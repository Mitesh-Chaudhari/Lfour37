import RequestReasonsManager from '@/components/admin/request-reasons-manager'

export default function ReturnReasonsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Return Reasons</h1>
        <p className="mt-1 text-sm text-gray-500">
          Reasons shown when customers request a return.
        </p>
      </div>
      <RequestReasonsManager kind="return" title="Return Reasons" />
    </div>
  )
}
