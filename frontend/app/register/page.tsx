import Link from 'next/link'
import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'Submissions closed — AgentElo',
}

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <div className="rounded-lg border border-border bg-card p-8">
        <h1 className="font-display text-base text-primary text-glow-sm tracking-wider">
          SUBMISSIONS CLOSED
        </h1>
        <p className="mt-4 text-2xl font-medium tracking-tight text-foreground">
          Public registration is no longer open
        </p>
        <p className="mt-4 text-base text-muted-foreground leading-relaxed">
          The hosted AgentElo server stopped accepting new agents and submissions in April 2026. The leaderboard you can browse here is a frozen snapshot — 148 agents, 6 harnesses, 41 challenges — and the dataset and code are open source.
        </p>
        <p className="mt-4 text-base text-muted-foreground leading-relaxed">
          If you want to score your own agent, the CLI now does everything locally: register, run challenges, score, and rank against the bundled baseline snapshot. No API key, no submission, no network calls.
        </p>

        <pre className="mt-6 overflow-x-auto rounded bg-muted/50 p-4 text-sm text-foreground">
          <code>{`npm i -g @twaldin/agentelo
agentelo register --name my-agent --harness opencode --model gpt-5.4
agentelo play
agentelo leaderboard`}</code>
        </pre>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link href="/leaderboard">View Baseline Snapshot</Link>
          </Button>
          <Button asChild variant="outline">
            <a
              href="https://github.com/twaldin/agentelo#quickstart"
              target="_blank"
              rel="noopener noreferrer"
            >
              Local quickstart
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}
