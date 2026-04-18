'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { fetchLeaderboard, type LeaderboardAgent } from '@/lib/api'

interface Props {
  /** Agent the user is currently viewing (excluded from suggestions) */
  currentAgentId: string
  /** ELO of the current agent, used to surface similar-ELO defaults when input is empty */
  currentElo?: number | null
  /** Visual size. Default renders for the agent-page corner widget. */
  size?: 'sm' | 'md'
  /** Placeholder text override */
  placeholder?: string
  /** How to build the navigation URL on select. Defaults to /compare/:current/:target. */
  buildHref?: (targetId: string) => string
}

const MAX_SUGGESTIONS = 8
const MAX_DEFAULT_SUGGESTIONS = 3

export default function AgentPicker({
  currentAgentId,
  currentElo,
  size = 'sm',
  placeholder = 'Compare with agent…',
  buildHref,
}: Props) {
  const router = useRouter()
  const [agents, setAgents] = useState<LeaderboardAgent[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchLeaderboard().then(setAgents).catch(() => setAgents([]))
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [open])

  const trimmed = query.trim().toLowerCase()
  const pool = agents.filter(a => a.id !== currentAgentId)

  // Empty query: show nearest-ELO-above, nearest-ELO-below, and top-1
  // Typed query: fuzzy match by id/display name, sort by rank
  let suggestions: LeaderboardAgent[]
  if (!trimmed) {
    const sorted = [...pool].sort((x, y) => x.elo - y.elo)
    const out: LeaderboardAgent[] = []
    if (typeof currentElo === 'number') {
      const below = [...sorted].reverse().find(a => a.elo < currentElo)
      const above = sorted.find(a => a.elo > currentElo)
      if (above) out.push(above)
      if (below) out.push(below)
    }
    const top = pool.find(a => !out.some(o => o.id === a.id))
    if (top && out.length < MAX_DEFAULT_SUGGESTIONS) out.push(top)
    suggestions = out.slice(0, MAX_DEFAULT_SUGGESTIONS)
  } else {
    suggestions = pool
      .filter(a => {
        const hay = `${a.id} ${a.display_name ?? ''}`.toLowerCase()
        return trimmed.split(/\s+/).every(tok => hay.includes(tok))
      })
      .slice(0, MAX_SUGGESTIONS)
  }

  function go(targetId: string) {
    const href = buildHref ? buildHref(targetId) : `/compare/${encodeURIComponent(currentAgentId)}/${encodeURIComponent(targetId)}`
    router.push(href)
    setOpen(false)
    setQuery('')
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = suggestions[activeIdx]
      if (pick) go(pick.id)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const inputClass = cn(
    'rounded-md border border-border bg-card font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary',
    size === 'sm' ? 'h-8 w-48 px-2 text-xs' : 'h-9 w-64 px-3 text-sm'
  )

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={e => {
          setQuery(e.target.value)
          setActiveIdx(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        className={inputClass}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute right-0 z-20 mt-1 w-80 overflow-hidden rounded-md border border-border bg-card shadow-lg">
          {!trimmed && (
            <p className="border-b border-border bg-muted/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Suggested {typeof currentElo === 'number' ? '(similar ELO)' : ''}
            </p>
          )}
          <ul className="max-h-80 overflow-auto">
            {suggestions.map((a, i) => (
              <li key={a.id}>
                <button
                  onClick={() => go(a.id)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={cn(
                    'flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left font-mono text-xs transition-colors',
                    i === activeIdx ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/30'
                  )}
                >
                  <span className="truncate">
                    <span className="mr-2 text-muted-foreground/60">#{a.rank}</span>
                    {a.id}
                  </span>
                  <span className="shrink-0 text-primary">{a.elo}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
