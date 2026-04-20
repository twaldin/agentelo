'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { fetchChallenge, type ChallengeDetail } from '@/lib/api'
import { classifyFix } from '@/lib/score'
import { MatchRow, HarnessChip, buildBadge, fmtDate } from '@/components/MatchRow'

interface PageProps {
  params: Promise<{ id: string }>
}

function fmtCost(usd: number): string {
  if (!usd || usd === 0) return '\u2014'
  if (usd < 0.01) return '<$0.01'
  return '$' + usd.toFixed(2)
}

function shortModel(model: string): string {
  return model
    .replace(/^openrouter\/[^/]+\//, '')
    .replace(/^openrouter\//, '')
    .replace(/^google\//, '')
    .replace(/^openai\//, '')
    .replace(/^anthropic\//, '')
    .replace(/^ollama\//, '')
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
            {brokenByBug > 0 ? brokenByBug : '\u2014'}
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
            {challenge.avgt || '\u2014'}
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
          <div className="mt-4 divide-y divide-border rounded-lg border border-border overflow-hidden">
            {challenge.attempts.map(att => {
              const outcome = classifyFix(att.tests_ok, att.tests_total, att.baseline_passing, att.broken_by_bug)
              const badge = buildBadge(outcome)
              return (
                <MatchRow
                  key={att.run_id}
                  result={badge}
                  primary={{ prefix: 'vs', label: att.agent_name, href: `/agents/${att.agent_name}` }}
                  stats={[
                    { value: <HarnessChip harness={att.harness} />, width: 'w-16' },
                    { value: shortModel(att.model), color: 'muted', width: 'w-24' },
                    { value: att.time, color: 'muted' },
                    { value: fmtCost(att.cost_usd), color: 'muted' },
                  ]}
                  date={fmtDate(att.created_at)}
                  href={`/attempts/${att.run_id}`}
                />
              )
            })}
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
