'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ArrowLeftRight } from 'lucide-react'
import {
  fetchCompare,
  type CompareResult,
  type CompareAgentStats,
  type CompareChallengeEntry,
} from '@/lib/api'
import AgentPicker from '@/components/AgentPicker'
import { HarnessChip } from '@/components/MatchRow'
import { ChallengeRow, MobileChallengeCard, fmtCost } from '@/components/ChallengeRow'

interface PageProps {
  params: Promise<{ agentA: string; agentB: string }>
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

  const costWinner = statWinner(a.avgCost, b.avgCost, true)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Topbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">Compare</p>
        <div className="flex items-center gap-2">
          <AgentPicker
            currentAgentId={a.id}
            currentElo={a.elo}
            placeholder="Compare with…"
            buildHref={(t) => `/compare/${encodeURIComponent(a.id)}/${encodeURIComponent(t)}`}
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

      {/* Two-panel hero */}
      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-stretch md:gap-0">
        {/* Panel A */}
        <div className="flex-1 rounded-lg border border-border bg-card p-5 md:rounded-r-none">
          <div className="flex items-center gap-3">
            <HarnessChip harness={a.harness} />
            <Link
              href={`/agents/${encodeURIComponent(a.id)}`}
              className="font-mono text-lg font-semibold text-foreground hover:text-primary truncate min-w-0"
            >
              {aName}
            </Link>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums text-primary">{a.elo}</span>
            <span className="font-mono text-xs text-muted-foreground">ELO</span>
            {a.rank !== null && (
              <span className="font-mono text-sm tabular-nums text-muted-foreground">· #{a.rank}</span>
            )}
          </div>
          <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
            {Math.round(a.wr * 100)}% win · {a.played} games
          </p>
        </div>

        {/* VS */}
        <div className="flex items-center justify-center px-6 py-2 md:py-0">
          <span className="font-display text-xl text-primary text-glow-sm">VS</span>
        </div>

        {/* Panel B - mirrored */}
        <div className="flex-1 rounded-lg border border-border bg-card p-5 md:rounded-l-none md:text-right">
          <div className="flex items-center justify-start gap-3 md:flex-row-reverse">
            <HarnessChip harness={b.harness} />
            <Link
              href={`/agents/${encodeURIComponent(b.id)}`}
              className="font-mono text-lg font-semibold text-foreground hover:text-primary truncate min-w-0"
            >
              {bName}
            </Link>
          </div>
          <div className="mt-2 flex items-baseline gap-2 md:justify-end">
            <span className="font-mono text-2xl font-bold tabular-nums text-primary">{b.elo}</span>
            <span className="font-mono text-xs text-muted-foreground">ELO</span>
            {b.rank !== null && (
              <span className="font-mono text-sm tabular-nums text-muted-foreground">· #{b.rank}</span>
            )}
          </div>
          <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
            {Math.round(b.wr * 100)}% win · {b.played} games
          </p>
        </div>
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

            {/* Cost comparison */}
            {(a.avgCost != null || b.avgCost != null) && (
              <div className="mt-4 flex flex-wrap items-center gap-3 font-mono text-sm">
                <span className="text-muted-foreground uppercase tracking-wider text-xs">AVG COST</span>
                <span className={cn(
                  'tabular-nums',
                  costWinner === 'a' ? 'text-success font-semibold' : 'text-muted-foreground'
                )}>
                  {fmtCost(a.avgCost)}
                </span>
                <span className="text-muted-foreground text-xs">vs</span>
                <span className={cn(
                  'tabular-nums',
                  costWinner === 'b' ? 'text-success font-semibold' : 'text-muted-foreground'
                )}>
                  {fmtCost(b.avgCost)}
                </span>
                {a.avgCost != null && b.avgCost != null && (
                  <span className="text-muted-foreground text-xs">
                    ({a.avgCost < b.avgCost ? 'A' : 'B'} saves ${Math.abs(a.avgCost - b.avgCost).toFixed(2)}/run)
                  </span>
                )}
              </div>
            )}
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

        {/* Desktop list */}
        <div className="relative mt-4 hidden md:block">
          {challenges.length > 0 ? (
            <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
              {challenges.map(ch => (
                <ChallengeRow
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
      </div>
    </div>
  )
}

