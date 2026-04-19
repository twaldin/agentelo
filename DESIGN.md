# DESIGN: adopt local cost parser for `claude-code`

## Goal
Replace the inline, per-CLI `claude-code` token/cost scraping block in `bin/agentelo` with an `agentelo-local` parser function that mirrors harness-adapter style: parser logic lives in a dedicated module and `bin/agentelo` calls it.

## Strict scope
- In scope: `claude-code` extraction only.
- Out of scope: daemon behavior, queueing, retry loop, result writing, and all non-`claude-code` harness parsers.

## Block being replaced
Current block in `bin/agentelo`:
- Start: `// --- Claude Code: --output-format json → JSON result line in stdout ---`
- End: matching `if (harness === 'claude-code') { ... }` close
- Current location: approximately lines `1420-1444`.

## Planned code changes
1. Add parser module:
- `core/agentelo-local/parsers/claude-code.js`
- Export function: parse `claude-code` JSON/JSONL from stdout/log text and return `{ tokensIn, tokensOut, costUsd }`.

2. Wire parser into `bin/agentelo`:
- Add one `require` near other top-level imports.
- Replace only the `claude-code` inline extraction block with a call to the new parser.
- Keep all other harness extraction blocks unchanged.

3. Add focused unit tests for parser:
- `test/claude-code-cost-parser.test.js`
- Cover:
  - parses `result` line usage fields including cache token fields
  - prefers parsed `total_cost_usd` when present
  - handles JSONL/mixed noise lines
  - returns zeros when no parseable result object exists

## Before vs after call flow
### Before
`bin/agentelo` executes harness, captures `stdoutChunks`/log, then runs inline `if (harness === 'claude-code')` loop to reverse-scan lines and parse tokens/cost.

### After
`bin/agentelo` executes harness, captures `stdoutChunks`/log, then calls local parser for `claude-code`:
- `parseClaudeCodeCostAndTokens({ stdoutText, logContent })`
- parser returns normalized usage object
- `bin/agentelo` assigns `tokensIn/tokensOut/costUsd`

Behavior remains equivalent, but parsing logic is isolated in an adapter-like local module.

## Verification plan
1. Unit tests:
- Run `node --test test/claude-code-cost-parser.test.js`

2. Required live run through new code path:
- `agentelo practice --challenge qs-pr335 --harness claude-code --model haiku`
- Validate resulting `results/*.json` for this run has non-null `cost_usd`, `tokens_in`, and `tokens_out`.

3. Safety check:
- Confirm no changes to daemon/queue/result-writing flow.

## Commit plan
- Commit 1: `DESIGN.md` only.
- Commit 2: parser module + wiring + parser tests.
- Commit 3 (if needed): test-only or minor follow-up from live run.
