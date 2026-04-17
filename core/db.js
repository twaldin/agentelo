'use strict';

const Database = require('better-sqlite3');
const path = require('path');

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

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        api_key TEXT UNIQUE NOT NULL,
        harness TEXT NOT NULL,
        model TEXT NOT NULL,
        display_name TEXT,
        current_hash TEXT,
        rating REAL NOT NULL DEFAULT 1500,
        rd REAL NOT NULL DEFAULT 350,
        volatility REAL NOT NULL DEFAULT 0.06,
        challenges_attempted INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS config_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        agent_hash TEXT NOT NULL,
        harness TEXT NOT NULL,
        model TEXT NOT NULL,
        config_files TEXT DEFAULT '[]',
        first_seen_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_cv_agent ON config_versions(agent_id);

      CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT UNIQUE NOT NULL,
        challenge_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        agent_hash TEXT NOT NULL,
        harness TEXT NOT NULL,
        model TEXT NOT NULL,
        tests_passed INTEGER NOT NULL DEFAULT 0,
        tests_total INTEGER NOT NULL DEFAULT 0,
        tests_ok INTEGER NOT NULL DEFAULT 0,
        tests_failed INTEGER NOT NULL DEFAULT 0,
        agent_time_seconds REAL NOT NULL DEFAULT 0,
        test_time_seconds REAL NOT NULL DEFAULT 0,
        diff_lines INTEGER NOT NULL DEFAULT 0,
        diff TEXT DEFAULT '',
        exit_code INTEGER NOT NULL DEFAULT 1,
        tampered INTEGER NOT NULL DEFAULT 0,
        rating_at_submission REAL NOT NULL DEFAULT 1500,
        rd_at_submission REAL NOT NULL DEFAULT 350,
        transcript_path TEXT,
        tokens_in INTEGER NOT NULL DEFAULT 0,
        tokens_out INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sub_agent ON submissions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_sub_challenge ON submissions(challenge_id);

      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        challenge_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        opponent_id TEXT NOT NULL,
        submission_id INTEGER NOT NULL,
        opponent_submission_id INTEGER NOT NULL,
        score REAL NOT NULL,
        rating_before REAL NOT NULL,
        rating_after REAL NOT NULL,
        rd_before REAL NOT NULL,
        rd_after REAL NOT NULL,
        delta REAL NOT NULL,
        opponent_rating REAL NOT NULL,
        opponent_rd REAL NOT NULL,
        opponent_model TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_games_agent ON games(agent_id);
      CREATE INDEX IF NOT EXISTS idx_games_challenge ON games(challenge_id);

      CREATE TABLE IF NOT EXISTS rating_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        rating REAL NOT NULL,
        wins INTEGER NOT NULL DEFAULT 0,
        challenges_attempted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_agent ON rating_snapshots(agent_id);
      CREATE INDEX IF NOT EXISTS idx_snapshots_time ON rating_snapshots(created_at);

      CREATE TABLE IF NOT EXISTS rate_limits (
        bucket_key TEXT NOT NULL,
        window_day TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (bucket_key, window_day)
      );
      CREATE INDEX IF NOT EXISTS idx_ratelimits_day ON rate_limits(window_day);

      CREATE TABLE IF NOT EXISTS invite_codes (
        code TEXT PRIMARY KEY,
        note TEXT,
        used_by_agent TEXT,
        used_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Migration: add columns that may be missing from older schemas
    const submissionCols = _db.pragma('table_info(submissions)').map(c => c.name);
    if (!submissionCols.includes('tokens_in')) {
      _db.exec('ALTER TABLE submissions ADD COLUMN tokens_in INTEGER NOT NULL DEFAULT 0');
    }
    if (!submissionCols.includes('tokens_out')) {
      _db.exec('ALTER TABLE submissions ADD COLUMN tokens_out INTEGER NOT NULL DEFAULT 0');
    }
    if (!submissionCols.includes('cost_usd')) {
      _db.exec('ALTER TABLE submissions ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0');
    }

    const agentCols = _db.pragma('table_info(agents)').map(c => c.name);
    if (!agentCols.includes('display_name')) {
      _db.exec('ALTER TABLE agents ADD COLUMN display_name TEXT');
    }
    _db.exec(`
      UPDATE agents
      SET display_name = id
      WHERE display_name IS NULL OR trim(display_name) = ''
    `);
  }
  return _db;
}

// --- Challenge functions ---

function upsertChallenge(ch) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO challenges (id, repo, title, difficulty_files, difficulty_lines, test_command, fix_commit)
    VALUES (@id, @repo, @title, @difficulty_files, @difficulty_lines, @test_command, @fix_commit)
  `).run({
    id: ch.id,
    repo: ch.repo || ch.repoUrl || '',
    title: ch.title || (ch.issue && ch.issue.title) || '',
    difficulty_files: (ch.difficulty && ch.difficulty.filesChanged) || 0,
    difficulty_lines: ((ch.difficulty && ch.difficulty.linesAdded) || 0) + ((ch.difficulty && ch.difficulty.linesRemoved) || 0),
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

// Returns { challenge_id: attemptCount }
function getAttemptCounts() {
  const rows = getDb().prepare('SELECT challenge_id, COUNT(*) as cnt FROM submissions GROUP BY challenge_id').all();
  const map = {};
  for (const row of rows) map[row.challenge_id] = row.cnt;
  return map;
}

// Returns { challenge_id: { total, wins, avg_agent_time } }
// Note: 'wins' here is a count of submissions with tests_ok > 0, but the API
// should recalculate using baseline-relative tests_fixed for accurate solve rate.
function getSolveStats() {
  const rows = getDb().prepare(`
    SELECT challenge_id,
           COUNT(*) as total,
           SUM(CASE WHEN tests_ok > 0 THEN 1 ELSE 0 END) as wins,
           AVG(CASE WHEN agent_time_seconds > 0 THEN agent_time_seconds ELSE NULL END) as avg_agent_time
    FROM submissions
    GROUP BY challenge_id
  `).all();
  const map = {};
  for (const r of rows) map[r.challenge_id] = r;
  return map;
}

// --- Agent functions ---

function createAgent({ id, api_key, harness, model, display_name }) {
  return getDb().prepare(`
    INSERT INTO agents (id, api_key, harness, model, display_name)
    VALUES (@id, @api_key, @harness, @model, @display_name)
  `).run({
    id,
    api_key,
    harness,
    model,
    display_name: display_name || id,
  });
}

function getAgentByKey(api_key) {
  return getDb().prepare('SELECT * FROM agents WHERE api_key = ?').get(api_key) || null;
}

function getAgent(id) {
  return getDb().prepare('SELECT * FROM agents WHERE id = ?').get(id) || null;
}

function getAllAgents() {
  return getDb().prepare('SELECT * FROM agents ORDER BY (rating - 2 * rd) DESC').all();
}

function updateAgent(agent) {
  return getDb().prepare(`
    UPDATE agents SET
      rating = @rating,
      rd = @rd,
      volatility = @volatility,
      wins = @wins,
      challenges_attempted = @challenges_attempted,
      current_hash = @current_hash,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id: agent.id,
    rating: agent.rating,
    rd: agent.rd,
    volatility: agent.volatility,
    wins: agent.wins,
    challenges_attempted: agent.challenges_attempted,
    current_hash: agent.current_hash || null,
  });
}

function setAgentDisplayName(id, display_name) {
  return getDb().prepare(`
    UPDATE agents
    SET display_name = @display_name,
        updated_at = datetime('now')
    WHERE id = @id
  `).run({ id, display_name });
}

// --- Config version functions ---

function insertConfigVersion({ agent_id, agent_hash, harness, model, config_files }) {
  return getDb().prepare(`
    INSERT INTO config_versions (agent_id, agent_hash, harness, model, config_files)
    VALUES (@agent_id, @agent_hash, @harness, @model, @config_files)
  `).run({
    agent_id,
    agent_hash,
    harness,
    model,
    config_files: JSON.stringify(config_files || []),
  });
}

function getConfigVersions(agent_id) {
  return getDb().prepare(
    'SELECT * FROM config_versions WHERE agent_id = ? ORDER BY first_seen_at'
  ).all(agent_id).map(row => ({
    ...row,
    config_files: JSON.parse(row.config_files || '[]'),
  }));
}

// --- Games functions ---

function insertGame(game) {
  return getDb().prepare(`
    INSERT INTO games
      (challenge_id, agent_id, opponent_id, submission_id, opponent_submission_id,
       score, rating_before, rating_after, rd_before, rd_after, delta,
       opponent_rating, opponent_rd, opponent_model)
    VALUES
      (@challenge_id, @agent_id, @opponent_id, @submission_id, @opponent_submission_id,
       @score, @rating_before, @rating_after, @rd_before, @rd_after, @delta,
       @opponent_rating, @opponent_rd, @opponent_model)
  `).run({
    challenge_id: game.challenge_id,
    agent_id: game.agent_id,
    opponent_id: game.opponent_id,
    submission_id: game.submission_id,
    opponent_submission_id: game.opponent_submission_id,
    score: game.score,
    rating_before: game.rating_before,
    rating_after: game.rating_after,
    rd_before: game.rd_before,
    rd_after: game.rd_after,
    delta: game.delta,
    opponent_rating: game.opponent_rating,
    opponent_rd: game.opponent_rd,
    opponent_model: game.opponent_model,
  });
}

function getGameById(id) {
  return getDb().prepare('SELECT * FROM games WHERE id = ?').get(id) || null;
}

function getGamesByAgent(agentId, limit) {
  if (limit != null) {
    return getDb().prepare(
      'SELECT * FROM games WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(agentId, limit);
  }
  return getDb().prepare(
    'SELECT * FROM games WHERE agent_id = ? ORDER BY created_at DESC'
  ).all(agentId);
}

function getGamesBySubmission(submissionId, agentId) {
  if (agentId) {
    return getDb().prepare('SELECT * FROM games WHERE submission_id = ? AND agent_id = ?').all(submissionId, agentId);
  }
  return getDb().prepare('SELECT * FROM games WHERE submission_id = ?').all(submissionId);
}

function getRatingHistory(agentId) {
  return getDb().prepare(`
    SELECT rating_after, delta, score, challenge_id, opponent_id, opponent_model, created_at
    FROM games
    WHERE agent_id = ?
    ORDER BY created_at
  `).all(agentId);
}

// --- Submission functions ---

function insertSubmission(sub) {
  return getDb().prepare(`
    INSERT OR IGNORE INTO submissions
      (run_id, challenge_id, agent_id, agent_hash, harness, model,
       tests_passed, tests_total, tests_ok, tests_failed,
       agent_time_seconds, test_time_seconds, diff_lines, diff,
       exit_code, tampered, rating_at_submission, rd_at_submission,
       transcript_path, tokens_in, tokens_out, cost_usd, created_at)
    VALUES
      (@run_id, @challenge_id, @agent_id, @agent_hash, @harness, @model,
       @tests_passed, @tests_total, @tests_ok, @tests_failed,
       @agent_time_seconds, @test_time_seconds, @diff_lines, @diff,
       @exit_code, @tampered, @rating_at_submission, @rd_at_submission,
       @transcript_path, @tokens_in, @tokens_out, @cost_usd, @created_at)
  `).run({
    run_id: sub.run_id,
    challenge_id: sub.challenge_id,
    agent_id: sub.agent_id,
    agent_hash: sub.agent_hash,
    harness: sub.harness,
    model: sub.model,
    tests_passed: sub.tests_passed || 0,
    tests_total: sub.tests_total || 0,
    tests_ok: sub.tests_ok || 0,
    tests_failed: sub.tests_failed || 0,
    agent_time_seconds: sub.agent_time_seconds || 0,
    test_time_seconds: sub.test_time_seconds || 0,
    diff_lines: sub.diff_lines || 0,
    diff: sub.diff || '',
    exit_code: sub.exit_code != null ? sub.exit_code : 1,
    tampered: sub.tampered ? 1 : 0,
    rating_at_submission: sub.rating_at_submission || 1500,
    rd_at_submission: sub.rd_at_submission || 350,
    transcript_path: sub.transcript_path || null,
    tokens_in: sub.tokens_in || 0,
    tokens_out: sub.tokens_out || 0,
    cost_usd: sub.cost_usd || 0,
    created_at: sub.created_at || new Date().toISOString(),
  });
}

function getSubmission(runId) {
  return getDb().prepare('SELECT * FROM submissions WHERE run_id = ?').get(runId) || null;
}

function getSubmissionById(id) {
  return getDb().prepare('SELECT * FROM submissions WHERE id = ?').get(id) || null;
}

function getSubmissionsByAgent(agentId) {
  return getDb().prepare('SELECT * FROM submissions WHERE agent_id = ? ORDER BY created_at DESC').all(agentId);
}

function getSubmissionsByChallenge(challengeId) {
  return getDb().prepare('SELECT * FROM submissions WHERE challenge_id = ?').all(challengeId);
}

// --- Rating snapshot functions ---

function insertRatingSnapshot({ agent_id, rating, wins, challenges_attempted }) {
  return getDb().prepare(`
    INSERT INTO rating_snapshots (agent_id, rating, wins, challenges_attempted)
    VALUES (@agent_id, @rating, @wins, @challenges_attempted)
  `).run({ agent_id, rating, wins, challenges_attempted });
}

function getRatingSnapshots(agentId) {
  return getDb().prepare(
    'SELECT * FROM rating_snapshots WHERE agent_id = ? ORDER BY created_at ASC'
  ).all(agentId);
}

function getLatestSnapshots() {
  return getDb().prepare(`
    SELECT rs.* FROM rating_snapshots rs
    INNER JOIN (
      SELECT agent_id, MAX(id) as max_id FROM rating_snapshots GROUP BY agent_id
    ) latest ON rs.id = latest.max_id
  `).all();
}

function getPreviousSnapshots(agentId, beforeDate) {
  return getDb().prepare(
    'SELECT * FROM rating_snapshots WHERE agent_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT 1'
  ).get(agentId, beforeDate) || null;
}

module.exports = {
  getDb,
  // challenges
  upsertChallenge,
  getChallenge,
  getAllChallenges,
  getAttemptCounts,
  getSolveStats,
  // agents
  createAgent,
  getAgentByKey,
  getAgent,
  getAllAgents,
  updateAgent,
  setAgentDisplayName,
  // config versions
  insertConfigVersion,
  getConfigVersions,
  // games
  insertGame,
  getGameById,
  getGamesByAgent,
  getGamesBySubmission,
  getRatingHistory,
  // rating snapshots
  insertRatingSnapshot,
  getRatingSnapshots,
  getLatestSnapshots,
  getPreviousSnapshots,
  // submissions
  insertSubmission,
  getSubmission,
  getSubmissionById,
  getSubmissionsByAgent,
  getSubmissionsByChallenge,
};
