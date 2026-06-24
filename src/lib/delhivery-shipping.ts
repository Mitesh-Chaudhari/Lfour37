import { createAdminClient } from '@/lib/supabase/server'
import {
  createShipment,
  getTrackingMilestone,
  mapDelhiveryStatusToOrderStatus,
  parseShipmentCreationResponse,
  trackShipment,
  type DelhiveryOrder,
  type DelhiveryOrderItem,
  type NormalizedDelhiveryTracking,
} from '@/lib/delhivery'
import { sendShipmentStatusEmail } from '@/lib/email'
import {
  notifyOrderDelivered,
  notifyOrderShipped,
} from '@/lib/whatsapp/order-notifications'
import logger from '@/lib/logger'

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

    const orderForWhatsApp = {
      id: order.id,
      order_number: order.order_number,
      user_id: order.user_id,
      shipping_address: order.shipping_address,
    }

    const shippedMilestones = [
      'shipment_created',
      'picked_up',
      'in_transit',
      'out_for_delivery',
    ]
    const shippedAlreadyNotified = shippedMilestones.includes(
      shipment.last_notified_milestone || ''
    )

    if (milestone === 'delivered') {
      await notifyOrderDelivered(orderForWhatsApp)
    } else if (
      shippedMilestones.includes(milestone) &&
      !shippedAlreadyNotified
    ) {
      await notifyOrderShipped(orderForWhatsApp, trackingNumber)
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
  if (existing?.status === 'creating') {
    throw new Error('Delhivery shipment creation is already in progress')
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
      items: order.items as DelhiveryOrderItem[],
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

    await notifyCustomerOfShipmentMilestone(saved as ShipmentRow, {
      milestone: 'shipment_created',
      carrierStatus: created.status,
      trackingNumber: created.awb,
    })

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
  shipment: ShipmentRow
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
  const milestone = getTrackingMilestone(tracking.currentStatus)

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
      status: tracking.currentStatus,
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
    tracking.currentStatus
  )

  const { data: order } = await supabase
    .from('orders')
    .select('*, user:users(email, full_name), items:order_items(*)')
    .eq('id', shipment.order_id)
    .single()

  if (order && mappedOrderStatus) {
    const orderUpdate: Record<string, string> = {
      status: mappedOrderStatus,
      tracking_number: tracking.awb,
    }

    if (mappedOrderStatus === 'shipped' && !order.shipped_at) {
      orderUpdate.shipped_at = latestEvent?.occurredAt || new Date().toISOString()
    }
    if (mappedOrderStatus === 'delivered' && !order.delivered_at) {
      orderUpdate.delivered_at =
        tracking.deliveredAt || new Date().toISOString()
    }
    if (mappedOrderStatus === 'cancelled' && !order.cancelled_at) {
      orderUpdate.cancelled_at = new Date().toISOString()
    }

    await supabase.from('orders').update(orderUpdate).eq('id', order.id)
  }

  if (order && milestone !== shipment.last_notified_milestone) {
    await notifyCustomerOfShipmentMilestone(shipment, {
      milestone,
      carrierStatus: tracking.currentStatus,
      trackingNumber: tracking.awb,
      expectedDeliveryDate: tracking.expectedDeliveryDate,
      instructions: tracking.instructions,
    })
  }

  logger.info('Delhivery shipment synced', {
    orderId: shipment.order_id,
    awb: shipment.awb,
    status: tracking.currentStatus,
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
    carrierStatus: tracking.currentStatus,
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
