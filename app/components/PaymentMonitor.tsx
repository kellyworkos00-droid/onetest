'use client';

import { useState, useEffect } from 'react';
import { ClockIcon } from './Icons';

interface Payment {
  id: string;
  mpesaReceiptNumber: string;
  amount: number;
  phoneNumber: string;
  customer: {
    name: string;
    customerId: string;
  };
  status: string;
  createdAt: string;
}

export default function PaymentMonitor() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchRecentPayments();
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchRecentPayments, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Filter payments based on search query
    if (searchQuery.trim() === '') {
      setFilteredPayments(payments);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredPayments(
        payments.filter(
          (payment) =>
            payment.mpesaReceiptNumber.toLowerCase().includes(query) ||
            payment.customer.name.toLowerCase().includes(query) ||
            payment.customer.customerId.toLowerCase().includes(query) ||
            payment.phoneNumber.includes(query)
        )
      );
    }
  }, [searchQuery, payments]);

  const fetchRecentPayments = async () => {
    try {
      const response = await fetch('/api/reports?type=recent-payments&limit=20');
      if (response.ok) {
        const data = await response.json();
        setPayments(data);
        setFilteredPayments(data);
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'FAILED':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Real-Time Payment Monitor</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Live M-Pesa payment tracking - Auto-refreshes every 5 seconds
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="animate-pulse flex items-center text-green-600 dark:text-green-400">
            <span className="h-2 w-2 bg-green-600 rounded-full mr-2"></span>
            <span className="text-sm font-medium">Live</span>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
        <input
          type="text"
          placeholder="Search payments by receipt, customer, or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
        />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 mb-4">
              <ClockIcon />
            </div>
            <p className="text-gray-500 dark:text-gray-400">
              {searchQuery ? 'No payments found matching your search.' : 'Waiting for payments...'}
            </p>
            {!searchQuery && (
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                Payments will appear here automatically when received
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="px-6 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Showing {filteredPayments.length} of {payments.length} payments
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      M-Pesa Receipt
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredPayments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {new Date(payment.createdAt).toLocaleTimeString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                          {payment.mpesaReceiptNumber}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {payment.customer.name}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {payment.customer.customerId}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {payment.phoneNumber}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-lg font-bold text-green-600 dark:text-green-400">
                          {formatCurrency(payment.amount)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(payment.status)}`}>
                          {payment.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">How to Make a Payment</h3>
        <ol className="text-sm text-blue-800 dark:text-blue-300 space-y-1 ml-4 list-decimal">
          <li>Go to M-Pesa menu on your phone</li>
          <li>Select "Lipa na M-Pesa" - "Pay Bill"</li>
          <li>Enter Business Number: <strong>{process.env.NEXT_PUBLIC_MPESA_SHORT_CODE || '174379'}</strong></li>
          <li>Enter Account Number: <strong>Customer ID</strong> (e.g., ACC001)</li>
          <li>Enter Amount and your M-Pesa PIN</li>
          <li>Payment will appear here instantly!</li>
        </ol>
      </div>
    </div>
  );
}
