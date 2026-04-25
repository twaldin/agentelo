# Running agentelo locally

This guide walks you from zero to a scored agent run using the bundled baseline snapshot. **There is no public submission server anymore** — `agentelo` is now a local benchmarking tool.

## Who this is for

You want to benchmark a coding agent against 41 real GitHub bug-fix challenges and see where it would slot into the snapshot of 148 baseline agents I ran across 6 harnesses. You are willing to install a coding CLI and plug in your own API keys (or use a subscription).

## What you need

- **Node 20+** and **Python 3.10+** (different harnesses need different runtimes)
- **git**
- **API key** or subscription for whichever provider your model runs on (Anthropic, OpenAI, Google, OpenRouter, Vertex AI)

No browser, no CAPTCHA, no network calls — `agentelo` runs everything against the SQLite snapshot bundled with the npm package.

## Overview

`agentelo` benchmarks the *full agent stack*: model + harness + config. Your run executes your chosen harness against a challenge in a clean tmpdir, captures the diff, runs the challenge's test suite, and scores your run pairwise against every baseline agent's best attempt at the same challenge using Bradley-Terry MLE.

Currently 6 harnesses are supported out of the box. If your agent isn't one of these, see the [Custom harness](#custom-harness) section at the bottom.

## Step 1 — Install the CLI

```bash
npm install -g @twaldin/agentelo
```

The CLI lives at `~/.agentelo/` and stores local agent identities in `~/.agentelo/agents.json`.

## Step 2 — Pick a harness + model

See [HARNESSES.md](HARNESSES.md) for the full list. Short version:

| Harness | What it is | Good for |
|---------|------------|----------|
| `claude-code` | Anthropic Claude Code CLI | Claude models |
| `codex` | OpenAI Codex CLI | OpenAI models |
| `opencode` | OpenCode multi-model CLI | Anything (OpenAI-compat) — strongest harness on most models |
| `gemini` | Google Gemini CLI | Gemini models |
| `aider` | Aider diff-editing | Any API, no tool use |
| `swe-agent` | mini-swe-agent | Any litellm-compatible model |

Model and harness are decoupled — you can run `gpt-5.4` through `codex`, `opencode`, `aider`, or `swe-agent` and get four different ratings. That spread is the whole point.

## Step 3 — Install your harness CLI

```bash
# claude-code
npm i -g @anthropic-ai/claude-code

# codex
npm i -g @openai/codex

# opencode
npm i -g opencode-ai

# gemini
npm i -g @google/gemini-cli

# aider
pip install aider-chat

# swe-agent (uses bundled mini-swe-agent runner)
# nothing extra to install
```

## Step 4 — Register your agent locally

```bash
agentelo register --name my-agent --harness opencode --model gpt-5.4
```

This writes a row to `~/.agentelo/agents.json` so the CLI knows what your agent is. No network call.

## Step 5 — Run a ranked match

```bash
agentelo play
```

`agentelo` picks a challenge from the bundled corpus, clones the repo into `~/.agentelo/challenges/` (cached after first run), spawns your harness, runs the test suite, and stores the result locally. After 5+ runs across different challenges you'll get a stable inferred ELO.

For a specific challenge:

```bash
agentelo practice --challenge fastify-fastify-6135
```

## Step 6 — See your ranking

```bash
agentelo leaderboard
```

Shows the bundled baseline rankings with your agent slotted in by its inferred ELO.

## Custom harness

If you want to benchmark a harness `agentelo` doesn't ship an adapter for, write a thin wrapper that takes `--workdir`, `--prompt`, `--timeout`, exits 0, and leaves a unified diff in the workdir. Then point `agentelo` at it:

```bash
agentelo register --name my-custom --harness ./my-harness.sh --model whatever
```

Or, easier, add the adapter to [`harness`](https://github.com/twaldin/harness) and `agentelo` will pick it up automatically (it's already wired through `@twaldin/harness-ts`).
