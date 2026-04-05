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
      CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT UNIQUE NOT NULL,
        challenge_id TEXT NOT NULL,
        agent_hash TEXT NOT NULL,
        harness TEXT NOT NULL,
        model TEXT NOT NULL,
        tests_passed INTEGER NOT NULL DEFAULT 0,
        time_seconds REAL NOT NULL DEFAULT 0,
        agent_time_seconds REAL NOT NULL DEFAULT 0,
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

function insertSubmission(sub) {
  // Migrations for existing DBs
  try { getDb().exec('ALTER TABLE submissions ADD COLUMN agent_time_seconds REAL NOT NULL DEFAULT 0'); } catch (_) {}
  try { getDb().exec('ALTER TABLE submissions ADD COLUMN test_time_seconds REAL NOT NULL DEFAULT 0'); } catch (_) {}
  try { getDb().exec('ALTER TABLE submissions ADD COLUMN tests_total INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
  try { getDb().exec('ALTER TABLE submissions ADD COLUMN tests_ok INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
  try { getDb().exec('ALTER TABLE submissions ADD COLUMN tests_failed INTEGER NOT NULL DEFAULT 0'); } catch (_) {}

  getDb().prepare(`
    INSERT OR IGNORE INTO submissions
      (run_id, challenge_id, agent_hash, harness, model, tests_passed, time_seconds, agent_time_seconds, test_time_seconds, diff_lines, tests_total, tests_ok, tests_failed, tampered, transcript_path, created_at)
    VALUES
      (@run_id, @challenge_id, @agent_hash, @harness, @model, @tests_passed, @time_seconds, @agent_time_seconds, @test_time_seconds, @diff_lines, @tests_total, @tests_ok, @tests_failed, @tampered, @transcript_path, @created_at)
  `).run({
    run_id: sub.run_id,
    challenge_id: sub.challenge_id,
    agent_hash: sub.agent_hash,
    harness: sub.harness,
    model: sub.model,
    tests_passed: sub.tests_passed ? 1 : 0,
    time_seconds: sub.agent_time_seconds || sub.time_seconds || 0,
    agent_time_seconds: sub.agent_time_seconds || 0,
    test_time_seconds: sub.test_time_seconds || sub.time_seconds || 0,
    diff_lines: sub.diff_lines || 0,
    tests_total: sub.tests_total || 0,
    tests_ok: sub.tests_ok || 0,
    tests_failed: sub.tests_failed || 0,
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

// Returns { challenge_id: { total, wins, avg_time, avg_agent_time } }
function getSolveStats() {
  // Add column if missing (migration)
  try { getDb().exec('ALTER TABLE submissions ADD COLUMN agent_time_seconds REAL NOT NULL DEFAULT 0'); } catch (_) {}

  const rows = getDb().prepare(`
    SELECT challenge_id,
           COUNT(*) as total,
           SUM(tests_passed) as wins,
           AVG(time_seconds) as avg_time,
           AVG(CASE WHEN agent_time_seconds > 0 THEN agent_time_seconds ELSE NULL END) as avg_agent_time
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
