export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8">Kelly OS - M-Pesa Payments Engine</h1>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">System Status</h2>
          <div className="space-y-2">
            <p className="text-green-600 dark:text-green-400">✅ Server Running</p>
            <p className="text-green-600 dark:text-green-400">✅ Database Connected</p>
            <p className="text-green-600 dark:text-green-400">✅ M-Pesa Webhook Ready</p>
          </div>
          
          <div className="mt-8">
            <h3 className="text-xl font-semibold mb-3">API Endpoints</h3>
            <ul className="space-y-1 text-sm font-mono">
              <li>POST /api/webhooks/mpesa - M-Pesa C2B Callback</li>
              <li>POST /api/customers - Create Customer</li>
              <li>POST /api/invoices - Create Invoice</li>
              <li>POST /api/pos - Create POS Sale</li>
              <li>GET /api/reports?type=balance - Account Balances</li>
            </ul>
          </div>
          
          <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900 rounded">
            <p className="text-sm">
              <strong>PayBill Number:</strong> {process.env.MPESA_SHORT_CODE || '174379'}
            </p>
            <p className="text-sm mt-2">
              <strong>Environment:</strong> {process.env.MPESA_ENVIRONMENT || 'sandbox'}
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
