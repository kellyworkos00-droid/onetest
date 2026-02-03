'use client';

import Image from 'next/image';
import { useState } from 'react';
import Dashboard from './components/Dashboard';
import CustomerManager from './components/CustomerManager';
import InvoiceManager from './components/InvoiceManager';
import POSManager from './components/POSManager';
import PaymentMonitor from './components/PaymentMonitor';
import {
  DashboardIcon,
  PaymentIcon,
  CustomersIcon,
  InvoicesIcon,
  POSIcon,
} from './components/Icons';
 
type Tab = 'dashboard' | 'customers' | 'invoices' | 'pos' | 'payments';

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const tabs = [
    { id: 'dashboard' as Tab, name: 'Dashboard', icon: DashboardIcon },
    { id: 'payments' as Tab, name: 'Live Payments', icon: PaymentIcon },
    { id: 'customers' as Tab, name: 'Customers', icon: CustomersIcon },
    { id: 'invoices' as Tab, name: 'Invoices', icon: InvoicesIcon },
    { id: 'pos' as Tab, name: 'POS Sales', icon: POSIcon },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-center">
                <Image src="/logo.png" alt="Elegant Steel East Africa" width={40} height={40} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Elegant Steel HW</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">M-Pesa PayBill Payments Engine • System Owner: Kelly OS</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="hidden md:flex items-center space-x-2 px-3 py-1 bg-green-100 dark:bg-green-900 rounded-full">
                <span className="h-2 w-2 bg-green-600 rounded-full animate-pulse"></span>
                <span className="text-sm font-medium text-green-800 dark:text-green-200">System Online</span>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400">PayBill</p>
                <p className="text-sm font-mono font-semibold text-gray-900 dark:text-white">174379</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs (Desktop) */}
      <nav className="hidden md:block bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-6 py-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-green-600 text-green-600 dark:text-green-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <tab.icon />
                <span>{tab.name}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'customers' && <CustomerManager />}
        {activeTab === 'invoices' && <InvoiceManager />}
        {activeTab === 'pos' && <POSManager />}
        {activeTab === 'payments' && <PaymentMonitor />}
      </main>

      {/* Navigation Tabs (Mobile Bottom) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-around px-2 py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center px-3 py-2 rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/40'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
              aria-label={tab.name}
            >
              <tab.icon />
              <span className="mt-1 text-[11px] font-medium">{tab.name}</span>
            </button>
          ))}
        </div>
      </nav>

    </div>
  );
}
