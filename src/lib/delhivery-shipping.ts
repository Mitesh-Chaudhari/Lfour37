import { createAdminClient } from '@/lib/supabase/server'
import {
  cancelShipment,
  createExchangeForwardShipment,
  createReversePickup,
  createShipment,
  formatDelhiveryCarrierStatus,
  getReversePickupMilestone,
  getTrackingMilestone,
  isDelhiveryOutForDelivery,
  isDelhiveryRtoStatus,
  isDelhiveryStatusCancellable,
  mapDelhiveryReverseStatus,
  mapDelhiveryStatusToOrderStatus,
  parseShipmentCreationResponse,
  trackShipment,
  type DelhiveryOrder,
  type DelhiveryOrderItem,
  type NormalizedDelhiveryTracking,
} from '@/lib/delhivery'
import { sendOrderStatusEmail, sendReversePickupStatusEmail, sendShipmentStatusEmail } from '@/lib/email'
import {
  notifyOrderCancelled,
  notifyOrderDelivered,
  notifyOrderShipmentMilestone,
  notifyReversePickupMilestone,
} from '@/lib/whatsapp/order-notifications'
import {
  formatItemLabel,
  isReversePickupWhatsAppMilestone,
  isShipmentWhatsAppMilestone,
} from '@/lib/whatsapp/templates'
import logger from '@/lib/logger'
import { markCodCollectedOnDelivery } from '@/lib/cod-payment'

type ShipmentRow = {
  id: string
  order_id: string
  awb: string | null
  status: string
  last_notified_milestone: string | null
}

export type DelhiverySyncSummary = {
  tracking: NormalizedDelhiveryTracking
  orderStatus: string
  carrierStatus: string
  awb: string
  lastSyncedAt: string
  expectedDeliveryDate?: string | null
}

export type AdminDelhiverySyncResult = {
  orderId: string
  awb: string | null
  success: boolean
  orderStatus?: string
  carrierStatus?: string
  lastSyncedAt?: string
  expectedDeliveryDate?: string | null
  error?: string
}

function eventKey(
  event: NormalizedDelhiveryTracking['events'][number]
): string {
  return [
    event.occurredAt || '',
    event.statusCode || '',
    event.status,
    event.location || '',
  ].join('|')
}

async function notifyCustomerOfShipmentMilestone(
  shipment: ShipmentRow,
  {
    milestone,
    carrierStatus,
    trackingNumber,
    expectedDeliveryDate,
    instructions,
  }: {
    milestone: string
    carrierStatus: string
    trackingNumber: string
    expectedDeliveryDate?: string | null
    instructions?: string | null
  }
): Promise<void> {
  if (milestone === shipment.last_notified_milestone) return
  // AWB/manifest create is tracked but not messaged as "shipped"
  if (milestone === 'shipment_created') {
    const supabase = createAdminClient()
    await supabase
      .from('delhivery_shipments')
      .update({ last_notified_milestone: milestone })
      .eq('id', shipment.id)
    return
  }

  const supabase = createAdminClient()
  const { data: order } = await supabase
    .from('orders')
    .select('*, user:users(email, full_name), items:order_items(*)')
    .eq('id', shipment.order_id)
    .single()

  if (!order) return

  const orderUser = Array.isArray(order.user) ? order.user[0] : order.user
  if (!orderUser?.email && !order.shipping_address?.phone) return

  try {
    const orderForWhatsApp = {
      id: order.id,
      order_number: order.order_number,
      user_id: order.user_id,
      shipping_address: order.shipping_address,
      items: order.items,
    }

    // Portal cancel / parcel back at warehouse → cancellation email + WhatsApp
    if (milestone === 'cancelled' || milestone === 'rto_delivered') {
      if (orderUser?.email) {
        await sendOrderStatusEmail(order, orderUser.email, 'cancelled')
      }
      await notifyOrderCancelled({
        order: orderForWhatsApp,
        item: order.items?.[0] ?? null,
      })
      await supabase
        .from('delhivery_shipments')
        .update({ last_notified_milestone: milestone })
        .eq('id', shipment.id)
      return
    }

    if (orderUser?.email) {
      await sendShipmentStatusEmail({
        order,
        email: orderUser.email,
        milestone,
        carrierStatus,
        trackingNumber,
        expectedDeliveryDate,
        instructions,
      })
    }

    if (milestone === 'delivered') {
      await notifyOrderDelivered(orderForWhatsApp)
    } else if (isShipmentWhatsAppMilestone(milestone)) {
      await notifyOrderShipmentMilestone({
        order: orderForWhatsApp,
        milestone,
        trackingNumber,
        items: order.items,
      })
    }

    await supabase
      .from('delhivery_shipments')
      .update({ last_notified_milestone: milestone })
      .eq('id', shipment.id)
  } catch (error) {
    logger.warn('Delhivery status email failed', {
      error,
      orderId: shipment.order_id,
      milestone,
    })
  }
}

async function notifyCustomerOfReversePickupMilestone(
  reversePickup: ReversePickupRow,
  {
    milestone,
    carrierStatus,
    trackingNumber,
  }: {
    milestone: 'reverse_picked_up' | 'reverse_dto'
    carrierStatus: string
    trackingNumber: string
  }
): Promise<void> {
  if (milestone === reversePickup.last_notified_milestone) return

  const supabase = createAdminClient()
  const { data: order } = await supabase
    .from('orders')
    .select('*, user:users(email, full_name)')
    .eq('id', reversePickup.order_id)
    .single()

  const { data: item } = await supabase
    .from('order_items')
    .select(
      'product_name, variant_size, variant_color, exchange_size, exchange_color, quantity'
    )
    .eq('id', reversePickup.order_item_id)
    .single()

  if (!order || !item) return

  const orderUser = Array.isArray(order.user) ? order.user[0] : order.user
  if (!orderUser?.email && !order.shipping_address?.phone) return

  const itemLabel = formatItemLabel(
    item.product_name,
    item.variant_size,
    item.variant_color
  )

  try {
    if (orderUser?.email) {
      await sendReversePickupStatusEmail({
        order,
        email: orderUser.email,
        milestone,
        carrierStatus,
        trackingNumber,
        itemLabel,
        pickupType: reversePickup.pickup_type,
      })
    }

    if (order.shipping_address?.phone) {
      await notifyReversePickupMilestone({
        order: {
          id: order.id,
          order_number: order.order_number,
          user_id: order.user_id,
          shipping_address: order.shipping_address,
        },
        item,
        milestone,
        trackingNumber,
        pickupType: reversePickup.pickup_type,
      })
    }

    await supabase
      .from('delhivery_reverse_pickups')
      .update({ last_notified_milestone: milestone })
      .eq('id', reversePickup.id)
  } catch (error) {
    logger.warn('Reverse pickup status notification failed', {
      error,
      orderId: reversePickup.order_id,
      milestone,
    })
  }
}

export async function createDelhiveryShipmentForOrder(
  orderId: string
): Promise<ShipmentRow> {
  const supabase = createAdminClient()
  const { data: existing } = await supabase
    .from('delhivery_shipments')
    .select('id, order_id, awb, status, last_notified_milestone')
    .eq('order_id', orderId)
    .maybeSingle()

  if (existing?.awb) return existing as ShipmentRow

  // A crashed request can leave status stuck on "creating", which would
  // permanently block the admin Create Shipment button. Allow a retry after 2 min.
  if (existing?.status === 'creating') {
    const { data: creatingRow } = await supabase
      .from('delhivery_shipments')
      .select('updated_at, created_at')
      .eq('id', existing.id)
      .single()

    const startedAt = new Date(
      creatingRow?.updated_at || creatingRow?.created_at || 0
    ).getTime()
    const ageMs = Date.now() - startedAt

    if (Number.isFinite(ageMs) && ageMs < 2 * 60 * 1000) {
      throw new Error('Delhivery shipment creation is already in progress')
    }

    await supabase
      .from('delhivery_shipments')
      .update({
        status: 'creation_failed',
        error_message:
          'Previous shipment creation timed out. Retrying Create Shipment.',
      })
      .eq('id', existing.id)
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*, items:order_items(*)')
    .eq('id', orderId)
    .single()

  if (orderError || !order) throw new Error('Order not found')
  const isCodOrder = order.payment_method === 'cod'
  const canShip =
    order.payment_status === 'completed' ||
    (isCodOrder && order.status === 'processing')

  if (!canShip) {
    throw new Error(
      'A shipment can only be created for a paid or confirmed COD order'
    )
  }
  if (!order.items?.length) throw new Error('Order has no shippable items')

  const shippableItems = order.items.filter(
    (orderItem: { status?: string | null }) =>
      orderItem.status !== 'cancelled' && orderItem.status !== 'cancel_requested'
  )

  if (!shippableItems.length) {
    throw new Error('Order has no shippable items')
  }

  let shipmentId = existing?.id

  if (!shipmentId) {
    const { data: reservation, error: reservationError } = await supabase
      .from('delhivery_shipments')
      .insert({
        order_id: orderId,
        status: 'creating',
      })
      .select('id')
      .single()

    if (reservationError) {
      logger.error('Failed to reserve Delhivery shipment row', {
        reservationError,
        orderId,
      })

      const { data: concurrentShipment } = await supabase
        .from('delhivery_shipments')
        .select('id, order_id, awb, status, last_notified_milestone')
        .eq('order_id', orderId)
        .single()

      if (concurrentShipment?.awb) return concurrentShipment as ShipmentRow
      if (concurrentShipment?.status === 'creating') {
        throw new Error('Delhivery shipment creation is already in progress')
      }
      if (!concurrentShipment) throw reservationError
      shipmentId = concurrentShipment.id
    } else {
      shipmentId = reservation.id
    }
  } else {
    await supabase
      .from('delhivery_shipments')
      .update({ status: 'creating', error_message: null })
      .eq('id', shipmentId)
  }

  try {
    const response = await createShipment({
      order: order as DelhiveryOrder,
      items: shippableItems as DelhiveryOrderItem[],
    })
    const created = parseShipmentCreationResponse(response)

    const { data: saved, error: saveError } = await supabase
      .from('delhivery_shipments')
      .update({
        awb: created.awb,
        status: created.status,
        create_response: response,
        error_message: null,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', shipmentId)
      .select('id, order_id, awb, status, last_notified_milestone')
      .single()

    if (saveError || !saved) throw saveError || new Error('Shipment was not saved')

    await supabase
      .from('orders')
      .update({
        status:
          order.status === 'paid' || order.status === 'pending'
            ? 'processing'
            : order.status,
        tracking_number: created.awb,
      })
      .eq('id', orderId)

    logger.info('Delhivery shipment created', {
      orderId,
      awb: created.awb,
    })

    // Do NOT notify customer here. AWB creation is not "shipped".
    // Mark milestone so sync won't send a fake shipment_created "shipped" message.
    // Real customer updates start at picked_up / in_transit via syncDelhiveryShipment.
    await supabase
      .from('delhivery_shipments')
      .update({ last_notified_milestone: 'shipment_created' })
      .eq('id', saved.id)

    return saved as ShipmentRow
  } catch (error) {
    await supabase
      .from('delhivery_shipments')
      .update({
        status: 'creation_failed',
        error_message: error instanceof Error ? error.message : String(error),
      })
      .eq('id', shipmentId)
    throw error
  }
}

export async function ensureDelhiveryShipmentForPaidOrder(
  orderId: string
): Promise<{ ok: boolean; awb?: string | null; error?: string }> {
  const supabase = createAdminClient()

  try {
    const { data: existing, error: existingError } = await supabase
      .from('delhivery_shipments')
      .select('id, order_id, awb, status, last_notified_milestone')
      .eq('order_id', orderId)
      .maybeSingle()

    if (existingError) {
      logger.error('Failed to query delhivery_shipments', {
        existingError,
        orderId,
      })
      return {
        ok: false,
        error:
          existingError.message.includes('does not exist') ||
          existingError.code === '42P01'
            ? 'delhivery_shipments table is missing. Run supabase/migrations/002_delhivery_shipping.sql'
            : existingError.message,
      }
    }

    if (existing?.awb) {
      try {
        await syncDelhiveryShipment(existing as ShipmentRow)
      } catch (syncError) {
        logger.warn('Delhivery sync failed for existing shipment', {
          syncError,
          orderId,
        })
      }
      return { ok: true, awb: existing.awb }
    }

    const shipment = await createDelhiveryShipmentForOrder(orderId)

    if (shipment.awb) {
      try {
        await syncDelhiveryShipment(shipment)
      } catch (syncError) {
        logger.warn('Initial Delhivery sync failed after shipment creation', {
          syncError,
          orderId,
        })
      }
    }

    return { ok: true, awb: shipment.awb }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('Delhivery shipment ensure failed', { error, orderId })
    return { ok: false, error: message }
  }
}

export async function syncDelhiveryShipment(
  shipment: ShipmentRow,
  options?: { skipNotify?: boolean }
): Promise<DelhiverySyncSummary> {
  if (!shipment.awb) throw new Error('Shipment has no AWB')

  const supabase = createAdminClient()
  const tracking = await trackShipment(shipment.awb)
  const latestEvent = tracking.events
    .filter((event) => event.occurredAt)
    .sort((a, b) => {
      return (
        new Date(b.occurredAt || 0).getTime() -
        new Date(a.occurredAt || 0).getTime()
      )
    })[0]
  const milestone = getTrackingMilestone(
    tracking.currentStatus,
    tracking.statusType,
    tracking.instructions,
    tracking.statusCode
  )
  const displayStatus = formatDelhiveryCarrierStatus(
    tracking.currentStatus,
    tracking.statusType,
    tracking.instructions
  )
  const isRto = isDelhiveryRtoStatus(
    tracking.currentStatus,
    tracking.statusType,
    tracking.instructions
  )

  if (tracking.events.length) {
    const rows = tracking.events.map((event) => ({
      shipment_id: shipment.id,
      status: event.status,
      status_code: event.statusCode,
      status_type: event.statusType,
      location: event.location,
      instructions: event.instructions,
      occurred_at: event.occurredAt,
      event_key: eventKey(event),
    }))

    const { error } = await supabase
      .from('delhivery_tracking_events')
      .upsert(rows, {
        onConflict: 'shipment_id,event_key',
        ignoreDuplicates: true,
      })

    if (error) logger.warn('Could not persist Delhivery tracking events', { error })
  }

  const { error: shipmentError } = await supabase
    .from('delhivery_shipments')
    .update({
      status: displayStatus,
      status_code: tracking.statusCode,
      status_type: tracking.statusType,
      instructions: tracking.instructions,
      expected_delivery_date: tracking.expectedDeliveryDate,
      last_event_at: latestEvent?.occurredAt || null,
      last_synced_at: new Date().toISOString(),
      tracking_response: tracking.raw,
      error_message: null,
    })
    .eq('id', shipment.id)

  if (shipmentError) throw shipmentError

  const mappedOrderStatus = mapDelhiveryStatusToOrderStatus(
    tracking.currentStatus,
    tracking.statusType,
    tracking.instructions,
    tracking.statusCode
  )

  const { data: order } = await supabase
    .from('orders')
    .select('*, user:users(email, full_name), items:order_items(*)')
    .eq('id', shipment.order_id)
    .single()

  const { data: shipmentMeta } = await supabase
    .from('delhivery_shipments')
    .select('cancellation_requested_at, last_notified_milestone')
    .eq('id', shipment.id)
    .maybeSingle()

  const cancellationRequested = Boolean(
    shipmentMeta?.cancellation_requested_at
  )
  const lastNotified =
    shipmentMeta?.last_notified_milestone ?? shipment.last_notified_milestone

  if (order && mappedOrderStatus) {
    // Don't resurrect a cancelled order from a stale carrier status
    const skipOrderStatusUpdate =
      order.status === 'cancelled' ||
      order.status === 'refunded' ||
      cancellationRequested

    if (!skipOrderStatusUpdate) {
      const orderUpdate: Record<string, string> = {
        status: mappedOrderStatus,
        tracking_number: tracking.awb,
      }

      if (mappedOrderStatus === 'shipped' && !order.shipped_at) {
        orderUpdate.shipped_at =
          latestEvent?.occurredAt || new Date().toISOString()
      }
      if (mappedOrderStatus === 'delivered' && !order.delivered_at) {
        orderUpdate.delivered_at =
          tracking.deliveredAt || new Date().toISOString()
      }
      if (mappedOrderStatus === 'cancelled' && !order.cancelled_at) {
        orderUpdate.cancelled_at = new Date().toISOString()
      }

      // COD refused / RTO: keep a clear note for admin.
      // Stock restores only when status becomes cancelled (RTO delivered).
      if (isRto) {
        const rtoNote =
          mappedOrderStatus === 'cancelled'
            ? `Delhivery RTO delivered to warehouse: ${displayStatus}`
            : `Delhivery RTO in transit: ${displayStatus}`
        const existingNotes =
          typeof order.notes === 'string' ? order.notes.trim() : ''
        if (
          mappedOrderStatus === 'cancelled' ||
          !existingNotes.toLowerCase().includes('delhivery rto')
        ) {
          orderUpdate.notes = existingNotes
            ? `${existingNotes}\n${rtoNote}`
            : rtoNote
        }
        if (mappedOrderStatus === 'cancelled') {
          orderUpdate.cancel_reason =
            'Order auto cancelled after RTO delivered to warehouse'
        }
      }

      await supabase.from('orders').update(orderUpdate).eq('id', order.id)

      if (mappedOrderStatus === 'delivered') {
        await markCodCollectedOnDelivery(order.id, order, supabase)
      }
    } else if (tracking.awb && !order.tracking_number) {
      await supabase
        .from('orders')
        .update({ tracking_number: tracking.awb })
        .eq('id', order.id)
    }
  }

  if (
    !options?.skipNotify &&
    !cancellationRequested &&
    order &&
    order.status !== 'cancelled' &&
    milestone !== lastNotified
  ) {
    await notifyCustomerOfShipmentMilestone(
      {
        ...shipment,
        last_notified_milestone: lastNotified,
      },
      {
        milestone,
        carrierStatus: displayStatus,
        trackingNumber: tracking.awb,
        expectedDeliveryDate: tracking.expectedDeliveryDate,
        instructions: tracking.instructions,
      }
    )
  }

  logger.info('Delhivery shipment synced', {
    orderId: shipment.order_id,
    awb: shipment.awb,
    status: displayStatus,
    statusType: tracking.statusType,
    isRto,
    milestone,
  })

  const { data: updatedOrder } = await supabase
    .from('orders')
    .select('status')
    .eq('id', shipment.order_id)
    .single()

  const { data: updatedShipment } = await supabase
    .from('delhivery_shipments')
    .select('status, last_synced_at, expected_delivery_date')
    .eq('id', shipment.id)
    .single()

  return {
    tracking,
    orderStatus: updatedOrder?.status || order?.status || 'processing',
    carrierStatus: displayStatus,
    awb: tracking.awb,
    lastSyncedAt:
      updatedShipment?.last_synced_at || new Date().toISOString(),
    expectedDeliveryDate: updatedShipment?.expected_delivery_date,
  }
}

export async function syncDelhiveryShipmentByOrderId(
  orderId: string
): Promise<DelhiverySyncSummary> {
  const supabase = createAdminClient()
  const { data: shipment, error } = await supabase
    .from('delhivery_shipments')
    .select('id, order_id, awb, status, last_notified_milestone')
    .eq('order_id', orderId)
    .single()

  if (error || !shipment) throw new Error('Shipment not found')
  return syncDelhiveryShipment(shipment as ShipmentRow)
}

export async function syncDelhiveryShipmentsForAdmin(options?: {
  orderIds?: string[]
  limit?: number
}): Promise<AdminDelhiverySyncResult[]> {
  const supabase = createAdminClient()
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100)

  let query = supabase
    .from('delhivery_shipments')
    .select('id, order_id, awb, status, last_notified_milestone')
    .not('awb', 'is', null)

  if (options?.orderIds?.length) {
    query = query.in('order_id', options.orderIds)
  } else {
    query = query
      .not('status', 'ilike', '%delivered%')
      .order('last_synced_at', { ascending: true, nullsFirst: true })
      .limit(limit)
  }

  const { data: shipments, error } = await query
  if (error) throw error

  const results: AdminDelhiverySyncResult[] = []

  for (const shipment of shipments || []) {
    try {
      const summary = await syncDelhiveryShipment(shipment as ShipmentRow)
      results.push({
        orderId: shipment.order_id,
        awb: summary.awb,
        success: true,
        orderStatus: summary.orderStatus,
        carrierStatus: summary.carrierStatus,
        lastSyncedAt: summary.lastSyncedAt,
        expectedDeliveryDate: summary.expectedDeliveryDate,
      })
    } catch (syncError) {
      await supabase
        .from('delhivery_shipments')
        .update({
          last_synced_at: new Date().toISOString(),
          error_message:
            syncError instanceof Error ? syncError.message : String(syncError),
        })
        .eq('id', shipment.id)

      results.push({
        orderId: shipment.order_id,
        awb: shipment.awb,
        success: false,
        error:
          syncError instanceof Error ? syncError.message : String(syncError),
      })
    }
  }

  return results
}

export async function syncActiveDelhiveryShipments(limit = 50) {
  return syncDelhiveryShipmentsForAdmin({ limit })
}

type ReversePickupRow = {
  id: string
  order_id: string
  order_item_id: string
  pickup_type: 'return' | 'exchange'
  awb: string | null
  exchange_forward_awb: string | null
  status: string
  last_notified_milestone: string | null
}

export type DelhiveryCancelResult = {
  ok: boolean
  awb?: string | null
  skipped?: boolean
  reason?: string
  error?: string
}

export async function cancelDelhiveryShipmentForOrder(
  orderId: string
): Promise<DelhiveryCancelResult> {
  const supabase = createAdminClient()
  const { data: shipment } = await supabase
    .from('delhivery_shipments')
    .select('id, awb, status, cancellation_requested_at, last_notified_milestone')
    .eq('order_id', orderId)
    .maybeSingle()

  if (!shipment?.awb) {
    return { ok: true, skipped: true, reason: 'no_awb' }
  }

  if (shipment.cancellation_requested_at) {
    return { ok: true, awb: shipment.awb, skipped: true, reason: 'already_requested' }
  }

  const carrierStatus = shipment.status || 'Unknown'
  const shipmentRow = {
    id: shipment.id,
    order_id: orderId,
    awb: shipment.awb,
    status: carrierStatus,
    last_notified_milestone: shipment.last_notified_milestone,
  } as ShipmentRow

  if (isDelhiveryOutForDelivery(carrierStatus)) {
    return {
      ok: false,
      awb: shipment.awb,
      error:
        'Shipment is out for delivery. Ask the customer to refuse delivery; Delhivery will process it as RTO.',
    }
  }

  if (!isDelhiveryStatusCancellable(carrierStatus)) {
    try {
      // Refresh status only — do not send pickup/shipped WhatsApp during cancel checks
      await syncDelhiveryShipment(shipmentRow, { skipNotify: true })
    } catch {
      // Best effort refresh before re-checking cancellability.
    }

    const { data: refreshed } = await supabase
      .from('delhivery_shipments')
      .select('status')
      .eq('id', shipment.id)
      .single()

    const latestStatus = refreshed?.status || carrierStatus
    if (!isDelhiveryStatusCancellable(latestStatus)) {
      return {
        ok: false,
        awb: shipment.awb,
        error: `Shipment cannot be cancelled in its current Delhivery state (${latestStatus}).`,
      }
    }
  }

  try {
    await cancelShipment(shipment.awb)

    await supabase
      .from('delhivery_shipments')
      .update({
        cancellation_requested_at: new Date().toISOString(),
        status: 'Cancellation Requested',
        last_synced_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', shipment.id)

    logger.info('Delhivery shipment cancellation requested', {
      orderId,
      awb: shipment.awb,
    })

    try {
      // Post-cancel sync must not emit pickup messages from stale carrier status
      await syncDelhiveryShipment(
        {
          ...shipmentRow,
          status: 'Cancellation Requested',
          last_notified_milestone: shipment.last_notified_milestone,
        },
        { skipNotify: true }
      )
    } catch (syncError) {
      logger.warn('Post-cancel Delhivery sync failed', { syncError, orderId })
    }

    return { ok: true, awb: shipment.awb }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('Delhivery shipment cancellation failed', { error, orderId })
    return { ok: false, awb: shipment.awb, error: message }
  }
}

function reverseReference(orderNumber: string, itemId: string): string {
  return `${orderNumber}-RVP-${itemId.slice(0, 8)}`
}

function exchangeReference(orderNumber: string, itemId: string): string {
  return `${orderNumber}-EX-${itemId.slice(0, 8)}`
}

export type DelhiveryReversePickupResult = {
  ok: boolean
  reverseAwb?: string
  exchangeForwardAwb?: string
  error?: string
}

export async function createDelhiveryReversePickupForItem(
  orderItemId: string
): Promise<DelhiveryReversePickupResult> {
  const supabase = createAdminClient()

  const { data: item, error: itemError } = await supabase
    .from('order_items')
    .select(`
      *,
      orders (
        id,
        order_number,
        total,
        payment_status,
        payment_method,
        shipping_address
      )
    `)
    .eq('id', orderItemId)
    .single()

  if (itemError || !item) {
    return { ok: false, error: 'Order item not found' }
  }

  const order = Array.isArray(item.orders) ? item.orders[0] : item.orders
  if (!order) {
    return { ok: false, error: 'Parent order not found' }
  }

  const pickupType: 'return' | 'exchange' =
    item.return_type === 'exchange' ? 'exchange' : 'return'

  const { data: existing } = await supabase
    .from('delhivery_reverse_pickups')
    .select('id, awb, exchange_forward_awb, status')
    .eq('order_item_id', orderItemId)
    .maybeSingle()

  if (existing?.awb) {
    return {
      ok: true,
      reverseAwb: existing.awb,
      exchangeForwardAwb: existing.exchange_forward_awb || undefined,
    }
  }

  let reversePickupId = existing?.id

  if (!reversePickupId) {
    const { data: reservation, error: reservationError } = await supabase
      .from('delhivery_reverse_pickups')
      .insert({
        order_id: order.id,
        order_item_id: orderItemId,
        pickup_type: pickupType,
        status: 'creating',
      })
      .select('id')
      .single()

    if (reservationError) {
      const { data: concurrent } = await supabase
        .from('delhivery_reverse_pickups')
        .select('id, awb, exchange_forward_awb')
        .eq('order_item_id', orderItemId)
        .maybeSingle()

      if (concurrent?.awb) {
        return {
          ok: true,
          reverseAwb: concurrent.awb,
          exchangeForwardAwb: concurrent.exchange_forward_awb || undefined,
        }
      }
      if (!concurrent) return { ok: false, error: reservationError.message }
      reversePickupId = concurrent.id
    } else {
      reversePickupId = reservation.id
    }
  }

  const returnReason =
    item.return_custom_reason ||
    (item.return_reason_id
      ? pickupType === 'exchange'
        ? 'Exchange approved'
        : 'Return approved'
      : pickupType === 'exchange'
        ? 'Customer exchange'
        : 'Customer return')

  try {
    // Same reverse + QC path for return and exchange; exchange then adds a forward AWB.
    const reverseResponse = await createReversePickup({
      order: order as DelhiveryOrder,
      item: {
        product_name: item.product_name,
        quantity: item.quantity,
        variant_size: item.variant_size,
        variant_color: item.variant_color,
        product_image: item.product_image,
        return_reason: returnReason,
      },
      reference: reverseReference(order.order_number, orderItemId),
    })

    const reverseCreated = parseShipmentCreationResponse(reverseResponse)
    let exchangeForwardAwb: string | undefined
    let exchangeCreateResponse: unknown = null

    if (pickupType === 'exchange') {
      const exchangeItem: DelhiveryOrderItem = {
        product_name: item.product_name,
        quantity: item.quantity,
        variant_size: item.exchange_size || item.variant_size,
        variant_color: item.exchange_color || item.variant_color,
      }

      try {
        exchangeCreateResponse = await createExchangeForwardShipment({
          order: order as DelhiveryOrder,
          item: exchangeItem,
          reference: exchangeReference(order.order_number, orderItemId),
        })
        exchangeForwardAwb =
          parseShipmentCreationResponse(exchangeCreateResponse).awb
      } catch (exchangeError) {
        const exchangeMessage =
          exchangeError instanceof Error
            ? exchangeError.message
            : String(exchangeError)

        await supabase
          .from('delhivery_reverse_pickups')
          .update({
            awb: reverseCreated.awb,
            status: reverseCreated.status,
            create_response: reverseResponse,
            error_message: `Reverse pickup created but exchange forward failed: ${exchangeMessage}`,
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', reversePickupId)

        return {
          ok: false,
          reverseAwb: reverseCreated.awb,
          error: `Reverse pickup created (${reverseCreated.awb}) but exchange shipment failed: ${exchangeMessage}`,
        }
      }
    }

    await supabase
      .from('delhivery_reverse_pickups')
      .update({
        awb: reverseCreated.awb,
        exchange_forward_awb: exchangeForwardAwb || null,
        status: reverseCreated.status,
        create_response: reverseResponse,
        exchange_create_response: exchangeCreateResponse,
        error_message: null,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', reversePickupId)

    logger.info('Delhivery reverse pickup created', {
      orderId: order.id,
      orderItemId,
      reverseAwb: reverseCreated.awb,
      exchangeForwardAwb,
      pickupType,
    })

    return {
      ok: true,
      reverseAwb: reverseCreated.awb,
      exchangeForwardAwb,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    await supabase
      .from('delhivery_reverse_pickups')
      .update({
        status: 'creation_failed',
        error_message: message,
      })
      .eq('id', reversePickupId)

    logger.error('Delhivery reverse pickup creation failed', {
      error,
      orderItemId,
    })

    return { ok: false, error: message }
  }
}

export async function syncDelhiveryReversePickup(
  reversePickup: ReversePickupRow
): Promise<void> {
  if (!reversePickup.awb) return

  const supabase = createAdminClient()
  const tracking = await trackShipment(reversePickup.awb)
  const milestone = getReversePickupMilestone(
    tracking.currentStatus,
    tracking.statusType
  )

  await supabase
    .from('delhivery_reverse_pickups')
    .update({
      status: tracking.currentStatus,
      status_code: tracking.statusCode,
      status_type: tracking.statusType,
      instructions: tracking.instructions,
      last_event_at:
        tracking.events[tracking.events.length - 1]?.occurredAt || null,
      last_synced_at: new Date().toISOString(),
      tracking_response: tracking.raw,
      error_message: null,
    })
    .eq('id', reversePickup.id)

  if (
    milestone &&
    isReversePickupWhatsAppMilestone(milestone) &&
    milestone !== reversePickup.last_notified_milestone
  ) {
    await notifyCustomerOfReversePickupMilestone(reversePickup, {
      milestone,
      carrierStatus: tracking.currentStatus,
      trackingNumber: tracking.awb,
    })
  }

  const reverseState = mapDelhiveryReverseStatus(tracking.currentStatus)

  if (reversePickup.pickup_type === 'return' && reverseState === 'delivered_to_origin') {
    await supabase
      .from('order_items')
      .update({ status: 'returned' })
      .eq('id', reversePickup.order_item_id)

    await supabase
      .from('orders')
      .update({ status: 'returned' })
      .eq('id', reversePickup.order_id)
  }

  if (reversePickup.pickup_type === 'exchange' && reversePickup.exchange_forward_awb) {
    const forwardTracking = await trackShipment(reversePickup.exchange_forward_awb)
    const forwardDelivered =
      forwardTracking.currentStatus.toLowerCase().includes('delivered') &&
      !forwardTracking.currentStatus.toLowerCase().includes('undelivered')

    if (forwardDelivered) {
      await supabase
        .from('order_items')
        .update({ status: 'exchanged' })
        .eq('id', reversePickup.order_item_id)

      await supabase
        .from('orders')
        .update({ status: 'exchanged' })
        .eq('id', reversePickup.order_id)
    }
  }
}

export async function syncActiveDelhiveryReversePickups(limit = 50) {
  const supabase = createAdminClient()
  const { data: pickups, error } = await supabase
    .from('delhivery_reverse_pickups')
    .select(
      'id, order_id, order_item_id, pickup_type, awb, exchange_forward_awb, status, last_notified_milestone'
    )
    .not('awb', 'is', null)
    .or(
      'last_notified_milestone.is.null,last_notified_milestone.neq.reverse_dto'
    )
    .not('status', 'ilike', '%cancel%')
    .not('status', 'ilike', '%closed%')
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(Math.min(Math.max(limit, 1), 100))

  if (error) throw error

  for (const pickup of pickups || []) {
    try {
      await syncDelhiveryReversePickup(pickup as ReversePickupRow)
    } catch (syncError) {
      logger.warn('Delhivery reverse pickup sync failed', {
        syncError,
        reversePickupId: pickup.id,
      })
    }
  }

  return pickups?.length || 0
}
