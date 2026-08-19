/**
 * Carrier integration entrypoint.
 * New bookings use DTDC; legacy Delhivery AWBs keep Delhivery tracking.
 */
export * from '@/lib/dtdc'
export {
  trackShipment,
  trackShipmentByCarrier,
} from '@/lib/carrier-tracking'
export { trackDelhiveryShipment } from '@/lib/delhivery-legacy-tracking'
