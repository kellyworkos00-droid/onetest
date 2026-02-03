import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kelly OS - M-Pesa Payments',
  description: 'M-Pesa PayBill Payments Engine',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
