import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/toaster'
import { AuthProvider } from '@/lib/auth-context'
import { AuthDialog } from '@/components/AuthDialog'
import './globals.css'

export const metadata: Metadata = {
  title: 'Создатель курсов из PDF',
  description: 'Превратите PDF-документы в интерактивные образовательные курсы с помощью ИИ',
  generator: 'v0.app',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        <AuthProvider>
          {children}
          <AuthDialog />
          <Toaster />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
