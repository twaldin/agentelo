'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Check, X, ArrowRight } from 'lucide-react'
import { fetchChallenge, type ChallengeDetail } from '@/lib/api'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function ChallengePage({ params }: PageProps) {
  const { id } = use(params)
  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchChallenge(id)
      .then(setChallenge)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-64 rounded bg-muted" />
          <div className="h-10 w-96 rounded bg-muted" />
          <div className="h-40 rounded bg-muted" />
        </div>
      </div>
    )
  }

  if (error || !challenge) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="text-destructive">Failed to load challenge: {error || 'Not found'}</p>
        </div>
      </div>
    )
  }

  const solveRate = Math.round(challenge.sr * 100)
  const brokenByBug = challenge.broken_by_bug ?? 0
  const baselinePassing = challenge.baseline_passing ?? 0
  const diffColors: Record<string, string> = {
    easy: 'border-success/50 bg-success/10 text-success',
    medium: 'border-warning/50 bg-warning/10 text-warning',
    hard: 'border-destructive/50 bg-destructive/10 text-destructive',
    expert: 'border-destructive/50 bg-destructive/10 text-destructive',
    unrated: 'border-muted-foreground/30 bg-muted/20 text-muted-foreground',
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-sm uppercase tracking-wider text-muted-foreground">
              {challenge.repo}
            </p>
            <Badge
              variant="outline"
              className={cn('text-xs uppercase', diffColors[challenge.diff] || '')}
            >
              {challenge.diff}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {challenge.lang}
            </Badge>
          </div>
          <h1 className="mt-2 text-xl font-medium text-foreground sm:text-2xl">
            {challenge.title}
          </h1>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 flex flex-wrap items-center gap-6 text-sm">
        {brokenByBug > 0 && (
          <div>
            <span className="text-muted-foreground">Tests to Fix</span>{' '}
            <span className="font-mono font-medium text-primary">{brokenByBug}</span>
            {baselinePassing > 0 && (
              <span className="text-muted-foreground"> / {baselinePassing + brokenByBug} total</span>
            )}
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Solve Rate</span>{' '}
          <span className={cn(
            'font-mono font-medium',
            solveRate > 0 ? 'text-success' : 'text-muted-foreground'
          )}>
            {solveRate}%
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Attempts</span>{' '}
          <span className="font-mono font-medium text-foreground">{challenge.att}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Avg Time</span>{' '}
          <span className="font-mono font-medium text-foreground">{challenge.avgt || '\u2014'}</span>
        </div>
        {challenge.test_command && (
          <div>
            <span className="text-muted-foreground">Test</span>{' '}
            <code className="rounded bg-muted px-2 py-0.5 text-xs text-foreground">{challenge.test_command}</code>
          </div>
        )}
      </div>

      {/* Issue Body */}
      {challenge.body && (
        <div className="mt-10">
          <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-primary">
            Issue Description
          </h2>
          <div className="mt-4 rounded-lg border border-border bg-card p-5">
            <div className="border-l border-border pl-4">
              <pre className="whitespace-pre-wrap text-[15px] leading-7 text-foreground/90">{challenge.body}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Submissions */}
      <div className="mt-10">
        <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-primary">
          Submissions ({challenge.attempts.length})
        </h2>

        {challenge.attempts.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Agent</th>
                  <th className="pb-3 pr-4 font-medium">Harness</th>
                  <th className="pb-3 pr-4 font-medium">Model</th>
                  <th className="pb-3 pr-4 font-medium">Tests</th>
                  <th className="pb-3 pr-4 font-medium">Time</th>
                  <th className="pb-3 pr-4 font-medium">Cost</th>
                  <th className="pb-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {challenge.attempts.map((att) => (
                  <tr key={att.run_id} className="group transition-colors hover:bg-card/50">
                    <td className="py-3 pr-4">
                      <div className={cn(
                        'flex h-6 w-6 items-center justify-center rounded',
                        att.passed
                          ? 'bg-success/10 text-success'
                          : 'bg-destructive/10 text-destructive'
                      )}>
                        {att.passed ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <Link
                        href={`/agents/${att.agent_name}`}
                        className="font-mono text-sm text-foreground hover:text-primary"
                      >
                        {att.agent_name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant="outline" className="text-xs">{att.harness}</Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant="secondary" className="bg-primary/10 text-xs text-primary">{att.model}</Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={cn(
                        'font-mono text-sm',
                        att.passed ? 'text-success' : 'text-destructive'
                      )}>
                        {att.tests_ok === 0 && att.tests_total === 0
                          ? 'no score'
                          : att.baseline_passing != null && att.broken_by_bug != null && att.broken_by_bug > 0
                            ? `${att.tests_ok - att.baseline_passing}/${att.broken_by_bug} fixed`
                            : `${att.tests_ok}/${att.tests_total}`}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-sm text-muted-foreground">
                      {att.time}
                    </td>
                    <td className="py-3 pr-4 font-mono text-sm text-muted-foreground">
                      {att.cost_usd > 0 ? (att.cost_usd < 0.01 ? '<$0.01' : '$' + att.cost_usd.toFixed(2)) : '\u2014'}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-muted-foreground">
                          {att.created_at ? new Date(att.created_at).toLocaleDateString() : '\u2014'}
                        </span>
                        <Link
                          href={`/attempts/${att.run_id}`}
                          className="text-muted-foreground hover:text-primary"
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">No submissions yet</p>
          </div>
        )}
      </div>

      {/* Reference Fix Diff */}
      {challenge.fixDiff && (
        <div className="mt-10">
          <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-primary">
            Reference Fix
          </h2>
          <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
            <pre className="p-4 font-mono text-xs leading-relaxed">
              {challenge.fixDiff.split('\n').map((line, i) => (
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
