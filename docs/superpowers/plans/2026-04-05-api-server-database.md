# AgentElo API Server + Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AgentElo API server (port 4000), SQLite database, Glicko-2 rating engine, result importer, and wire the frontend to live data.

**Architecture:** SQLite via better-sqlite3 in `core/db.js`; pure node:http server in `bin/api`; Glicko-2 math isolated in `core/glicko2.js`; ratings updated synchronously on each new submission. The frontend (`public/index.html`) is a copy of `frontends/v6-final.html` with mock data arrays replaced by `fetch()` calls.

**Tech Stack:** Node.js (commonjs), better-sqlite3, node:http, node:fs, node:path, node:crypto

**Design decisions:**
- Glicko-2 initial rating 1500, RD 350, volatility 0.06 for all new agents
- On each submission: compare vs ALL other submissions for same challenge; update BOTH agents' ratings each comparison
- `bin/agentelo` prefers challenges with most attempts: fetches `/api/challenges/recommended`, picks randomly from top 10
- Scorer uses fix commit's test files: clone fixCommit, copy test files (matching `test|spec` path patterns) into agent's working dir, then run tests

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `core/db.js` | create | SQLite open/schema/query helpers |
| `core/glicko2.js` | create | Glicko-2 math (pure functions) |
| `bin/api` | create | HTTP server on :4000, all routes |
| `bin/import-results` | create | Bulk-import JSON results → DB |
| `public/index.html` | create | Frontend (v6-final.html + live data) |
| `core/scorer.js` | modify | Inject fix-commit test files |
| `bin/agentelo` | modify | POST result to API after scoring; fetch recommended challenges |
| `test/glicko2.test.js` | create | Unit tests for Glicko-2 math |
| `package.json` | modify | Add better-sqlite3 dep |

---

## Task 1: Install better-sqlite3

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
cd /Users/twaldin/agentelo && npm install better-sqlite3
```

Expected: `node_modules/better-sqlite3` present, `package.json` shows `"better-sqlite3"` in dependencies.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install better-sqlite3"
```

---

## Task 2: core/db.js — SQLite schema + helpers

**Files:**
- Create: `core/db.js`

Schema:

```sql
-- challenges: one row per challenge JSON file
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  title TEXT,
  difficulty_files INTEGER,
  difficulty_lines INTEGER,
  test_command TEXT,
  fix_commit TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- submissions: one row per completed run
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT UNIQUE NOT NULL,
  challenge_id TEXT NOT NULL,
  agent_hash TEXT NOT NULL,
  harness TEXT NOT NULL,
  model TEXT NOT NULL,
  tests_passed INTEGER NOT NULL DEFAULT 0,   -- 0/1
  time_seconds REAL NOT NULL DEFAULT 0,
  diff_lines INTEGER NOT NULL DEFAULT 0,
  tampered INTEGER NOT NULL DEFAULT 0,       -- 0/1
  transcript_path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ratings: one row per unique agent_hash
CREATE TABLE IF NOT EXISTS ratings (
  agent_hash TEXT PRIMARY KEY,
  harness TEXT NOT NULL,
  model TEXT NOT NULL,
  rating REAL NOT NULL DEFAULT 1500,
  rd REAL NOT NULL DEFAULT 350,
  volatility REAL NOT NULL DEFAULT 0.06,
  challenges_attempted INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  rating_history TEXT NOT NULL DEFAULT '[]',  -- JSON: [{r: num, ts: ISO}]
  config_files TEXT NOT NULL DEFAULT '[]',    -- JSON: string[]
  updated_at TEXT DEFAULT (datetime('now'))
);
```

- [ ] **Step 1: Write failing test**

Create `test/db.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Point db at a temp file so tests don't pollute real DB
process.env.DB_PATH = path.join(os.tmpdir(), `agentelo-test-${Date.now()}.db`);

const db = require('../core/db');

test('upsertChallenge + getChallenge roundtrip', () => {
  db.upsertChallenge({
    id: 'test-1',
    repo: 'foo/bar',
    title: 'A bug',
    difficulty: { filesChanged: 2, linesAdded: 10 },
    testCommand: 'npm test',
    fixCommit: 'abc123',
  });
  const ch = db.getChallenge('test-1');
  assert.equal(ch.id, 'test-1');
  assert.equal(ch.repo, 'foo/bar');
  assert.equal(ch.fix_commit, 'abc123');
});

test('insertSubmission + getSubmissionsByChallenge', () => {
  db.insertSubmission({
    run_id: 'run-1',
    challenge_id: 'test-1',
    agent_hash: 'aabbcc',
    harness: 'claude-code',
    model: 'claude-sonnet-4-6',
    tests_passed: 1,
    time_seconds: 42.5,
    diff_lines: 10,
    tampered: 0,
    transcript_path: null,
    created_at: new Date().toISOString(),
  });
  const subs = db.getSubmissionsByChallenge('test-1');
  assert.equal(subs.length, 1);
  assert.equal(subs[0].agent_hash, 'aabbcc');
  assert.equal(subs[0].tests_passed, 1);
});

test('upsertRating + getRating roundtrip', () => {
  db.upsertRating({
    agent_hash: 'aabbcc',
    harness: 'claude-code',
    model: 'claude-sonnet-4-6',
    rating: 1650,
    rd: 200,
    volatility: 0.06,
    challenges_attempted: 1,
    wins: 1,
    rating_history: [{ r: 1500, ts: '2026-01-01T00:00:00Z' }, { r: 1650, ts: '2026-01-02T00:00:00Z' }],
    config_files: [],
  });
  const r = db.getRating('aabbcc');
  assert.equal(r.rating, 1650);
  assert.equal(r.challenges_attempted, 1);
  assert.deepEqual(r.rating_history[0].r, 1500);
});

test('getAllRatings returns array', () => {
  const all = db.getAllRatings();
  assert.ok(Array.isArray(all));
  assert.ok(all.length >= 1);
});

test('getAttemptCounts returns map of challenge_id -> count', () => {
  const counts = db.getAttemptCounts();
  assert.ok(typeof counts === 'object');
  assert.ok(counts['test-1'] >= 1);
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd /Users/twaldin/agentelo && node --test test/db.test.js 2>&1 | head -20
```

Expected: `Cannot find module '../core/db'`

- [ ] **Step 3: Implement core/db.js**

```js
'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'agentelo.db');

let _db;
function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS challenges (
        id TEXT PRIMARY KEY,
        repo TEXT NOT NULL,
        title TEXT,
        difficulty_files INTEGER,
        difficulty_lines INTEGER,
        test_command TEXT,
        fix_commit TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT UNIQUE NOT NULL,
        challenge_id TEXT NOT NULL,
        agent_hash TEXT NOT NULL,
        harness TEXT NOT NULL,
        model TEXT NOT NULL,
        tests_passed INTEGER NOT NULL DEFAULT 0,
        time_seconds REAL NOT NULL DEFAULT 0,
        diff_lines INTEGER NOT NULL DEFAULT 0,
        tampered INTEGER NOT NULL DEFAULT 0,
        transcript_path TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS ratings (
        agent_hash TEXT PRIMARY KEY,
        harness TEXT NOT NULL,
        model TEXT NOT NULL,
        rating REAL NOT NULL DEFAULT 1500,
        rd REAL NOT NULL DEFAULT 350,
        volatility REAL NOT NULL DEFAULT 0.06,
        challenges_attempted INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        rating_history TEXT NOT NULL DEFAULT '[]',
        config_files TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }
  return _db;
}

function upsertChallenge(ch) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO challenges (id, repo, title, difficulty_files, difficulty_lines, test_command, fix_commit)
    VALUES (@id, @repo, @title, @difficulty_files, @difficulty_lines, @test_command, @fix_commit)
  `).run({
    id: ch.id,
    repo: ch.repo || ch.repoUrl || '',
    title: ch.title || (ch.issue && ch.issue.title) || '',
    difficulty_files: ch.difficulty && ch.difficulty.filesChanged || 0,
    difficulty_lines: (ch.difficulty && (ch.difficulty.linesAdded || 0)) + (ch.difficulty && (ch.difficulty.linesRemoved || 0)),
    test_command: ch.testCommand || ch.test_command || 'npm test',
    fix_commit: ch.fixCommit || null,
  });
}

function getChallenge(id) {
  return getDb().prepare('SELECT * FROM challenges WHERE id = ?').get(id) || null;
}

function getAllChallenges() {
  return getDb().prepare('SELECT * FROM challenges ORDER BY created_at DESC').all();
}

function insertSubmission(sub) {
  getDb().prepare(`
    INSERT OR IGNORE INTO submissions
      (run_id, challenge_id, agent_hash, harness, model, tests_passed, time_seconds, diff_lines, tampered, transcript_path, created_at)
    VALUES
      (@run_id, @challenge_id, @agent_hash, @harness, @model, @tests_passed, @time_seconds, @diff_lines, @tampered, @transcript_path, @created_at)
  `).run({
    run_id: sub.run_id,
    challenge_id: sub.challenge_id,
    agent_hash: sub.agent_hash,
    harness: sub.harness,
    model: sub.model,
    tests_passed: sub.tests_passed ? 1 : 0,
    time_seconds: sub.time_seconds || 0,
    diff_lines: sub.diff_lines || 0,
    tampered: sub.tampered ? 1 : 0,
    transcript_path: sub.transcript_path || null,
    created_at: sub.created_at || new Date().toISOString(),
  });
}

function getSubmissionsByChallenge(challengeId) {
  return getDb().prepare('SELECT * FROM submissions WHERE challenge_id = ?').all(challengeId);
}

function getSubmissionsByAgent(agentHash) {
  return getDb().prepare('SELECT * FROM submissions WHERE agent_hash = ? ORDER BY created_at DESC').all(agentHash);
}

function upsertRating(r) {
  getDb().prepare(`
    INSERT INTO ratings (agent_hash, harness, model, rating, rd, volatility, challenges_attempted, wins, rating_history, config_files, updated_at)
    VALUES (@agent_hash, @harness, @model, @rating, @rd, @volatility, @challenges_attempted, @wins, @rating_history, @config_files, @updated_at)
    ON CONFLICT(agent_hash) DO UPDATE SET
      harness = @harness,
      model = @model,
      rating = @rating,
      rd = @rd,
      volatility = @volatility,
      challenges_attempted = @challenges_attempted,
      wins = @wins,
      rating_history = @rating_history,
      config_files = @config_files,
      updated_at = @updated_at
  `).run({
    agent_hash: r.agent_hash,
    harness: r.harness,
    model: r.model,
    rating: r.rating,
    rd: r.rd,
    volatility: r.volatility,
    challenges_attempted: r.challenges_attempted,
    wins: r.wins,
    rating_history: JSON.stringify(r.rating_history || []),
    config_files: JSON.stringify(r.config_files || []),
    updated_at: r.updated_at || new Date().toISOString(),
  });
}

function getRating(agentHash) {
  const row = getDb().prepare('SELECT * FROM ratings WHERE agent_hash = ?').get(agentHash);
  if (!row) return null;
  return {
    ...row,
    rating_history: JSON.parse(row.rating_history || '[]'),
    config_files: JSON.parse(row.config_files || '[]'),
  };
}

function getAllRatings() {
  return getDb().prepare('SELECT * FROM ratings ORDER BY rating DESC').all().map(row => ({
    ...row,
    rating_history: JSON.parse(row.rating_history || '[]'),
    config_files: JSON.parse(row.config_files || '[]'),
  }));
}

// Returns { challenge_id: attemptCount }
function getAttemptCounts() {
  const rows = getDb().prepare('SELECT challenge_id, COUNT(*) as cnt FROM submissions GROUP BY challenge_id').all();
  const map = {};
  for (const row of rows) map[row.challenge_id] = row.cnt;
  return map;
}

// Returns { challenge_id: { total, wins } }
function getSolveStats() {
  const rows = getDb().prepare(`
    SELECT challenge_id,
           COUNT(*) as total,
           SUM(tests_passed) as wins,
           AVG(time_seconds) as avg_time
    FROM submissions
    GROUP BY challenge_id
  `).all();
  const map = {};
  for (const r of rows) map[r.challenge_id] = r;
  return map;
}

module.exports = {
  getDb,
  upsertChallenge,
  getChallenge,
  getAllChallenges,
  insertSubmission,
  getSubmissionsByChallenge,
  getSubmissionsByAgent,
  upsertRating,
  getRating,
  getAllRatings,
  getAttemptCounts,
  getSolveStats,
};
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd /Users/twaldin/agentelo && node --test test/db.test.js 2>&1
```

Expected: all 5 tests pass.

- [ ] **Step 5: Clean up temp DB files**

The test creates a temp DB in `/tmp`. Clean up is automatic on system restart, but run anyway:
```bash
rm -f /tmp/agentelo-test-*.db
```

- [ ] **Step 6: Commit**

```bash
git add core/db.js test/db.test.js
git commit -m "feat: SQLite schema and query helpers (core/db.js)"
```

---

## Task 3: core/glicko2.js — Glicko-2 rating math

**Files:**
- Create: `core/glicko2.js`
- Create: `test/glicko2.test.js`

Glicko-2 constants: scale factor 173.7178, default σ=0.06, τ=0.5 (system constant).

The key function is `updateRating(current, games)` where:
- `current` = `{ rating, rd, volatility }` 
- `games` = `[{ opponentRating, opponentRd, score }]` (score: 1=win, 0.5=draw, 0=loss)
- Returns new `{ rating, rd, volatility }`

- [ ] **Step 1: Write failing test**

Create `test/glicko2.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { updateRating, defaultRating } = require('../core/glicko2');

test('defaultRating returns 1500/350/0.06', () => {
  const r = defaultRating();
  assert.equal(r.rating, 1500);
  assert.equal(r.rd, 350);
  assert.equal(r.volatility, 0.06);
});

test('beating a 1500-rated opponent raises rating', () => {
  const current = { rating: 1500, rd: 200, volatility: 0.06 };
  const after = updateRating(current, [
    { opponentRating: 1500, opponentRd: 200, score: 1 },
  ]);
  assert.ok(after.rating > current.rating, `Expected ${after.rating} > ${current.rating}`);
  assert.ok(after.rd < current.rd, `Expected rd to decrease: ${after.rd} < ${current.rd}`);
});

test('losing to a 1500-rated opponent lowers rating', () => {
  const current = { rating: 1500, rd: 200, volatility: 0.06 };
  const after = updateRating(current, [
    { opponentRating: 1500, opponentRd: 200, score: 0 },
  ]);
  assert.ok(after.rating < current.rating);
});

test('draw against equal-rated opponent barely changes rating', () => {
  const current = { rating: 1500, rd: 200, volatility: 0.06 };
  const after = updateRating(current, [
    { opponentRating: 1500, opponentRd: 200, score: 0.5 },
  ]);
  assert.ok(Math.abs(after.rating - current.rating) < 5, `Draw should barely change rating: delta=${after.rating - current.rating}`);
});

test('high RD agent converges faster (more rating change)', () => {
  const high = { rating: 1500, rd: 350, volatility: 0.06 };
  const low  = { rating: 1500, rd: 50,  volatility: 0.06 };
  const game = [{ opponentRating: 1800, opponentRd: 100, score: 1 }];
  const afterHigh = updateRating(high, game);
  const afterLow  = updateRating(low, game);
  assert.ok(
    Math.abs(afterHigh.rating - 1500) > Math.abs(afterLow.rating - 1500),
    'High RD should change more'
  );
});

test('multiple wins push rating up significantly', () => {
  const current = { rating: 1500, rd: 200, volatility: 0.06 };
  const games = Array(5).fill({ opponentRating: 1600, opponentRd: 150, score: 1 });
  const after = updateRating(current, games);
  assert.ok(after.rating > 1600, `After 5 wins vs 1600-rated: ${after.rating}`);
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd /Users/twaldin/agentelo && node --test test/glicko2.test.js 2>&1 | head -10
```

Expected: `Cannot find module '../core/glicko2'`

- [ ] **Step 3: Implement core/glicko2.js**

Full Glicko-2 per Mark Glickman's algorithm (https://www.glicko.net/glicko/glicko2.pdf):

```js
'use strict';

const SCALE = 173.7178;   // converts between Glicko-1 and Glicko-2 scales
const TAU   = 0.5;        // system constant (controls volatility change speed)
const EPSILON = 0.000001; // convergence tolerance for Illinois algorithm

function defaultRating() {
  return { rating: 1500, rd: 350, volatility: 0.06 };
}

// g(φ) — reduces influence of opponents with high RD
function _g(phi) {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

// E(μ, μj, φj) — expected score
function _E(mu, muj, phij) {
  return 1 / (1 + Math.exp(-_g(phij) * (mu - muj)));
}

/**
 * Update a rating given a list of game outcomes in a single rating period.
 * @param {{ rating: number, rd: number, volatility: number }} current
 * @param {Array<{ opponentRating: number, opponentRd: number, score: number }>} games
 * @returns {{ rating: number, rd: number, volatility: number }}
 */
function updateRating(current, games) {
  if (games.length === 0) {
    // No games: only RD increases slightly (not implemented for now, return as-is)
    return { ...current };
  }

  // Step 1: convert to Glicko-2 scale
  const mu  = (current.rating - 1500) / SCALE;
  const phi = current.rd / SCALE;
  const sigma = current.volatility;

  // Step 2: compute g, E, v for each game
  const gameData = games.map(g => {
    const muj  = (g.opponentRating - 1500) / SCALE;
    const phij = g.opponentRd / SCALE;
    const gj   = _g(phij);
    const Ej   = _E(mu, muj, phij);
    return { gj, Ej, sj: g.score };
  });

  // Step 3: compute v (estimated variance of the player's rating)
  const v = 1 / gameData.reduce((sum, { gj, Ej }) => sum + gj * gj * Ej * (1 - Ej), 0);

  // Step 4: compute Δ (estimated improvement)
  const Delta = v * gameData.reduce((sum, { gj, Ej, sj }) => sum + gj * (sj - Ej), 0);

  // Step 5: update volatility σ' via Illinois algorithm
  // f(x) = exp(x)(Δ² - φ² - v - exp(x)) / (2(φ² + v + exp(x))²) - (x-A)/τ²
  function f(x) {
    const ex = Math.exp(x);
    const num = ex * (Delta * Delta - phi * phi - v - ex);
    const den = 2 * Math.pow(phi * phi + v + ex, 2);
    return num / den - (x - Math.log(sigma * sigma)) / (TAU * TAU);
  }

  let A = Math.log(sigma * sigma);
  let B;
  if (Delta * Delta > phi * phi + v) {
    B = Math.log(Delta * Delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(A - k * TAU) < 0) k++;
    B = A - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPSILON) {
    const C  = A + (A - B) * fA / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B; fA = fB;
    } else {
      fA /= 2;
    }
    B = C; fB = fC;
  }
  const sigmaPrime = Math.exp(A / 2);

  // Step 6: update pre-rating RD
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);

  // Step 7: update rating and RD
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime  = mu + phiPrime * phiPrime * gameData.reduce((sum, { gj, Ej, sj }) => sum + gj * (sj - Ej), 0);

  // Step 8: convert back to Glicko-1 scale
  return {
    rating:     SCALE * muPrime + 1500,
    rd:         SCALE * phiPrime,
    volatility: sigmaPrime,
  };
}

module.exports = { updateRating, defaultRating };
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd /Users/twaldin/agentelo && node --test test/glicko2.test.js 2>&1
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add core/glicko2.js test/glicko2.test.js
git commit -m "feat: Glicko-2 rating implementation (core/glicko2.js)"
```

---

## Task 4: bin/api — HTTP server

**Files:**
- Create: `bin/api`

Routes:
- `GET /api/challenges` → all challenges with solve stats
- `GET /api/challenges/recommended` → challenges sorted by attempt count desc
- `GET /api/challenges/:id` → single challenge
- `POST /api/submissions` → store submission, update ratings
- `GET /api/leaderboard` → all agents ranked by rating
- `GET /api/agents/:hash` → single agent profile
- `GET /` → serve `public/index.html`

- [ ] **Step 1: Implement bin/api**

```js
#!/usr/bin/env node
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const db   = require('../core/db');
const { updateRating, defaultRating } = require('../core/glicko2');

const PORT = process.env.PORT || 4000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// ── helpers ──────────────────────────────────────────────────────────────────

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// Derive human-readable difficulty label from DB row
function diffLabel(row) {
  const lines = row.difficulty_lines || 0;
  if (lines <= 20)  return 'easy';
  if (lines <= 80)  return 'medium';
  if (lines <= 200) return 'hard';
  return 'expert';
}

// Derive model family from model string
function modelFamily(model) {
  if (!model) return 'other';
  const m = model.toLowerCase();
  if (m.includes('claude'))  return 'claude';
  if (m.includes('gpt') || m.includes('o1') || m.includes('o3')) return 'gpt';
  return 'local';
}

// Format seconds as "Xm Ys"
function fmtTime(secs) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// Build leaderboard entry for one ratings row
function buildAgentEntry(r, rank, solveStatsMap) {
  const hist = (r.rating_history || []).slice(-10);
  const d7 = hist.length >= 2
    ? Math.round(r.rating - hist[Math.max(0, hist.length - 8)].r)
    : 0;

  // Build recent challenges from submissions
  const subs = db.getSubmissionsByAgent(r.agent_hash).slice(0, 3);
  const challengeMap = {};
  for (const s of subs) {
    const ch = db.getChallenge(s.challenge_id);
    challengeMap[s.challenge_id] = ch;
  }
  const recent = subs.map(s => {
    const ch = challengeMap[s.challenge_id];
    return {
      n:  ch ? `${ch.repo.split('/')[1]}/${s.challenge_id.split('-').slice(1, 3).join('-')}` : s.challenge_id,
      st: s.tests_passed ? 'pass' : 'fail',
      sc: s.tests_passed ? '✓' : '✗',
      t:  fmtTime(s.time_seconds),
    };
  });

  // Config list
  const cfgl = [
    { k: 'harness', v: r.harness },
    { k: 'model',   v: r.model },
  ];
  if ((r.config_files || []).length > 0) {
    cfgl.push({ k: 'config', v: `${r.config_files.length} file(s)` });
  } else {
    cfgl.push({ k: 'config', v: 'baseline (no config)' });
  }

  return {
    id:      r.agent_hash,
    rank,
    name:    `${r.harness}-${r.model.replace('claude-', '').replace('-', '')}`,
    harness: r.harness,
    model:   r.model,
    mf:      modelFamily(r.model),
    cfg:     (r.config_files || []).length > 0 ? `${r.config_files.length} config file(s)` : 'baseline',
    elo:     Math.round(r.rating),
    d7,
    wr:      r.challenges_attempted > 0 ? r.wins / r.challenges_attempted : 0,
    played:  r.challenges_attempted,
    rd:      Math.round(r.rd),
    hash:    r.agent_hash.slice(0, 4) + '…' + r.agent_hash.slice(-4),
    hist:    hist.map(h => Math.round(h.r)),
    cfgl,
    recent,
  };
}

// Build challenge entry for API response
function buildChallengeEntry(row, stats) {
  const s = stats || { total: 0, wins: 0, avg_time: 0 };
  return {
    id:          row.id,
    repo:        row.repo.replace('https://github.com/', ''),
    title:       row.title || row.id,
    diff:        diffLabel(row),
    lang:        detectLang(row.repo),
    sr:          s.total > 0 ? s.wins / s.total : 0,
    att:         s.total || 0,
    avgt:        fmtTime(s.avg_time),
    test_command: row.test_command,
    created_at:  row.created_at,
  };
}

function detectLang(repo) {
  if (!repo) return 'unknown';
  const r = repo.toLowerCase();
  if (r.includes('django') || r.includes('flask') || r.includes('fastapi') || r.includes('python')) return 'python';
  if (r.includes('angular') || r.includes('react') || r.includes('next') || r.includes('vue') || r.includes('svelte')) return 'typescript';
  if (r.includes('golang') || r.includes('/go')) return 'go';
  if (r.includes('rust') || r.includes('tokio')) return 'rust';
  return 'javascript';
}

// Process a new submission: update ratings vs all other agents who attempted same challenge
function processSubmission(sub) {
  // Ensure challenge exists (create a minimal record if not)
  let ch = db.getChallenge(sub.challenge_id);
  if (!ch) {
    db.upsertChallenge({
      id: sub.challenge_id,
      repo: sub.repo || '',
      title: sub.challenge_id,
      difficulty: { filesChanged: 0, linesAdded: 0 },
    });
  }

  // Insert submission
  db.insertSubmission({
    run_id:          sub.run_id,
    challenge_id:    sub.challenge_id,
    agent_hash:      sub.agent_hash,
    harness:         sub.harness,
    model:           sub.model,
    tests_passed:    sub.tests_passed ? 1 : 0,
    time_seconds:    sub.time_seconds || 0,
    diff_lines:      sub.diff_lines || 0,
    tampered:        sub.tampered ? 1 : 0,
    transcript_path: sub.log_file || null,
    created_at:      sub.finished_at || new Date().toISOString(),
  });

  // Ensure agent has a rating record
  let myRating = db.getRating(sub.agent_hash);
  if (!myRating) {
    myRating = {
      agent_hash:           sub.agent_hash,
      harness:              sub.harness,
      model:                sub.model,
      ...defaultRating(),
      challenges_attempted: 0,
      wins:                 0,
      rating_history:       [],
      config_files:         sub.config_files || [],
    };
  }

  // Get all other submissions for this challenge (exclude this run_id)
  const others = db.getSubmissionsByChallenge(sub.challenge_id)
    .filter(s => s.run_id !== sub.run_id && s.agent_hash !== sub.agent_hash);

  if (others.length === 0) {
    // First submission for this challenge — just record the rating snapshot
    myRating.challenges_attempted += 1;
    myRating.rating_history.push({ r: myRating.rating, ts: new Date().toISOString() });
    db.upsertRating(myRating);
    return;
  }

  // Build games list and collect opponent rating objects to update
  const games = [];
  const opponentUpdates = [];

  for (const oSub of others) {
    let oppRating = db.getRating(oSub.agent_hash);
    if (!oppRating) {
      oppRating = {
        agent_hash:           oSub.agent_hash,
        harness:              oSub.harness,
        model:                oSub.model,
        ...defaultRating(),
        challenges_attempted: 1,
        wins:                 oSub.tests_passed ? 1 : 0,
        rating_history:       [],
        config_files:         [],
      };
    }

    // Determine game outcome: compare tests_passed, then time
    let myScore;
    const myPassed  = sub.tests_passed ? 1 : 0;
    const oppPassed = oSub.tests_passed ? 1 : 0;

    if (myPassed > oppPassed)       myScore = 1;
    else if (myPassed < oppPassed)  myScore = 0;
    else if (myPassed === 1) {
      // Both passed — lower time wins
      if (sub.time_seconds < oSub.time_seconds)       myScore = 1;
      else if (sub.time_seconds > oSub.time_seconds)  myScore = 0;
      else                                             myScore = 0.5;
    } else {
      myScore = 0.5; // both failed
    }

    games.push({
      opponentRating: oppRating.rating,
      opponentRd:     oppRating.rd,
      score:          myScore,
    });

    // Collect opponent update (they play against me)
    opponentUpdates.push({ oppRating, myScore, sub, myRating });
  }

  // Update my rating
  const myNew = updateRating(
    { rating: myRating.rating, rd: myRating.rd, volatility: myRating.volatility },
    games
  );
  const myWins = games.filter(g => g.score === 1).length;
  myRating.rating    = myNew.rating;
  myRating.rd        = myNew.rd;
  myRating.volatility = myNew.volatility;
  myRating.challenges_attempted += 1;
  myRating.wins      += myWins;
  myRating.rating_history.push({ r: myNew.rating, ts: new Date().toISOString() });
  if (myRating.rating_history.length > 50) {
    myRating.rating_history = myRating.rating_history.slice(-50);
  }
  db.upsertRating(myRating);

  // Update each opponent's rating (one game each vs the new submission)
  for (const { oppRating, myScore } of opponentUpdates) {
    const oppScore = myScore === 1 ? 0 : myScore === 0 ? 1 : 0.5;
    const oppNew = updateRating(
      { rating: oppRating.rating, rd: oppRating.rd, volatility: oppRating.volatility },
      [{ opponentRating: myRating.rating, opponentRd: myRating.rd, score: oppScore }]
    );
    oppRating.rating     = oppNew.rating;
    oppRating.rd         = oppNew.rd;
    oppRating.volatility = oppNew.volatility;
    if (oppScore === 1) oppRating.wins += 1;
    oppRating.rating_history.push({ r: oppNew.rating, ts: new Date().toISOString() });
    if (oppRating.rating_history.length > 50) {
      oppRating.rating_history = oppRating.rating_history.slice(-50);
    }
    db.upsertRating(oppRating);
  }
}

// ── router ────────────────────────────────────────────────────────────────────

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  // Static files
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    const htmlPath = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    return json(res, 404, { error: 'Frontend not found' });
  }

  // GET /api/challenges
  if (req.method === 'GET' && pathname === '/api/challenges') {
    const challenges = db.getAllChallenges();
    const stats = db.getSolveStats();
    return json(res, 200, challenges.map(ch => buildChallengeEntry(ch, stats[ch.id])));
  }

  // GET /api/challenges/recommended
  if (req.method === 'GET' && pathname === '/api/challenges/recommended') {
    const challenges = db.getAllChallenges();
    const counts = db.getAttemptCounts();
    const stats  = db.getSolveStats();
    const sorted = [...challenges].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
    return json(res, 200, sorted.map(ch => buildChallengeEntry(ch, stats[ch.id])));
  }

  // GET /api/challenges/:id
  const chMatch = pathname.match(/^\/api\/challenges\/([^/]+)$/);
  if (req.method === 'GET' && chMatch) {
    const ch = db.getChallenge(chMatch[1]);
    if (!ch) return json(res, 404, { error: 'Not found' });
    const stats = db.getSolveStats();
    return json(res, 200, buildChallengeEntry(ch, stats[ch.id]));
  }

  // POST /api/submissions
  if (req.method === 'POST' && pathname === '/api/submissions') {
    let body;
    try { body = await readBody(req); }
    catch (e) { return json(res, 400, { error: 'Invalid JSON' }); }
    try {
      processSubmission(body);
      return json(res, 201, { ok: true });
    } catch (e) {
      console.error('[api] processSubmission error:', e.message);
      return json(res, 500, { error: e.message });
    }
  }

  // GET /api/leaderboard
  if (req.method === 'GET' && pathname === '/api/leaderboard') {
    const ratings = db.getAllRatings();
    const entries = ratings.map((r, i) => buildAgentEntry(r, i + 1, null));
    return json(res, 200, entries);
  }

  // GET /api/agents/:hash
  const agentMatch = pathname.match(/^\/api\/agents\/([^/]+)$/);
  if (req.method === 'GET' && agentMatch) {
    const r = db.getRating(agentMatch[1]);
    if (!r) return json(res, 404, { error: 'Not found' });
    const ratings = db.getAllRatings();
    const rank = ratings.findIndex(x => x.agent_hash === r.agent_hash) + 1;
    return json(res, 200, buildAgentEntry(r, rank, null));
  }

  return json(res, 404, { error: 'Not found' });
}

// ── server ────────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(err => {
    console.error('[api] unhandled error:', err);
    try { json(res, 500, { error: 'Internal server error' }); } catch (_) {}
  });
});

server.listen(PORT, () => {
  console.log(`[agentelo-api] listening on http://localhost:${PORT}`);
});
```

- [ ] **Step 2: Make executable**

```bash
chmod +x /Users/twaldin/agentelo/bin/api
```

- [ ] **Step 3: Smoke test the server**

Start: `node /Users/twaldin/agentelo/bin/api &`
Test:
```bash
sleep 1
curl -s http://localhost:4000/api/challenges | head -20
curl -s http://localhost:4000/api/leaderboard | head -20
```

Expected: valid JSON arrays (empty is fine if DB is empty).

Stop: `kill %1`

- [ ] **Step 4: Commit**

```bash
git add bin/api
git commit -m "feat: HTTP API server on :4000 (bin/api)"
```

---

## Task 5: Update core/scorer.js — inject fix-commit test files

**Files:**
- Modify: `core/scorer.js`

The `score()` function currently takes `(diff, repoDir, challenge, logFile)`. Modify to:
1. Check if `challenge.fixCommit` exists
2. If yes: clone repo at fixCommit into temp `fixDir`
3. Copy test files from `fixDir` into `repoDir` (after applying agent diff)
4. Run tests

Test file detection: any file whose path contains `/test`, `/tests`, `/spec`, `/specs`, `.test.`, `.spec.`

- [ ] **Step 1: Read current scorer.js to understand the apply-then-test flow**

Read `core/scorer.js` lines 1-70 (already reviewed in planning). The key flow is:
1. Write diff to tmpPatch
2. `git apply` tmpPatch to repoDir
3. Run `challenge.test_command` in repoDir

The modification inserts a step between 2 and 3.

- [ ] **Step 2: Modify core/scorer.js**

After the `git apply` block (line ~42, after the `finally { try { fs.unlinkSync(tmpPatch) } }` block), add the fix-commit test injection:

Replace the entire `score()` function with:

```js
async function score(diff, repoDir, challenge, logFile) {
  if (!diff || diff.trim() === '') {
    return { tests_passed: false, exit_code: 1, time_seconds: 0, diff_lines: 0 };
  }

  const diffLines = diff.split('\n').filter(l => /^[+-]/.test(l) && !/^[+-]{3}/.test(l)).length;

  const tmpDir   = os.tmpdir();
  const tmpPatch = path.join(tmpDir, `agentelo-patch-${Date.now()}-${process.pid}.patch`);

  try {
    fs.writeFileSync(tmpPatch, diff, 'utf8');
  } catch (err) {
    return { tests_passed: false, exit_code: 1, time_seconds: 0, diff_lines: diffLines };
  }

  try {
    await runCommand('git', ['apply', '--whitespace=fix', tmpPatch], repoDir, null, 30000);
  } catch (err) {
    return { tests_passed: false, exit_code: 1, time_seconds: 0, diff_lines: diffLines };
  } finally {
    try { fs.unlinkSync(tmpPatch); } catch (_) {}
  }

  // Inject fix-commit test files so we test against the PR's test suite
  if (challenge.fixCommit) {
    await injectFixTests(repoDir, challenge);
  }

  const resolvedLog = logFile || '/dev/null';
  const TIMEOUT_MS  = 10 * 60 * 1000;
  const [cmd, ...args] = parseCommand(challenge.test_command);

  const start = Date.now();
  let exitCode;
  try {
    exitCode = await runCommand(cmd, args, repoDir, resolvedLog, TIMEOUT_MS);
  } catch (err) {
    exitCode = err.exitCode != null ? err.exitCode : 1;
  }
  const timeSeconds = (Date.now() - start) / 1000;

  return {
    tests_passed: exitCode === 0,
    time_seconds: timeSeconds,
    exit_code: exitCode,
    diff_lines: diffLines,
  };
}

/**
 * Clone the fix commit, find test files, copy them into repoDir.
 */
async function injectFixTests(repoDir, challenge) {
  const { execFileSync } = require('child_process');
  const fixDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentelo-fix-'));
  try {
    // Clone the repo at the fix commit
    execFileSync('git', ['clone', '--quiet', challenge.repo, fixDir], { stdio: 'pipe' });
    execFileSync('git', ['checkout', '--quiet', challenge.fixCommit], { cwd: fixDir, stdio: 'pipe' });

    // Walk the fix checkout and copy test files into repoDir
    copyTestFiles(fixDir, fixDir, repoDir);
  } catch (err) {
    // Non-fatal: if we can't inject fix tests, fall back to running existing tests
    console.warn('[scorer] Warning: could not inject fix-commit tests:', err.message);
  } finally {
    try { fs.rmSync(fixDir, { recursive: true, force: true }); } catch (_) {}
  }
}

function isTestFile(relPath) {
  const p = relPath.toLowerCase().replace(/\\/g, '/');
  return (
    p.includes('/test/') || p.includes('/tests/') ||
    p.includes('/spec/')  || p.includes('/specs/') ||
    p.includes('.test.')  || p.includes('.spec.')  ||
    p.endsWith('.test.js') || p.endsWith('.spec.js') ||
    p.endsWith('.test.ts') || p.endsWith('.spec.ts') ||
    p.endsWith('_test.go') || p.endsWith('_test.rs')
  );
}

function copyTestFiles(srcBase, srcDir, dstBase) {
  let entries;
  try { entries = fs.readdirSync(srcDir, { withFileTypes: true }); }
  catch (_) { return; }
  for (const entry of entries) {
    const srcFull = path.join(srcDir, entry.name);
    const rel     = path.relative(srcBase, srcFull);
    const dstFull = path.join(dstBase, rel);
    if (entry.isDirectory()) {
      if (entry.name === '.git') continue;
      copyTestFiles(srcBase, srcFull, dstBase);
    } else if (entry.isFile() && isTestFile(rel)) {
      try {
        fs.mkdirSync(path.dirname(dstFull), { recursive: true });
        fs.copyFileSync(srcFull, dstFull);
      } catch (_) {}
    }
  }
}
```

- [ ] **Step 3: Verify existing scorer tests still pass**

```bash
cd /Users/twaldin/agentelo && node --test test/scorer.test.js 2>&1
```

Expected: all tests pass (or same result as before).

- [ ] **Step 4: Commit**

```bash
git add core/scorer.js
git commit -m "feat: inject fix-commit test files before scoring"
```

---

## Task 6: bin/import-results — bulk import JSON results

**Files:**
- Create: `bin/import-results`

Reads every `.json` file in `results/`, imports challenge info and submission into DB, then recalculates all ratings by replaying submissions in chronological order.

- [ ] **Step 1: Implement bin/import-results**

```js
#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const db   = require('../core/db');

const PROJECT_ROOT  = path.resolve(__dirname, '..');
const CHALLENGES_DIR = path.join(PROJECT_ROOT, 'challenges');
const RESULTS_DIR   = path.join(PROJECT_ROOT, 'results');

// Load all challenge JSON files into DB
function importChallenges() {
  if (!fs.existsSync(CHALLENGES_DIR)) return;
  const files = fs.readdirSync(CHALLENGES_DIR).filter(f => f.endsWith('.json'));
  let count = 0;
  for (const file of files) {
    try {
      const ch = JSON.parse(fs.readFileSync(path.join(CHALLENGES_DIR, file), 'utf8'));
      db.upsertChallenge(ch);
      count++;
    } catch (e) {
      console.warn(`[import] Skipping challenge ${file}: ${e.message}`);
    }
  }
  console.log(`[import] Imported ${count} challenges.`);
}

// Load all result JSON files, sorted by created_at, replay into DB
function importResults() {
  if (!fs.existsSync(RESULTS_DIR)) {
    console.log('[import] No results directory found.');
    return;
  }

  const files = fs.readdirSync(RESULTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), 'utf8'));
        return data;
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      const ta = a.finished_at || a.started_at || '';
      const tb = b.finished_at || b.started_at || '';
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });

  console.log(`[import] Found ${files.length} result file(s).`);

  for (const result of files) {
    // Normalize fields
    const sub = {
      run_id:       result.run_id,
      challenge_id: result.challenge_id,
      agent_hash:   result.agent_hash,
      harness:      result.harness,
      model:        result.model,
      tests_passed: result.tests_passed ? 1 : 0,
      time_seconds: result.time_seconds || 0,
      diff_lines:   result.diff_lines || 0,
      tampered:     result.tampered ? 1 : 0,
      log_file:     result.log_file || null,
      config_files: result.config_files || [],
      finished_at:  result.finished_at || result.started_at || new Date().toISOString(),
    };

    if (!sub.run_id || !sub.challenge_id || !sub.agent_hash) {
      console.warn('[import] Skipping incomplete result:', sub.run_id);
      continue;
    }

    // Ensure challenge record exists (create stub if not in challenges/)
    if (!db.getChallenge(sub.challenge_id)) {
      db.upsertChallenge({
        id:       sub.challenge_id,
        repo:     result.repo || '',
        title:    sub.challenge_id,
        difficulty: { filesChanged: 0, linesAdded: 0 },
      });
    }

    // Import the submission (skip duplicates via INSERT OR IGNORE)
    const existing = db.getSubmissionsByChallenge(sub.challenge_id)
      .find(s => s.run_id === sub.run_id);

    if (existing) {
      process.stdout.write('.');
      continue;
    }

    // Use the same rating-update logic as the API
    // (Re-use by requiring the API's processSubmission logic)
    // Since we can't require bin/api (it starts a server), inline the logic here.
    processSubmission(sub);
    process.stdout.write('+');
  }
  console.log('\n[import] Done.');
}

// Inline copy of processSubmission from bin/api (avoids starting a server)
const { updateRating, defaultRating } = require('../core/glicko2');

function processSubmission(sub) {
  db.insertSubmission({
    run_id:          sub.run_id,
    challenge_id:    sub.challenge_id,
    agent_hash:      sub.agent_hash,
    harness:         sub.harness,
    model:           sub.model,
    tests_passed:    sub.tests_passed ? 1 : 0,
    time_seconds:    sub.time_seconds || 0,
    diff_lines:      sub.diff_lines || 0,
    tampered:        sub.tampered ? 1 : 0,
    transcript_path: sub.log_file || null,
    created_at:      sub.finished_at || new Date().toISOString(),
  });

  let myRating = db.getRating(sub.agent_hash);
  if (!myRating) {
    myRating = {
      agent_hash:           sub.agent_hash,
      harness:              sub.harness,
      model:                sub.model,
      ...defaultRating(),
      challenges_attempted: 0,
      wins:                 0,
      rating_history:       [],
      config_files:         sub.config_files || [],
    };
  }

  const others = db.getSubmissionsByChallenge(sub.challenge_id)
    .filter(s => s.run_id !== sub.run_id && s.agent_hash !== sub.agent_hash);

  if (others.length === 0) {
    myRating.challenges_attempted += 1;
    myRating.rating_history.push({ r: myRating.rating, ts: new Date().toISOString() });
    db.upsertRating(myRating);
    return;
  }

  const games = [];
  const opponentUpdates = [];

  for (const oSub of others) {
    let oppRating = db.getRating(oSub.agent_hash);
    if (!oppRating) {
      oppRating = {
        agent_hash:           oSub.agent_hash,
        harness:              oSub.harness,
        model:                oSub.model,
        ...defaultRating(),
        challenges_attempted: 1,
        wins:                 oSub.tests_passed ? 1 : 0,
        rating_history:       [],
        config_files:         [],
      };
    }

    let myScore;
    const myPassed  = sub.tests_passed ? 1 : 0;
    const oppPassed = oSub.tests_passed ? 1 : 0;

    if (myPassed > oppPassed)       myScore = 1;
    else if (myPassed < oppPassed)  myScore = 0;
    else if (myPassed === 1) {
      if (sub.time_seconds < oSub.time_seconds)       myScore = 1;
      else if (sub.time_seconds > oSub.time_seconds)  myScore = 0;
      else                                             myScore = 0.5;
    } else {
      myScore = 0.5;
    }

    games.push({ opponentRating: oppRating.rating, opponentRd: oppRating.rd, score: myScore });
    opponentUpdates.push({ oppRating, myScore });
  }

  const myNew = updateRating(
    { rating: myRating.rating, rd: myRating.rd, volatility: myRating.volatility },
    games
  );
  const myWins = games.filter(g => g.score === 1).length;
  myRating.rating     = myNew.rating;
  myRating.rd         = myNew.rd;
  myRating.volatility = myNew.volatility;
  myRating.challenges_attempted += 1;
  myRating.wins       += myWins;
  myRating.rating_history.push({ r: myNew.rating, ts: new Date().toISOString() });
  if (myRating.rating_history.length > 50) myRating.rating_history = myRating.rating_history.slice(-50);
  db.upsertRating(myRating);

  for (const { oppRating, myScore } of opponentUpdates) {
    const oppScore = myScore === 1 ? 0 : myScore === 0 ? 1 : 0.5;
    const oppNew = updateRating(
      { rating: oppRating.rating, rd: oppRating.rd, volatility: oppRating.volatility },
      [{ opponentRating: myRating.rating, opponentRd: myRating.rd, score: oppScore }]
    );
    oppRating.rating     = oppNew.rating;
    oppRating.rd         = oppNew.rd;
    oppRating.volatility = oppNew.volatility;
    if (oppScore === 1) oppRating.wins += 1;
    oppRating.rating_history.push({ r: oppNew.rating, ts: new Date().toISOString() });
    if (oppRating.rating_history.length > 50) oppRating.rating_history = oppRating.rating_history.slice(-50);
    db.upsertRating(oppRating);
  }
}

// Run
importChallenges();
importResults();
```

- [ ] **Step 2: Make executable**

```bash
chmod +x /Users/twaldin/agentelo/bin/import-results
```

- [ ] **Step 3: Run against existing results**

```bash
cd /Users/twaldin/agentelo && node bin/import-results
```

Expected:
```
[import] Imported N challenges.
[import] Found M result file(s).
+.+...
[import] Done.
```

- [ ] **Step 4: Verify DB has data**

```bash
cd /Users/twaldin/agentelo && node -e "
const db = require('./core/db');
console.log('challenges:', db.getAllChallenges().length);
console.log('ratings:', db.getAllRatings().length);
console.log('top agent:', JSON.stringify(db.getAllRatings()[0], null, 2).slice(0, 200));
"
```

- [ ] **Step 5: Commit**

```bash
git add bin/import-results
git commit -m "feat: bulk import results + rebuild ratings (bin/import-results)"
```

---

## Task 7: Update bin/agentelo — POST to API + fetch recommended challenges

**Files:**
- Modify: `bin/agentelo`

Two changes:
1. After scoring (at the end of `runAgentPlay`), POST the result to `http://localhost:4000/api/submissions`. Non-fatal if API is not running.
2. In `runAgentPlay` when no `--challenge` flag, try to fetch `/api/challenges/recommended`, pick from top 10 randomly. Fall back to local files if API unavailable.

- [ ] **Step 1: Add POST-to-API helper function**

After the `ensureResultsDir()` function (~line 92), add:

```js
// ---------------------------------------------------------------------------
// POST result to API (non-blocking, non-fatal)
// ---------------------------------------------------------------------------
async function postToApi(result) {
  return new Promise((resolve) => {
    const body = JSON.stringify(result);
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: '/api/submissions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = require('http').request(options, (res) => {
      res.resume();
      res.on('end', () => resolve());
    });
    req.on('error', () => resolve()); // non-fatal
    req.setTimeout(5000, () => { req.destroy(); resolve(); });
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Fetch recommended challenges from API
// ---------------------------------------------------------------------------
async function fetchRecommendedChallenges() {
  return new Promise((resolve) => {
    const req = require('http').request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/challenges/recommended',
      method: 'GET',
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (_) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(3000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}
```

- [ ] **Step 2: Update challenge selection in runAgentPlay**

Replace the challenge selection block (lines 113-145 roughly, the section from `const challengeFiles = ...` to `const challenge = { ... }`) with:

```js
  // Try to get challenges from API (recommended = most attempted first)
  let challenge;
  if (challengeId) {
    // Specific challenge requested — load from local file as before
    const challengeFile = path.join(CHALLENGES_DIR, `${challengeId}.json`);
    if (!fs.existsSync(challengeFile)) {
      console.error(`[agentelo] Challenge not found: ${challengeId}`);
      process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(challengeFile, 'utf8'));
    challenge = normalizeChallenge(raw);
  } else {
    // No specific challenge — prefer challenges with most attempts (API)
    let selected = null;
    const recommended = await fetchRecommendedChallenges();
    if (recommended && recommended.length > 0) {
      // Pick randomly from top 10
      const pool = recommended.slice(0, 10);
      const picked = pool[Math.floor(Math.random() * pool.length)];
      // Load the full challenge from local file
      const challengeFile = path.join(CHALLENGES_DIR, `${picked.id}.json`);
      if (fs.existsSync(challengeFile)) {
        const raw = JSON.parse(fs.readFileSync(challengeFile, 'utf8'));
        selected = normalizeChallenge(raw);
      }
    }
    if (!selected) {
      // Fall back to random local challenge
      const challengeFiles = fs.existsSync(CHALLENGES_DIR)
        ? fs.readdirSync(CHALLENGES_DIR).filter(f => f.endsWith('.json'))
        : [];
      if (challengeFiles.length === 0) {
        console.log("[agentelo] No challenges found. Run 'agentelo mine' to fetch some.");
        process.exit(1);
      }
      const idx = Math.floor(Math.random() * challengeFiles.length);
      const raw = JSON.parse(fs.readFileSync(path.join(CHALLENGES_DIR, challengeFiles[idx]), 'utf8'));
      selected = normalizeChallenge(raw);
    }
    challenge = selected;
  }
```

And add the `normalizeChallenge` helper after `ensureResultsDir`:

```js
function normalizeChallenge(raw) {
  return {
    id:           raw.id,
    repo:         raw.repoUrl || raw.repo,
    commit:       raw.buggyCommit || raw.commit,
    fixCommit:    raw.fixCommit,
    fixDiff:      raw.fixDiff,
    title:        raw.issue?.title || raw.title || raw.id,
    body:         raw.issue?.body  || raw.body  || '',
    test_command: raw.testCommand  || raw.test_command || 'npm test',
    difficulty:   raw.difficulty,
  };
}
```

- [ ] **Step 3: Add POST after saving result (end of runAgentPlay)**

After the line `console.log(\`Result saved: results/${runId}.json\`);`, add:

```js
    // Post to API (non-blocking, best-effort)
    try {
      await postToApi(result);
      console.log('[agentelo] Result submitted to API.');
    } catch (_) {
      // API not running is fine
    }
```

- [ ] **Step 4: Verify agentelo still runs (dry run)**

```bash
cd /Users/twaldin/agentelo && node bin/agentelo 2>&1 | head -5
```

Expected: usage message, no crash.

- [ ] **Step 5: Commit**

```bash
git add bin/agentelo
git commit -m "feat: post results to API + prefer recommended challenges"
```

---

## Task 8: public/index.html — frontend with live data

**Files:**
- Create: `public/index.html`

Copy `frontends/v6-final.html`, then replace the mock `AGENTS` and `CHALLENGES` arrays with `fetch()` calls to the API.

The frontend uses:
- `AGENTS` array → fetch from `GET /api/leaderboard`
- `CHALLENGES` array → fetch from `GET /api/challenges`

The API already returns data shaped like the mock arrays (same field names: `id`, `rank`, `name`, `harness`, `model`, `mf`, `elo`, `d7`, `wr`, `played`, `rd`, `hash`, `hist`, `cfgl`, `recent` for agents; `id`, `repo`, `title`, `diff`, `lang`, `sr`, `att`, `avgt` for challenges).

Changes needed in the JS section:
1. Remove the `const AGENTS = [...]` and `const CHALLENGES = [...]` static arrays
2. Add async fetch init that populates `AGENTS` and `CHALLENGES` globals, then calls `renderLB()` / `renderCH()`

- [ ] **Step 1: Create public/ directory**

```bash
mkdir -p /Users/twaldin/agentelo/public
```

- [ ] **Step 2: Copy and update index.html**

Copy `frontends/v6-final.html` to `public/index.html`, then make the following changes to the `<script>` section:

**Remove** the entire `const AGENTS = [...]` block (lines 695–884 of v6-final.html).

**Remove** the entire `const CHALLENGES = [...]` block (lines 886–947).

**Replace** these blocks with:

```js
// LIVE DATA — fetched from /api/*
let AGENTS = [];
let CHALLENGES = [];

async function loadData() {
  try {
    const [lb, ch] = await Promise.all([
      fetch('/api/leaderboard').then(r => r.json()),
      fetch('/api/challenges').then(r => r.json()),
    ]);
    AGENTS = lb;
    CHALLENGES = ch;
  } catch (e) {
    console.warn('[agentelo] Could not load data from API:', e.message);
  }
}
```

**Replace** the `window.addEventListener('load', ...)` block with:

```js
window.addEventListener('load', async function() {
  await loadData();
  // Auto-navigate to leaderboard if we have data
  if (AGENTS.length > 0) go('leaderboard');

  // Random glitch
  setInterval(function() {
    var els = document.querySelectorAll('.glitch');
    if (!els.length) return;
    var el = els[Math.floor(Math.random() * els.length)];
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }, 2800 + Math.random() * 2000);
});
```

- [ ] **Step 3: Verify frontend serves correctly**

```bash
node /Users/twaldin/agentelo/bin/api &
sleep 1
curl -s http://localhost:4000/ | head -5
kill %1
```

Expected: `<!DOCTYPE html>` response.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: frontend served from /api live data (public/index.html)"
```

---

## Task 9: Wire up — run import then verify full stack

**Files:** none (verification only)

- [ ] **Step 1: Run the full import**

```bash
cd /Users/twaldin/agentelo && node bin/import-results
```

- [ ] **Step 2: Start API**

```bash
node /Users/twaldin/agentelo/bin/api &
sleep 1
```

- [ ] **Step 3: Check all endpoints**

```bash
echo "=== challenges ===" && curl -s http://localhost:4000/api/challenges | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.length + ' challenges')"
echo "=== leaderboard ===" && curl -s http://localhost:4000/api/leaderboard | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.length + ' agents'); d.slice(0,3).forEach(a=>console.log('#'+a.rank, a.name, a.elo))"
echo "=== recommended ===" && curl -s http://localhost:4000/api/challenges/recommended | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('top:', d[0] && d[0].id, d[0] && d[0].att + ' attempts')"
```

- [ ] **Step 4: Kill server and run all tests**

```bash
kill %1
cd /Users/twaldin/agentelo && node --test test/*.test.js 2>&1
```

Expected: all tests pass.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: verify full stack — API, DB, ratings, frontend"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Covered |
|-------------|---------|
| `core/db.js` — challenges, submissions, ratings tables | Task 2 |
| `bin/api` — GET /api/challenges | Task 4 |
| `bin/api` — GET /api/challenges/:id | Task 4 |
| `bin/api` — POST /api/submissions | Task 4 |
| `bin/api` — GET /api/leaderboard | Task 4 |
| `bin/api` — GET /api/agents/:hash | Task 4 |
| `bin/api` — GET / (serve frontend) | Task 4 |
| `core/glicko2.js` — Glicko-2 implementation | Task 3 |
| Glicko-2 initial rating 1500, RD 350, volatility 0.06 | Task 3+4 |
| Rating update vs all agents on same challenge | Task 4+6 |
| `bin/import-results` — import existing JSON results | Task 6 |
| Update `bin/agentelo` — POST to API | Task 7 |
| Update `bin/agentelo` — prefer recommended challenges | Task 7 |
| `GET /api/challenges/recommended` endpoint | Task 4 |
| `public/index.html` from v6-final.html with live data | Task 8 |
| `core/scorer.js` — use fix-commit test files | Task 5 |
| `npm install better-sqlite3` | Task 1 |

**Placeholder scan:** No TBDs, all code shown.

**Type/name consistency:**
- `agent_hash` — used consistently in DB schema, `getRating()`, `upsertRating()`, and `processSubmission()`
- `run_id` — used consistently in `submissions` table and result objects
- `tests_passed` — stored as INTEGER 0/1 in DB; read back as integer; compared with `? 1 : 0` conversion
- `rating_history` — `[{r: number, ts: string}]` format used consistently in db.js, glicko2 usage, and frontend `hist` field (mapped via `.map(h => Math.round(h.r))`)
- `challenge.fixCommit` — camelCase from challenge JSON; passed through `normalizeChallenge()` in bin/agentelo; referenced in scorer.js as `challenge.fixCommit`
- `challenge.repo` — in scorer.js `injectFixTests`, uses `challenge.repo`. Must be set in normalize — confirmed.
- `diffLabel()` in api uses `difficulty_lines` from DB; `upsertChallenge` stores `linesAdded + linesRemoved` as `difficulty_lines` — consistent.

**Note on processSubmission duplication:** The function is duplicated between `bin/api` and `bin/import-results`. This is intentional — `bin/api` runs as a live server and `bin/import-results` is a CLI tool. Sharing via a third module would require an extra file; the duplication is ~40 lines and the alternative is not worth the complexity for MVP. If it diverges later, extract to `core/rating-engine.js`.
