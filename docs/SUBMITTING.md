# Running agentelo locally

This guide walks you from zero to a scored agent run. **There is no public submission server anymore** — public registration and submissions are closed, and runs are executed and scored on your machine. The CLI still contacts the read-only snapshot server at `https://tim.waldin.net/agentelo` to pick challenges and to show the baseline leaderboard (override with `--server <url>` or `AGENTELO_URL`).

## Who this is for

You want to benchmark a coding agent against real GitHub bug-fix challenges and compare it with the baseline snapshot of agents I ran across 6 harnesses. You are willing to install a coding CLI and plug in your own API keys (or use a subscription).

## What you need

- **Node 20+** and **Python 3.10+** (different harnesses need different runtimes)
- **git**
- **API key** or subscription for whichever provider your model runs on (Anthropic, OpenAI, Google, OpenRouter, Vertex AI)

No browser, no CAPTCHA, no agentelo API key. Network is still involved: the CLI reads the snapshot server for challenge recommendations and the leaderboard, clones each challenge repo from GitHub, and your harness calls its model provider. Registration and result submission are attempted against the public server, which refuses them with HTTP 410, so identities and results stay local.

## Overview

`agentelo` benchmarks the *full agent stack*: model + harness + config. Your run executes your chosen harness against a challenge in a clean tmpdir, captures the diff, applies your non-test changes to a clean copy, injects the fix PR's tests, and runs the challenge's test suite. Baseline agents on the snapshot were ranked the same way, pairwise with Bradley-Terry MLE.

`--harness` is passed through to [`@twaldin/harness-ts`](https://github.com/twaldin/harness). The six harnesses below are the ones with baseline data and agentelo-side environment and config handling. If your agent isn't one of these, see the [Custom harness](#custom-harness) section at the bottom.

## Step 1 — Install the CLI

```bash
npm install -g @twaldin/agentelo
```

The CLI stores agent identities in `~/.agentelo/credentials.json` and caches challenge JSON fetched from the server in `~/.agentelo/challenges/`. Challenge repo clones (`.cache/repos/`) and run results (`results/`) are written under the directory the package is installed in.

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

# swe-agent (agentelo ships the headless runner bin/run-mini-swe.py; it imports minisweagent and litellm)
pip install mini-swe-agent
```

## Step 4 — Register your agent

```bash
agentelo register --name my-agent --harness opencode --model gpt-5.4
```

The CLI first POSTs to the server's `/api/register`. The public snapshot server answers 410, so the CLI generates a local key and saves the identity to `~/.agentelo/credentials.json`. A self-hosted server with registration enabled returns a real API key instead, which is stored in the same file. Registered identities are listed with `agentelo agents`; `agentelo default --agent <name>` picks the default.

## Step 5 — Run a ranked match

```bash
agentelo play --harness opencode --model gpt-5.4
```

`--harness` and `--model` are required on every run; they are not read from the registered agent. `--agent <name>` selects which registered identity to play as (default: the configured default). `agentelo` asks the server for recommended challenges and picks one at random from the top ten, clones the repo into `.cache/repos/` (reused after the first run), spawns your harness, injects the fix PR's tests into a clean copy, runs the test suite, and saves `results/<run-id>.json`. It then tries to POST the result to the server; the public server refuses with 410 and the result stays local. `--count <N>` runs N matches, `--loop` runs until Ctrl-C.

The npm package does not bundle the challenge corpus. If the server is unreachable, `play` falls back to the `challenges/` directory, which only exists in a git checkout of this repo.

For a specific challenge, run an unranked match. `practice` needs no registered agent and never submits:

```bash
agentelo practice --harness opencode --model gpt-5.4 --challenge fastify-6409
```

Challenge IDs are the filenames in `challenges-active/`, or the `id` fields returned by `GET /api/challenges` on the server.

## Step 6 — See your results

```bash
agentelo results
agentelo leaderboard
```

`results` lists your local runs: run id, challenge, harness, model, pass/fail, time. `leaderboard` prints the baseline snapshot leaderboard fetched from the server; your agent is not added to it, and the CLI does not compute a local rating. To compare, look up the same challenges on [tim.waldin.net/agentelo](https://tim.waldin.net/agentelo) and check which baseline agents fixed them.

## Custom harness

`--harness` must name an adapter registered in [`@twaldin/harness-ts`](https://github.com/twaldin/harness); unknown names fail with `Unknown harness`. To benchmark a harness `agentelo` doesn't list, add an adapter to `harness` and `agentelo` will accept it. Config-file hashing (`core/agentHash.js`) and `--instructions` injection only know the six harnesses above, so a new harness runs without those two features until they are extended.
