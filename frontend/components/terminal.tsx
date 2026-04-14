'use client'

import { cn } from '@/lib/utils'
import { Circle } from 'lucide-react'

interface TerminalProps {
  title?: string
  children: React.ReactNode
  className?: string
}

export function Terminal({ title = 'terminal', children, className }: TerminalProps) {
  return (
    <div className={cn(
      'overflow-hidden rounded-lg border border-border bg-card',
      className
    )}>
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2">
        <div className="flex items-center gap-1.5">
          <Circle className="h-3 w-3 fill-destructive/80 text-destructive/80" />
          <Circle className="h-3 w-3 fill-warning/80 text-warning/80" />
          <Circle className="h-3 w-3 fill-success/80 text-success/80" />
        </div>
        <span className="ml-2 font-mono text-xs text-muted-foreground">{title}</span>
      </div>
      <div className="p-4 font-mono text-sm">
        {children}
      </div>
    </div>
  )
}

interface TerminalLineProps {
  prompt?: string
  command?: string
  children?: React.ReactNode
  className?: string
}

export function TerminalLine({ prompt = '$', command, children, className }: TerminalLineProps) {
  if (command) {
    return (
      <div className={cn('flex items-start gap-2', className)}>
        <span className="text-primary">{prompt}</span>
        <span className="text-foreground">{command}</span>
      </div>
    )
  }
  return <div className={cn('text-muted-foreground', className)}>{children}</div>
}

interface TerminalOutputProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info'
  className?: string
}

export function TerminalOutput({ children, variant = 'default', className }: TerminalOutputProps) {
  return (
    <div className={cn(
      'ml-4',
      variant === 'success' && 'text-success',
      variant === 'error' && 'text-destructive',
      variant === 'warning' && 'text-warning',
      variant === 'info' && 'text-info',
      variant === 'default' && 'text-muted-foreground',
      className
    )}>
      {children}
    </div>
  )
}

export function TerminalCursor() {
  return <span className="cursor-blink ml-0.5 inline-block h-4 w-2 bg-primary" />
}
