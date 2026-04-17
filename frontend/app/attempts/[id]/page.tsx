'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { fetchSubmission, type SubmissionDetail } from '@/lib/api'

interface PageProps {
  params: Promise<{ id: string }>
}

function fmtTime(secs: number): string {
  if (!secs) return '\u2014'
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export default function AttemptPage({ params }: PageProps) {
  const { id } = use(params)
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSubmission(id)
      .then(setSubmission)
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

  if (error || !submission) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="text-destructive">Failed to load submission: {error || 'Not found'}</p>
        </div>
      </div>
    )
  }

  const passed = submission.baseline_passing != null
    ? (submission.tests_ok - submission.baseline_passing) > 0
    : submission.tests_ok > 0

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Back Navigation */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/agents/${submission.agent_id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Agent
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/challenges/${submission.challenge_id}`}
              className="font-mono text-sm uppercase tracking-wider text-muted-foreground hover:text-primary"
            >
              {submission.challenge_id}
            </Link>
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                passed
                  ? 'border-success/50 bg-success/10 text-success'
                  : 'border-destructive/50 bg-destructive/10 text-destructive'
              )}
            >
              {passed ? 'PASSED' : 'FAILED'}
            </Badge>
          </div>
          <h1 className="mt-2 text-xl font-medium text-foreground sm:text-2xl">
            {submission.challenge_title}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">by</span>
            <Link
              href={`/agents/${submission.agent_id}`}
              className="font-mono text-sm text-primary hover:underline"
            >
              {submission.agent_id}
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        <StatCard
          label="Tests"
          value={
            submission.baseline_passing != null && submission.broken_by_bug != null && submission.broken_by_bug > 0
              ? `${Math.max(0, submission.tests_ok - submission.baseline_passing)}/${submission.broken_by_bug} fixed`
              : `${submission.tests_ok}/${submission.tests_total}`
          }
          className={passed ? 'text-success' : 'text-destructive'}
        />
        <StatCard label="Agent Time" value={fmtTime(submission.agent_time_seconds)} />
        <StatCard label="Diff Lines" value={String(submission.diff_lines)} />
        <StatCard label="Exit Code" value={String(submission.exit_code)} />
        <StatCard
          label="Cost"
          value={submission.cost_usd > 0 ? '$' + submission.cost_usd.toFixed(2) : '\u2014'}
        />
        <StatCard
          label="Tokens In"
          value={submission.tokens_in > 0 ? submission.tokens_in.toLocaleString() : '\u2014'}
        />
        <StatCard
          label="Tokens Out"
          value={submission.tokens_out > 0 ? submission.tokens_out.toLocaleString() : '\u2014'}
        />
        <StatCard
          label="Date"
          value={submission.created_at ? new Date(submission.created_at).toLocaleDateString() : '\u2014'}
          className="text-xs"
        />
      </div>

      {/* Games */}
      {submission.games.length > 0 && (
        <div className="mt-10">
          <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-primary">
            Head-to-Head Results ({submission.games.length})
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Result</th>
                  <th className="pb-3 pr-4 font-medium">Opponent</th>
                  <th className="pb-3 pr-4 font-medium">Their Tests</th>
                  <th className="pb-3 pr-4 font-medium">Their Time</th>
                  <th className="pb-3 pl-4 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {submission.games.map((game, i) => {
                  const result = game.score === 1 ? 'WIN' : game.score === 0 ? 'LOSS' : 'DRAW'
                  const row = (
                    <tr key={i} className="group transition-colors hover:bg-card/50">
                      <td className="py-3 pr-4">
                        <span className={cn(
                          'font-mono text-sm font-medium',
                          result === 'WIN' ? 'text-success' : result === 'LOSS' ? 'text-destructive' : 'text-muted-foreground'
                        )}>
                          {result}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <Link
                          href={`/agents/${game.opponent_id}`}
                          className="font-mono text-sm text-foreground hover:text-primary"
                        >
                          {game.opponent_id}
                        </Link>
                        <span className="ml-2 text-xs text-muted-foreground">{game.opponent_model}</span>
                      </td>
                      <td className="py-3 pr-4">
                        {(() => {
                          const oppOk = game.opponent_tests_ok;
                          const oppTotal = game.opponent_tests_total;
                          if (oppOk == null || oppTotal == null) {
                            return <span className="font-mono text-sm text-muted-foreground">&mdash;</span>;
                          }
                          const bl = submission.baseline_passing;
                          const broken = submission.broken_by_bug;
                          const passed = bl != null ? (oppOk - bl) > 0 : oppOk > 0;
                          const label = (oppOk === 0 && oppTotal === 0)
                            ? 'no score'
                            : (bl != null && broken != null && broken > 0)
                              ? `${oppOk - bl}/${broken} fixed`
                              : `${oppOk}/${oppTotal}`;
                          return (
                            <span className={cn(
                              'font-mono text-sm',
                              passed ? 'text-success' : 'text-destructive'
                            )}>
                              {label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 pr-4 font-mono text-sm text-muted-foreground">
                        {game.opponent_time != null ? fmtTime(game.opponent_time) : '\u2014'}
                      </td>
                      {game.id != null && (
                        <td className="py-3 pl-4 text-right">
                          <Link
                            href={`/games/${game.id}`}
                            className="text-xs text-muted-foreground hover:text-primary"
                          >
                            Details &rarr;
                          </Link>
                        </td>
                      )}
                    </tr>
                  )
                  return row
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Diff */}
      {submission.diff && (
        <div className="mt-10">
          <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-primary">
            Code Changes ({submission.diff_lines} lines)
          </h2>
          <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
            <pre className="p-4 font-mono text-xs leading-relaxed">
              {submission.diff.split('\n').map((line, i) => (
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
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-mono text-sm font-medium', className)}>{value}</p>
    </div>
  )
}
