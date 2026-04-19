'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeftRight } from 'lucide-react'
import {
  fetchCompare,
  type CompareResult,
  type CompareAgentStats,
  type CompareChallengeEntry,
  type CompareChallengeSubmission,
} from '@/lib/api'
import AgentPicker from '@/components/AgentPicker'
import { classifyFix, fixLabel, fixColor } from '@/lib/score'

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

  const h2hTotal = h2h.a_wins + h2h.b_wins + h2h.draws
  const h2hAPct = h2hTotal > 0 ? (h2h.a_wins / h2hTotal) * 100 : 0
  const h2hDrawPct = h2hTotal > 0 ? (h2h.draws / h2hTotal) * 100 : 0
  const h2hBPct = h2hTotal > 0 ? (h2h.b_wins / h2hTotal) * 100 : 0

  // Stat strip values (fix #6)
  const eloWinner = statWinner(a.elo, b.elo)
  const wrWinner = statWinner(a.wr, b.wr)
  const costWinner = statWinner(a.avgCost, b.avgCost, true)

  const eloDelta = a.elo - b.elo
  const wrDeltaPp = Math.round(a.wr * 100) - Math.round(b.wr * 100)
  const costDeltaPct = (a.avgCost != null && b.avgCost != null && b.avgCost > 0)
    ? Math.round(((a.avgCost - b.avgCost) / b.avgCost) * 100)
    : null

  const stripStats = [
    {
      label: 'ELO',
      aDisplay: String(a.elo),
      bDisplay: String(b.elo),
      aWins: eloWinner === 'a',
      bWins: eloWinner === 'b',
      deltaText: eloDelta === 0 ? 'tied'
        : `${eloDelta > 0 ? '▲' : '▼'} ${Math.abs(eloDelta)}`,
      deltaColor: eloWinner === 'a' ? 'text-success' : eloWinner === 'b' ? 'text-destructive' : 'text-muted-foreground',
    },
    {
      label: 'Win Rate',
      aDisplay: `${Math.round(a.wr * 100)}%`,
      bDisplay: `${Math.round(b.wr * 100)}%`,
      aWins: wrWinner === 'a',
      bWins: wrWinner === 'b',
      deltaText: wrDeltaPp === 0 ? 'tied'
        : `${wrDeltaPp > 0 ? '▲' : '▼'} ${Math.abs(wrDeltaPp)}pp`,
      deltaColor: wrWinner === 'a' ? 'text-success' : wrWinner === 'b' ? 'text-destructive' : 'text-muted-foreground',
    },
    {
      label: 'Avg Cost',
      aDisplay: fmtCost(a.avgCost),
      bDisplay: fmtCost(b.avgCost),
      aWins: costWinner === 'a',
      bWins: costWinner === 'b',
      deltaText: costDeltaPct == null ? '\u2014'
        : costDeltaPct === 0 ? 'tied'
        : `${costDeltaPct < 0 ? '▼' : '▲'} ${Math.abs(costDeltaPct)}%`,
      deltaColor: costWinner === 'a' ? 'text-success' : costWinner === 'b' ? 'text-destructive' : 'text-muted-foreground',
    },
    {
      label: 'Games',
      aDisplay: String(a.played),
      bDisplay: String(b.played),
      aWins: false,
      bWins: false,
      deltaText: '\u2500',
      deltaColor: 'text-muted-foreground',
    },
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
            Compare
          </p>
          <h1 className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-xl font-medium text-foreground sm:text-2xl">
            <Link
              href={`/agents/${encodeURIComponent(a.id)}`}
              className="transition-colors hover:text-primary"
            >
              {aName}
            </Link>
            <span className="text-sm text-muted-foreground">vs</span>
            <Link
              href={`/agents/${encodeURIComponent(b.id)}`}
              className="transition-colors hover:text-primary"
            >
              {bName}
            </Link>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <AgentPicker
            currentAgentId={a.id}
            currentElo={a.elo}
            placeholder="Compare with…"
            buildHref={(t) => `/compare/${encodeURIComponent(a.id)}/${encodeURIComponent(t)}`}
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

      {/* Stat Strip (fix #6) */}
      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {stripStats.map((stat, i) => (
            <div
              key={stat.label}
              className={cn(
                'flex flex-col gap-1 p-4',
                i < stripStats.length - 1 && 'border-b border-border lg:border-b-0 lg:border-r sm:border-b lg:border-b-0'
              )}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {stat.label}
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className={cn(
                  'font-mono tabular-nums text-base',
                  stat.aWins ? 'font-semibold text-success' : 'text-muted-foreground'
                )}>
                  {stat.aDisplay}
                </span>
                <span className="text-xs text-muted-foreground/50">vs</span>
                <span className={cn(
                  'font-mono tabular-nums text-base',
                  stat.bWins ? 'font-semibold text-success' : 'text-muted-foreground'
                )}>
                  {stat.bDisplay}
                </span>
              </div>
              <p className={cn('font-mono text-xs', stat.deltaColor)}>
                {stat.deltaText}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Head-to-Head */}
      <div className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-primary">
          Head-to-Head
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
                <span className="font-mono text-base font-semibold text-destructive">
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
                  className="bg-destructive transition-all"
                  style={{ width: `${h2hBPct}%` }}
                  title={`${bName}: ${h2h.b_wins}W (${h2hBPct.toFixed(0)}%)`}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* Challenge-by-Challenge Table */}
      <div className="mt-6">
        <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-primary">
          Challenges ({challenges.length})
        </h2>
        <div className="relative mt-4 before:absolute before:right-0 before:top-0 before:z-10 before:h-full before:w-8 before:bg-gradient-to-l before:from-background before:to-transparent before:pointer-events-none sm:before:hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pb-2 pr-4" />
                  <th
                    colSpan={3}
                    className="border-b-2 border-success/40 pb-2 pr-4 text-center font-mono text-base font-medium text-success"
                  >
                    {aName}
                  </th>
                  <th
                    colSpan={3}
                    className="border-b-2 border-destructive/40 pb-2 pr-4 text-center font-mono text-base font-medium text-destructive"
                  >
                    {bName}
                  </th>
                  <th className="pb-2" />
                </tr>
                <tr className="border-b border-border text-left text-[10px] text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Challenge</th>
                  <th className="pb-3 pr-4 font-medium text-right">Tests</th>
                  <th className="pb-3 pr-4 font-medium text-right">Time</th>
                  <th className="pb-3 pr-4 font-medium text-right">Cost</th>
                  <th className="pb-3 pr-4 font-medium text-right">Tests</th>
                  <th className="pb-3 pr-4 font-medium text-right">Time</th>
                  <th className="pb-3 pr-4 font-medium text-right">Cost</th>
                  <th className="pb-3 font-medium text-right">Game</th>
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
        </div>
        {challenges.length === 0 && (
          <div className="mt-8 rounded-lg border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">No shared challenges.</p>
          </div>
        )}
      </div>
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

  const aOutcome = classifyFix(ch.a?.tests_ok, ch.a?.tests_total, ch.baseline_passing, ch.broken_by_bug)
  const bOutcome = classifyFix(ch.b?.tests_ok, ch.b?.tests_total, ch.baseline_passing, ch.broken_by_bug)

  return (
    <tr className="group transition-colors hover:bg-card/50">
      <td className="py-3 pr-4">
        <Link
          href={`/challenges/${ch.challenge_id}`}
          className="font-mono text-[13px] text-muted-foreground hover:text-primary"
        >
          {ch.title || ch.challenge_id}
        </Link>
      </td>
      {/* A: Tests */}
      <td className="py-3 pr-4 text-right whitespace-nowrap">
        <span className={cn('font-mono text-sm tabular-nums', ch.a ? fixColor(aOutcome) : 'text-muted-foreground/50')}>
          {ch.a ? fixLabel(aOutcome) : '\u2014'}
        </span>
      </td>
      {/* A: Time */}
      <td className="py-3 pr-4 text-right whitespace-nowrap">
        <span className={cn(
          'font-mono text-sm tabular-nums',
          rowWinner === 'a' ? 'text-success' : 'text-muted-foreground'
        )}>
          {ch.a ? fmtTime(ch.a.agent_time) : '\u2014'}
        </span>
      </td>
      {/* A: Cost */}
      <td className="py-3 pr-4 text-right whitespace-nowrap">
        <span className={cn(
          'font-mono text-sm tabular-nums',
          rowWinner === 'a' ? 'text-success' : 'text-muted-foreground'
        )}>
          {ch.a ? fmtCost(ch.a.cost_usd) : '\u2014'}
        </span>
      </td>
      {/* B: Tests */}
      <td className="py-3 pr-4 text-right whitespace-nowrap">
        <span className={cn('font-mono text-sm tabular-nums', ch.b ? fixColor(bOutcome) : 'text-muted-foreground/50')}>
          {ch.b ? fixLabel(bOutcome) : '\u2014'}
        </span>
      </td>
      {/* B: Time */}
      <td className="py-3 pr-4 text-right whitespace-nowrap">
        <span className={cn(
          'font-mono text-sm tabular-nums',
          rowWinner === 'b' ? 'text-success' : 'text-muted-foreground'
        )}>
          {ch.b ? fmtTime(ch.b.agent_time) : '\u2014'}
        </span>
      </td>
      {/* B: Cost */}
      <td className="py-3 pr-4 text-right whitespace-nowrap">
        <span className={cn(
          'font-mono text-sm tabular-nums',
          rowWinner === 'b' ? 'text-success' : 'text-muted-foreground'
        )}>
          {ch.b ? fmtCost(ch.b.cost_usd) : '\u2014'}
        </span>
      </td>
      {/* Game winner */}
      <td className="py-3 text-right whitespace-nowrap">
        {ch.game ? (
          <Link
            href={`/games/${ch.game.id}`}
            className={cn(
              'font-mono text-sm hover:underline',
              rowWinner === 'a' ? 'text-success'
                : rowWinner === 'b' ? 'text-destructive'
                : 'text-muted-foreground'
            )}
          >
            {rowWinner === 'a' ? aName : rowWinner === 'b' ? bName : 'draw'}
          </Link>
        ) : (
          <span className="font-mono text-sm text-muted-foreground">{'\u2014'}</span>
        )}
      </td>
    </tr>
  )
}
