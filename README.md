# agentelo

Local benchmarking tool for AI coding agents. Run your agent against real GitHub bug-fix challenges, get a Bradley-Terry score, see where it would slot into the snapshot of 148 baseline agents I ran across 6 harnesses.

> **Public leaderboard is closed.** I'm not running a hosted submission server anymore — Stanford / Laude Institute's [Terminal-Bench 2.0](https://www.tbench.ai/) + Harbor cover the public-leaderboard problem at a scale a solo student can't match. What's left is still useful: the harness adapters, the challenge corpus, and the baseline snapshot. The CLI now runs everything locally — register, run challenges, score, and rank your agent against the bundled baseline — with no network calls.

## What it does

- Runs your agent (any harness/model combo supported by [`@twaldin/harness-ts`](https://github.com/twaldin/harness)) on real merged-PR bug fixes from `click`, `fastify`, `flask`, `jinja`, `koa`, `marshmallow`, `qs`
- Scores each run with the original PR's test suite — pass/fail per test, no rubric judgment
- Compares your scores pairwise against the 148 bundled baseline agents using Bradley-Terry MLE, gives you an inferred ELO and which baselines your agent would beat

Use it to A/B your own prompt changes, your own harness configs, or a model you suspect is under- or over-rated by the baseline.

## Install

```bash
npm i -g @twaldin/agentelo
```

## Quickstart

```bash
# register a local agent (no network call — just saves identity to ~/.agentelo)
agentelo register --name my-agent --harness opencode --model gpt-5.4

# run a ranked match against a randomly picked challenge from the bundled corpus
agentelo play

# show your local results + inferred ranking against the baseline snapshot
agentelo leaderboard
```

The first `play` clones the challenge repo into `~/.agentelo/challenges/`. After that, runs are offline.

## Baseline snapshot (2026-04-15)

These rankings ship with the CLI and are what your local runs are scored against.

- 148 agents ranked
- 41 challenges across 7 repos
- 6 harnesses: `claude-code`, `codex`, `aider`, `swe-agent`, `opencode`, `gemini`
- Bradley-Terry ELO over all pairwise outcomes from ~3.5K verified runs

| Rank | Agent | ELO | Win Rate |
|-----:|-------|----:|---------:|
| 1 | `swe-agent-glm-5` | 1887 | 85% |
| 2 | `opencode-glm-5` | 1882 | 85% |
| 3 | `opencode-gpt-5.4` | 1873 | 85% |
| 4 | `opencode-gpt-5.3-codex` | 1861 | 84% |
| 5 | `gemini-gemini-3-flash-preview` | 1856 | 84% |

Full rankings, match logs, and the SQLite database are in this repo. Browse the snapshot at [tim.waldin.net/agentelo](https://tim.waldin.net/agentelo) — read-only, no submission.

## Where the related work lives

- **Multi-CLI harness abstraction** → [`harness`](https://github.com/twaldin/harness) (Python + TypeScript libraries, 13 adapters)
- **Fleet orchestration** → [`flt`](https://github.com/twaldin/flt) (multi-agent, multi-CLI orchestrator)
- **Prompt/agent optimization** → [`hone`](https://github.com/twaldin/hone) (uses harness as mutator backend)
- **Harness benchmarking** → [`harness-bench`](https://github.com/twaldin/harness-bench) (hold the model fixed, vary the scaffold)

## License

MIT
