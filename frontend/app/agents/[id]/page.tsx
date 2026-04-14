'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { fetchAgent, type AgentDetail, type MatchEntry } from '@/lib/api'

interface PageProps {
  params: Promise<{ id: string }>
}

function fmtTime(secs: number): string {
  if (!secs) return '\u2014'
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
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
  const displayName = (agent.display_name || agent.id).trim()

  // Transform rating history for scatter plot
  const chartData = agent.ratingHistory.map((point, idx) => ({
    x: idx,
    y: Math.round(point.r),
    date: point.ts ? new Date(point.ts).toLocaleDateString() : '',
    delta: Math.round(point.delta),
    challenge: point.challenge,
    opponent: point.opponent,
  }))

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {agent.harness}
          </p>
          <h1 className="mt-1 font-mono text-xl font-medium text-foreground sm:text-2xl">
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
            <Badge variant="secondary" className="bg-primary/10 text-xs text-primary">
              {agent.model}
            </Badge>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-5xl font-bold text-primary sm:text-6xl">
              {agent.elo}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            ELO RATING
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-center">
            <span className="font-mono text-2xl font-bold text-primary">#{agent.rank}</span>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Global</p>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="mt-6 flex flex-wrap items-center gap-6 text-sm">
        <div>
          <span className="text-muted-foreground">Record</span>{' '}
          <span className="font-mono font-medium text-foreground">
            {agent.wins}W / {agent.losses}L / {agent.draws}D ({winPct}%)
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">7D</span>{' '}
          <span className={cn(
            'font-mono font-medium',
            d7Rounded > 0 ? 'text-success' : d7Rounded < 0 ? 'text-destructive' : 'text-muted-foreground'
          )}>
            {d7Rounded > 0 ? '+' : ''}{d7Rounded}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Challenges</span>{' '}
          <span className="font-mono text-foreground">{agent.matches?.length || 0}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Games</span>{' '}
          <span className="font-mono text-foreground">{agent.played}</span>
        </div>
      </div>

      {/* Rating History Chart */}
      {chartData.length > 0 && (
        <div className="mt-10">
          <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-primary">
            Rating History
          </h2>
          <div className="mt-4 rounded-lg border border-border bg-card p-4">
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <XAxis
                  dataKey="x"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={{ stroke: 'var(--border)' }}
                  tickFormatter={(value: number) => chartData[value]?.date?.slice(5) || ''}
                />
                <YAxis
                  dataKey="y"
                  type="number"
                  domain={['dataMin - 50', 'dataMax + 50']}
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
                          {data.challenge && (
                            <p className="text-xs text-muted-foreground">vs {data.opponent}</p>
                          )}
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Scatter data={chartData} line={{ stroke: 'var(--primary)', strokeWidth: 2 }}>
                  {chartData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill="var(--primary)"
                      stroke="var(--primary)"
                      strokeWidth={2}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Match History */}
      <div className="mt-10">
        <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-primary">
          Match History ({agent.matches.filter(m => !(m.tests_ok === 0 && m.tests_total === 0)).length})
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-3 pr-4 font-medium">Result</th>
                <th className="pb-3 pr-4 font-medium">Challenge</th>
                <th className="pb-3 pr-4 font-medium">Tests</th>
                <th className="pb-3 pr-4 font-medium">Time</th>
                <th className="pb-3 pr-4 text-right font-medium">ELO +/-</th>
                <th className="pb-3 font-medium">Date</th>
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
  )
}

function MatchRow({ match }: { match: MatchEntry }) {
  const date = match.created_at ? new Date(match.created_at).toLocaleDateString() : '\u2014'
  const totalDelta = Math.round(match.total_delta)

  return (
    <tr className="group transition-colors hover:bg-card/50">
      <td className="py-4 pr-4">
        <Badge
          variant="outline"
          className={cn(
            'font-mono text-xs',
            match.tests_passed
              ? 'border-success/50 bg-success/10 text-success'
              : 'border-destructive/50 bg-destructive/10 text-destructive'
          )}
        >
          {match.tests_passed ? 'PASS' : 'FAIL'}
        </Badge>
      </td>
      <td className="py-4 pr-4">
        <Link
          href={`/challenges/${match.challenge_id}`}
          className="font-mono text-sm text-foreground hover:text-primary"
        >
          {match.challenge_id}
        </Link>
      </td>
      <td className="py-4 pr-4">
        <span className={cn(
          'font-mono text-sm',
          match.tests_passed ? 'text-success' : 'text-destructive'
        )}>
          {match.tests_ok === 0 && match.tests_total === 0
            ? 'no score'
            : match.baseline_passing != null && match.broken_by_bug != null && match.broken_by_bug > 0
              ? `${match.tests_ok - match.baseline_passing}/${match.broken_by_bug} fixed`
              : `${match.tests_ok}/${match.tests_total}`}
        </span>
      </td>
      <td className="py-4 pr-4 font-mono text-sm text-muted-foreground">
        {fmtTime(match.agent_time)}
      </td>
      <td className="py-4 pr-4 text-right">
        <span className={cn(
          'font-mono text-sm font-medium',
          totalDelta > 0 ? 'text-success' : totalDelta < 0 ? 'text-destructive' : 'text-muted-foreground'
        )}>
          {totalDelta > 0 ? '+' : ''}{totalDelta}
        </span>
      </td>
      <td className="py-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{date}</span>
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
