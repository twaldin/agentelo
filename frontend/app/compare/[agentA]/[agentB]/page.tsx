'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ArrowLeftRight, ArrowRight } from 'lucide-react'
import {
  fetchCompare,
  type CompareResult,
  type CompareAgentStats,
  type CompareChallengeEntry,
  type CompareChallengeSubmission,
} from '@/lib/api'
import AgentPicker from '@/components/AgentPicker'
import { classifyFix, fixLabel, fixColor, type FixOutcome } from '@/lib/score'

interface PageProps {
  params: Promise<{ agentA: string; agentB: string }>
}

function fmtTime(secs: number): string {
  if (!secs) return '\u2014'
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function fmtCost(usd: number | null): string {
  if (usd == null || usd === 0) return '\u2014'
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

function statWinner(
  aVal: number | null,
  bVal: number | null,
  lowerIsBetter = false
): 'a' | 'b' | 'tie' {
  if (aVal == null && bVal == null) return 'tie'
  if (aVal == null) return 'b'
  if (bVal == null) return 'a'
  if (aVal === bVal) return 'tie'
  if (lowerIsBetter) return aVal < bVal ? 'a' : 'b'
  return aVal > bVal ? 'a' : 'b'
}

// Derives a short display name from a full agent id
function shortName(n: string): string {
  const parts = n.split('-')
  if (parts.length >= 3) return parts.slice(-2).join('-')
  if (parts.length === 2) return parts[1]
  return n.length > 8 ? n.slice(0, 7) + '\u2026' : n
}

function fmtTests(
  sub: CompareChallengeSubmission | null,
  baselinePassing: number | null,
  brokenByBug: number | null
): string {
  if (!sub) return '\u2014'
  const outcome = classifyFix(sub.tests_ok, sub.tests_total, baselinePassing, brokenByBug)
  return fixLabel(outcome)
}

export default function ComparePage({ params }: PageProps) {
  const { agentA, agentB } = use(params)
  const router = useRouter()
  const [data, setData] = useState<CompareResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchCompare(agentA, agentB)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [agentA, agentB])

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 rounded bg-muted" />
          <div className="h-10 w-96 rounded bg-muted" />
          <div className="h-40 rounded bg-muted" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="text-destructive">Failed to load comparison: {error || 'Not found'}</p>
        </div>
      </div>
    )
  }

  const { a, b, h2h, challenges } = data
  const aName = (a.display_name || a.id).trim()
  const bName = (b.display_name || b.id).trim()
  const shortA = shortName(aName)
  const shortB = shortName(bName)

  const h2hTotal = h2h.a_wins + h2h.b_wins + h2h.draws
  const h2hAPct = h2hTotal > 0 ? (h2h.a_wins / h2hTotal) * 100 : 0
  const h2hDrawPct = h2hTotal > 0 ? (h2h.draws / h2hTotal) * 100 : 0
  const h2hBPct = h2hTotal > 0 ? (h2h.b_wins / h2hTotal) * 100 : 0

  const stats: {
    label: string
    aVal: string
    bVal: string
    winner: 'a' | 'b' | 'tie'
  }[] = [
    {
      label: 'ELO',
      aVal: String(a.elo),
      bVal: String(b.elo),
      winner: statWinner(a.elo, b.elo),
    },
    {
      label: 'Rank',
      aVal: a.rank !== null ? `#${a.rank}` : 'placement',
      bVal: b.rank !== null ? `#${b.rank}` : 'placement',
      winner: (a.rank === null || b.rank === null) ? 'tie' : statWinner(a.rank, b.rank, true),
    },
    {
      label: 'Win Rate',
      aVal: `${Math.round(a.wr * 100)}%`,
      bVal: `${Math.round(b.wr * 100)}%`,
      winner: statWinner(a.wr, b.wr),
    },
    {
      label: 'Games',
      aVal: String(a.played),
      bVal: String(b.played),
      winner: statWinner(a.played, b.played),
    },
    {
      label: 'Avg Cost',
      aVal: fmtCost(a.avgCost),
      bVal: fmtCost(b.avgCost),
      winner: statWinner(a.avgCost, b.avgCost, true),
    },
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header — stacks vertically on mobile, side-by-side on md+ */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
            Compare
          </p>
          {/* Agent names: vertical on mobile, horizontal on md+ */}
          <h1 className="mt-1 flex flex-col gap-1 font-mono text-lg font-medium text-foreground md:flex-row md:flex-wrap md:items-baseline md:gap-x-3 md:gap-y-1 sm:text-xl md:text-2xl">
            <Link
              href={`/agents/${encodeURIComponent(a.id)}`}
              className="whitespace-nowrap transition-colors hover:text-primary"
            >
              {aName}
            </Link>
            <span className="text-sm text-muted-foreground">vs</span>
            <Link
              href={`/agents/${encodeURIComponent(b.id)}`}
              className="whitespace-nowrap transition-colors hover:text-primary"
            >
              {bName}
            </Link>
          </h1>
        </div>
        {/* Picker + Swap: full-width on mobile, auto on md+ */}
        <div className="flex w-full flex-row items-center gap-2 md:w-auto">
          <AgentPicker
            currentAgentId={a.id}
            currentElo={a.elo}
            placeholder="Compare with…"
            buildHref={(t) => `/compare/${encodeURIComponent(a.id)}/${encodeURIComponent(t)}`}
            className="flex-1 md:flex-none"
            fullWidth
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/compare/${encodeURIComponent(agentB)}/${encodeURIComponent(agentA)}`)}
          >
            <ArrowLeftRight className="mr-1.5 h-4 w-4" />
            Swap
          </Button>
        </div>
      </div>

      {/* Stat tiles — 1 col mobile, 3 col md, 5 col lg */}
      <div className="mt-6 grid grid-cols-1 gap-2 md:grid-cols-3 lg:grid-cols-5">
        {stats.map(s => (
          <div key={s.label} className="rounded-md border border-border bg-card p-4 md:p-5">
            <p className="font-mono text-sm text-muted-foreground">
              {s.label}
            </p>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span
                className={cn(
                  'font-mono text-xl tabular-nums whitespace-nowrap',
                  s.winner === 'a' ? 'font-semibold text-success' : 'text-muted-foreground'
                )}
              >
                {s.aVal}
              </span>
              <span
                className={cn(
                  'font-mono text-xl tabular-nums whitespace-nowrap',
                  s.winner === 'b' ? 'font-semibold text-success' : 'text-muted-foreground'
                )}
              >
                {s.bVal}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Head-to-Head */}
      <div className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-primary">
          Head-to-Head
          <span className="ml-2 text-xs font-normal text-muted-foreground">(N={h2hTotal})</span>
        </h2>
        {h2hTotal === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No head-to-head games yet.</p>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between text-sm">
              <div className="flex flex-col">
                <span className="font-mono text-xs text-muted-foreground">{aName}</span>
                <span className="font-mono text-base font-semibold text-success">
                  {h2h.a_wins}W
                </span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {h2h.draws} draws
              </span>
              <div className="flex flex-col items-end">
                <span className="font-mono text-xs text-muted-foreground">{bName}</span>
                <span className="font-mono text-base font-semibold text-muted-foreground">
                  {h2h.b_wins}W
                </span>
              </div>
            </div>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted/30">
              {h2hAPct > 0 && (
                <div
                  className="bg-success transition-all"
                  style={{ width: `${h2hAPct}%` }}
                  title={`${aName}: ${h2h.a_wins}W (${h2hAPct.toFixed(0)}%)`}
                />
              )}
              {h2hDrawPct > 0 && (
                <div
                  className="bg-muted-foreground/40 transition-all"
                  style={{ width: `${h2hDrawPct}%` }}
                  title={`${h2h.draws} draws`}
                />
              )}
              {h2hBPct > 0 && (
                <div
                  className="bg-muted-foreground/50 transition-all"
                  style={{ width: `${h2hBPct}%` }}
                  title={`${bName}: ${h2h.b_wins}W (${h2hBPct.toFixed(0)}%)`}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* Challenge-by-Challenge */}
      <div className="mt-6">
        <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-primary">
          Challenges ({challenges.length})
        </h2>

        {/* Mobile card stack */}
        <div className="mt-4 md:hidden">
          {challenges.length > 0 ? (
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border overflow-hidden">
              {challenges.map(ch => (
                <MobileChallengeCard
                  key={ch.challenge_id}
                  ch={ch}
                  aName={aName}
                  bName={bName}
                />
              ))}
            </div>
          ) : (
            <div className="mt-8 rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-muted-foreground">No shared challenges.</p>
            </div>
          )}
        </div>

        {/* Desktop table */}
        <div className="relative mt-4 hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-sm font-medium text-muted-foreground">
                  <th className="pb-3 pr-4">Challenge</th>
                  <th className="pb-3 pr-4 text-right">
                    <span className="text-muted-foreground" style={{ opacity: 0.7 }}>{shortA}</span>
                    {' Tests'}
                  </th>
                  <th className="pb-3 pr-4 text-right">
                    <span className="text-muted-foreground" style={{ opacity: 0.7 }}>{shortA}</span>
                    {' Time'}
                  </th>
                  <th className="pb-3 pr-4 text-right">
                    <span className="text-muted-foreground" style={{ opacity: 0.7 }}>{shortA}</span>
                    {' Cost'}
                  </th>
                  <th className="pb-3 pr-4 text-right">
                    <span className="text-muted-foreground" style={{ opacity: 0.7 }}>{shortB}</span>
                    {' Tests'}
                  </th>
                  <th className="pb-3 pr-4 text-right">
                    <span className="text-muted-foreground" style={{ opacity: 0.7 }}>{shortB}</span>
                    {' Time'}
                  </th>
                  <th className="pb-3 pr-4 text-right">
                    <span className="text-muted-foreground" style={{ opacity: 0.7 }}>{shortB}</span>
                    {' Cost'}
                  </th>
                  <th className="pb-3 text-right">Winner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {challenges.map(ch => (
                  <ChallengeRow
                    key={ch.challenge_id}
                    ch={ch}
                    aName={aName}
                    bName={bName}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {challenges.length === 0 && (
            <div className="mt-8 rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-muted-foreground">No shared challenges.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MobileChallengeCard({
  ch,
  aName,
  bName,
}: {
  ch: CompareChallengeEntry
  aName: string
  bName: string
}) {
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

  return (
    <div className="bg-card p-4">
      {/* Title row */}
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/challenges/${ch.challenge_id}`}
          className="font-mono text-sm text-muted-foreground hover:text-primary truncate"
        >
          {ch.title || ch.challenge_id}
        </Link>
        {ch.game && (
          <Link href={`/games/${ch.game.id}`} className="shrink-0 text-muted-foreground hover:text-primary">
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      <div className="mt-2 border-t border-border/50" />

      {/* Agent A row */}
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

      {/* Agent B row */}
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

      {/* Winner badge */}
      {ch.game && (
        <div className="mt-2 flex justify-end">
          <span className={cn(
            'font-mono text-xs px-2 py-0.5 rounded border',
            rowWinner === 'a'
              ? 'border-success/50 bg-success/10 text-success'
              : rowWinner === 'b'
                ? 'border-muted-foreground/30 bg-muted/20 text-muted-foreground'
                : 'border-muted-foreground/30 bg-muted/20 text-muted-foreground'
          )}>
            {rowWinner === 'a' ? 'A wins' : rowWinner === 'b' ? 'B wins' : 'Draw'}
          </span>
        </div>
      )}
    </div>
  )
}

function ChallengeRow({
  ch,
  aName,
  bName,
}: {
  ch: CompareChallengeEntry
  aName: string
  bName: string
}) {
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

  const cellBase = 'font-mono text-base tabular-nums whitespace-nowrap'

  return (
    <tr className="group transition-colors hover:bg-card/50">
      <td className="py-3 pr-4">
        <Link
          href={`/challenges/${ch.challenge_id}`}
          className="font-mono text-sm text-muted-foreground hover:text-primary"
        >
          {ch.title || ch.challenge_id}
        </Link>
      </td>
      <td className="py-3 pr-4 text-right">
        <span className={cn(cellBase, aTestColor)}>
          {fmtTests(ch.a, ch.baseline_passing, ch.broken_by_bug)}
        </span>
      </td>
      <td className="py-3 pr-4 text-right">
        <span className={cn(cellBase, aColor)}>
          {ch.a ? fmtTime(ch.a.agent_time) : '\u2014'}
        </span>
      </td>
      <td className="py-3 pr-4 text-right">
        <span className={cn(cellBase, aColor)}>
          {ch.a ? fmtCost(ch.a.cost_usd) : '\u2014'}
        </span>
      </td>
      <td className="py-3 pr-4 text-right">
        <span className={cn(cellBase, bTestColor)}>
          {fmtTests(ch.b, ch.baseline_passing, ch.broken_by_bug)}
        </span>
      </td>
      <td className="py-3 pr-4 text-right">
        <span className={cn(cellBase, bColor)}>
          {ch.b ? fmtTime(ch.b.agent_time) : '\u2014'}
        </span>
      </td>
      <td className="py-3 pr-4 text-right">
        <span className={cn(cellBase, bColor)}>
          {ch.b ? fmtCost(ch.b.cost_usd) : '\u2014'}
        </span>
      </td>
      <td className="py-3 text-right">
        {ch.game ? (
          <Link
            href={`/games/${ch.game.id}`}
            className={cn(
              'font-mono text-base hover:underline',
              rowWinner === 'a'
                ? 'text-success'
                : rowWinner === 'b'
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground'
            )}
          >
            {ch.game.score === 1 ? 'A' : ch.game.score === 0 ? 'B' : '\u2014'}
          </Link>
        ) : (
          <span className="font-mono text-base text-muted-foreground">{'\u2014'}</span>
        )}
      </td>
    </tr>
  )
}
