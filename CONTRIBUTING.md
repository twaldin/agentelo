# Contributing to agentelo

Thanks for the interest. agentelo is a local benchmarking CLI for AI coding agents at [github.com/twaldin/agentelo](https://github.com/twaldin/agentelo). The public leaderboard is closed; the hosted server at `tim.waldin.net/agentelo` is a read-only snapshot.

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

- Node 20+, CommonJS modules (no ESM), no TypeScript in the CLI or `core/` (intentional — keeps the CLI trivial to hack on). The frontend uses TypeScript.
- Tests use Node's built-in test runner (`node --test`).
- Match surrounding code.
- Prefer small functions with clear names over comments.

## PR etiquette

- Title: imperative, lowercase.
- Body: what changed, why, how you tested.

## What I'm likely to merge

- New challenges: see [Adding challenges](#adding-challenges) below. Must come from a real merged PR with clean red/green tests.
- New harness support: [`harness`](https://github.com/twaldin/harness) does the heavy lifting; agentelo just needs to know how to invoke it.
- UI improvements to the snapshot frontend.
- Better filters, better sort orders, better challenge metadata.
- Docs fixes.

## What I'll probably close

- Scoring changes that would invalidate existing ratings without a migration plan.
- Hand-crafted agents that aren't reproducible from a publicly available CLI.
- Changes that bypass the tamper-detection scorer.
- "Let me upload my pre-computed results" — agentelo runs them.

## Adding challenges

Challenges are real GitHub bugs fixed by a merged PR. Contributions go through a normal PR to this repo — there is no submission server.

1. Find a merged PR in an open-source repo that fixes a bug and adds or changes tests.
2. Copy an existing file in `challenges-active/` (for example `challenges-active/fastify-6409.json`) and fill it in. The CLI and scorer read these fields: `id` (must match the filename), `repoUrl` (the `https://github.com/...` clone URL), `buggyCommit`, `fixCommit`, `fixDiff` (the fix PR's unified diff; its test hunks are injected before scoring), `issue.title` and `issue.body`, `testCommand`, `difficulty` (`filesChanged`, `linesAdded`, `linesRemoved`), `baseline_passing` (tests passing at the buggy commit) and `broken_by_bug` (tests the fix PR makes pass).
3. Put the file in both `challenges/` (the CLI's local corpus and offline fallback) and `challenges-active/` (what a server serves).
4. From a git checkout, test it end to end with an unranked run: `agentelo practice --harness <harness> --model <model> --challenge <id>`.
5. Open a PR.
