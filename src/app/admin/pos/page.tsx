import { PosClient } from '@/components/admin/pos-client'
import { LFOUR37_STORE_JAMNAGAR_LOCATION_ID } from '@/lib/organization'

export const dynamic = 'force-dynamic'

export default function AdminPosPage() {
  return (
    <PosClient
      locationId={LFOUR37_STORE_JAMNAGAR_LOCATION_ID}
      locationName="LFOUR37 Store – Jamnagar"
    />
  )
}
