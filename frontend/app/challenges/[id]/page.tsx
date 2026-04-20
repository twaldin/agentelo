'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Check, X, ArrowRight } from 'lucide-react'
import { fetchChallenge, type ChallengeDetail } from '@/lib/api'
import { classifyFix, fixLabel, fixColor } from '@/lib/score'

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
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
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
          <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {challenge.title}
          </h1>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-px sm:grid-cols-4 bg-border rounded-lg overflow-hidden border border-border">
        <div className="bg-card p-4">
          <p className="font-mono text-sm uppercase tracking-[0.12em] text-muted-foreground">TESTS TO FIX</p>
          <p className="font-mono text-xl font-semibold tabular-nums text-foreground">
            {brokenByBug > 0 ? brokenByBug : '—'}
          </p>
          {baselinePassing > 0 && brokenByBug > 0 && (
            <p className="font-mono text-xs text-muted-foreground">of {baselinePassing + brokenByBug} total</p>
          )}
        </div>
        <div className="bg-card p-4">
          <p className="font-mono text-sm uppercase tracking-[0.12em] text-muted-foreground">SOLVE RATE</p>
          <p className={cn(
            'font-mono text-xl font-semibold tabular-nums',
            solveRate > 0 ? 'text-success' : 'text-muted-foreground'
          )}>
            {solveRate}%
          </p>
        </div>
        <div className="bg-card p-4">
          <p className="font-mono text-sm uppercase tracking-[0.12em] text-muted-foreground">ATTEMPTS</p>
          <p className="font-mono text-xl font-semibold tabular-nums text-foreground">{challenge.att}</p>
        </div>
        <div className="bg-card p-4">
          <p className="font-mono text-sm uppercase tracking-[0.12em] text-muted-foreground">AVG TIME</p>
          <p className="font-mono text-xl font-semibold tabular-nums text-foreground whitespace-nowrap">
            {challenge.avgt || '—'}
          </p>
          {challenge.test_command && (
            <p className="font-mono text-xs text-muted-foreground truncate" title={challenge.test_command}>
              {challenge.test_command}
            </p>
          )}
        </div>
      </div>

      {/* Issue Body */}
      {challenge.body && (
        <div className="mt-10">
          <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-primary">
            Issue Description
          </h2>
          <div className="mt-4 rounded-lg border border-border bg-card p-5">
            <div className="border-l border-border pl-4">
              <pre className="whitespace-pre-wrap text-base leading-7 text-foreground/90">{challenge.body}</pre>
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
          <>
            {/* Mobile cards */}
            <div className="mt-4 md:hidden">
              <div className="flex flex-col divide-y divide-border rounded-lg border border-border overflow-hidden">
                {challenge.attempts.map((att) => {
                  const outcome = classifyFix(att.tests_ok, att.tests_total, att.baseline_passing, att.broken_by_bug)
                  const testsLabel = (att.tests_ok === 0 && att.tests_total === 0) ? 'no score' : fixLabel(outcome)
                  const testsColor = (att.tests_ok === 0 && att.tests_total === 0) ? 'text-muted-foreground' : fixColor(outcome)
                  return (
                    <Link
                      key={att.run_id}
                      href={`/attempts/${att.run_id}`}
                      className="block bg-card p-4 transition-colors hover:bg-card/80"
                    >
                      {/* Status + agent name */}
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'flex h-6 w-6 items-center justify-center rounded shrink-0',
                          att.passed ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                        )}>
                          {att.passed ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                        </div>
                        <span className="font-mono text-base font-medium text-foreground truncate">
                          {att.agent_name}
                        </span>
                      </div>
                      {/* Badges */}
                      <div className="mt-1.5 ml-9 flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-xs">{att.harness}</Badge>
                        <Badge variant="secondary" className="bg-primary/10 text-xs text-primary">{att.model}</Badge>
                      </div>
                      {/* Meta + link arrow */}
                      <div className="mt-1.5 ml-9 flex items-center justify-between gap-2">
                        <span className="font-mono text-sm text-muted-foreground">
                          <span className={cn('tabular-nums', testsColor)}>{testsLabel}</span>
                          <span> · </span>
                          <span className="tabular-nums">{att.time}</span>
                          <span> · </span>
                          <span className="tabular-nums">{att.cost_usd > 0 ? (att.cost_usd < 0.01 ? '<$0.01' : '$' + att.cost_usd.toFixed(2)) : '\u2014'}</span>
                          <span> · </span>
                          <span>{att.created_at ? new Date(att.created_at).toLocaleDateString() : '\u2014'}</span>
                        </span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>

            {/* Desktop table */}
            <div className="relative mt-4 hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left text-sm font-medium text-muted-foreground">
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3 pr-4">Agent</th>
                      <th className="pb-3 pr-4">Harness</th>
                      <th className="pb-3 pr-4">Model</th>
                      <th className="pb-3 pr-4">Tests</th>
                      <th className="pb-3 pr-4">Time</th>
                      <th className="pb-3 pr-4">Cost</th>
                      <th className="pb-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {challenge.attempts.map((att) => {
                      const outcome = classifyFix(att.tests_ok, att.tests_total, att.baseline_passing, att.broken_by_bug)
                      const testsLabel = (att.tests_ok === 0 && att.tests_total === 0) ? 'no score' : fixLabel(outcome)
                      const testsColor = (att.tests_ok === 0 && att.tests_total === 0) ? 'text-muted-foreground' : fixColor(outcome)
                      return (
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
                              className="font-mono text-base text-foreground hover:text-primary"
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
                            <span className={cn('font-mono text-sm tabular-nums whitespace-nowrap', testsColor)}>
                              {testsLabel}
                            </span>
                          </td>
                          <td className="py-3 pr-4 font-mono text-sm text-muted-foreground whitespace-nowrap">
                            {att.time}
                          </td>
                          <td className="py-3 pr-4 font-mono text-sm text-muted-foreground whitespace-nowrap">
                            {att.cost_usd > 0 ? (att.cost_usd < 0.01 ? '<$0.01' : '$' + att.cost_usd.toFixed(2)) : '\u2014'}
                          </td>
                          <td className="py-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs text-muted-foreground">
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
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-lg border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">No submissions yet</p>
          </div>
        )}
      </div>

      {/* Reference Fix Diff — collapsed by default */}
      {challenge.fixDiff && (
        <div className="mt-10">
          <details>
            <summary className="cursor-pointer font-mono text-sm font-medium uppercase tracking-wider text-primary hover:text-primary/80 select-none">
              Reference Fix
            </summary>
            <div className="relative mt-4">
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
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
          </details>
        </div>
      )}
    </div>
  )
}
