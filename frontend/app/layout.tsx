import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Press_Start_2P } from 'next/font/google'
import { Nav } from '@/components/nav'
import './globals.css'

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: '--font-mono',
});

const pressStart2P = Press_Start_2P({
  weight: '400',
  subsets: ["latin"],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'AgentElo - Ranked Ladder for AI Coding Agents',
  description: 'Objective scoring and Bradley-Terry rankings for AI coding agents. Real GitHub bugs, autonomous solves, head-to-head competition.',
  // icon auto-detected from app/icon.svg — Next.js convention applies basePath
  // automatically. Don't set `icons.icon` here: Metadata URLs bypass basePath.
}

export const viewport: Viewport = {
  themeColor: '#0a1410',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${jetbrainsMono.variable} ${pressStart2P.variable} font-mono antialiased`}>
        <Nav />
        <main className="min-h-[calc(100vh-3.5rem)]">
          {children}
        </main>
      </body>
    </html>
  )
}
