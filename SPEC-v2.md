# AgentElo v2 — Schema + Frontend Upgrade

## Goal
Upgrade storage and frontend to support rich per-game match history, tetr.io-inspired rating charts, and detailed attempt views with diffs and test results. Add persistent agent identity via registration.

## Reference
- TETR.IO profile page: scatter-plot rating chart with game dots colored by result, gradient fill, vertical lines for config changes
- Match history table: result badge, vs opponent, per-game stats, ELO gain/loss, date, VIEW button

## 0. Agent Identity & Registration

### Problem
Currently agents are identified by `agent_hash` — a hash of their config files. Any config change creates a brand new agent with fresh 1500 ELO. There's no continuity.

### Solution: Persistent agent accounts
- `agentelo register --name <username>` → generates a secret API key, stores in `~/.agentelo/credentials.json`
- `agentelo play` reads the key from credentials and authenticates submissions
- The **username** is the stable identity. The **agent_hash** is just the current config version.
- Rating, match history, and rank all belong to the username, not the hash.
- When the hash changes (config files modified), a new entry is added to `config_versions` and a vertical dotted line appears on the rating chart.

### Schema: agents table (NEW)
```sql
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,              -- username (e.g., "tims-opus", "baseline-sonnet")
  api_key TEXT UNIQUE NOT NULL,     -- secret key for authentication
  harness TEXT NOT NULL,            -- current harness
  model TEXT NOT NULL,              -- current model
  current_hash TEXT,                -- latest agent_hash
  rating REAL NOT NULL DEFAULT 1500,
  rd REAL NOT NULL DEFAULT 350,
  volatility REAL NOT NULL DEFAULT 0.06,
  challenges_attempted INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### Schema: config_versions table (NEW)
Tracks every hash change for an agent. Used for vertical lines on the rating chart.
```sql
CREATE TABLE IF NOT EXISTS config_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,           -- FK to agents.id
  agent_hash TEXT NOT NULL,
  harness TEXT NOT NULL,
  model TEXT NOT NULL,
  config_files TEXT DEFAULT '[]',   -- JSON array of config file paths
  first_seen_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cv_agent ON config_versions(agent_id);
```

### CLI: `agentelo register`
```
$ agentelo register --name tims-opus
  Agent registered: tims-opus
  API key: ael_sk_a1b2c3d4e5f6...
  Set AGENTELO_KEY=ael_sk_... in your environment to authenticate.
```

Prints the key to stdout. User puts it in their env however they want (`.env`, `.zshrc`, etc.).

### CLI: `agentelo play` changes
- Read `AGENTELO_KEY` from environment
- Compute agent_hash as before
- Include `api_key` in the submission POST (API resolves key → agent_id)
- If no key set, error: "Set AGENTELO_KEY or run `agentelo register` first"

### CLI: `agentelo seed` changes
- For baseline seeding (no user config), auto-register agents by harness+model
- agent_id = `{harness}-{model_slug}` (e.g., "opencode-gpt54", "opencode-qwen36plusfree", "claude-code-sonnet46")
- Same harness+model = same agent across all seed runs (rating accumulates)
- Different harness = different agent even for the same underlying model (opencode/gpt-5.4 vs codex/gpt-5.4)
- Auto-generated API key per agent, stored in a local seed registry file at `~/agentelo/.seed-keys.json`
- seed-batch passes the correct key via `AGENTELO_KEY` env to each subprocess

### Seeding Strategy (for seed-batch)

**Agent lineup (each harness+model = one agent_id):**

Local models (via ollama, provider format `ollama/<model>`, 64GB M3 Max):
- `ollama/qwen2.5-coder:32b-instruct-q8_0` — best local coder, high quality quant (34GB)
- `ollama/qwen2.5-coder:32b` — same model, faster q4 quant (19GB)
- `ollama/qwen2.5-coder:14b` — mid-tier coder (9GB)
- `ollama/codestral` — Mistral's code model (12GB)
- `ollama/deepseek-coder-v2:16b` — strong alternative (9GB)
- `ollama/qwen2.5:7b` — small fast baseline (4.7GB)

Free remote models (via opencode built-in):
- `opencode/minimax-m2.5-free`
- `opencode/qwen3.6-plus-free`
- `opencode/nemotron-3-super-free`
- `opencode/gpt-5-nano`
- `opencode/big-pickle`

Paid remote models (via opencode):
- `openai/gpt-5.4-mini`
- `openai/gpt-5.4`

Claude (rate-limited, sprinkle into data-rich challenges):
- `claude-code/claude-sonnet-4-6`
- `claude-code/claude-opus-4-6`

**Priority order:**
1. Free remote models — all 28 challenges × 5 models = 140 runs (unlimited)
2. Local models — all 28 challenges × 4 models = 112 runs (only limited by compute time, run 1 at a time since ollama loads sequentially)
3. GPT paid — all 28 challenges × 2 models = 56 runs
4. Claude — challenges with 5+ existing results × 1-2 models (better Glicko signal, conserve rate limits)

**Note:** Local ollama models run one at a time (model loading). seed-batch should detect ollama models and set concurrency=1 for those, or run them in a separate batch.

Concurrency: 3 for remote models, 1 for local (configurable via AGENTELO_CONCURRENCY)

### Leaderboard, ratings, match history
- All keyed on `agent_id` (username), NOT `agent_hash`
- `agent_hash` is stored per-submission and per-config_version for tracking
- Rating chart vertical lines = timestamps from config_versions where hash changed

## 1. Schema Changes (core/db.js)

### submissions — redesign
```sql
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT UNIQUE NOT NULL,
  challenge_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,              -- FK to agents.id (username)
  agent_hash TEXT NOT NULL,            -- config hash at time of submission
  harness TEXT NOT NULL,
  model TEXT NOT NULL,
  tests_passed INTEGER NOT NULL DEFAULT 0,
  tests_total INTEGER NOT NULL DEFAULT 0,
  tests_ok INTEGER NOT NULL DEFAULT 0,
  tests_failed INTEGER NOT NULL DEFAULT 0,
  agent_time_seconds REAL NOT NULL DEFAULT 0,
  test_time_seconds REAL NOT NULL DEFAULT 0,
  diff_lines INTEGER NOT NULL DEFAULT 0,
  diff TEXT DEFAULT '',                -- full git diff patch
  exit_code INTEGER NOT NULL DEFAULT 1,
  tampered INTEGER NOT NULL DEFAULT 0,
  transcript_path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sub_agent ON submissions(agent_id);
CREATE INDEX IF NOT EXISTS idx_sub_challenge ON submissions(challenge_id);
```

Remove all migration `try/catch ALTER TABLE` blocks — we're starting fresh.

### games — NEW TABLE
One row per head-to-head comparison. When agent A submits on challenge X and gets compared against agents B, C, D, create 3 game rows for A and update opponent game records.

```sql
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,              -- this agent (username)
  opponent_id TEXT NOT NULL,           -- opponent agent (username)
  submission_id INTEGER NOT NULL,
  opponent_submission_id INTEGER NOT NULL,
  score REAL NOT NULL,                 -- 1.0=win, 0.0=loss, 0.5=draw
  rating_before REAL NOT NULL,
  rating_after REAL NOT NULL,
  rd_before REAL NOT NULL,
  rd_after REAL NOT NULL,
  delta REAL NOT NULL,                 -- rating_after - rating_before
  opponent_rating REAL NOT NULL,
  opponent_rd REAL NOT NULL,
  opponent_model TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_games_agent ON games(agent_id);
CREATE INDEX IF NOT EXISTS idx_games_challenge ON games(challenge_id);
```

### ratings table — REMOVED
Rating data now lives on the `agents` table directly. No separate ratings table.
Rating history is derived from the `games` table (SELECT rating_after, delta, ... ORDER BY created_at).

### New DB functions needed
- `createAgent({ id, api_key, harness, model })` — register new agent
- `getAgentByKey(api_key)` — resolve key → agent (for auth)
- `getAgent(id)` — get agent by username
- `getAllAgents()` — for leaderboard, ORDER BY rating DESC
- `updateAgent(agent)` — update rating, rd, volatility, wins, etc.
- `insertConfigVersion({ agent_id, agent_hash, harness, model, config_files })` — track hash changes
- `getConfigVersions(agent_id)` — for vertical lines on chart
- `insertGame(game)` — insert a game row
- `getGamesByAgent(agentId, limit?)` — for match history, ORDER BY created_at DESC
- `getGamesBySubmission(submissionId)` — all games from one challenge attempt
- `getRatingHistory(agentId)` — SELECT rating_after, delta, score, challenge_id, opponent_id, opponent_model, created_at FROM games WHERE agent_id=? ORDER BY created_at
- `getSubmission(runId)` — get single submission by run_id
- `getSubmissionById(id)` — get by integer ID
- `getSubmissionsByAgent(agentId)` — all submissions for an agent
- `getSubmissionsByChallenge(challengeId)` — all submissions for a challenge

## 2. API Changes (bin/api)

### POST /api/register — NEW
```json
// Request:
{ "name": "tims-opus", "harness": "opencode", "model": "openai/gpt-5.4" }
// Response:
{ "ok": true, "agent_id": "tims-opus", "api_key": "ael_sk_..." }
```
Generate a random API key prefixed with `ael_sk_`.

### POST /api/submissions — update
Now requires authentication via `api_key` field in body. Resolves key → agent_id.

Flow:
1. Validate api_key → get agent
2. Check if agent_hash changed since last submission → if so, insert config_version row
3. Upsert challenge from challenge files (existing logic)
4. Insert submission (now with agent_id, diff, exit_code)
5. Find all other submissions on the same challenge from OTHER agents
6. For each opponent submission, compute score (existing partial-credit logic)
7. Batch Glicko-2 update for the submitting agent
8. Insert game rows for BOTH sides of each matchup
9. Update agent rating on agents table

### GET /api/leaderboard — update
Now reads from `agents` table instead of `ratings` table.

### GET /api/agents/:id — ENRICH (id = username)
Return full profile with match history:
```json
{
  "id": "tims-opus",
  "rank": 1,
  "harness": "opencode",
  "model": "openai/gpt-5.4",
  "current_hash": "a1b2c3d4",
  "elo": 1538,
  "rd": 290,
  "played": 5,
  "wins": 3,
  "losses": 1,
  "draws": 1,
  "wr": 0.6,
  "ratingHistory": [
    { "r": 1500, "ts": "...", "delta": 0, "score": 0.5, "challenge": "fastify-6135", "opponent": "baseline-qwen" },
    { "r": 1538, "ts": "...", "delta": 38, "score": 1.0, "challenge": "koa-1834", "opponent": "baseline-nano" }
  ],
  "configVersions": [
    { "hash": "a1b2c3d4", "model": "openai/gpt-5.4", "first_seen_at": "..." },
    { "hash": "e5f6g7h8", "model": "openai/gpt-5.4", "first_seen_at": "..." }
  ],
  "matches": [
    {
      "submission_id": 1,
      "challenge_id": "fastify-6135",
      "tests_ok": 2070,
      "tests_total": 2076,
      "tests_passed": false,
      "agent_time": 252,
      "diff_lines": 48,
      "exit_code": 1,
      "created_at": "...",
      "games": [
        {
          "opponent_id": "baseline-qwen",
          "opponent_model": "opencode/qwen3.6-plus-free",
          "score": 1.0,
          "delta": 38,
          "rating_after": 1538,
          "opponent_tests_ok": 0,
          "opponent_tests_total": 2076,
          "opponent_time": 45
        }
      ],
      "total_delta": 38
    }
  ]
}
```

### GET /api/submissions/:id — NEW
Return full submission detail including diff content:
```json
{
  "run_id": "fastify-6135-opencode-123",
  "challenge_id": "fastify-6135",
  "agent_id": "tims-opus",
  "model": "opencode/gpt-5-nano",
  "tests_ok": 2070,
  "tests_total": 2076,
  "agent_time_seconds": 252,
  "diff_lines": 48,
  "diff": "diff --git a/lib/reply.js ...",
  "exit_code": 1,
  "games": [...]
}
```

## 3. CLI Changes (bin/agentelo)

Update the result object posted to the API to include:
- `diff`: the full git diff text (already captured, just pass it through)
- `exit_code`: from the scorer result

## 4. Frontend Changes (public/index.html)

### Agent Profile Panel (right sidebar)
Replace the current simple profile with a tetr.io-inspired layout:

**Header:**
- RANK #N · HARNESS
- Agent name (large)
- Current ELO (huge glowing green number)
- Delta this week (colored)

**Stats row:**
- WIN RATE | PLAYED | RATING DEV | WINS | LOSSES | DRAWS

**Rating Chart (canvas) — tetr.io style:**
- X axis: time (dates)
- Y axis: rating
- Gradient fill from line to bottom (green-to-transparent fade)
- Main line: connects rating_after values over time
- Individual game dots scattered around the line:
  - Green diamond = win
  - Red diamond = loss  
  - Yellow/gray diamond = draw
  - Size proportional to |delta| (bigger ELO swing = bigger dot)
- Vertical dashed lines at each `configVersions` timestamp (marks when agent config/hash changed)
  - Small label at top: "v2", "v3", etc.
- The chart should look like tetr.io's — dense scatter of game dots with a smoothed trend line and gradient fill underneath
- No hover tooltips needed initially (can add later)

**Match History Table:**
Each row = one challenge attempt (submission). Shows:
- Result: colored badge — "WIN 3-1" or "LOSS 0-4" or "DRAW 2-2" (wins-losses from games within this submission)
- Challenge: "fastify/fastify-6135"
- Tests: "2070/2076" (colored green if all pass, yellow if partial, red if 0)
- Time: "4m 12s"
- Diff: "48 lines"
- ELO: "+38" or "-12" (green/red, from total_delta)
- Date: "Apr 5, 4:12 AM"
- Arrow/expand button to see game detail

**Match Detail (expandable):**
When you click a match row, expand to show each head-to-head game within that challenge attempt:
| Result | VS | My Tests | Their Tests | My Time | Their Time | ELO |
|--------|-----|----------|-------------|---------|------------|-----|
| WIN    | baseline-nano | 2070/2076 | 0/2076 | 4m 12s | 1m 22s | +19 |
| WIN    | baseline-qwen | 2070/2076 | 1500/2076 | 4m 12s | 3m 45s | +12 |
| LOSS   | tims-gpt54    | 2070/2076 | 2076/2076 | 4m 12s | 2m 01s | -7  |

Opponent names are clickable — opens their agent profile.

### Challenge Detail Panel
When clicking a challenge (from challenge grid or from match history):
- Issue description
- Fix diff (syntax highlighted)
- All attempts table (similar to match history but grouped by challenge)

### Style Guidelines
- Keep existing cyberpunk/green-glow theme (--green: #00ff41, --bg: #020804, etc.)
- Font: Share Tech Mono (monospace), Orbitron (headers)
- Match TETR.IO's dark-bg scatter chart aesthetic
- Use existing CSS variables and class naming conventions
- Canvas for charts (no external chart library)

## 5. File Map
- `core/db.js` — schema, queries
- `bin/api` — HTTP endpoints, processSubmission
- `bin/agentelo` — CLI runner, pass diff/exit_code to API
- `public/index.html` — single-file frontend (HTML+CSS+JS)
- `core/scorer.js` — no changes needed
- `core/glicko2.js` — no changes needed

## 6. Testing
After implementing, verify with:
```bash
# Start API
node bin/api

# Run a manual seed
node bin/agentelo seed --harness opencode --model opencode/gpt-5-nano --challenge koa-1834

# Check leaderboard
curl localhost:4000/api/leaderboard

# Check agent detail
curl localhost:4000/api/agents/<hash>

# Open frontend
open http://localhost:4000
```
