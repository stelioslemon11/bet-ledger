import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BetLedger — Group Betting Tracker',
  description: 'Private bet tracking for your group',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
