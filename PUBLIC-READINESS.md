# AgentElo Public Readiness — Audit Report

**Date:** 2026-04-19
**Reviewer:** critical-analyzer subagent (cold review)
**Verdict:** **not ready**

## TL;DR

- A stranger landing on the site cannot install the CLI: `npm i -g agentelo` is prominently advertised in four places (landing, README, SUBMITTING.md, step-card widget) but the package is not published — `npm view agentelo` and `npm view @twaldin/agentelo` both return 404.
- The CLI's default server URL (`https://api.agentelo.io`) does not resolve in DNS, and even when `AGENTELO_URL=https://tim.waldin.net/agentelo` is set, `new URL('/api/submissions', baseUrl)` drops the `/agentelo` path prefix and hits the Next.js HTML page instead of the API. `postToApi` silently swallows the 200/HTML response, so every submission looks like it succeeded when none actually landed.
- Registration against prod is impossible from the CLI: prod enforces CAPTCHA (`TURNSTILE_SECRET` set) and requires an invite code (`REGISTRATION_ENABLED=false`), but `bin/agentelo`'s `cmdRegister` never sends `captcha_token` *or* `invite_code` — the `--invite` flag documented in SUBMITTING.md Step 5 isn't even parsed. The `/register` page on the frontend is the only working registration path.

Top recommendation: do not announce publicly until (1) `npm publish` lands, (2) the URL-prefix bug is fixed and the silent-swallow is removed from `postToApi`, (3) docs are rewritten to match the CLI reality (or the CLI is extended to match the docs), and (4) registration flow is actually reachable (either publish the frontend-generated key copy-paste story in docs, or add `--invite` + `--captcha-bypass-token` / admin-register path).

---

## 1. Fresh-install flow

Walkthrough from `https://tim.waldin.net/agentelo/`:

1. Landing shows a copy-able "Install widget" and a 4-step card: `npm i -g agentelo` → `agentelo register --harness opencode --model gpt-5.4` → `agentelo play` → "climb". (`frontend/app/page.tsx:118,126,131,136`.)
2. User runs `npm i -g agentelo`. **FAILS** — package not on npm. Confirmed: `npm view agentelo` returns 404. Same for `@twaldin/agentelo`.
3. README suggests the same command (`README.md:10`). SUBMITTING.md Step 1 duplicates it (`docs/SUBMITTING.md:25`).
4. If they clone the repo instead and `npm link`, the CLI runs. But `getBaseUrl` defaults to `https://api.agentelo.io` (`bin/agentelo:161`) which has **no DNS record** — confirmed: `dig api.agentelo.io` and `dig agentelo.io` both return nothing. So the first `agentelo register` throws ENOTFOUND.
5. If they set `AGENTELO_URL=https://tim.waldin.net/agentelo`, register still fails because prod has CAPTCHA enabled (returns `{"error":"CAPTCHA token required"}`, 403 — confirmed with a live probe). There is no way for `bin/agentelo register` to send a captcha token today.
6. The `/register` **web** page (`frontend/app/register/page.tsx`) is the only path that actually reaches prod registration. It is not linked from the landing page and is not mentioned anywhere in `README.md`, `docs/SUBMITTING.md`, or the `agentelo --help` output.
7. Undocumented prerequisites encountered while reading `bin/agentelo`:
   - `uv` (installs Python venvs — `bin/agentelo:237`). Not mentioned in SUBMITTING.md "What you need".
   - `pnpm` (for pnpm monorepos, `bin/agentelo:229`). Not mentioned.
   - `gcloud` + `AGENTELO_GCP_PROJECT` env (Vertex models, `bin/agentelo:78,91`). Not mentioned unless the user picks a Vertex model.
   - `tmux` (used as viewer `bin/agentelo:205`). Optional but not documented.
   - SWE-agent path actually uses a vendored `run-mini-swe.py` at `bin/run-mini-swe.py` — that file is **not in the `files` array** of `package.json`, so `npm install -g agentelo` will break swe-agent runs once published.

**Verdict:** The golden path is broken at every step for an external user. Until `npm publish` runs and the URL/registration bugs are fixed, no stranger can complete install → register → submit.

---

## 2. Docs vs CLI mismatches

| Doc claim | CLI reality | Verdict |
|---|---|---|
| `npm install -g agentelo` works (`README.md:10`, `SUBMITTING.md:25`, landing page `page.tsx:126,182`) | Package not on npm (404) | **Broken** |
| `agentelo register --invite YOUR_INVITE_CODE` (`SUBMITTING.md:86`) | `bin/agentelo` has zero occurrences of "invite" — flag is parsed into `flags.invite` but never read; registration body sent is `{name, harness, model}` only (`bin/agentelo:372`) | **Broken** |
| `agentelo play --loop` (`SUBMITTING.md:118`) | No `--loop` handling in `cmdPlay` or `runAgentPlay`. Docs-only. | **Hallucinated** |
| `agentelo play --count 5` (`SUBMITTING.md:119`) | No `--count` handling. | **Hallucinated** |
| `agentelo play --challenge id` (`SUBMITTING.md:120`) | Explicitly rejected: `bin/agentelo:632` prints "--challenge is not allowed with `play` (ranked). Use `practice --challenge <id>` for unranked runs." and exits 1. | **Broken** |
| "One registration per `(harness, model)` combination — re-running reuses" (`SUBMITTING.md:89`) | Re-running returns HTTP 409 ("Agent name already taken") because `cmdRegister` hard-exits on 409 (`bin/agentelo:378`). No reuse logic exists. | **Broken** |
| `agentelo practice --challenge click-pr2421` works standalone (`SUBMITTING.md:97`) | `runAgentPlay` requires `--harness` and `--model` even for practice (`bin/agentelo:625`). User will get a usage error without both flags. | Partial — docs imply one flag suffices |
| `agentelo leaderboard` viewing command (`README.md:54`) | Implemented. | **OK** |
| `agentelo results` command (`README.md:53`) | Implemented. | **OK** |
| `agentelo agents` command (`README.md:55`) | Implemented at `bin/agentelo:1788` but **not listed** in `printUsage()` (line 1710+). | Silently works |
| Default server URL shown in help: `https://api.agentelo.io` (`bin/agentelo:1723`) | DNS does not resolve. | **Broken** |
| API doc base URL `https://api.agentelo.io` (`docs/API.md:3`) | Same as above — host does not exist. | **Broken** |
| `homepage: "https://agentelo.io"` in `package.json:28` | Host does not exist. | **Broken** |
| `Bugs: github.com/twaldin/agentelo/issues` (`package.json:33`, `README.md:68`) | Not verified reachable (no public repo confirmed); frontend footer links to bare `https://github.com` (`frontend/app/page.tsx:163`). | Likely broken / generic |
| Harness list of 6 vs README "Supported Harnesses" table | README lists 6 harnesses; HARNESSES.md lists 6. Content roughly aligns. | **OK** |
| `agentelo --help` shape | Prints reasonable usage, but **omits**: `--instructions` flag (actually implemented, `bin/agentelo:821`), `agents` subcommand, `default` subcommand, `--agent` flag for play. | **Incomplete** |
| `verification_status` response field (`SUBMITTING.md:112-113`) | API returns `status: "pending" | "verified" | "rejected"` per `docs/API.md:77`. Field name inconsistent between docs. | **Minor** |
| Frontend footer GitHub link (`page.tsx:163`) | Points to bare `https://github.com` — not the repo. | **Broken** |

---

## 3. postToApi URL-prefix bug

**Root cause.** `bin/agentelo` uses `new URL('/api/...', baseUrl)` at **seven** sites:

```
302:  const url = new URL('/api/register', baseUrl);
325:  const url = new URL(`/api/agents/${encodeURIComponent(agentId)}`, baseUrl);
496:  const url = new URL('/api/submissions', baseUrl);
520:  const url = new URL('/api/challenges/recommended', baseUrl);
541:  const url = new URL(`/api/challenges/${encodeURIComponent(challengeId)}`, baseUrl);
562:  const url = new URL('/api/leaderboard', baseUrl);
1807: const url = new URL(`/api/agents/${agentId}`, base);
```

WHATWG URL semantics: when the second argument starts with `/`, the pathname of the base is **replaced**, not appended. Verified:

```
> new URL('/api/submissions', 'https://tim.waldin.net/agentelo').toString()
'https://tim.waldin.net/api/submissions'   ← wrong
> new URL('api/submissions', 'https://tim.waldin.net/agentelo/').toString()
'https://tim.waldin.net/agentelo/api/submissions'  ← correct
```

So with the prod URL, all seven requests go to `https://tim.waldin.net/api/*`. A live curl confirms that endpoint returns **HTML 200** (the Next.js portfolio page), not JSON.

**Silent-failure amplifier.** `postToApi` is non-blocking: any error, HTTP status, or parse failure resolves silently (`bin/agentelo:493-513`). `fetchRecommendedChallenges` / `fetchChallengeFromApi` / `fetchLeaderboard` all do `JSON.parse(htmlString)` inside a try/catch and `resolve(null)` on failure. The user sees "completed" with no indication that nothing was submitted. This is the "submissions silently drop" failure mode.

**Minimal fix.** Replace the helper with a base-preserving joiner. One-line fix inside each call site:

```diff
- const url = new URL('/api/submissions', baseUrl);
+ const url = new URL('api/submissions', baseUrl.replace(/\/?$/, '/'));
```

Or, cleaner, add one helper and route every site through it:

```js
function apiUrl(baseUrl, path) {
  // baseUrl may or may not end with '/'; path should not start with '/'
  const b = baseUrl.replace(/\/?$/, '/');
  const p = path.replace(/^\/+/, '');
  return new URL(p, b);
}
```

Then replace all seven call sites. Also: `postToApi` should log non-2xx responses, not silently resolve. Swallowing HTTP errors is actively harmful for a submission tool.

**Impact.** Ship-blocker. Every `agentelo play`, `agentelo register`, `agentelo leaderboard`, `agentelo rename` against prod is broken until this is fixed (unless the user points `AGENTELO_URL` at a bare-host deployment with no prefix).

---

## 4. CLAUDE.md tamper false-positive

**Root cause.** At `bin/agentelo:1190`:

```js
const HARNESS_ARTIFACTS = /^\.(agentelo-|aider\.|claude|opencode|codex|gemini|swe_agent)/;
```

The `^\.` anchors on a leading dot. Files without dots — `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` — never match. Verified:

```
CLAUDE.md:  false
AGENTS.md:  false
GEMINI.md:  false
.claude-memory.json: true
```

But `--instructions` (`bin/agentelo:821`) explicitly writes `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, or `.aider.conf.yml` into the tmpdir. Claude Code is known to mutate `CLAUDE.md` mid-session (memory / learning updates), so the post-run checksum differs from the pre-run checksum. Since the file isn't in `git diff --name-only` (it wasn't git-added) and isn't in the `HARNESS_ARTIFACTS` whitelist, it goes into `tamperedFiles` and the run is flagged.

**Minimal fix.**

```diff
- const HARNESS_ARTIFACTS = /^\.(agentelo-|aider\.|claude|opencode|codex|gemini|swe_agent)/;
+ const HARNESS_ARTIFACTS = /^(CLAUDE\.md|AGENTS\.md|GEMINI\.md|\.(agentelo-|aider\.|claude|opencode|codex|gemini|swe_agent))/;
```

Or build a per-harness whitelist from the `INSTRUCTION_TARGETS` map at `bin/agentelo:822-828` so the set of exempt files matches exactly what was injected.

**Impact.** Not a ship-blocker, but every `--instructions`-injected run is currently false-flagged as tampered. Users who follow the "use CLAUDE.md to customize" pattern will see a confusing `tampered: true` in their output.

---

## 5. npm publish recommendation

**Decision: publish to npm as `agentelo`** (unscoped).

**Pros:**
- The landing page, README, and SUBMITTING.md all already instruct `npm i -g agentelo`. Publishing is the cheapest way to make the docs true.
- `agentelo` is currently available (confirmed `npm view agentelo` returns 404).
- Unscoped means no `--access public` gymnastics; it's simpler for first-time users.
- Enables automated versioning via GitHub releases.

**Cons:**
- Once published, name is claimed — any future rename is costly.
- npm publish requires real npm auth (`NPM_TOKEN`) kept fresh; a leaked token lets attackers ship a malicious version.
- Current `files` array omits challenges, `bin/mine`, `bin/run-mini-swe.py`, etc. — some harnesses will break post-install. Requires curating what ships vs what stays server-only.

**Required `package.json` changes before publish:**

```json
{
  "name": "agentelo",
  "version": "0.1.0",                // bump to 0.2.0 on first real publish
  "description": "...",
  "type": "commonjs",
  "bin": { "agentelo": "./bin/agentelo" },
  "files": [
    "bin/agentelo",
    "bin/run-mini-swe.py",           // MISSING — swe-agent won't work without this
    "core/",
    "README.md",
    "LICENSE",                        // add LICENSE file (only SPDX "MIT" declared, no file present)
    "docs/API.md",
    "docs/SUBMITTING.md",
    "docs/HARNESSES.md",
    "docs/SECURITY.md",
    "docs/CONTRIBUTING.md"
    // explicitly NOT docs/superpowers/**, *.db, challenges-*, results/, etc.
  ],
  "keywords": ["ai", "coding", "benchmark", "agent", "elo", "llm", "evaluation"],
  "homepage": "https://tim.waldin.net/agentelo",     // was agentelo.io — dead
  "repository": { "type": "git", "url": "git+https://github.com/twaldin/agentelo.git" },
  "bugs": { "url": "https://github.com/twaldin/agentelo/issues" },
  "license": "MIT",
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "test": "node --test test/*.test.js",
    "prepack": "node --test test/*.test.js"     // ensures no broken publish
  },
  "dependencies": { "better-sqlite3": "^12.8.0" },
  "devDependencies": { "@2toad/profanity": "^3.3.0" }
}
```

Other cleanup before first publish:
- Add `.npmignore` or tighten `files` to exclude `docs/superpowers/plans/2026-04-05-api-server-database.md` (59kB of internal planning currently in the tarball — confirmed via `npm pack --dry-run`).
- Change CLI default `baseUrl` from `https://api.agentelo.io` to `https://tim.waldin.net/agentelo` (or, better, a real subdomain once provisioned).
- Add a `LICENSE` file (currently only `"license": "MIT"` in package.json — not a file).
- Fix 5 failing tests in `test/*.test.js` before enabling `prepack` — current `npm test` output: `# pass 56 / # fail 5`. Failures include DB roundtrip tests (`insertSubmission + getSubmissionsByChallenge`, `upsertRating + getRating roundtrip`, `getAllRatings returns array`, `getAttemptCounts returns map`). These won't block publish if `prepack` is conditional, but they will block any CI gating.

**Publish flow (manual):**
```bash
npm login
npm version minor     # bumps + tags
npm publish
git push --tags
```

Subscription-based or 2FA: add `"publishConfig": { "access": "public" }` only if switching to scoped.

---

## 6. GitHub Actions publish workflow

Current `.github/workflows/` directory does not exist (verified). Below is a drop-in workflow. Place at `.github/workflows/publish.yml`. **Not committed — for Tim to review.**

```yaml
name: Publish

on:
  push:
    tags:
      - 'v*.*.*'
  workflow_dispatch:

permissions:
  contents: write
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - name: Install
        run: npm ci --ignore-scripts

      - name: Test
        run: |
          if npm run | grep -q '^  test$'; then
            npm test
          else
            echo "no test script defined, skipping"
          fi

      - name: Verify tag matches package.json
        run: |
          PKG_VERSION=$(node -p "require('./package.json').version")
          TAG_VERSION="${GITHUB_REF_NAME#v}"
          if [ "$PKG_VERSION" != "$TAG_VERSION" ]; then
            echo "Tag $TAG_VERSION does not match package.json $PKG_VERSION"
            exit 1
          fi

      - name: Publish to npm
        run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          draft: false
          prerelease: false
```

**Integration notes:**
- No existing CI in `.github/workflows/` to clobber (verified: `.github/` does not exist at repo root).
- Uses `--provenance` — requires `id-token: write` permission; publishes signed provenance attestations to npm.
- Gracefully skips `npm test` if the script is gone (defensive against the 5 failing tests above).
- Fails the publish if the git tag and `package.json` version disagree.
- Consider adding a separate `ci.yml` that runs on PRs (test only, no publish) before wiring publish — out of scope for this audit but a good follow-up.

---

## 7. Ship-blocker triage

### P0 — must fix before public launch

- [ ] **Publish to npm.** Landing page (`frontend/app/page.tsx:126`), README (`README.md:10`), SUBMITTING.md (`docs/SUBMITTING.md:25`) all advertise `npm i -g agentelo`, which 404s. Until the package exists, no stranger can install.
- [ ] **Fix `new URL('/api/...', baseUrl)` path-prefix bug** (seven sites in `bin/agentelo`: 302, 325, 496, 520, 541, 562, 1807). Breaks every CLI call to `tim.waldin.net/agentelo`. Submissions silently drop because `postToApi` swallows HTTP errors.
- [ ] **Change default `baseUrl` from `https://api.agentelo.io`** (`bin/agentelo:161`). DNS does not resolve. Also fix `docs/API.md:3` and `package.json:28` (`homepage`).
- [ ] **Wire `--invite` and CAPTCHA into `cmdRegister`**, or redirect the CLI to send users to `/register` page and paste the key. SUBMITTING.md Step 5 documents `--invite` which doesn't exist; prod requires CAPTCHA which the CLI can't produce. Today the CLI register path is fully broken against prod.
- [ ] **Stop `postToApi` from swallowing HTTP errors** (`bin/agentelo:493-513`). Users currently see "success" when the server returned 404/HTML/500. One bad line here masks every other bug.

### P1 — within a week

- [ ] **Remove or implement** docs-promised flags `agentelo play --loop`, `--count N`, `--challenge id`. Pick one — either add the loop/count logic to `runAgentPlay` or rewrite `docs/SUBMITTING.md:117-120`.
- [ ] **Fix CLAUDE.md tamper false-positive** (`bin/agentelo:1190`). Add `CLAUDE.md|AGENTS.md|GEMINI.md` to `HARNESS_ARTIFACTS` regex or build the whitelist from `INSTRUCTION_TARGETS`.
- [ ] **Fix the 5 failing tests** in `test/*.test.js` (DB-layer roundtrip tests). Required before any `prepack` or CI gate. Block publishing broken code silently.
- [ ] **Fix frontend footer "GitHub" link** (`frontend/app/page.tsx:163`) — currently points to bare `https://github.com`, should be `https://github.com/twaldin/agentelo`.
- [ ] **Link `/register` from landing page**. Right now users have no way to discover the web-based registration path.
- [ ] **Document undocumented prerequisites** in `docs/SUBMITTING.md` "What you need": `uv` (Python), `pnpm` (optional), `gcloud` + `AGENTELO_GCP_PROJECT` (Vertex), `tmux` (optional).
- [ ] **Re-enable re-registration idempotency.** If user runs `register` twice with the same name, return 200 and load existing creds instead of 409 (`bin/agentelo:378`). SUBMITTING.md:89 claims this is the behavior.

### P2 — nice-to-have

- [ ] **Add `LICENSE` file** (only `"license": "MIT"` declared in package.json). Standard practice and makes GitHub display the license badge.
- [ ] **Trim `docs/superpowers/plans/*.md`** from the npm tarball — 59kB of internal planning docs currently ship (`npm pack --dry-run` verified).
- [ ] **List `agents` and `default` subcommands in `printUsage()`** (`bin/agentelo:1710+`). They're implemented but invisible.
- [ ] **Document `--instructions` flag** — it exists (`bin/agentelo:821`), is powerful, and is never mentioned in any doc.
- [ ] **Add `docs/CONTRIBUTING.md`-referenced agent-auth helper** — SUBMITTING.md says `One registration per (harness, model) combination` but there's no way from the CLI to list, switch, or delete agents other than the undocumented `agents`/`default` commands.
- [ ] **Add a `/docs` route** to the frontend. Right now docs live only in the repo; first-time visitors can't browse them from the site.
- [ ] **Kill duplicate/obsolete `.md` files in repo root** (`LAUNCH.md`, `LAUNCH-PLAN.md`, `SPEC.md`, `SPEC-v1.md`, `SPEC-v2.md`, `V1-SPEC.md`, `REFACTOR.md`, `ROADMAP.md`, `seed-refactor-plan.md`). Confusing for first-time contributors; archive under `docs/archive/`.

---

## Appendix: evidence

**Commands run:**
- `curl -sI https://tim.waldin.net/agentelo/` → 200 (landing reachable)
- `curl -sI https://api.agentelo.io/` → 308 redirect to `/agentelo` (Tim's personal nginx, not an API host; Vercel-like behavior)
- `dig +short api.agentelo.io` → (empty — no DNS record)
- `dig +short agentelo.io` → (empty — no DNS record)
- `curl -s https://tim.waldin.net/agentelo/api/leaderboard` → valid JSON array (confirms prefix-preserving URL works)
- `curl -s https://tim.waldin.net/api/leaderboard` → HTML (confirms Tim's root is Next.js portfolio, URL bug lands here)
- `curl -X POST https://tim.waldin.net/agentelo/api/register -d '{"name":"...","harness":"...","model":"..."}'` → `403 {"error":"CAPTCHA token required"}` (confirms CLI can't register to prod)
- `npm view agentelo` → 404
- `npm view @twaldin/agentelo` → 404
- `npm pack --dry-run` → 20 files, 71.4 kB tarball (notable: `docs/superpowers/plans/...` included; `bin/run-mini-swe.py` missing)
- `npm test` → `# pass 56 / # fail 5`
- `node -e "new URL('/api/submissions', 'https://tim.waldin.net/agentelo').toString()"` → `https://tim.waldin.net/api/submissions` (bug confirmed)
- `node -e "/^\.(claude|...)/.test('CLAUDE.md')"` → `false` (tamper regex miss confirmed)

**Files checked:**
- `package.json`, `README.md`, `bin/agentelo` (1830 lines), `bin/api` (register endpoint)
- `docs/API.md`, `docs/SUBMITTING.md`, `docs/HARNESSES.md`, `docs/CONTRIBUTING.md`
- `frontend/app/page.tsx`, `frontend/app/register/page.tsx`
- `core/` (confirmed all CLI imports resolve within published tarball)

**Files not inspected (out of scope):** `core/scorer.js` internals beyond imports, `bin/api` beyond `/api/register`, `test/*.test.js` content beyond pass/fail count, frontend nav/layout, challenge JSON format.
