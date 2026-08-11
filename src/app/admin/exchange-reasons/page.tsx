import RequestReasonsManager from '@/components/admin/request-reasons-manager'

export default function ExchangeReasonsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Exchange Reasons</h1>
        <p className="mt-1 text-sm text-gray-500">
          Reasons shown when customers request an exchange.
        </p>
      </div>
      <RequestReasonsManager kind="exchange" title="Exchange Reasons" />
    </div>
  )
}
