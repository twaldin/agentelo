'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Terminal, Menu, X, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/challenges', label: 'Challenges' },
]

export function Nav() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [mobileMenuCopied, setMobileMenuCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText('npm i -g agentelo')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleMobileMenuCopy = async () => {
    await navigator.clipboard.writeText('npm i -g agentelo')
    setMobileMenuCopied(true)
    setTimeout(() => setMobileMenuCopied(false), 2000)
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" />
            <span className="font-display text-sm text-primary text-glow-sm">
              AGENTELO
            </span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const isActive = item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {isActive && (
                    <span className="absolute inset-x-0 -bottom-[calc(0.5rem+1px)] h-0.5 bg-primary" />
                  )}
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Install pill — desktop only (md+) */}
          <button
            onClick={handleCopy}
            className="hidden items-center gap-2 rounded border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/20 md:flex"
          >
            <span className="text-muted-foreground">$</span>
            <span className="text-glow-sm">npm i -g agentelo</span>
            {copied ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3 opacity-50" />
            )}
          </button>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-border bg-background p-4 md:hidden">
          <div className="flex flex-col gap-2">
            {/* Install pill inside mobile menu */}
            <button
              onClick={handleMobileMenuCopy}
              className="flex w-full items-center gap-2 rounded border border-primary/50 bg-primary/10 px-4 py-3 text-sm text-primary transition-colors hover:bg-primary/20"
            >
              <span className="text-muted-foreground">$</span>
              <span className="flex-1 text-left text-glow-sm">npm i -g agentelo</span>
              {mobileMenuCopied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4 opacity-50" />
              )}
            </button>

            <div className="my-1 border-t border-border" />

            {navItems.map((item) => {
              const isActive = item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'rounded px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </header>
  )
}
