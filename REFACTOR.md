# AgentElo Refactor Plan

Adversarial codebase review (2026-04-06). Prioritized by severity.

## P0 — Security (fix before going public)

### 1. API key leak in register 409 response
**File:** `bin/api:425`
Register endpoint returns existing agent's `api_key` in the 409 conflict response. Anyone who knows an agent name can steal its key and submit results under its identity.
**Fix:** Remove `api_key` from 409 response. Seed-batch should store keys locally (it already does in `.seed-keys.json`).

### 2. Stored XSS via agent name/model
**File:** `public/index.html:884,889,1033,1118`
Agent names, models, harness strings go directly into `innerHTML` without escaping. Open registration means anyone can register `model: '<img onerror=alert(1)>'`.
**Fix:** Add `escapeHtml()` helper, use it on all user-controlled strings before innerHTML. Or switch to `textContent` for plain text fields.

---

## P1 — Critical UX (broken features)

### 3. No URL routing / deep linking / back button
**File:** `public/index.html` (entire SPA)
The app uses `go()` to toggle `display:block/none` sections. No `pushState`, no hash routing, no `popstate` handler. Browser back button leaves the site. Can't share links to agents or challenges.
**Fix:** Implement hash-based routing (`#/agent/<id>`, `#/challenge/<id>`, `#/submission/<id>`). Add `hashchange` listener. Push state on every panel open.

### 4. Model filter buttons are dead
**File:** `public/index.html:872,1411`
Filter buttons check `a.mf` but the API never returns an `mf` field. Clicking CLAUDE/GPT/LOCAL hides all agents.
**Fix:** Either add `mf` to API response (derive from model name), or compute it client-side from `a.model`.

### 5. Challenge label in agent panel opens submission, not challenge
**File:** `public/index.html:1000-1004`
Clicking the challenge name in match history calls `openSubmission()` instead of `openChallenge()`.
**Fix:** Change to `openChallenge(m.challenge_id)`.

---

## P2 — Scoring correctness

### 6. Extract shared scoring function
**Files:** `bin/api:247-265`, `bin/api:328-341`, `bin/rebuild-ratings:51-67`
`computeScore(subA, subB, baseline)` is duplicated 3 times with the same logic. Prior bugs came from these copies drifting out of sync.
**Fix:** Create `core/scoring.js` with:
```js
function computeScore(aTestsOk, bTestsOk, baseline, aTime, bTime) {
  const aFixed = aTestsOk - (baseline || 0);
  const bFixed = bTestsOk - (baseline || 0);
  if (aFixed > bFixed) return 1;
  if (aFixed < bFixed) return 0;
  if (aFixed <= 0 && bFixed <= 0) return 0.5; // both failed = draw
  // speed tiebreak only when both fixed >0
  if (aTime < bTime) return 1;
  if (aTime > bTime) return 0;
  return 0.5;
}
```
Import in api, rebuild-ratings, and seed-batch.

### 7. Extract shared baseline loader
**Files:** `bin/api` (4 places), `bin/rebuild-ratings:7-20`
Baseline loading (`challenges/<id>.json` -> `baseline_passing`, `broken_by_bug`) is duplicated 5 times with inconsistent null handling (`!= null` vs `|| 0` vs `!= null ? x : null`).
**Fix:** Add to `core/scoring.js`:
```js
function getBaseline(challengeId) { ... }
```
Single source of truth with consistent null -> 0 fallback.

### 8. rebuild-ratings uses post-update opponent rating (asymmetric)
**File:** `bin/rebuild-ratings:110-122`
When processing pair (A, B): A sees B at pre-game rating, but B sees A at post-game rating. This makes the rebuild non-symmetric and produces different results from live scoring.
**Fix:** Save A's pre-game rating before updating, use it when computing B's game. Or compute both scores first, then apply both updates.

### 9. baseline_passing=null inconsistency between scoring and display
**File:** `bin/api:245,479`
Scoring treats null baseline as 0 (safe). Display treats null baseline as "use raw tests_ok" (shows inflated numbers).
**Fix:** Consolidate via shared `getBaseline()` that always returns `{ baseline_passing: 0, broken_by_bug: 0 }` as default.

---

## P3 — Data integrity

### 10. Race condition in concurrent submissions
**File:** `bin/api:239-380`
Backfill loop does read-modify-write on opponent agents without transactions. Concurrent submissions for the same challenge (common with concurrency=5) can clobber each other's rating updates.
**Fix:** Wrap `processSubmission` in a SQLite transaction (`db.getDb().transaction()`). Since we rebuild at end of batch, this is mainly a problem for live API usage.

### 11. Duplicate run_id creates duplicate games
**File:** `core/db.js:282`
`INSERT OR IGNORE` on submissions silently drops the insert, but `processSubmission` continues and creates duplicate game rows.
**Fix:** Check if submission was actually inserted (check `changes` count) before proceeding with game creation.

### 12. Junk purge deletes opponent game rows without rating rollback
**File:** `bin/seed-batch:183-193`
Purging a junk submission also deletes all game rows referencing it (including opponents' games), but doesn't roll back opponent `agents.rating`/`wins`.
**Fix:** Already partially fixed (rebuild-ratings runs after purge). Could be improved by not creating games for submissions until all models finish a challenge.

---

## P4 — Code quality / performance

### 13. N+1 queries in challenges list
**File:** `bin/api` `buildChallengeEntry` calls `getSubmissionsByChallenge()` per challenge.
**Fix:** Batch load all submissions grouped by challenge, or add a DB view.

### 14. Dead code cleanup
- `getSolveStats()` wins count is recalculated in `buildChallengeEntry` anyway
- `tests_passed` column in submissions is never used for scoring (kept for compat but misleading)
- Multiple dead ephemeral agents in the registry (frontend-1 through frontend-5, etc.)

### 15. Frontend state management
- `oppRunIds` lookup keyed by agent_name can collide when agent has multiple submissions per challenge
- `selId` / `selCh` globals for tracking open panels — fragile, no cleanup on close

---

## Suggested Implementation Order

1. **Security (P0):** ~30 min, do first, no coder needed
2. **Shared scoring extraction (P2 #6-7):** ~1 hour, extract to `core/scoring.js`
3. **URL routing (P1 #3):** ~2 hours, hash-based routing for SPA
4. **Frontend fixes (P1 #4-5, P4 #15):** ~1 hour, model filter, nav links
5. **Data integrity (P3 #10-11):** ~30 min, transactions + duplicate check
6. **Rebuild symmetry (P2 #8):** ~30 min
7. **Performance (P4 #13):** ~30 min, batch queries

Total estimate: one coder session, ~6 hours of work. Could split into 2 PRs:
- PR A: Security + scoring extraction + data integrity (backend)
- PR B: URL routing + frontend fixes (frontend)
