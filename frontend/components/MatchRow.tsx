'use client'

import { type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { type FixOutcome } from '@/lib/score'

export type ResultKind = 'pass' | 'fail' | 'draw' | 'no-data'

export type MatchRowProps = {
  result: { kind: ResultKind; label: string }
  primary: { prefix?: string; label: string; href?: string }
  stats: Array<{ value: string | ReactNode; color?: 'success' | 'destructive' | 'muted'; width?: string }>
  date?: string
  delta?: { value: string; unit: string; kind: 'gain' | 'loss' | 'neutral' }
  href?: string
}

const HARNESS_MAP: Record<string, { abbr: string; cls: string }> = {
  'swe-agent': { abbr: 'SWE', cls: 'bg-primary/20 text-primary border-primary/40' },
  'claude-code': { abbr: 'CCO', cls: 'bg-amber-500/20 text-amber-400 border-amber-400/40' },
  opencode: { abbr: 'OPC', cls: 'bg-cyan-500/20 text-cyan-400 border-cyan-400/40' },
  codex: { abbr: 'CDX', cls: 'bg-purple-500/20 text-purple-400 border-purple-400/40' },
  aider: { abbr: 'AID', cls: 'bg-destructive/20 text-destructive border-destructive/40' },
  gemini: { abbr: 'GEM', cls: 'bg-blue-500/20 text-blue-400 border-blue-400/40' },
}

export function HarnessChip({ harness }: { harness: string }) {
  const h = harness.toLowerCase()
  const match = Object.entries(HARNESS_MAP).find(([key]) => h.includes(key))
  const { abbr, cls } = match
    ? match[1]
    : { abbr: harness.slice(0, 3).toUpperCase(), cls: 'bg-muted/20 text-muted-foreground border-border' }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded px-2 py-1 shrink-0',
        'font-mono text-xs font-bold tracking-wider border',
        cls
      )}
    >
      {abbr}
    </span>
  )
}

export function ResultBadge({ kind, label }: { kind: ResultKind; label: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center min-w-[5rem] px-3 py-1.5 shrink-0',
        'font-mono text-xs font-bold uppercase tracking-wider',
        kind === 'pass' && 'bg-success/15 text-success border-y border-l border-success/50',
        kind === 'fail' && 'bg-destructive/15 text-destructive border-y border-l border-destructive/50',
        kind === 'draw' && 'bg-warning/15 text-warning border-y border-l border-warning/50',
        kind === 'no-data' && 'bg-muted/20 text-muted-foreground border-y border-l border-border',
      )}
      style={{ clipPath: 'polygon(0 0, 100% 0, calc(100% - 0.75rem) 100%, 0 100%)' }}
    >
      {label}
    </div>
  )
}

export function buildBadge(outcome: FixOutcome): { kind: ResultKind; label: string } {
  switch (outcome.kind) {
    case 'full':
      return { kind: 'pass', label: `PASS ${outcome.delta}/${outcome.goal}` }
    case 'partial':
    case 'regression':
      return { kind: 'fail', label: `FAIL ${outcome.delta}/${outcome.goal}` }
    case 'no-progress':
      return { kind: 'fail', label: `FAIL 0/${outcome.goal}` }
    case 'no-data':
      return { kind: 'no-data', label: '\u2014' }
    case 'unbaselined':
      return outcome.ok >= outcome.total
        ? { kind: 'pass', label: `PASS ${outcome.ok}/${outcome.total}` }
        : { kind: 'fail', label: `FAIL ${outcome.ok}/${outcome.total}` }
  }
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '\u2014'
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`
}

export function MatchRow({ result, primary, stats, date, delta, href }: MatchRowProps) {
  const router = useRouter()
  const inner = (
    <div className="flex items-stretch gap-4 px-4 py-2.5 transition-colors group-hover:bg-card/50">
      <ResultBadge kind={result.kind} label={result.label} />

      <div className="flex min-w-0 flex-1 items-center gap-2">
        {primary.prefix && (
          <span className="hidden font-mono text-xs uppercase text-muted-foreground shrink-0 md:inline">
            {primary.prefix}
          </span>
        )}
        {primary.href ? (
          <Link
            href={primary.href}
            className="truncate font-mono text-sm font-semibold text-foreground hover:text-primary"
            onClick={e => e.stopPropagation()}
          >
            {primary.label}
          </Link>
        ) : (
          <span className="truncate font-mono text-sm font-semibold text-foreground group-hover:text-primary">
            {primary.label}
          </span>
        )}
      </div>

      {/* Trailing cells — fixed widths so columns align across rows */}
      <div className="hidden items-center md:flex shrink-0">
        {stats.map((s, i) => {
          const w = s.width ?? 'w-20'
          const isNode = typeof s.value !== 'string'
          if (isNode) {
            return (
              <div key={i} className={cn('flex items-center justify-end', w)}>
                {s.value}
              </div>
            )
          }
          return (
            <span
              key={i}
              className={cn(
                'font-mono text-sm tabular-nums whitespace-nowrap text-right',
                w,
                s.color === 'success' && 'text-success',
                s.color === 'destructive' && 'text-destructive',
                s.color === 'muted' && 'text-muted-foreground',
                !s.color && 'text-foreground'
              )}
            >
              {s.value as string}
            </span>
          )
        })}
        {date && (
          <span className="w-20 text-right font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap self-center">
            {date}
          </span>
        )}
        {delta && (
          <span className={cn(
            'w-24 text-right font-mono text-sm tabular-nums whitespace-nowrap self-center',
            delta.kind === 'gain' && 'text-success',
            delta.kind === 'loss' && 'text-destructive',
            delta.kind === 'neutral' && 'text-muted-foreground'
          )}>
            {delta.value}{' '}
            <span className="text-muted-foreground text-xs">{delta.unit}</span>
          </span>
        )}
        <span className="w-6 text-right self-center font-mono text-xs text-muted-foreground group-hover:text-primary">
          →
        </span>
      </div>

      {/* Mobile: just the arrow */}
      <span className="self-center font-mono text-xs text-muted-foreground group-hover:text-primary shrink-0 md:hidden">
        →
      </span>
    </div>
  )

  if (href) {
    if (primary.href) {
      return (
        <div
          className="block group cursor-pointer"
          onClick={() => router.push(href)}
        >
          {inner}
        </div>
      )
    }
    return (
      <Link href={href} className="block group">
        {inner}
      </Link>
    )
  }
  return <div className="group">{inner}</div>
}
