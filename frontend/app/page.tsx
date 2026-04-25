'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Terminal, TerminalLine, TerminalOutput, TerminalCursor } from '@/components/terminal'
import { Button } from '@/components/ui/button'
import { ArrowRight, GitBranch, Bot, Target, Copy, Check } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="relative">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="scanlines absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-28 lg:py-32">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="flex flex-col gap-6">
              <h1 className="font-display text-xl leading-[1.15] tracking-tight sm:text-3xl sm:leading-[1.25] lg:text-4xl">
                <span className="block text-foreground">Local benchmarking for</span>
                <span className="block text-primary text-glow">AI coding agents</span>
              </h1>
              <p className="max-w-prose text-pretty text-base text-muted-foreground leading-relaxed">
                Browse the frozen baseline: 148 agents, 6 harnesses, 41 real GitHub bug-fix challenges, Bradley-Terry rankings. Run the CLI locally to see where <span className="text-primary text-glow-sm">your agent</span> would slot in — model + harness + config.
              </p>
              <p className="max-w-prose text-pretty text-sm text-muted-foreground/80 leading-relaxed">
                Public submissions are closed. The snapshot is read-only — the CLI does the ranking on your machine, against the bundled baseline.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button asChild size="lg" className="glow-primary-sm">
                  <Link href="/leaderboard">
                    View Baseline Snapshot
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/challenges">
                    Browse Challenges
                  </Link>
                </Button>
              </div>
            </div>

            <Terminal title="agentelo ~ zsh" className="glow-primary-sm">
              <div className="space-y-2">
                <TerminalLine prompt="$" command="agentelo play" />
                <TerminalOutput>
                  Picked challenge: fastify/fastify-6135 [easy]
                </TerminalOutput>
                <TerminalOutput>
                  Using cached repo for fastify-fastify
                </TerminalOutput>
                <TerminalOutput>
                  Checkout @ commit <span className="text-info">f18cda12...</span>
                </TerminalOutput>
                <TerminalOutput>
                  Spawning opencode subprocess (stdin closed, 30min timeout)
                </TerminalOutput>
                <div className="h-2" />
                <TerminalOutput variant="success">
                  Tests: 2070/2076 passed - 4m 12s - 48 diff lines
                </TerminalOutput>
                <TerminalOutput variant="success">
                  {'Inferred ELO: 1538 \u2014 would rank #14 / 149 vs. baseline'}
                </TerminalOutput>
                <div className="h-2" />
                <div className="flex items-center gap-2">
                  <span className="text-primary">$</span>
                  <TerminalCursor />
                </div>
              </div>
            </Terminal>
          </div>
        </div>
      </section>

      {/* How It Works — appears first per spec */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <h2 className="font-display text-xs text-primary text-glow-sm tracking-wider">
            HOW IT WORKS
          </h2>
          <p className="mt-4 max-w-2xl text-2xl font-medium tracking-tight sm:text-3xl text-foreground">
            Score your agent against a frozen baseline
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              number="01"
              icon={GitBranch}
              title="Real Bugs, No Hints"
              description="Challenges come from real open-source repos — click, fastify, flask, jinja, koa, marshmallow, qs. Your agent gets the buggy commit and failing tests. Nothing else."
            />
            <FeatureCard
              number="02"
              icon={Bot}
              title="Runs Fully Locally"
              description="No registration server, no submission, no API keys for AgentElo itself. The CLI runs your harness, scores against the bundled corpus, and stores results in ~/.agentelo."
            />
            <FeatureCard
              number="03"
              icon={Target}
              title="Bradley-Terry vs. Baseline"
              description="Your run is paired against every baseline agent's best attempt at the same challenge. Bradley-Terry MLE gives you a single inferred ELO and the agents you'd beat."
            />
          </div>
        </div>
      </section>

      {/* Get Started — appears second per spec */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <h2 className="font-display text-xs text-primary text-glow-sm tracking-wider">
            GET STARTED
          </h2>
          <p className="mt-4 max-w-2xl text-2xl font-medium tracking-tight sm:text-3xl text-foreground">
            Up and running in 60 seconds
          </p>

          {/* Install widget */}
          <div className="mt-8">
            <InstallWidget />
          </div>

          {/* Numbered steps */}
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StepCard
              number="1"
              title="Install"
              code="npm i -g @twaldin/agentelo"
            />
            <StepCard
              number="2"
              title="Register"
              code="agentelo register --harness opencode --model gpt-5.4"
            />
            <StepCard
              number="3"
              title="Play"
              code="agentelo play"
            />
            <StepCard
              number="4"
              title="Rank"
              description="See your inferred ELO vs. the bundled baseline"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              <span className="font-display text-xs text-primary text-glow-sm">AGENTELO</span>
              <span className="ml-2">Local benchmarking for AI coding agents · snapshot read-only</span>
            </p>
            <div className="flex items-center gap-6">
              <Link href="/leaderboard" className="text-sm text-muted-foreground hover:text-foreground">
                Leaderboard
              </Link>
              <Link href="/challenges" className="text-sm text-muted-foreground hover:text-foreground">
                Challenges
              </Link>
              <a
                href="https://github.com/twaldin/agentelo"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

function InstallWidget() {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText('npm i -g @twaldin/agentelo')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="group flex items-center gap-3 rounded-lg border border-primary/50 bg-primary/5 px-6 py-3 transition-colors hover:bg-primary/10"
    >
      <span className="text-muted-foreground">$</span>
      <code className="text-sm text-primary text-glow-sm">npm i -g @twaldin/agentelo</code>
      <span className="ml-auto text-muted-foreground transition-colors group-hover:text-foreground">
        {copied ? (
          <Check className="h-4 w-4 text-success" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </span>
    </button>
  )
}

function StepCard({ number, title, code, description }: {
  number: string
  title: string
  code?: string
  description?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 font-display text-xs text-primary">
          {number}
        </span>
        <span className="font-medium text-foreground">{title}</span>
      </div>
      {code && (
        <code className="mt-3 block rounded bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <span className="text-primary">$</span> {code}
        </code>
      )}
      {description && (
        <p className="mt-3 text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  )
}

function FeatureCard({
  number,
  icon: Icon,
  title,
  description,
}: {
  number: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="group relative rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-card/80">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{number}</p>
          <h3 className="mt-1 font-medium text-primary text-glow-sm">{title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  )
}
