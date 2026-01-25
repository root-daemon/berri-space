import React from "react"
import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Analytics } from '@vercel/analytics/next'
import { ClerkProvider } from '@clerk/nextjs'
import { QueryProvider } from '@/components/query-provider'
import { CommandSearchProvider } from '@/components/command-search'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const instrumentSans = localFont({
  src: [
    {
      path: '../fonts/InstrumentSans-VariableFont_wdth,wght.ttf',
      weight: '100 900',
      style: 'normal',
    },
    {
      path: '../fonts/InstrumentSans-Italic-VariableFont_wdth,wght.ttf',
      weight: '100 900',
      style: 'italic',
    },
  ],
  variable: '--font-instrument-sans',
  display: 'swap',
  preload: true,
  fallback: ['system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: 'berri-space - Document Management',
  description: 'Modern document management and collaboration platform',
  generator: 'v0.app',
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={`${instrumentSans.variable} font-sans antialiased`}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange={false}
          >
            <QueryProvider>
              <CommandSearchProvider>
                {children}
              </CommandSearchProvider>
            </QueryProvider>
          </ThemeProvider>
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  )
}
