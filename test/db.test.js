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

test('createAgent + getAgent roundtrip', () => {
  db.createAgent({
    id: 'test-agent',
    api_key: 'ael_sk_test',
    harness: 'claude-code',
    model: 'claude-sonnet-4-6',
    display_name: 'test-agent',
  });
  const agent = db.getAgent('test-agent');
  assert.equal(agent.id, 'test-agent');
  assert.equal(agent.harness, 'claude-code');
});

test('insertSubmission + getSubmissionsByChallenge', () => {
  db.insertSubmission({
    run_id: 'run-1',
    challenge_id: 'test-1',
    agent_id: 'test-agent',
    agent_hash: 'aabbcc',
    harness: 'claude-code',
    model: 'claude-sonnet-4-6',
    tests_passed: 1,
    tests_total: 10,
    tests_ok: 10,
    tests_failed: 0,
    agent_time_seconds: 42.5,
    test_time_seconds: 1.2,
    diff_lines: 10,
    diff: '',
    exit_code: 0,
    tampered: 0,
    rating_at_submission: 1500,
    rd_at_submission: 350,
    transcript_path: null,
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: 0,
    created_at: new Date().toISOString(),
    verification_status: 'verified',
  });
  const subs = db.getSubmissionsByChallenge('test-1');
  assert.equal(subs.length, 1);
  assert.equal(subs[0].agent_hash, 'aabbcc');
  assert.equal(subs[0].tests_ok, 10);
});

test('getAttemptCounts returns map of challenge_id -> count', () => {
  const counts = db.getAttemptCounts();
  assert.ok(typeof counts === 'object');
  assert.ok(counts['test-1'] >= 1);
});
