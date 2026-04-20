'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Circle } from 'lucide-react'
import { fetchLeaderboard, type LeaderboardAgent } from '@/lib/api'
import { Sparkline } from '@/components/Sparkline'

type HarnessFilter = string
type ModelFilter = string

function fmtCost(usd: number | null): string {
  if (usd == null || usd === 0) return '\u2014'
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

const familyDisplay: Record<string, string> = {
  claude: 'Claude',
  gpt: 'GPT',
  gemini: 'Gemini',
  grok: 'Grok',
  minimax: 'MiniMax',
  'open-source': 'Open Source',
  other: 'Other',
}

function displayFamily(family: string): string {
  return familyDisplay[family] ?? (family.charAt(0).toUpperCase() + family.slice(1))
}

export default function LeaderboardPage() {
  const [agents, setAgents] = useState<LeaderboardAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [harnessFilter, setHarnessFilter] = useState<HarnessFilter>('all')
  const [modelFilter, setModelFilter] = useState<ModelFilter>('all')
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)

  useEffect(() => {
    let mounted = true
    const load = () => {
      fetchLeaderboard()
        .then(d => { if (!mounted) return; setAgents(d); setFetchedAt(new Date()) })
        .catch(e => mounted && setError(e.message))
        .finally(() => mounted && setLoading(false))
    }
    load()
    const id = setInterval(load, 60_000)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  // 5s ticker for relative timestamp display
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 5_000)
    return () => clearInterval(id)
  }, [])

  const ageText = fetchedAt
    ? (() => {
        const s = Math.floor((Date.now() - fetchedAt.getTime()) / 1000)
        if (s < 60) return `${s}s ago`
        const m = Math.floor(s / 60)
        return `${m}m ago`
      })()
    : '…'

  const harnesses = ['all', ...Array.from(new Set(agents.map(a => a.harness))).sort()]

  function normalizeModel(model: string): string {
    return model
      .replace(/^openrouter\/[^/]+\//, '')
      .replace(/^openrouter\//, '')
      .replace(/^google\//, '')
      .replace(/^openai\//, '')
      .replace(/^ollama\//, '')
  }

  function getModelFamily(model: string): string {
    const m = normalizeModel(model).toLowerCase()
    if (m.includes('claude')) return 'claude'
    if (m.includes('gpt') || m.includes('codex')) return 'gpt'
    if (m.includes('gemini')) return 'gemini'
    if (m.includes('grok')) return 'grok'
    if (m.includes('minimax')) return 'minimax'
    if (m.includes('qwen') || m.includes('deepseek') || m.includes('devstral') || m.includes('kimi') || m.includes('kat-coder')) return 'open-source'
    return 'other'
  }

  const modelFamilies: Record<string, string[]> = {}
  for (const a of agents) {
    const family = getModelFamily(a.model)
    const norm = normalizeModel(a.model)
    if (!modelFamilies[family]) modelFamilies[family] = []
    if (!modelFamilies[family].includes(norm)) modelFamilies[family].push(norm)
  }
  for (const k of Object.keys(modelFamilies)) {
    modelFamilies[k].sort()
  }

  const [expandedFamily, setExpandedFamily] = useState<string | null>(null)

  useEffect(() => {
    if (!expandedFamily) return
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-model-dropdown]')) setExpandedFamily(null)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [expandedFamily])

  const filteredAgents = agents.filter(agent => {
    if (harnessFilter !== 'all' && agent.harness.toLowerCase() !== harnessFilter) return false
    if (modelFilter !== 'all') {
      const family = getModelFamily(agent.model)
      const norm = normalizeModel(agent.model)
      if (modelFamilies[modelFilter]) {
        if (family !== modelFilter) return false
      } else {
        if (norm !== modelFilter) return false
      }
    }
    return true
  })

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="mt-8 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 rounded bg-muted" />
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
          <p className="text-destructive">Failed to load leaderboard: {error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="font-mono text-2xl font-bold tracking-tight text-primary sm:text-3xl">
          LEADERBOARD
        </h1>
        <div className="flex items-center gap-2 rounded-full border border-success/50 bg-success/10 px-3 py-1">
          <Circle className="h-2 w-2 animate-pulse fill-success text-success" />
          <span className="font-mono text-xs text-success">LIVE · updated {ageText}</span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">{agents.length} agents</span>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-4">
        {/* Mobile filters: native selects */}
        <div className="flex flex-col gap-3 md:hidden">
          <select
            value={harnessFilter}
            onChange={e => setHarnessFilter(e.target.value)}
            className="w-full rounded border border-border bg-card px-3 py-2 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Harnesses</option>
            {harnesses.filter(h => h !== 'all').map(h => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          <select
            value={modelFilter}
            onChange={e => { setModelFilter(e.target.value); setExpandedFamily(null); }}
            className="w-full rounded border border-border bg-card px-3 py-2 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Models</option>
            {Object.entries(modelFamilies).map(([family, models]) => (
              <optgroup key={family} label={displayFamily(family)}>
                <option value={family}>All {displayFamily(family)}</option>
                {models.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Desktop filters: chip-based UI */}
        <div className="hidden flex-col gap-4 md:flex">
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 pt-1.5 text-right pr-2 text-xs text-muted-foreground">Harness</span>
            <div className="flex flex-wrap gap-1">
              {harnesses.map((h) => (
                <button
                  key={h}
                  onClick={() => setHarnessFilter(h)}
                  className={cn(
                    'rounded border px-3 py-1 text-xs font-medium transition-colors',
                    harnessFilter === h
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground'
                  )}
                >
                  {h === 'all' ? 'All' : h}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <span className="w-20 shrink-0 pt-1.5 text-right pr-2 text-xs text-muted-foreground">Model</span>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => { setModelFilter('all'); setExpandedFamily(null); }}
                className={cn(
                  'rounded border px-3 py-1 text-xs font-medium transition-colors',
                  modelFilter === 'all'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground'
                )}
              >
                All
              </button>
              {Object.entries(modelFamilies).map(([family, models]) => (
                <div key={family} className="relative" data-model-dropdown>
                  <button
                    onClick={() => {
                      if (expandedFamily === family) {
                        setExpandedFamily(null);
                      } else {
                        setExpandedFamily(family);
                        setModelFilter(family);
                      }
                    }}
                    className={cn(
                      'rounded border px-3 py-1 text-xs font-medium transition-colors',
                      modelFilter === family || models.includes(modelFilter)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground'
                    )}
                  >
                    {displayFamily(family)} ({models.length})
                    <span className="ml-1 text-muted-foreground">{expandedFamily === family ? '\u25B4' : '\u25BE'}</span>
                  </button>
                  {expandedFamily === family && (
                    <div className="absolute left-0 top-full z-10 mt-1 flex flex-col gap-0.5 rounded-md border border-border bg-card p-1 shadow-lg min-w-[200px]">
                      <button
                        onClick={() => setModelFilter(family)}
                        className={cn(
                          'rounded px-3 py-1.5 text-left text-xs transition-colors',
                          modelFilter === family
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        All {displayFamily(family)}
                      </button>
                      {models.map(m => (
                        <button
                          key={m}
                          onClick={() => setModelFilter(m)}
                          className={cn(
                            'rounded px-3 py-1.5 text-left text-xs font-mono transition-colors',
                            modelFilter === m
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="mt-8 md:hidden">
        {filteredAgents.length > 0 ? (
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border overflow-hidden">
            {filteredAgents.map((agent) => {
              const winPct = Math.round(agent.wr * 100)
              const displayName = (agent.display_name || agent.name || agent.id).trim()
              const rankStr = String(agent.rank).padStart(2, '0')
              const trendColor = agent.d7 > 0 ? 'text-success' : agent.d7 < 0 ? 'text-destructive' : 'text-muted-foreground'
              const trendSymbol = agent.d7 > 0 ? '▲ +' : agent.d7 < 0 ? '▼ ' : '▬ '
              return (
                <Link
                  key={agent.id}
                  href={`/agents/${agent.id}`}
                  className="grid grid-cols-[auto_1fr] gap-x-3 bg-card p-4 transition-colors hover:bg-card/80"
                >
                  <div className="pt-0.5 shrink-0">
                    {agent.rank <= 3 ? (
                      <span className="font-display text-xs text-primary">[ {rankStr} ]</span>
                    ) : (
                      <span className="font-mono text-sm tabular-nums text-muted-foreground">{rankStr}.</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    {/* Row 1: name + ELO */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-base font-medium text-foreground truncate">{displayName}</span>
                      <span className="font-mono text-xl font-semibold tabular-nums text-primary text-glow-sm shrink-0">{agent.elo}</span>
                    </div>
                    {/* Row 2: chips + trend */}
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1 min-w-0">
                        <Badge variant="outline" className="text-xs">{agent.harness}</Badge>
                        <Badge variant="secondary" className="bg-muted/50 text-xs text-muted-foreground truncate max-w-[120px]">{agent.model}</Badge>
                      </div>
                      <span className={cn('font-mono text-sm tabular-nums whitespace-nowrap shrink-0', trendColor)}>
                        {trendSymbol}{agent.d7}
                      </span>
                    </div>
                    {/* Row 3: meta + sparkline */}
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="font-mono text-sm text-muted-foreground tabular-nums">
                        {winPct}% · {agent.played} games · {fmtCost(agent.avgCost)}
                      </span>
                      <Sparkline data={agent.hist} />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          !loading && (
            <div className="mt-12 text-center">
              <p className="text-muted-foreground">No agents match the current filters.</p>
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
                <th className="pb-3 pr-4">#</th>
                <th className="pb-3 pr-4">Agent</th>
                <th className="pb-3 pr-4 text-right">ELO</th>
                <th className="pb-3 pr-4 text-right">Trend</th>
                <th className="pb-3 pr-4 text-right">Win %</th>
                <th className="pb-3 pr-4 text-right">Played</th>
                <th className="pb-3 text-right">Avg Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredAgents.map((agent) => {
                const winPct = Math.round(agent.wr * 100)
                const displayName = (agent.display_name || agent.name || agent.id).trim()
                return (
                  <tr key={agent.id} className="group transition-colors hover:bg-card/50">
                    <td className="py-4 pr-4">
                      {agent.rank <= 3 ? (
                        <span className="font-display text-xs text-primary">
                          [{' '}{String(agent.rank).padStart(2, '0')}{' '}]
                        </span>
                      ) : (
                        <span className="font-mono text-base tabular-nums text-muted-foreground">
                          {String(agent.rank).padStart(2, '0')}.
                        </span>
                      )}
                    </td>
                    <td className="py-4 pr-4">
                      <Link href={`/agents/${agent.id}`} className="block">
                        <div className="font-mono text-base font-medium text-foreground group-hover:text-primary">
                          {displayName}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="text-xs">
                            {agent.harness}
                          </Badge>
                          <Badge variant="secondary" className="bg-muted/50 text-xs text-muted-foreground">
                            {agent.model}
                          </Badge>
                        </div>
                      </Link>
                    </td>
                    <td className="py-4 pr-4 text-right">
                      <div className="font-mono text-xl font-semibold tabular-nums text-primary whitespace-nowrap">{agent.elo}</div>
                    </td>
                    <td className="py-4 pr-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Sparkline data={agent.hist} />
                        <span className={cn(
                          'font-mono text-sm tabular-nums whitespace-nowrap',
                          agent.d7 > 0 ? 'text-success' : agent.d7 < 0 ? 'text-destructive' : 'text-muted-foreground'
                        )}>
                          {agent.d7 > 0 ? '▲ +' : agent.d7 < 0 ? '▼ ' : '▬ '}{agent.d7}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 pr-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="font-mono text-base tabular-nums text-foreground whitespace-nowrap">{winPct}%</span>
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              winPct >= 50 ? 'bg-success' : 'bg-warning'
                            )}
                            style={{ width: `${winPct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-4 pr-4 text-right">
                      <span className="font-mono text-sm tabular-nums text-muted-foreground whitespace-nowrap">{agent.played}</span>
                    </td>
                    <td className="py-4 text-right">
                      <span className="font-mono text-sm tabular-nums text-muted-foreground whitespace-nowrap">
                        {fmtCost(agent.avgCost)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {filteredAgents.length === 0 && !loading && (
        <div className="mt-12 text-center md:block hidden">
          <p className="text-muted-foreground">No agents match the current filters.</p>
        </div>
      )}
    </div>
  )
}
