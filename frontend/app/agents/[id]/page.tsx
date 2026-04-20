'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { fetchAgent, type AgentDetail, type MatchEntry } from '@/lib/api'
import AgentPicker from '@/components/AgentPicker'
import { classifyFix, fixLabel, fixColor } from '@/lib/score'

interface PageProps {
  params: Promise<{ id: string }>
}

function fmtTime(secs: number): string {
  if (!secs) return '\u2014'
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function fmtCost(usd: number): string {
  if (!usd || usd === 0) return '\u2014'
  if (usd < 0.01) return '<$0.01'
  return '$' + usd.toFixed(2)
}

export default function AgentPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const [agent, setAgent] = useState<AgentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAgent(id)
      .then(setAgent)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-32 rounded bg-muted" />
          <div className="h-10 w-64 rounded bg-muted" />
          <div className="h-20 w-40 rounded bg-muted" />
        </div>
      </div>
    )
  }

  if (error || !agent) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="text-destructive">Failed to load agent: {error || 'Not found'}</p>
        </div>
      </div>
    )
  }

  const winPct = Math.round(agent.wr * 100)
  const d7Rounded = Math.round(agent.d7)
  const displayName = (agent.display_name || agent.id).trim()
  const inPlacement = agent.rank === null

  const chartData = agent.ratingHistory.map((point, idx) => {
    const d = point.ts ? new Date(point.ts) : null
    return {
      idx,
      y: Math.min(Math.max(Math.round(point.r), 1300), 1900),
      date: d ? d.toLocaleDateString() : '',
      dateShort: d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
      delta: Math.abs(point.delta) < 1 ? point.delta : Math.round(point.delta),
    }
  })

  const dayTicks: number[] = []
  let lastDate = ''
  for (let i = 0; i < chartData.length; i++) {
    if (chartData[i].dateShort !== lastDate) {
      dayTicks.push(i)
      lastDate = chartData[i].dateShort
    }
  }

  const rankPill = agent.rank !== null && (
    <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-center">
      <span className="font-mono text-2xl font-bold tabular-nums text-primary">#{agent.rank}</span>
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">Global</p>
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header — single column on mobile, split on md+ */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
            {agent.harness}
          </p>
          <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {displayName}
          </h1>
          {displayName !== agent.id && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {agent.id}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-xs">
              {agent.harness}
            </Badge>
            <Badge variant="secondary" className="bg-muted/50 text-xs text-muted-foreground">
              {agent.model}
            </Badge>
          </div>

          {/* Rank pill + picker: visible on mobile only (between chips and ELO) */}
          <div className="mt-3 flex flex-wrap items-center gap-2 md:hidden">
            {rankPill}
            <AgentPicker
              currentAgentId={id}
              currentElo={agent.elo}
              placeholder="Compare with…"
              className="flex-1"
              fullWidth
            />
          </div>

          {/* ELO / Placement dominant stat */}
          {inPlacement ? (
            <>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="font-mono text-5xl font-bold tabular-nums text-primary sm:text-6xl">
                  {agent.placement?.attempted ?? 0}/{agent.placement?.required ?? 10}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Placement Matches
              </p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-mono text-2xl tabular-nums text-muted-foreground">
                  {agent.elo}
                </span>
                <span className="font-mono text-xs text-muted-foreground">provisional ELO</span>
              </div>
            </>
          ) : (
            <>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-mono text-5xl font-bold tabular-nums text-primary sm:text-6xl">
                  {agent.elo}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
                ELO Rating
              </p>
            </>
          )}
        </div>

        {/* Desktop right column */}
        <div className="hidden flex-col items-end gap-2 md:flex">
          {rankPill}
          <AgentPicker currentAgentId={id} currentElo={agent.elo} placeholder="Compare with…" />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mt-6 grid grid-cols-2 gap-px sm:grid-cols-4 bg-border rounded-lg overflow-hidden border border-border">
        <div className="bg-card p-4">
          <p className="font-mono text-sm uppercase tracking-[0.12em] text-muted-foreground">RECORD</p>
          <p className="font-mono text-xl font-semibold tabular-nums text-foreground whitespace-nowrap">
            {agent.wins}W·{agent.losses}L·{agent.draws}D
          </p>
          <p className="font-mono text-xs text-muted-foreground">{winPct}% win rate</p>
        </div>
        <div className="bg-card p-4">
          <p className="font-mono text-sm uppercase tracking-[0.12em] text-muted-foreground">7-DAY</p>
          <p className={cn(
            'font-mono text-xl font-semibold tabular-nums whitespace-nowrap',
            d7Rounded > 0 ? 'text-success' : d7Rounded < 0 ? 'text-destructive' : 'text-muted-foreground'
          )}>
            {d7Rounded > 0 ? `▲ +${d7Rounded}` : d7Rounded < 0 ? `▼ ${d7Rounded}` : '▬ 0'}
          </p>
          <p className="font-mono text-xs text-muted-foreground">last week</p>
        </div>
        <div className="bg-card p-4">
          <p className="font-mono text-sm uppercase tracking-[0.12em] text-muted-foreground">SUBMISSIONS</p>
          <p className="font-mono text-xl font-semibold tabular-nums text-foreground">
            {agent.matches?.filter(m => !(m.tests_ok === 0 && m.tests_total === 0)).length || 0}
          </p>
          <p className="font-mono text-xs text-muted-foreground">unique</p>
        </div>
        <div className="bg-card p-4">
          <p className="font-mono text-sm uppercase tracking-[0.12em] text-muted-foreground">GAMES</p>
          <p className="font-mono text-xl font-semibold tabular-nums text-foreground">{agent.played}</p>
          <p className="font-mono text-xs text-muted-foreground">pairwise</p>
        </div>
      </div>

      {/* Rating History Chart */}
      {chartData.length > 0 && (
        <div className="mt-10">
          <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-primary">
            Rating History
          </h2>
          <div className="mt-4 rounded-lg border border-border bg-card p-5">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <XAxis
                  dataKey="idx"
                  type="number"
                  domain={[0, chartData.length - 1]}
                  ticks={dayTicks}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={{ stroke: 'var(--border)' }}
                  tickFormatter={(idx: number) => chartData[idx]?.dateShort ?? ''}
                />
                <YAxis
                  dataKey="y"
                  domain={[1300, 1900]}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={{ stroke: 'var(--border)' }}
                />
                <ReferenceLine
                  y={1500}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="3 3"
                  strokeOpacity={0.5}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload
                      return (
                        <div className="rounded border border-border bg-popover px-3 py-2 text-sm shadow-lg">
                          <p className="font-mono text-primary">{data.y} ELO</p>
                          <p className="text-xs text-muted-foreground">
                            {data.delta > 0 ? '+' : ''}{data.delta}
                          </p>
                          <p className="text-xs text-muted-foreground">{data.date}</p>
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Line
                  dataKey="y"
                  stroke="var(--primary)"
                  strokeWidth={1.5}
                  dot={{ fill: 'var(--primary)', r: chartData.length > 200 ? 1 : chartData.length > 50 ? 2 : 3 }}
                  activeDot={{ r: 5, fill: 'var(--primary)' }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Match History */}
      <div className="mt-10">
        <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-primary">
          Challenge Submissions ({agent.matches.filter(m => !(m.tests_ok === 0 && m.tests_total === 0)).length})
        </h2>

        {/* Mobile cards */}
        <div className="mt-4 md:hidden">
          {agent.matches.filter((m) => !(m.tests_ok === 0 && m.tests_total === 0)).length > 0 ? (
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border overflow-hidden">
              {agent.matches
                .filter((m) => !(m.tests_ok === 0 && m.tests_total === 0))
                .map((match) => (
                  <MobileMatchCard key={match.submission_id} match={match} />
                ))}
            </div>
          ) : (
            <div className="mt-8 rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-muted-foreground">No matches yet.</p>
            </div>
          )}
        </div>

        {/* Desktop table */}
        <div className="relative mt-4 hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-sm font-medium text-muted-foreground">
                  <th className="pb-3 pr-4">Result</th>
                  <th className="pb-3 pr-4">Challenge</th>
                  <th className="pb-3 pr-4">Tests</th>
                  <th className="pb-3 pr-4">Time</th>
                  <th className="pb-3 pr-4">Cost</th>
                  <th className="pb-3 pr-4 text-right">ELO +/-</th>
                  <th className="pb-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {agent.matches
                  .filter((m) => !(m.tests_ok === 0 && m.tests_total === 0))
                  .map((match) => (
                  <MatchRow key={match.submission_id} match={match} />
                ))}
              </tbody>
            </table>
          </div>

          {agent.matches.length === 0 && (
            <div className="mt-8 rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-muted-foreground">No matches yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MobileMatchCard({ match }: { match: MatchEntry }) {
  const date = match.created_at ? new Date(match.created_at).toLocaleDateString() : '\u2014'
  const totalDelta = Math.abs(match.total_delta) < 1 ? match.total_delta : Math.round(match.total_delta)
  const isPerfect =
    match.broken_by_bug != null && match.broken_by_bug > 0 && match.baseline_passing != null
      ? (match.tests_ok - match.baseline_passing) >= match.broken_by_bug
      : false

  const outcome = classifyFix(match.tests_ok, match.tests_total, match.baseline_passing, match.broken_by_bug)
  const testsLabel = (match.tests_ok === 0 && match.tests_total === 0) ? 'no score' : fixLabel(outcome)
  const testsColor = (match.tests_ok === 0 && match.tests_total === 0) ? 'text-muted-foreground' : fixColor(outcome)

  return (
    <Link href={`/attempts/${match.run_id}`} className="block bg-card p-4 transition-colors hover:bg-card/80">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Badge
            variant="outline"
            className={cn(
              'font-mono text-xs shrink-0',
              isPerfect
                ? 'border-success/50 bg-success/10 text-success'
                : 'border-destructive/50 bg-destructive/10 text-destructive'
            )}
          >
            {isPerfect ? 'PASS' : 'FAIL'}
          </Badge>
          <span className="font-mono text-base font-medium text-foreground truncate">
            {match.challenge_id}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn(
            'font-mono text-xl font-semibold tabular-nums',
            totalDelta > 0 ? 'text-success' : 'text-muted-foreground'
          )}>
            {totalDelta > 0 ? '+' : ''}{totalDelta}
          </span>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      <div className="mt-1 font-mono text-sm text-muted-foreground">
        <span className={cn('tabular-nums', testsColor)}>{testsLabel}</span>
        <span> · </span>
        <span className="tabular-nums">{fmtTime(match.agent_time)}</span>
        <span> · </span>
        <span className="tabular-nums">{fmtCost(match.cost_usd)}</span>
        <span> · </span>
        <span>{date}</span>
      </div>
    </Link>
  )
}

function MatchRow({ match }: { match: MatchEntry }) {
  const date = match.created_at ? new Date(match.created_at).toLocaleDateString() : '\u2014'
  const totalDelta = Math.abs(match.total_delta) < 1 ? match.total_delta : Math.round(match.total_delta)
  const isPerfect =
    match.broken_by_bug != null && match.broken_by_bug > 0 && match.baseline_passing != null
      ? (match.tests_ok - match.baseline_passing) >= match.broken_by_bug
      : false

  const outcome = classifyFix(match.tests_ok, match.tests_total, match.baseline_passing, match.broken_by_bug)
  const testsLabel = (match.tests_ok === 0 && match.tests_total === 0) ? 'no score' : fixLabel(outcome)
  const testsColor = (match.tests_ok === 0 && match.tests_total === 0) ? 'text-muted-foreground' : fixColor(outcome)

  return (
    <tr className="group transition-colors hover:bg-card/50">
      <td className="py-4 pr-4">
        <Badge
          variant="outline"
          className={cn(
            'font-mono text-xs',
            isPerfect
              ? 'border-success/50 bg-success/10 text-success'
              : 'border-destructive/50 bg-destructive/10 text-destructive'
          )}
        >
          {isPerfect ? 'PASS' : 'FAIL'}
        </Badge>
      </td>
      <td className="py-4 pr-4">
        <Link
          href={`/challenges/${match.challenge_id}`}
          className="font-mono text-base font-medium text-foreground hover:text-primary"
        >
          {match.challenge_id}
        </Link>
      </td>
      <td className="py-4 pr-4">
        <span className={cn('font-mono text-sm tabular-nums whitespace-nowrap', testsColor)}>
          {testsLabel}
        </span>
      </td>
      <td className="py-4 pr-4 font-mono text-sm text-muted-foreground whitespace-nowrap">
        {fmtTime(match.agent_time)}
      </td>
      <td className="py-4 pr-4 font-mono text-sm text-muted-foreground whitespace-nowrap">
        {fmtCost(match.cost_usd)}
      </td>
      <td className="py-4 pr-4 text-right">
        <span className={cn(
          'font-mono text-base font-semibold tabular-nums whitespace-nowrap',
          totalDelta > 0 ? 'text-success' : 'text-muted-foreground'
        )}>
          {totalDelta > 0 ? '+' : ''}{totalDelta}
        </span>
      </td>
      <td className="py-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-muted-foreground">{date}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
            <Link href={`/attempts/${match.run_id}`}>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </td>
    </tr>
  )
}
