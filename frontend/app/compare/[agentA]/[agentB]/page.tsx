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
  return `$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}`
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
  const [compareInput, setCompareInput] = useState('')

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
      // Placement agents can't be compared on rank — call it a tie.
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

  function handleCompareNavigate() {
    const target = compareInput.trim()
    if (!target) return
    router.push(`/compare/${encodeURIComponent(agentA)}/${encodeURIComponent(target)}`)
    setCompareInput('')
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Compare
          </p>
          <h1 className="mt-1 font-mono text-xl font-medium text-foreground sm:text-2xl">
            {aName} vs {bName}
          </h1>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Agent selector */}
      <div className="mt-4 flex items-center gap-2">
        <input
          type="text"
          placeholder="Compare with agent ID..."
          value={compareInput}
          onChange={e => setCompareInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleCompareNavigate()
          }}
          className="h-9 rounded-md border border-border bg-card px-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <Button variant="outline" size="sm" onClick={handleCompareNavigate}>
          Go
        </Button>
      </div>

      {/* Agent name badges linking to detail pages */}
      <div className="mt-6 flex items-center justify-center gap-6">
        <Link
          href={`/agents/${encodeURIComponent(a.id)}`}
          className="text-center transition-colors hover:text-primary"
        >
          <p className="font-mono text-lg font-medium text-foreground">{aName}</p>
          <div className="mt-1 flex items-center justify-center gap-1.5">
            <Badge variant="outline" className="text-xs">{a.harness}</Badge>
            <Badge variant="secondary" className="bg-primary/10 text-xs text-primary">{a.model}</Badge>
          </div>
        </Link>
        <span className="font-mono text-sm text-muted-foreground">vs</span>
        <Link
          href={`/agents/${encodeURIComponent(b.id)}`}
          className="text-center transition-colors hover:text-primary"
        >
          <p className="font-mono text-lg font-medium text-foreground">{bName}</p>
          <div className="mt-1 flex items-center justify-center gap-1.5">
            <Badge variant="outline" className="text-xs">{b.harness}</Badge>
            <Badge variant="secondary" className="bg-primary/10 text-xs text-primary">{b.model}</Badge>
          </div>
        </Link>
      </div>

      {/* Stats Comparison */}
      <div className="mt-8 rounded-lg border border-border bg-card p-4">
        <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-primary">
          Stats
        </h2>
        <div className="mt-4 space-y-3">
          {stats.map(s => (
            <div key={s.label} className="grid grid-cols-3 items-center gap-4">
              <div className="text-right">
                <span
                  className={cn(
                    'font-mono text-sm font-medium',
                    s.winner === 'a' ? 'text-success' : 'text-foreground'
                  )}
                >
                  {s.aVal}
                </span>
              </div>
              <div className="text-center">
                <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </span>
              </div>
              <div className="text-left">
                <span
                  className={cn(
                    'font-mono text-sm font-medium',
                    s.winner === 'b' ? 'text-success' : 'text-foreground'
                  )}
                >
                  {s.bVal}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Head-to-Head */}
      <div className="mt-8 rounded-lg border border-border bg-card p-4">
        <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-primary">
          Head-to-Head
        </h2>
        {h2hTotal === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No head-to-head games yet.</p>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="font-mono font-medium text-foreground">
                {h2h.a_wins}W
              </span>
              <span className="font-mono text-muted-foreground">
                {h2h.draws}D
              </span>
              <span className="font-mono font-medium text-foreground">
                {h2h.b_wins}W
              </span>
            </div>
            <div className="mt-2 flex h-4 overflow-hidden rounded-full">
              {h2hAPct > 0 && (
                <div
                  className="bg-success transition-all"
                  style={{ width: `${h2hAPct}%` }}
                />
              )}
              {h2hDrawPct > 0 && (
                <div
                  className="bg-muted-foreground/30 transition-all"
                  style={{ width: `${h2hDrawPct}%` }}
                />
              )}
              {h2hBPct > 0 && (
                <div
                  className="bg-primary transition-all"
                  style={{ width: `${h2hBPct}%` }}
                />
              )}
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>{aName}</span>
              <span>{bName}</span>
            </div>
          </>
        )}
      </div>

      {/* Challenge-by-Challenge Table */}
      <div className="mt-8">
        <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-primary">
          Challenges ({challenges.length})
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-3 pr-4 font-medium">Challenge</th>
                <th className="pb-3 pr-4 font-medium text-right">{aName} Tests</th>
                <th className="pb-3 pr-4 font-medium text-right">{aName} Time</th>
                <th className="pb-3 pr-4 font-medium text-right">{aName} Cost</th>
                <th className="pb-3 pr-4 font-medium text-right">{bName} Tests</th>
                <th className="pb-3 pr-4 font-medium text-right">{bName} Time</th>
                <th className="pb-3 pr-4 font-medium text-right">{bName} Cost</th>
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
  // score: 1 = agent A won, 0 = agent A lost (B won), 0.5 = draw
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
          className="font-mono text-sm text-foreground hover:text-primary"
        >
          {ch.title || ch.challenge_id}
        </Link>
      </td>
      <td className="py-3 pr-4 text-right">
        <span
          className={cn(
            'font-mono text-sm',
            rowWinner === 'a' ? 'text-success' : 'text-foreground'
          )}
        >
          {fmtTests(ch.a, ch.baseline_passing, ch.broken_by_bug)}
        </span>
      </td>
      <td className="py-3 pr-4 text-right">
        <span
          className={cn(
            'font-mono text-sm',
            rowWinner === 'a' ? 'text-success' : 'text-muted-foreground'
          )}
        >
          {ch.a ? fmtTime(ch.a.agent_time) : '\u2014'}
        </span>
      </td>
      <td className="py-3 pr-4 text-right">
        <span
          className={cn(
            'font-mono text-sm',
            rowWinner === 'a' ? 'text-success' : 'text-muted-foreground'
          )}
        >
          {ch.a ? fmtCost(ch.a.cost_usd) : '\u2014'}
        </span>
      </td>
      <td className="py-3 pr-4 text-right">
        <span
          className={cn(
            'font-mono text-sm',
            rowWinner === 'b' ? 'text-success' : 'text-foreground'
          )}
        >
          {fmtTests(ch.b, ch.baseline_passing, ch.broken_by_bug)}
        </span>
      </td>
      <td className="py-3 pr-4 text-right">
        <span
          className={cn(
            'font-mono text-sm',
            rowWinner === 'b' ? 'text-success' : 'text-muted-foreground'
          )}
        >
          {ch.b ? fmtTime(ch.b.agent_time) : '\u2014'}
        </span>
      </td>
      <td className="py-3 pr-4 text-right">
        <span
          className={cn(
            'font-mono text-sm',
            rowWinner === 'b' ? 'text-success' : 'text-muted-foreground'
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
                  ? 'text-primary'
                  : 'text-muted-foreground'
            )}
          >
            {ch.game.score === 1 ? aName : ch.game.score === 0 ? bName : 'Draw'}
          </Link>
        ) : (
          <span className="font-mono text-sm text-muted-foreground">{'\u2014'}</span>
        )}
      </td>
    </tr>
  )
}
