'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { fetchChallenges, type ChallengeEntry } from '@/lib/api'

type LanguageFilter = string

const diffColors: Record<string, string> = {
  easy: 'border-success/50 bg-success/10 text-success',
  medium: 'border-warning/50 bg-warning/10 text-warning',
  hard: 'border-destructive/50 bg-destructive/10 text-destructive',
  expert: 'border-destructive/50 bg-destructive/10 text-destructive',
  unrated: 'border-muted-foreground/30 bg-muted/20 text-muted-foreground',
}

export default function ChallengesPage() {
  const [challenges, setChallenges] = useState<ChallengeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [languageFilter, setLanguageFilter] = useState<LanguageFilter>('all')

  useEffect(() => {
    fetchChallenges()
      .then(setChallenges)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const availableLanguages = Array.from(new Set(challenges.map(ch => ch.lang.toLowerCase()))).sort()

  const filteredChallenges = challenges.filter(ch => {
    if (languageFilter !== 'all' && ch.lang.toLowerCase() !== languageFilter) return false
    return true
  })

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="mt-8 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 rounded bg-muted" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="text-destructive">Failed to load challenges: {error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-baseline gap-4">
        <h1 className="font-mono text-2xl font-bold tracking-tight text-primary sm:text-3xl">
          CHALLENGES
        </h1>
        <span className="text-sm text-muted-foreground">
          {challenges.length} total
        </span>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Language</span>
          <div className="flex flex-wrap gap-1">
            {['all', ...availableLanguages].map((filter) => (
              <button
                key={filter}
                onClick={() => setLanguageFilter(filter)}
                className={cn(
                  'rounded border px-3 py-1 text-xs font-medium transition-colors',
                  languageFilter === filter
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground'
                )}
              >
                {filter === 'all' ? 'All' : filter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="mt-8 md:hidden">
        {filteredChallenges.length > 0 ? (
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border overflow-hidden">
            {filteredChallenges.map((ch) => {
              const solveRate = Math.round(ch.sr * 100)
              return (
                <Link
                  key={ch.id}
                  href={`/challenges/${ch.id}`}
                  className="block bg-card p-4 transition-colors hover:bg-card/80"
                >
                  {/* Title */}
                  <p className="font-mono text-base font-medium text-foreground leading-snug">
                    {ch.title || ch.id}
                  </p>
                  {/* Meta: id · repo */}
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {ch.title ? `${ch.id} · ` : ''}{ch.repo}
                  </p>
                  {/* Badges + stats */}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-xs">{ch.lang}</Badge>
                      <Badge
                        variant="outline"
                        className={cn('text-xs uppercase', diffColors[ch.diff] || '')}
                      >
                        {ch.diff}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={cn(
                        'font-mono text-xl font-semibold tabular-nums',
                        solveRate > 0 ? 'text-success' : 'text-muted-foreground'
                      )}>
                        {solveRate}%
                      </span>
                      <span className="font-mono text-sm tabular-nums text-muted-foreground">
                        {ch.att}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          !loading && (
            <div className="mt-12 text-center">
              <p className="text-muted-foreground">No challenges match the current filters.</p>
            </div>
          )
        )}
      </div>

      {/* Desktop table */}
      <div className="relative mt-8 hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-sm font-medium text-muted-foreground">
                <th className="pb-3 pr-4">Challenge</th>
                <th className="pb-3 pr-4">Repo</th>
                <th className="pb-3 pr-4">Language</th>
                <th className="pb-3 pr-4">Difficulty</th>
                <th className="pb-3 pr-4 text-right">Solve Rate</th>
                <th className="pb-3 pr-4 text-right">Attempts</th>
                <th className="pb-3 text-right">Avg Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredChallenges.map((ch) => {
                const solveRate = Math.round(ch.sr * 100)
                return (
                  <tr key={ch.id} className="group transition-colors hover:bg-card/50">
                    <td className="py-4 pr-4">
                      <Link href={`/challenges/${ch.id}`} className="block hover:text-primary">
                        <span className="font-mono text-base font-medium text-foreground group-hover:text-primary">
                          {ch.title || ch.id}
                        </span>
                        {ch.title && (
                          <span className="block font-mono text-xs text-muted-foreground mt-0.5">
                            {ch.id}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="py-4 pr-4 font-mono text-sm text-muted-foreground">
                      {ch.repo}
                    </td>
                    <td className="py-4 pr-4">
                      <Badge variant="outline" className="text-xs">
                        {ch.lang}
                      </Badge>
                    </td>
                    <td className="py-4 pr-4">
                      <Badge
                        variant="outline"
                        className={cn('text-xs uppercase', diffColors[ch.diff] || '')}
                      >
                        {ch.diff}
                      </Badge>
                    </td>
                    <td className="py-4 pr-4 text-right">
                      <span className={cn(
                        'font-mono text-sm tabular-nums whitespace-nowrap',
                        solveRate > 0 ? 'text-success' : 'text-muted-foreground'
                      )}>
                        {solveRate}%
                      </span>
                    </td>
                    <td className="py-4 pr-4 text-right">
                      <span className="font-mono text-sm tabular-nums text-muted-foreground whitespace-nowrap">{ch.att}</span>
                    </td>
                    <td className="py-4 text-right">
                      <span className="font-mono text-sm tabular-nums text-muted-foreground whitespace-nowrap">{ch.avgt || '\u2014'}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {filteredChallenges.length === 0 && !loading && (
        <div className="mt-12 hidden text-center md:block">
          <p className="text-muted-foreground">No challenges match the current filters.</p>
        </div>
      )}
    </div>
  )
}
