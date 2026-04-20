'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ArrowRight } from 'lucide-react'
import { classifyFix, type FixOutcome } from '@/lib/score'
import { ResultBadge, type ResultKind } from '@/components/MatchRow'
import type { CompareChallengeEntry, CompareChallengeSubmission } from '@/lib/api'

export function fmtTime(secs: number): string {
  if (!secs) return '\u2014'
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function fmtCost(usd: number | null): string {
  if (usd == null || usd === 0) return '\u2014'
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

export function shortName(n: string): string {
  const parts = n.split('-')
  if (parts.length >= 3) return parts.slice(-2).join('-')
  if (parts.length === 2) return parts[1]
  return n.length > 8 ? n.slice(0, 7) + '\u2026' : n
}

export function fmtTests(
  sub: CompareChallengeSubmission | null,
  baselinePassing: number | null,
  brokenByBug: number | null
): string {
  if (!sub) return '\u2014'
  const outcome = classifyFix(sub.tests_ok, sub.tests_total, baselinePassing, brokenByBug)
  switch (outcome.kind) {
    case 'full': return `${outcome.delta}/${outcome.goal} \u2714`
    case 'partial': return `${outcome.delta}/${outcome.goal}`
    case 'no-progress': return `0/${outcome.goal}`
    case 'regression': return `${outcome.delta}/${outcome.goal}`
    case 'no-data': return '\u2014'
    case 'unbaselined': return `${outcome.ok}/${outcome.total}`
  }
}

type ChallengeRowProps = {
  ch: CompareChallengeEntry
  aName: string
  bName: string
}

function computeRowState(ch: CompareChallengeEntry) {
  let rowWinner: 'a' | 'b' | 'draw' | null = null
  if (ch.game) {
    if (ch.game.score === 1) rowWinner = 'a'
    else if (ch.game.score === 0) rowWinner = 'b'
    else rowWinner = 'draw'
  }

  const aOutcome: FixOutcome = ch.a
    ? classifyFix(ch.a.tests_ok, ch.a.tests_total, ch.baseline_passing, ch.broken_by_bug)
    : { kind: 'no-data' }
  const bOutcome: FixOutcome = ch.b
    ? classifyFix(ch.b.tests_ok, ch.b.tests_total, ch.baseline_passing, ch.broken_by_bug)
    : { kind: 'no-data' }

  const aTestColor = aOutcome.kind === 'regression'
    ? 'text-destructive'
    : rowWinner === 'a' ? 'text-success' : 'text-muted-foreground'
  const bTestColor = bOutcome.kind === 'regression'
    ? 'text-destructive'
    : rowWinner === 'b' ? 'text-success' : 'text-muted-foreground'

  const aColor = rowWinner === 'a' ? 'text-success' : 'text-muted-foreground'
  const bColor = rowWinner === 'b' ? 'text-success' : 'text-muted-foreground'

  const winnerKind: ResultKind = rowWinner === 'a' ? 'pass' : rowWinner === 'b' ? 'fail' : rowWinner === 'draw' ? 'draw' : 'no-data'
  const winnerLabel = rowWinner === 'a' ? 'A WINS' : rowWinner === 'b' ? 'B WINS' : rowWinner === 'draw' ? 'DRAW' : '\u2014'

  return { rowWinner, aTestColor, bTestColor, aColor, bColor, winnerKind, winnerLabel }
}

export function MobileChallengeCard({ ch, aName, bName }: ChallengeRowProps) {
  const { rowWinner, aTestColor, bTestColor, winnerKind, winnerLabel } = computeRowState(ch)

  return (
    <div className="bg-card p-4">
      <div className="flex items-center gap-3">
        {ch.game && <ResultBadge kind={winnerKind} label={winnerLabel} />}
        <Link
          href={`/challenges/${ch.challenge_id}`}
          className="flex-1 min-w-0 font-mono text-sm text-muted-foreground hover:text-primary truncate"
        >
          {ch.title || ch.challenge_id}
        </Link>
        {ch.game && (
          <Link href={`/games/${ch.game.id}`} className="shrink-0 text-muted-foreground hover:text-primary">
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={cn('font-mono text-xs truncate', rowWinner === 'a' ? 'text-success font-medium' : 'text-muted-foreground')}>
          {shortName(aName)}
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <span className={cn('font-mono text-xs tabular-nums', aTestColor)}>
            {fmtTests(ch.a, ch.baseline_passing, ch.broken_by_bug)}
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {ch.a ? fmtTime(ch.a.agent_time) : '\u2014'}
          </span>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <span className={cn('font-mono text-xs truncate', rowWinner === 'b' ? 'text-success font-medium' : 'text-muted-foreground')}>
          {shortName(bName)}
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <span className={cn('font-mono text-xs tabular-nums', bTestColor)}>
            {fmtTests(ch.b, ch.baseline_passing, ch.broken_by_bug)}
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {ch.b ? fmtTime(ch.b.agent_time) : '\u2014'}
          </span>
        </div>
      </div>
    </div>
  )
}

export function ChallengeRow({ ch, aName: _aName, bName: _bName }: ChallengeRowProps) {
  const { aTestColor, bTestColor, aColor, bColor, winnerKind, winnerLabel } = computeRowState(ch)

  return (
    <div className="flex items-stretch gap-3 py-1.5 transition-colors hover:bg-card/50 group">
      <ResultBadge kind={winnerKind} label={winnerLabel} />

      <div className="flex min-w-0 flex-1 items-center">
        <Link
          href={`/challenges/${ch.challenge_id}`}
          className="truncate font-mono text-sm text-foreground hover:text-primary"
        >
          {ch.title || ch.challenge_id}
        </Link>
      </div>

      <div className="hidden items-center gap-1 md:flex">
        <span className={cn('font-mono text-sm tabular-nums whitespace-nowrap', aTestColor)}>
          {fmtTests(ch.a, ch.baseline_passing, ch.broken_by_bug)}
        </span>
        <span className={cn('font-mono text-xs tabular-nums whitespace-nowrap', aColor)}>
          · {ch.a ? fmtTime(ch.a.agent_time) : '\u2014'} · {ch.a ? fmtCost(ch.a.cost_usd) : '\u2014'}
        </span>
      </div>

      <span className="hidden self-center font-mono text-xs text-muted-foreground md:block">·</span>

      <div className="hidden items-center gap-1 md:flex">
        <span className={cn('font-mono text-sm tabular-nums whitespace-nowrap', bTestColor)}>
          {fmtTests(ch.b, ch.baseline_passing, ch.broken_by_bug)}
        </span>
        <span className={cn('font-mono text-xs tabular-nums whitespace-nowrap', bColor)}>
          · {ch.b ? fmtTime(ch.b.agent_time) : '\u2014'} · {ch.b ? fmtCost(ch.b.cost_usd) : '\u2014'}
        </span>
      </div>

      {ch.game ? (
        <Link
          href={`/games/${ch.game.id}`}
          className="self-center font-mono text-xs text-muted-foreground hover:text-primary shrink-0 pr-2"
        >
          →
        </Link>
      ) : (
        <span className="self-center font-mono text-xs text-muted-foreground shrink-0 pr-2">→</span>
      )}
    </div>
  )
}
