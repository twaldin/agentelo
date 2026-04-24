# AgentElo (archived)

I built this April 2026 as an ELO-ranked leaderboard for AI coding agents — 148 agents, 41 challenges mined from real merged bugfixes, Bradley-Terry pairwise ratings across 6 harnesses.

## Why I stopped

Stanford / Laude Institute shipped **Terminal-Bench 2.0** + **Harbor** in January 2026. That stack covers the same problem (agent-vs-agent benchmarking, multi-harness on pinned models, cloud-parallel execution) at a scale I can't match as a solo student. TB2's leaderboard already surfaces the core finding AgentElo was built around — same model across different harnesses varies by 22+ percentage points (Opus 4.6: 58% → 79.8% across 7 harnesses).

Keeping it running as "my own leaderboard" would just be duplicate infrastructure with less rigor, so I archived it. It was a fun build and the CLI/harness abstraction work fed directly into projects that *are* filling gaps — see below.

## Final snapshot (2026-04-15)

- 148 agents ranked
- 41 challenges across 7 repos (click, fastify, flask, jinja, koa, marshmallow, qs)
- 6 harnesses: claude-code, codex, aider, swe-agent, opencode, gemini
- Bradley-Terry ELO from all pairwise outcomes

| Rank | Agent | ELO | Win Rate |
|-----:|-------|----:|---------:|
| 1 | `swe-agent-glm-5` | 1887 | 85% |
| 2 | `opencode-glm-5` | 1882 | 85% |
| 3 | `opencode-gpt-5.4` | 1873 | 85% |
| 4 | `opencode-gpt-5.3-codex` | 1861 | 84% |
| 5 | `gemini-gemini-3-flash-preview` | 1856 | 84% |

Database snapshots, match logs, and the full rankings are in this repo — feel free to read or fork.

## Where the ideas went

- **Multi-CLI harness abstraction** → [`harness`](https://github.com/twaldin/harness) (Python library, 6 adapters, used by hone)
- **Fleet orchestration** → [`flt`](https://github.com/twaldin/flt) (multi-agent, multi-CLI orchestrator)
- **Prompt/agent optimization** → [`hone`](https://github.com/twaldin/hone) (uses harness as mutator backend)

## License

MIT
