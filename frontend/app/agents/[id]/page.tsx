'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { fetchAgent, type AgentDetail, type MatchEntry } from '@/lib/api'
import AgentPicker from '@/components/AgentPicker'
import { classifyFix } from '@/lib/score'
import { MatchRow, HarnessChip, buildBadge, fmtDate, type ResultKind } from '@/components/MatchRow'

interface PageProps {
  params: Promise<{ id: string }>
}

function fmtTime(secs: number): string {
  if (!secs) return '\u2014'
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function fmtCost(usd: number | null): string {
  if (!usd || usd === 0) return '\u2014'
  if (usd < 0.01) return '<$0.01'
  return '$' + usd.toFixed(2)
}

function StatRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="font-mono text-xs uppercase tracking-wider text-muted-foreground shrink-0">{label}</dt>
      <span className="flex-1 border-b border-dotted border-muted-foreground/30 translate-y-[-4px]" aria-hidden />
      <dd className={cn('font-mono text-sm tabular-nums text-foreground whitespace-nowrap', valueClass)}>
        {value}
      </dd>
    </div>
  )
}

export default function AgentPage({ params }: PageProps) {
  const { id } = use(params)
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
  const d7Display = d7Rounded > 0 ? `▲ +${d7Rounded}` : d7Rounded < 0 ? `▼ ${d7Rounded}` : '▬ 0'
  const d7Color = d7Rounded > 0 ? 'text-success' : d7Rounded < 0 ? 'text-destructive' : 'text-muted-foreground'
  const displayName = (agent.display_name || agent.id).trim()
  const inPlacement = agent.rank === null

  const subCount = agent.matches.filter(m => !(m.tests_ok === 0 && m.tests_total === 0)).length
  const matchesWithCost = agent.matches.filter(m => m.cost_usd > 0)
  const avgCostCalc = matchesWithCost.length > 0
    ? matchesWithCost.reduce((sum, m) => sum + m.cost_usd, 0) / matchesWithCost.length
    : null

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

  const rankBadge = agent.rank !== null && (
    <div
      className={cn(
        'flex flex-col items-center px-5 py-2 border-y border-r',
        agent.rank <= 3 ? 'bg-primary/20 border-primary/40' : 'bg-muted/20 border-border',
      )}
      style={{ clipPath: 'polygon(0.75rem 0, 100% 0, 100% 100%, 0 100%)' }}
    >
      <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">GLOBAL</span>
      <span className={cn(
        'font-mono text-2xl font-bold tabular-nums',
        agent.rank <= 3 ? 'text-primary' : 'text-muted-foreground'
      )}>
        #{agent.rank}
      </span>
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Hero */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          {/* Name row */}
          <div className="flex items-center gap-3">
            <HarnessChip harness={agent.harness} />
            <div className="min-w-0">
              <h1 className="font-mono text-2xl font-bold tracking-tight text-foreground sm:text-3xl truncate">
                {displayName}
              </h1>
              {displayName !== agent.id && (
                <p className="font-mono text-xs text-muted-foreground truncate">{agent.id}</p>
              )}
            </div>
          </div>

          {/* Mobile: rank + picker */}
          <div className="mt-3 flex flex-wrap items-center gap-2 md:hidden">
            {rankBadge}
            <AgentPicker
              currentAgentId={id}
              currentElo={agent.elo}
              placeholder="Compare with…"
              className="flex-1"
              fullWidth
            />
          </div>

          {/* ELO / Placement hero */}
          {inPlacement ? (
            <div className="mt-4">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-5xl font-bold tabular-nums text-primary sm:text-6xl">
                  {agent.placement?.attempted ?? 0}/{agent.placement?.required ?? 10}
                </span>
                <span className="font-mono text-sm text-muted-foreground">placement</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-2xl tabular-nums text-muted-foreground">{agent.elo}</span>
                <span className="font-mono text-xs text-muted-foreground">provisional ELO</span>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-5xl font-bold tabular-nums text-primary sm:text-6xl">
                  {agent.elo}
                </span>
                <span className="font-mono text-sm text-muted-foreground">ELO</span>
              </div>
              <p className={cn('mt-1 font-mono text-sm tabular-nums', d7Color)}>
                {d7Display} last 7 days
              </p>
            </div>
          )}
        </div>

        {/* Desktop right: rank + picker */}
        <div className="hidden flex-col items-end gap-2 md:flex">
          {rankBadge}
          <AgentPicker currentAgentId={id} currentElo={agent.elo} placeholder="Compare with…" />
        </div>
      </div>

      {/* Stat strip — dotted leader lines */}
      <div className="mt-6 rounded-lg border border-border bg-card p-5 md:p-6">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
          <StatRow label="RECORD" value={`${agent.wins}W·${agent.losses}L·${agent.draws}D (${winPct}%)`} />
          <StatRow label="GAMES" value={String(agent.played)} />
          <StatRow label="7-DAY" value={d7Display} valueClass={d7Color} />
          <StatRow label="SUBMISSIONS" value={String(subCount)} />
          {avgCostCalc !== null && (
            <StatRow label="AVG COST" value={fmtCost(avgCostCalc)} />
          )}
          <StatRow label="MODEL" value={agent.model} />
        </dl>
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
          Challenge Submissions ({subCount})
        </h2>

        {subCount > 0 ? (
          <div className="mt-4 divide-y divide-border rounded-lg border border-border overflow-hidden">
            {agent.matches
              .filter(m => !(m.tests_ok === 0 && m.tests_total === 0))
              .map(match => {
                const outcome = classifyFix(match.tests_ok, match.tests_total, match.baseline_passing, match.broken_by_bug)
                const badge = buildBadge(outcome)
                const totalDelta = Math.abs(match.total_delta) < 1 ? match.total_delta : Math.round(match.total_delta)
                return (
                  <MatchRow
                    key={match.submission_id}
                    result={badge}
                    primary={{ prefix: 'vs', label: match.challenge_id, href: `/challenges/${match.challenge_id}` }}
                    stats={[
                      { value: fmtTime(match.agent_time), color: 'muted' },
                      { value: fmtCost(match.cost_usd), color: 'muted' },
                    ]}
                    date={fmtDate(match.created_at)}
                    delta={{
                      value: totalDelta > 0 ? `+${totalDelta}` : totalDelta < 0 ? String(totalDelta) : '\u00b10',
                      unit: 'ELO',
                      kind: totalDelta > 0 ? 'gain' : totalDelta < 0 ? 'loss' : 'neutral',
                    }}
                    href={`/attempts/${match.run_id}`}
                  />
                )
              })}
          </div>
        ) : (
          <div className="mt-8 rounded-lg border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">No matches yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}
