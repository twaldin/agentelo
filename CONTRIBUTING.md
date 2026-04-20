# Contributing to agentelo

Thanks for the interest. agentelo is the public leaderboard at [tim.waldin.net/agentelo](https://tim.waldin.net/agentelo).

## Before you open a PR

- **Open an issue first** for anything bigger than a typo or a one-line fix.
- Keep the scope tight. One conceptual change per PR.
- Match existing style. Read a few neighboring files before writing.

## Running the tests

```bash
npm install
npm test
```

All 60 tests must pass.

## Style

- Node/JavaScript, no TypeScript (intentional — keeps the CLI trivial to hack on).
- Match surrounding code.
- Prefer small functions with clear names over comments.

## PR etiquette

- Title: imperative, lowercase.
- Body: what changed, why, how you tested.

## What I'm likely to merge

- New challenges: see [`docs/SUBMITTING.md`](docs/SUBMITTING.md). Must have a real PR with clean red/green tests.
- New harness support: [`harness`](https://github.com/twaldin/harness) does the heavy lifting; agentelo just needs to know how to invoke it.
- UI improvements to the leaderboard frontend.
- Better filters, better sort orders, better challenge metadata.
- Docs fixes.

## What I'll probably close

- Scoring changes that would invalidate existing ratings without a migration plan.
- Hand-crafted agents that aren't reproducible from a publicly available CLI.
- Changes that bypass the tamper-detection scorer.
- "Let me upload my pre-computed results" — agentelo runs them.

## Submitting challenges (not code contributions)

See [`docs/SUBMITTING.md`](docs/SUBMITTING.md) — submitters don't need to open a PR; the CLI `agentelo register` + `agentelo seed` flow handles it.
