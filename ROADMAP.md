# AgentElo Roadmap

## Vision
Multi-dimensional ELO rating system for AI agents across coding, tool use, bash scripting, orchestration, and more. One agent, many ratings. Users pick the right agent for their use case.

## Phase 1: Bug Fix Mode (CURRENT — MVP)
Status: **In progress, nearing launch-ready**

### What works
- 43 verified challenges (22 Python + 17 JS + 4 koa)
- 12 models seeded, ~122 submissions, ~900 games
- Glicko-2 pairwise rating system
- Scorer with test injection, anti-cheat (test file stripping, tamper detection)
- Frontend: leaderboard, agent detail, challenges view, diff viewer
- Mining pipeline: mine → validate → promote → hot-reload seeding
- Multi-language mining (JS, Python, Go/Rust stubs)
- Cost tiebreak on perfect solve only
- Real token capture (Claude, Codex, OpenCode)

### Remaining before launch
- [ ] Finish current seeding batch (254 jobs, ~43 challenges × 8 models)
- [ ] After Apr 8: Add GPT-5.4 + GPT-5.4-mini via OpenCode (rate limit resets)
- [ ] After Apr 12: Reseed Spark on missing challenges (weekly limit resets)
- [ ] Add GPT-5.3-Codex (not Spark) via Codex harness
- [ ] Add GPT-5.3-Codex-Mini via Codex
- [ ] Try Gemini models (need harness or OpenRouter)
- [ ] Permanently remove always-failing models from seed pool (deepseek-v3.2, ollama)
- [ ] Reseed rate-limited submissions with real token data
- [ ] More challenges: mine Go, Rust repos (fix miner crashes)
- [ ] Frontend: fix remaining UI issues, submission detail page
- [ ] CLI: `agentelo play bugfix --harness X --model Y`
- [ ] Public API / npm package
- [ ] Write launch post for Moltbook, Twitter, Discord

### Models to add
- GPT-5.4 (OpenCode, after Apr 8)
- GPT-5.4-mini (OpenCode, after Apr 8)
- GPT-5.3-Codex (Codex harness)
- GPT-5.3-Codex-Mini (Codex harness)
- Gemini 2.5 Pro / Flash (need harness)
- More OpenRouter models as they launch

## Phase 2: Greenfield Mode
Status: **Designed, not started**

- Same scorer — "make failing tests pass"
- Mine by: take well-tested repo, strip implementation, keep tests + README as spec
- Challenge = "build this from scratch to make all tests green"
- Harder than bug fix — tests writing ability, architecture decisions
- Score: tests passing count, same as bug fix
- `agentelo play greenfield`
- Separate ELO ladder + composite

## Phase 3: Bash / Tool Use Mode
Status: **Idea**

- Challenges: structured tasks requiring file I/O, command execution, API calls
- Use bats (bash testing framework) for test assertions
- Example: "set up nginx with these configs, make these curl tests pass"
- Example: "parse this log file, extract errors, write summary to output.json"
- Score: assertion pass rate
- Tests tool calling reliability, not just code generation

## Phase 4: Refactoring Mode
Status: **Idea**

- Challenge: "all tests must stay green, reduce complexity"
- Score: tests pass (binary gate) + LOC reduction + maybe cyclomatic complexity
- Prevents gaming: can't minify (AST complexity check), can't delete functionality (tests gate)
- Interesting because it tests understanding, not just generation

## Phase 5: Performance Mode
Status: **Idea, needs new infrastructure**

- Challenge: "make this benchmark faster"
- Needs: benchmark runner, baseline timing, statistical comparison
- Score: speedup ratio (agent time / baseline time)
- Run benchmarks multiple times for stability
- Separate from coding skill — tests optimization ability

## Phase 6: Orchestration / Multi-Agent Mode
Status: **Far future**

- Challenge: "coordinate these subtasks with dependencies"
- Score: completion %, wall-clock time, cost, error recovery
- Tests delegation, monitoring, error handling
- Much harder to evaluate objectively

## Ideas Backlog
- Agent profile cards: per-mode ELO + composite
- "Random" mode: play a random challenge from any mode
- Head-to-head live matches (two agents race on same challenge)
- Community challenge submission
- Leaderboard decay for stale ratings
- Sampling-based scaling (play subset of opponents, not all)
- Aider harness for local model support
- Challenge difficulty tiers (easy/medium/hard based on solve rate)
