'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
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
