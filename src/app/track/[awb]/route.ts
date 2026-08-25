import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCarrierTrackingUrl } from '@/lib/whatsapp/templates'
import { resolveShipmentCarrier } from '@/lib/shipment-carrier'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ awb: string }>
}

/**
 * Carrier-aware tracking redirect used by WhatsApp "Track" URL buttons.
 * Meta templates should use: https://www.lfour37.com/track/{{1}}
 * where {{1}} is the AWB.
 */
export async function GET(_request: NextRequest, { params }: Props) {
  const { awb: rawAwb } = await params
  const awb = decodeURIComponent(rawAwb || '').trim()

  if (!awb || awb === 'N/A') {
    return NextResponse.redirect(new URL('https://www.dtdc.in/tracking.asp'))
  }

  try {
    const supabase = createAdminClient()
    const { data: shipment } = await supabase
      .from('delhivery_shipments')
      .select('carrier, create_response')
      .eq('awb', awb)
      .maybeSingle()

    const carrier = resolveShipmentCarrier({
      carrier: shipment?.carrier,
      create_response: shipment?.create_response,
    })

    return NextResponse.redirect(getCarrierTrackingUrl(awb, carrier), 302)
  } catch {
    return NextResponse.redirect(getCarrierTrackingUrl(awb, 'dtdc'), 302)
  }
}
