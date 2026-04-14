'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  loadResults,
  sortResultsByDate,
  formatResultsTable,
  aggregateLeaderboard,
  formatLeaderboardTable,
} = require('../core/results');

const { computeAgentHash } = require('../core/agentHash');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const RESULT_A = {
  run_id: 'express-5291-claude-code-1712345678',
  challenge_id: 'express-5291',
  harness: 'claude-code',
  model: 'claude-sonnet-4-6',
  agent_hash: 'abc123def456',
  started_at: '2026-04-05T12:00:00Z',
  finished_at: '2026-04-05T12:15:00Z',
  tests_passed: true,
  time_seconds: 900,
  exit_code: 0,
  diff_lines: 42,
  diff: '',
  tampered: false,
  tampered_files: [],
  log_file: 'results/express-5291-claude-code-1712345678.log',
  timed_out: false,
};

const RESULT_B = {
  run_id: 'koa-100-claude-code-1712340000',
  challenge_id: 'koa-100',
  harness: 'claude-code',
  model: 'claude-sonnet-4-6',
  agent_hash: 'abc123def456',
  started_at: '2026-04-04T10:00:00Z',
  finished_at: '2026-04-04T10:20:00Z',
  tests_passed: false,
  time_seconds: 1200,
  exit_code: 1,
  diff_lines: 10,
  diff: '',
  tampered: false,
  tampered_files: [],
  log_file: 'results/koa-100-claude-code-1712340000.log',
  timed_out: false,
};

const RESULT_C = {
  run_id: 'fastify-50-opencode-1712300000',
  challenge_id: 'fastify-50',
  harness: 'opencode',
  model: 'gpt-4o',
  agent_hash: 'xyz999aabbcc',
  started_at: '2026-04-03T08:00:00Z',
  finished_at: '2026-04-03T08:10:00Z',
  tests_passed: true,
  time_seconds: 600,
  exit_code: 0,
  diff_lines: 5,
  diff: '',
  tampered: false,
  tampered_files: [],
  log_file: 'results/fastify-50-opencode-1712300000.log',
  timed_out: false,
};

// ---------------------------------------------------------------------------
// Helper: write fixtures to a temp dir
// ---------------------------------------------------------------------------
function makeTempResultsDir(results) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentelo-test-'));
  for (const r of results) {
    fs.writeFileSync(path.join(dir, `${r.run_id}.json`), JSON.stringify(r), 'utf8');
  }
  return dir;
}

// ---------------------------------------------------------------------------
// Tests: loadResults
// ---------------------------------------------------------------------------
test('loadResults returns empty array for nonexistent directory', () => {
  const result = loadResults('/does/not/exist/at/all');
  assert.deepEqual(result, []);
});

test('loadResults reads all JSON files from a directory', () => {
  const dir = makeTempResultsDir([RESULT_A, RESULT_B]);
  try {
    const results = loadResults(dir);
    assert.equal(results.length, 2);
    const ids = results.map(r => r.run_id).sort();
    assert.deepEqual(ids, [RESULT_A.run_id, RESULT_B.run_id].sort());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadResults skips non-JSON files and malformed JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentelo-test-'));
  try {
    fs.writeFileSync(path.join(dir, `${RESULT_A.run_id}.json`), JSON.stringify(RESULT_A));
    fs.writeFileSync(path.join(dir, 'run.log'), 'some log data');
    fs.writeFileSync(path.join(dir, 'bad.json'), '{not valid json]');
    const results = loadResults(dir);
    assert.equal(results.length, 1);
    assert.equal(results[0].run_id, RESULT_A.run_id);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: sortResultsByDate
// ---------------------------------------------------------------------------
test('sortResultsByDate returns results newest-first', () => {
  const sorted = sortResultsByDate([RESULT_B, RESULT_C, RESULT_A]);
  assert.equal(sorted[0].run_id, RESULT_A.run_id); // 2026-04-05
  assert.equal(sorted[1].run_id, RESULT_B.run_id); // 2026-04-04
  assert.equal(sorted[2].run_id, RESULT_C.run_id); // 2026-04-03
});

test('sortResultsByDate does not mutate original array', () => {
  const original = [RESULT_B, RESULT_A];
  sortResultsByDate(original);
  assert.equal(original[0].run_id, RESULT_B.run_id);
});

// ---------------------------------------------------------------------------
// Tests: formatResultsTable (results subcommand)
// ---------------------------------------------------------------------------
test('formatResultsTable includes headers and correct data', () => {
  const dir = makeTempResultsDir([RESULT_A]);
  try {
    const results = loadResults(dir);
    const sorted = sortResultsByDate(results);
    const table = formatResultsTable(sorted);

    assert.ok(table.includes('RUN ID'), 'should have RUN ID header');
    assert.ok(table.includes('CHALLENGE'), 'should have CHALLENGE header');
    assert.ok(table.includes('HARNESS'), 'should have HARNESS header');
    assert.ok(table.includes('MODEL'), 'should have MODEL header');
    assert.ok(table.includes('PASS'), 'should have PASS header');
    assert.ok(table.includes('TIME'), 'should have TIME header');

    assert.ok(table.includes(RESULT_A.run_id), 'should include run_id');
    assert.ok(table.includes('express-5291'), 'should include challenge_id');
    assert.ok(table.includes('claude-code'), 'should include harness');
    assert.ok(table.includes('claude-sonnet-4-6'), 'should include model');
    assert.ok(table.includes('YES'), 'should show YES for tests_passed');
    assert.ok(table.includes('900s'), 'should include time');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('formatResultsTable shows NO for failed runs', () => {
  const dir = makeTempResultsDir([RESULT_B]);
  try {
    const results = loadResults(dir);
    const table = formatResultsTable(results);
    assert.ok(table.includes('NO'), 'should show NO for failed tests');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: aggregateLeaderboard
// ---------------------------------------------------------------------------
test('aggregateLeaderboard groups by agent_hash', () => {
  const leaderboard = aggregateLeaderboard([RESULT_A, RESULT_B, RESULT_C]);
  assert.equal(leaderboard.length, 2); // abc123def456 and xyz999aabbcc
});

test('aggregateLeaderboard computes correct pass_rate', () => {
  const leaderboard = aggregateLeaderboard([RESULT_A, RESULT_B]);
  // Both share agent_hash abc123def456: 1 pass / 2 total = 50%
  assert.equal(leaderboard.length, 1);
  assert.equal(leaderboard[0].agent_hash, 'abc123def456');
  assert.equal(leaderboard[0].pass_rate, 50);
  assert.equal(leaderboard[0].challenges_attempted, 2);
});

test('aggregateLeaderboard computes avg_time from passing runs only', () => {
  const leaderboard = aggregateLeaderboard([RESULT_A, RESULT_B]);
  // Only RESULT_A passed: time_seconds = 900
  assert.equal(leaderboard[0].avg_time, 900);
});

test('aggregateLeaderboard sorts by pass_rate desc then avg_time asc', () => {
  // RESULT_C agent passes 100%, RESULT_A+B agent passes 50%
  const leaderboard = aggregateLeaderboard([RESULT_A, RESULT_B, RESULT_C]);
  assert.equal(leaderboard[0].agent_hash, 'xyz999aabbcc'); // 100% pass rate
  assert.equal(leaderboard[1].agent_hash, 'abc123def456'); // 50% pass rate
});

test('aggregateLeaderboard handles agent with zero passing runs', () => {
  const failResult = { ...RESULT_B, agent_hash: 'zzz' };
  const leaderboard = aggregateLeaderboard([failResult]);
  assert.equal(leaderboard[0].pass_rate, 0);
  assert.equal(leaderboard[0].avg_time, null);
});

test('aggregateLeaderboard tie in pass_rate sorts by avg_time asc', () => {
  // Two agents both at 100% pass rate, different avg times
  const fast = {
    ...RESULT_A,
    agent_hash: 'fast-agent',
    harness: 'opencode',
    model: 'gpt-4o',
    time_seconds: 300,
  };
  const slow = {
    ...RESULT_A,
    run_id: 'slow-run',
    agent_hash: 'slow-agent',
    harness: 'claude-code',
    model: 'claude-opus',
    time_seconds: 1500,
  };
  const leaderboard = aggregateLeaderboard([slow, fast]);
  assert.equal(leaderboard[0].agent_hash, 'fast-agent');
  assert.equal(leaderboard[1].agent_hash, 'slow-agent');
});

// ---------------------------------------------------------------------------
// Tests: formatLeaderboardTable
// ---------------------------------------------------------------------------
test('formatLeaderboardTable includes correct headers and data', () => {
  const leaderboard = aggregateLeaderboard([RESULT_A, RESULT_B, RESULT_C]);
  const table = formatLeaderboardTable(leaderboard);

  assert.ok(table.includes('RANK'), 'should have RANK header');
  assert.ok(table.includes('AGENT HASH'), 'should have AGENT HASH header');
  assert.ok(table.includes('HARNESS'), 'should have HARNESS header');
  assert.ok(table.includes('MODEL'), 'should have MODEL header');
  assert.ok(table.includes('PASS RATE'), 'should have PASS RATE header');
  assert.ok(table.includes('ATTEMPTS'), 'should have ATTEMPTS header');
  assert.ok(table.includes('AVG TIME'), 'should have AVG TIME header');

  assert.ok(table.includes('xyz999aabbcc'), 'should include top agent hash');
  assert.ok(table.includes('100%'), 'should include 100% pass rate');
  assert.ok(table.includes('600s'), 'should include avg time');
  assert.ok(table.includes('1'), 'should include rank 1');
});

test('formatLeaderboardTable shows N/A for agents with no passing runs', () => {
  const failResult = { ...RESULT_B, agent_hash: 'zzz', tests_passed: false };
  const leaderboard = aggregateLeaderboard([failResult]);
  const table = formatLeaderboardTable(leaderboard);
  assert.ok(table.includes('N/A'), 'should show N/A for no passing time');
});

// ---------------------------------------------------------------------------
// Tests: computeAgentHash
// ---------------------------------------------------------------------------
test('computeAgentHash returns a 12-char hex hash', async () => {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentelo-hash-test-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentelo-hash-home-'));
  try {
    const { hash, configFiles } = await computeAgentHash('claude-code', 'claude-sonnet-4-6', workdir, homeDir);
    assert.ok(typeof hash === 'string', 'hash should be a string');
    assert.equal(hash.length, 12, 'hash should be 12 characters');
    assert.ok(/^[0-9a-f]+$/.test(hash), 'hash should be hex');
    assert.ok(Array.isArray(configFiles), 'configFiles should be an array');
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

test('computeAgentHash changes when CLAUDE.md content changes', async () => {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentelo-hash-test-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentelo-hash-home-'));
  try {
    // Write a CLAUDE.md in the workdir
    fs.writeFileSync(path.join(workdir, 'CLAUDE.md'), 'Initial instructions\n', 'utf8');

    const { hash: hash1, configFiles: cf1 } = await computeAgentHash('claude-code', 'claude-sonnet-4-6', workdir, homeDir);

    // Modify the CLAUDE.md
    fs.writeFileSync(path.join(workdir, 'CLAUDE.md'), 'Modified instructions\n', 'utf8');

    const { hash: hash2, configFiles: cf2 } = await computeAgentHash('claude-code', 'claude-sonnet-4-6', workdir, homeDir);

    assert.notEqual(hash1, hash2, 'hash should change when CLAUDE.md content changes');
    assert.ok(cf1.some(f => f.includes('CLAUDE.md')), 'configFiles should include CLAUDE.md path');
    assert.ok(cf2.some(f => f.includes('CLAUDE.md')), 'configFiles should include CLAUDE.md path');
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

test('computeAgentHash includes config files from parent directories up to homeDir', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentelo-hash-home-'));
  const subDir = path.join(homeDir, 'projects', 'myrepo');
  fs.mkdirSync(subDir, { recursive: true });
  try {
    // Write CLAUDE.md at home level and at workdir level
    fs.writeFileSync(path.join(homeDir, 'CLAUDE.md'), 'Home-level instructions\n', 'utf8');
    fs.writeFileSync(path.join(subDir, 'CLAUDE.md'), 'Repo-level instructions\n', 'utf8');

    const { hash, configFiles } = await computeAgentHash('claude-code', 'claude-sonnet-4-6', subDir, homeDir);

    // Both CLAUDE.md files should be in configFiles
    const hasHomeLevel = configFiles.some(f => f === path.join(homeDir, 'CLAUDE.md'));
    const hasRepoLevel = configFiles.some(f => f === path.join(subDir, 'CLAUDE.md'));
    assert.ok(hasHomeLevel, 'should include home-level CLAUDE.md');
    assert.ok(hasRepoLevel, 'should include repo-level CLAUDE.md');
    assert.equal(hash.length, 12, 'hash should be 12 chars');
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

test('computeAgentHash handles unknown harness gracefully', async () => {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentelo-hash-test-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentelo-hash-home-'));
  try {
    const { hash, configFiles } = await computeAgentHash('unknown-harness', 'some-model', workdir, homeDir);
    assert.equal(hash.length, 12, 'should still return 12-char hash');
    assert.deepEqual(configFiles, [], 'configFiles should be empty for unknown harness');
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});
