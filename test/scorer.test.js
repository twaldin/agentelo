'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { score } = require('../core/scorer');

function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentelo-test-'));

  // Init repo with a known identity so it works in CI too
  spawnSync('git', ['init', '-b', 'main'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@agentelo.local'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'AgentElo Test'], { cwd: dir });

  // Create and commit a base file
  const filePath = path.join(dir, 'hello.txt');
  fs.writeFileSync(filePath, 'hello world\n');
  spawnSync('git', ['add', '.'], { cwd: dir });
  spawnSync('git', ['commit', '-m', 'initial'], { cwd: dir });

  return dir;
}

function buildDiff(repoDir) {
  // Make a change
  const filePath = path.join(repoDir, 'hello.txt');
  fs.appendFileSync(filePath, 'fix applied\n');

  // Capture the diff before resetting
  const result = spawnSync('git', ['diff'], { cwd: repoDir, encoding: 'utf8' });
  const diff = result.stdout;

  // Reset the working tree back to the committed state so score() can apply it cleanly
  spawnSync('git', ['checkout', '--', '.'], { cwd: repoDir });

  return diff;
}

test('score() applies diff and runs passing test command', async () => {
  const repoDir = makeTempRepo();
  try {
    const diff = buildDiff(repoDir);
    assert.ok(diff.length > 0, 'diff should be non-empty');

    const challenge = {
      id: 'test-challenge',
      repo: 'https://example.com/repo.git',
      commit: 'abc123',
      test_command: 'true',
    };

    const result = await score(diff, repoDir, challenge);

    assert.equal(result.tests_passed, true, 'tests_passed should be true');
    assert.equal(result.exit_code, 0, 'exit_code should be 0');
    assert.ok(typeof result.time_seconds === 'number', 'time_seconds should be a number');
    assert.ok(result.time_seconds >= 0, 'time_seconds should be non-negative');
    assert.ok(result.diff_lines > 0, 'diff_lines should be positive');
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('score() returns tests_passed=false when test command fails', async () => {
  const repoDir = makeTempRepo();
  try {
    const diff = buildDiff(repoDir);

    const challenge = {
      id: 'test-challenge-fail',
      repo: 'https://example.com/repo.git',
      commit: 'abc123',
      test_command: 'false',
    };

    const result = await score(diff, repoDir, challenge);

    assert.equal(result.tests_passed, false, 'tests_passed should be false');
    assert.notEqual(result.exit_code, 0, 'exit_code should be non-zero');
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('score() returns failure immediately when diff cannot be applied', async () => {
  const repoDir = makeTempRepo();
  try {
    const badDiff = 'this is not a valid diff\n';

    const challenge = {
      id: 'test-bad-diff',
      repo: 'https://example.com/repo.git',
      commit: 'abc123',
      test_command: 'true',
    };

    const result = await score(badDiff, repoDir, challenge);

    assert.equal(result.tests_passed, false, 'tests_passed should be false for bad diff');
    assert.equal(result.exit_code, 1, 'exit_code should be 1 for bad diff');
    assert.equal(result.time_seconds, 0, 'time_seconds should be 0 for bad diff');
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('score() returns tests_passed=false immediately for empty diff without running tests', async () => {
  const repoDir = makeTempRepo();
  try {
    const challenge = {
      id: 'test-empty-diff',
      repo: 'https://example.com/repo.git',
      commit: 'abc123',
      // Use a command that would pass to confirm tests were NOT run
      test_command: 'true',
    };

    // Empty string
    const result = await score('', repoDir, challenge);
    assert.equal(result.tests_passed, false, 'tests_passed should be false for empty diff');
    assert.equal(result.exit_code, 1, 'exit_code should be 1 for empty diff');
    assert.equal(result.time_seconds, 0, 'time_seconds should be 0 for empty diff');
    assert.equal(result.diff_lines, 0, 'diff_lines should be 0 for empty diff');

    // Whitespace-only string
    const result2 = await score('   \n  \n  ', repoDir, challenge);
    assert.equal(result2.tests_passed, false, 'tests_passed should be false for whitespace diff');
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('score() diff_lines counts only changed lines not context or headers', async () => {
  const repoDir = makeTempRepo();
  try {
    const diff = buildDiff(repoDir);
    assert.ok(diff.length > 0, 'diff should be non-empty');

    const challenge = {
      id: 'test-diff-lines',
      repo: 'https://example.com/repo.git',
      commit: 'abc123',
      test_command: 'true',
    };

    const result = await score(diff, repoDir, challenge);

    // Count manually: lines starting with + or - but NOT +++ or ---
    const expectedDiffLines = diff
      .split('\n')
      .filter(l => /^[+-]/.test(l) && !/^[+-]{3}/.test(l))
      .length;

    assert.ok(expectedDiffLines > 0, 'should have some changed lines');
    assert.equal(result.diff_lines, expectedDiffLines, 'diff_lines should count only changed lines');

    // Verify it is less than total line count (context lines are excluded)
    const totalLines = diff.split('\n').length;
    assert.ok(result.diff_lines <= totalLines, 'diff_lines should not exceed total lines');
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});
