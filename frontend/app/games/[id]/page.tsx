'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { fetchGame, type GameDetail, type GameSubmission } from '@/lib/api'

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
  if (!usd) return '\u2014'
  return `$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}`
}

function DiffBlock({ diff }: { diff: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <pre className="p-4 font-mono text-xs leading-relaxed">
        {diff.split('\n').map((line, i) => (
          <div
            key={i}
            className={cn(
              'px-2',
              line.startsWith('+') && !line.startsWith('+++') && 'bg-diff-add-bg text-diff-add-text',
              line.startsWith('-') && !line.startsWith('---') && 'bg-diff-remove-bg text-diff-remove-text',
              line.startsWith('@@') && 'text-info',
              !line.startsWith('+') && !line.startsWith('-') && !line.startsWith('@@') && 'text-foreground/80'
            )}
          >
            {line}
          </div>
        ))}
      </pre>
    </div>
  )
}

function StatCard({ label, value, className, highlight }: { label: string; value: string; className?: string; highlight?: boolean }) {
  return (
    <div className={cn(
      'rounded-lg border border-border bg-card p-3',
      highlight && 'border-success/40'
    )}>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-mono text-sm font-medium', className)}>{value}</p>
    </div>
  )
}

function SubmissionColumn({
  sub,
  agentId,
  isWinner,
  baselinePassing,
  brokenByBug,
}: {
  sub: GameSubmission | null
  agentId: string
  isWinner: boolean
  baselinePassing: number | null
  brokenByBug: number | null
}) {
  if (!sub) {
    return (
      <div className={cn(
        'flex-1 rounded-lg border p-6',
        'border-border bg-card/50'
      )}>
        <div className="mb-4">
          <Link
            href={`/agents/${agentId}`}
            className="font-mono text-sm font-medium text-primary hover:underline"
          >
            {agentId}
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">No submission data</p>
      </div>
    )
  }

  const testsFixed = baselinePassing != null
    ? Math.max(0, sub.tests_ok - baselinePassing)
    : sub.tests_ok

  return (
    <div className={cn(
      'flex-1 rounded-lg border p-6',
      isWinner
        ? 'border-success/40 bg-success/5 shadow-[0_0_15px_rgba(34,197,94,0.08)]'
        : 'border-border bg-card/50'
    )}>
      {/* Agent header */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/agents/${sub.agent_id}`}
          className="font-mono text-sm font-medium text-primary hover:underline"
        >
          {sub.agent_id}
        </Link>
        {isWinner && (
          <Badge variant="outline" className="border-success/50 bg-success/10 text-success text-xs">
            WINNER
          </Badge>
        )}
      </div>

      {/* Meta */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge variant="outline" className="text-xs">{sub.harness}</Badge>
        <Badge variant="outline" className="text-xs">{sub.model}</Badge>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Tests Fixed"
          value={brokenByBug != null ? `${testsFixed}/${brokenByBug} fixed` : `${testsFixed}/${sub.tests_total}`}
          className={testsFixed > 0 ? 'text-success' : 'text-destructive'}
        />
        <StatCard
          label="Total Tests"
          value={`${sub.tests_ok}/${sub.tests_total}`}
          className={sub.tests_ok === sub.tests_total ? 'text-success' : undefined}
        />
        <StatCard label="Agent Time" value={fmtTime(sub.agent_time_seconds)} />
        <StatCard label="Test Time" value={fmtTime(sub.test_time_seconds)} />
        <StatCard label="Diff Lines" value={String(sub.diff_lines)} />
        <StatCard label="Exit Code" value={String(sub.exit_code)} className={sub.exit_code !== 0 ? 'text-destructive' : undefined} />
        <StatCard label="Cost" value={fmtCost(sub.cost_usd)} />
        <StatCard
          label="Tokens"
          value={`${((sub.tokens_in + sub.tokens_out) / 1000).toFixed(1)}k`}
        />
      </div>

      {/* Diff */}
      {sub.diff && (
        <div className="mt-6">
          <h3 className="mb-3 font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Code Changes ({sub.diff_lines} lines)
          </h3>
          <DiffBlock diff={sub.diff} />
        </div>
      )}
    </div>
  )
}

export default function GamePage({ params }: PageProps) {
  const { id } = use(params)
  const [game, setGame] = useState<GameDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchGame(Number(id))
      .then(setGame)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-32 rounded bg-muted" />
          <div className="h-10 w-64 rounded bg-muted" />
          <div className="h-40 rounded bg-muted" />
        </div>
      </div>
    )
  }

  if (error || !game) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="text-destructive">Failed to load game: {error || 'Not found'}</p>
        </div>
      </div>
    )
  }

  const result = game.score === 1 ? 'WIN' : game.score === 0 ? 'LOSS' : 'DRAW'
  const delta = Math.abs(game.delta) < 1 ? game.delta : Math.round(game.delta)

  // Determine which side won for highlighting
  const agentWon = game.score === 1
  const opponentWon = game.score === 0

  // Comparison stats
  const subA = game.submission
  const subB = game.opponent_submission

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Back Navigation */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/agents/${game.agent_id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Agent
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/challenges/${game.challenge_id}`}
            className="font-mono text-sm uppercase tracking-wider text-muted-foreground hover:text-primary"
          >
            {game.challenge_id}
          </Link>
          <h1 className="mt-2 text-xl font-medium text-foreground sm:text-2xl">
            {game.challenge_title}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className={cn(
              'text-sm px-3 py-1',
              result === 'WIN'
                ? 'border-success/50 bg-success/10 text-success'
                : result === 'LOSS'
                ? 'border-destructive/50 bg-destructive/10 text-destructive'
                : 'border-muted-foreground/50 bg-muted/10 text-muted-foreground'
            )}
          >
            {result}
          </Badge>
          <span className={cn(
            'font-mono text-lg font-medium',
            delta > 0 ? 'text-success' : delta < 0 ? 'text-destructive' : 'text-muted-foreground'
          )}>
            {delta > 0 ? '+' : ''}{delta}
          </span>
        </div>
      </div>

      {/* ELO context */}
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>
          Rating: <span className="font-mono text-foreground">{Math.round(game.rating_before)}</span>
        </span>
        <span>
          Opponent rating: <span className="font-mono text-foreground">{Math.round(game.opponent_rating)}</span>
        </span>
        <span>
          {new Date(game.created_at).toLocaleDateString()}
        </span>
      </div>

      {/* Stats Comparison Row */}
      {subA && subB && (
        <div className="mt-8">
          <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-primary">
            Comparison
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 pr-4 text-left font-medium">Metric</th>
                  <th className="pb-3 pr-4 text-right font-medium">
                    <Link href={`/agents/${subA.agent_id}`} className="hover:text-primary">
                      {subA.agent_id}
                    </Link>
                  </th>
                  <th className="pb-3 text-right font-medium">
                    <Link href={`/agents/${subB.agent_id}`} className="hover:text-primary">
                      {subB.agent_id}
                    </Link>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <ComparisonRow
                  label="Tests Fixed"
                  a={game.baseline_passing != null ? Math.max(0, subA.tests_ok - game.baseline_passing) : subA.tests_ok}
                  b={game.baseline_passing != null ? Math.max(0, subB.tests_ok - game.baseline_passing) : subB.tests_ok}
                  format={v => String(v)}
                  higherIsBetter
                />
                <ComparisonRow
                  label="Tests OK"
                  a={subA.tests_ok}
                  b={subB.tests_ok}
                  format={v => `${v}/${subA.tests_total}`}
                  higherIsBetter
                />
                <ComparisonRow
                  label="Agent Time"
                  a={subA.agent_time_seconds}
                  b={subB.agent_time_seconds}
                  format={fmtTime}
                  higherIsBetter={false}
                />
                <ComparisonRow
                  label="Diff Lines"
                  a={subA.diff_lines}
                  b={subB.diff_lines}
                  format={v => String(v)}
                  higherIsBetter={false}
                />
                <ComparisonRow
                  label="Cost"
                  a={subA.cost_usd}
                  b={subB.cost_usd}
                  format={fmtCost}
                  higherIsBetter={false}
                />
                <ComparisonRow
                  label="Exit Code"
                  a={subA.exit_code}
                  b={subB.exit_code}
                  format={v => String(v)}
                  higherIsBetter={false}
                />
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Two-column submissions */}
      <div className="mt-8">
        <h2 className="mb-4 font-mono text-sm font-medium uppercase tracking-wider text-primary">
          Submissions
        </h2>
        <div className="flex flex-col gap-6 lg:flex-row">
          <SubmissionColumn
            sub={subA}
            agentId={game.agent_id}
            isWinner={agentWon}
            baselinePassing={game.baseline_passing}
            brokenByBug={game.broken_by_bug}
          />
          <div className="flex items-center justify-center lg:flex-col">
            <span className="font-mono text-lg font-bold text-muted-foreground">vs</span>
          </div>
          <SubmissionColumn
            sub={subB}
            agentId={game.opponent_id}
            isWinner={opponentWon}
            baselinePassing={game.baseline_passing}
            brokenByBug={game.broken_by_bug}
          />
        </div>
      </div>
    </div>
  )
}

function ComparisonRow({
  label,
  a,
  b,
  format,
  higherIsBetter,
}: {
  label: string
  a: number
  b: number
  format: (v: number) => string
  higherIsBetter: boolean
}) {
  const aWins = higherIsBetter ? a > b : a < b
  const bWins = higherIsBetter ? b > a : b < a
  const tie = a === b

  return (
    <tr className="group transition-colors hover:bg-card/50">
      <td className="py-3 pr-4 text-sm text-muted-foreground">{label}</td>
      <td className="py-3 pr-4 text-right">
        <span className={cn(
          'font-mono text-sm',
          aWins && !tie ? 'font-medium text-success' : 'text-foreground'
        )}>
          {format(a)}
        </span>
      </td>
      <td className="py-3 text-right">
        <span className={cn(
          'font-mono text-sm',
          bWins && !tie ? 'font-medium text-success' : 'text-foreground'
        )}>
          {format(b)}
        </span>
      </td>
    </tr>
  )
}
