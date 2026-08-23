export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateInvoicePdf } from '@/lib/invoice-pdf'
import type { InvoiceOrderInput } from '@/lib/invoice'
import { canDownloadInvoice } from '@/lib/invoice-access'
import logger from '@/lib/logger'

interface Props {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: order } = await supabase
      .from('orders')
      .select(`
        *,
        items:order_items(*),
        delhivery_shipment:delhivery_shipments(expected_delivery_date)
      `)
      .eq('id', id)
      .single()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    const isAdmin = profile && ['admin', 'super_admin'].includes(profile.role)
    if (order.user_id !== user.id && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!isAdmin && !canDownloadInvoice(order)) {
      return NextResponse.json(
        {
          error:
            order.payment_method === 'cod'
              ? 'Invoice for Cash on Delivery orders is available after delivery'
              : 'Invoice is not available for this order yet',
        },
        { status: 403 }
      )
    }

    const shipment = Array.isArray(order.delhivery_shipment)
      ? order.delhivery_shipment[0]
      : order.delhivery_shipment

    const pdfBytes = await generateInvoicePdf(order as InvoiceOrderInput, {
      expectedDeliveryDate: shipment?.expected_delivery_date || null,
    })
    const filename = `invoice-${order.order_number}.pdf`

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'Content-Length': String(pdfBytes.byteLength),
      },
    })
  } catch (error) {
    logger.error('Failed to generate invoice PDF', { error })
    return NextResponse.json({ error: 'Failed to generate invoice' }, { status: 500 })
  }
}
