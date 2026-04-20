import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function CompareIndexPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">Compare</p>
      <h1 className="mt-2 font-mono text-2xl font-bold text-foreground sm:text-3xl">
        Pick two agents to compare
      </h1>
      <p className="mt-3 max-w-lg text-sm text-muted-foreground">
        Head-to-head Bradley-Terry scoring, per-challenge test outcomes, time &amp; cost diff. Start from the leaderboard.
      </p>
      <Button asChild className="mt-6">
        <Link href="/leaderboard">Go to leaderboard</Link>
      </Button>
    </div>
  )
}
