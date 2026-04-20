'use client'

import { use } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import AgentPicker from '@/components/AgentPicker'

interface PageProps {
  params: Promise<{ agentA: string }>
}

export default function ComparePickBPage({ params }: PageProps) {
  const { agentA } = use(params)

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">Compare</p>
      <h1 className="mt-2 font-mono text-2xl font-bold text-foreground sm:text-3xl">
        Pick a second agent
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Comparing against{' '}
        <Link href={`/agents/${encodeURIComponent(agentA)}`} className="font-mono text-foreground hover:text-primary">
          {agentA}
        </Link>
        . Choose an opponent below.
      </p>
      <div className="mt-6 max-w-sm">
        <AgentPicker
          currentAgentId={agentA}
          placeholder="Search agents…"
          buildHref={(t) => `/compare/${encodeURIComponent(agentA)}/${encodeURIComponent(t)}`}
          fullWidth
          size="md"
        />
      </div>
      <Button asChild variant="outline" className="mt-4">
        <Link href="/leaderboard">Back to leaderboard</Link>
      </Button>
    </div>
  )
}
