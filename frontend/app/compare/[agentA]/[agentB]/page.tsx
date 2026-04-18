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

      {/* Stat tiles — label text-sm, value text-xl tabular-nums */}
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(s => (
          <div key={s.label} className="rounded-md border border-border bg-card p-5">
            <p className="font-mono text-sm uppercase tracking-wider text-muted-foreground">
              {s.label}
            </p>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span
                className={cn(
                  'font-mono text-xl tabular-nums',
                  s.winner === 'a' ? 'font-semibold text-success' : 'text-muted-foreground'
                )}
              >
                {s.aVal}
              </span>
              <span
                className={cn(
                  'font-mono text-xl tabular-nums',
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
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              {/* Group header: agent names span their 3 sub-columns */}
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
              {/* Sub-header: Tests / Time / Cost */}
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
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
        {challenges.length === 0 && (
          <div className="mt-8 rounded-lg border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">No shared challenges.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function fmtTests(
  sub: CompareChallengeSubmission | null,
  baselinePassing: number | null,
  brokenByBug: number | null
): string {
  if (!sub) return '\u2014'
  if (brokenByBug != null && brokenByBug > 0 && baselinePassing != null) {
    return `${sub.tests_fixed}/${brokenByBug} fixed`
  }
  return `${sub.tests_ok}/${sub.tests_total}`
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
      <td className="py-3 pr-4 text-right">
        <span
          className={cn(
            'font-mono tabular-nums',
            rowWinner === 'a' ? 'text-base font-semibold text-success' : 'text-sm text-muted-foreground/70'
          )}
        >
          {fmtTests(ch.a, ch.baseline_passing, ch.broken_by_bug)}
        </span>
      </td>
      <td className="py-3 pr-4 text-right">
        <span
          className={cn(
            'font-mono tabular-nums',
            rowWinner === 'a' ? 'text-base font-semibold text-success' : 'text-sm text-muted-foreground/70'
          )}
        >
          {ch.a ? fmtTime(ch.a.agent_time) : '\u2014'}
        </span>
      </td>
      <td className="py-3 pr-4 text-right">
        <span
          className={cn(
            'font-mono tabular-nums',
            rowWinner === 'a' ? 'text-base font-semibold text-success' : 'text-sm text-muted-foreground/70'
          )}
        >
          {ch.a ? fmtCost(ch.a.cost_usd) : '\u2014'}
        </span>
      </td>
      <td className="py-3 pr-4 text-right">
        <span
          className={cn(
            'font-mono tabular-nums',
            rowWinner === 'b' ? 'text-base font-semibold text-destructive' : 'text-sm text-muted-foreground/70'
          )}
        >
          {fmtTests(ch.b, ch.baseline_passing, ch.broken_by_bug)}
        </span>
      </td>
      <td className="py-3 pr-4 text-right">
        <span
          className={cn(
            'font-mono tabular-nums',
            rowWinner === 'b' ? 'text-base font-semibold text-destructive' : 'text-sm text-muted-foreground/70'
          )}
        >
          {ch.b ? fmtTime(ch.b.agent_time) : '\u2014'}
        </span>
      </td>
      <td className="py-3 pr-4 text-right">
        <span
          className={cn(
            'font-mono tabular-nums',
            rowWinner === 'b' ? 'text-base font-semibold text-destructive' : 'text-sm text-muted-foreground/70'
          )}
        >
          {ch.b ? fmtCost(ch.b.cost_usd) : '\u2014'}
        </span>
      </td>
      <td className="py-3 text-right">
        {ch.game ? (
          <Link
            href={`/games/${ch.game.id}`}
            className={cn(
              'font-mono text-sm hover:underline',
              rowWinner === 'a'
                ? 'text-success'
                : rowWinner === 'b'
                  ? 'text-destructive'
                  : 'text-muted-foreground'
            )}
          >
            {ch.game.score === 1 ? 'A' : ch.game.score === 0 ? 'B' : '—'}
          </Link>
        ) : (
          <span className="font-mono text-sm text-muted-foreground">{'\u2014'}</span>
        )}
      </td>
    </tr>
  )
}
