'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Score an agent's solution.
 * @param {string} diff - The git diff produced by the agent (output of `git diff`)
 * @param {string} repoDir - Path to the challenge repo directory (already cloned at buggy commit)
 * @param {object} challenge - The challenge manifest object
 * @param {string} [logFile] - Optional path to write test command stdout+stderr
 * @returns {Promise<{tests_passed: boolean, time_seconds: number, exit_code: number, diff_lines: number}>}
 */
/**
 * Strip test file hunks from a unified diff.
 * Only keep changes to non-test files so agents can't inflate scores by adding tests.
 */
function stripTestFiles(diff) {
  const testPatterns = ['/test/', '/tests/', '/__tests__/', '.test.', '.spec.', '_test.', 'test_'];
  const testPrefixes = ['test/', 'tests/', '__tests__/'];
  const chunks = diff.split(/^(diff --git )/m);
  const kept = [];
  for (let i = 0; i < chunks.length; i++) {
    if (!chunks[i].startsWith('diff --git ')) {
      if (i === 0) kept.push(chunks[i]); // preamble
      continue;
    }
    const chunk = chunks[i] + (chunks[i + 1] || '');
    i++; // skip the next part (already consumed)
    // Extract file path from "diff --git a/path b/path"
    const fileMatch = chunk.match(/^diff --git a\/(\S+)/);
    if (!fileMatch) continue;
    const filePath = fileMatch[1].toLowerCase();
    const isTest = testPatterns.some(p => filePath.includes(p)) || testPrefixes.some(p => filePath.startsWith(p));
    if (!isTest) kept.push(chunk);
  }
  return kept.join('');
}

async function score(diff, repoDir, challenge, logFile) {
  if (!diff || diff.trim() === '') {
    return { tests_passed: false, exit_code: 1, time_seconds: 0, diff_lines: 0 };
  }

  // Strip test file changes from the diff — only score code changes.
  // Agents adding tests would inflate their score; we use the fix PR's test suite instead.
  const strippedDiff = stripTestFiles(diff);
  if (!strippedDiff || strippedDiff.trim() === '') {
    return { tests_passed: false, exit_code: 1, time_seconds: 0, diff_lines: 0 };
  }

  const diffLines = strippedDiff.split('\n').filter(l => /^[+-]/.test(l) && !/^[+-]{3}/.test(l)).length;

  // Write diff to a temp file
  const tmpDir = os.tmpdir();
  const tmpPatch = path.join(tmpDir, `agentelo-patch-${Date.now()}-${process.pid}.patch`);

  try {
    fs.writeFileSync(tmpPatch, strippedDiff, 'utf8');
  } catch (err) {
    return { tests_passed: false, exit_code: 1, time_seconds: 0, diff_lines: diffLines };
  }

  // Apply the diff
  try {
    await runCommand('git', ['apply', '--whitespace=fix', tmpPatch], repoDir, null, 30000);
  } catch (err) {
    console.error('[scorer] git apply FAILED:', err.message?.slice(0, 200));
    // Try with --3way as fallback
    try {
      await runCommand('git', ['apply', '--3way', tmpPatch], repoDir, null, 30000);
      console.log('[scorer] git apply --3way succeeded');
    } catch (err2) {
      console.error('[scorer] git apply --3way also FAILED:', err2.message?.slice(0, 200));
      return { tests_passed: false, exit_code: 1, time_seconds: 0, diff_lines: diffLines };
    }
  } finally {
    try { fs.unlinkSync(tmpPatch); } catch (_) {}
  }

  // Inject fix-commit test files so we score against the PR's test suite
  if (challenge.fixCommit && challenge.repo) {
    await injectFixTests(repoDir, challenge);
  }

  // Resolve log file destination
  const resolvedLog = logFile || '/dev/null';

  // Run the test command
  const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  // Skip lint/coverage wrappers — find the fastest pure test command
  let testCmd = challenge.test_command;
  if (testCmd === 'npm test' || testCmd === 'pnpm test') {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(repoDir, 'package.json'), 'utf8'));
      const s = pkg.scripts || {};
      if (s.unit) testCmd = testCmd.replace('test', 'run unit');
      else if (s['tests-only']) testCmd = testCmd.replace('test', 'run tests-only');
    } catch {}
  }

  // Split the test_command string into argv
  let [cmd, ...args] = parseCommand(testCmd);

  // If a venv exists, use it for Python commands (pytest, python, etc.)
  const venvBin = path.join(repoDir, '.venv', 'bin');
  if (fs.existsSync(venvBin) && (cmd === 'pytest' || cmd === 'python' || cmd === 'python3')) {
    const venvCmd = path.join(venvBin, cmd);
    if (fs.existsSync(venvCmd)) {
      cmd = venvCmd;
    }
  }

  const start = Date.now();
  let exitCode;
  let testOutput = '';
  try {
    const result = await runCommandWithOutput(cmd, args, repoDir, resolvedLog, TIMEOUT_MS);
    exitCode = result.exitCode;
    testOutput = result.output;
  } catch (err) {
    exitCode = err.exitCode != null ? err.exitCode : 1;
    testOutput = err.output || '';
  }
  const timeSeconds = (Date.now() - start) / 1000;

  // Parse test counts from output
  const testCounts = parseTestCounts(testOutput);

  return {
    tests_passed: exitCode === 0,
    time_seconds: timeSeconds,
    exit_code: exitCode,
    diff_lines: diffLines,
    tests_total: testCounts.total,
    tests_ok: testCounts.passed,
    tests_failed: testCounts.failed,
    test_output: testOutput.slice(-3000), // last 3KB for retry feedback
  };
}

/**
 * Parse test pass/fail counts from test runner output.
 * Handles: node --test, borp, jest, pytest, vitest, mocha, tap.
 */
function parseTestCounts(output) {
  if (!output) return { total: 0, passed: 0, failed: 0 };

  // node --test / borp: "ℹ tests 2076" + "ℹ pass 2070" + "ℹ fail 2"
  const nodeTests = output.match(/tests\s+(\d+)/);
  const nodePass  = output.match(/pass\s+(\d+)/);
  const nodeFail  = output.match(/fail\s+(\d+)/);
  if (nodeTests && nodePass) {
    return {
      total:  parseInt(nodeTests[1]),
      passed: parseInt(nodePass[1]),
      failed: nodeFail ? parseInt(nodeFail[1]) : 0,
    };
  }

  // pytest: "2 passed, 1 failed" or "2 passed" or "1 failed"
  const pytestMatch = output.match(/(\d+)\s+passed(?:,\s+(\d+)\s+failed)?/);
  if (pytestMatch) {
    const passed = parseInt(pytestMatch[1]);
    const failed = pytestMatch[2] ? parseInt(pytestMatch[2]) : 0;
    return { total: passed + failed, passed, failed };
  }
  const pytestFail = output.match(/(\d+)\s+failed(?:,\s+(\d+)\s+passed)?/);
  if (pytestFail) {
    const failed = parseInt(pytestFail[1]);
    const passed = pytestFail[2] ? parseInt(pytestFail[2]) : 0;
    return { total: passed + failed, passed, failed };
  }

  // jest/vitest: "Tests:  2 passed, 1 failed, 3 total"
  const jestMatch = output.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+failed,\s+(\d+)\s+total/);
  if (jestMatch) {
    return { total: parseInt(jestMatch[3]), passed: parseInt(jestMatch[1]), failed: parseInt(jestMatch[2]) };
  }

  // TAP: "# pass  5" + "# fail  2"
  const tapPass = output.match(/#\s*pass\s+(\d+)/);
  const tapFail = output.match(/#\s*fail\s+(\d+)/);
  if (tapPass) {
    const passed = parseInt(tapPass[1]);
    const failed = tapFail ? parseInt(tapFail[1]) : 0;
    return { total: passed + failed, passed, failed };
  }

  return { total: 0, passed: 0, failed: 0 };
}

/**
 * Clone the fix commit and copy test files into the agent's working dir.
 * Non-fatal: if anything fails, scoring falls back to the existing tests.
 */
async function injectFixTests(repoDir, challenge) {
  const { execFileSync } = require('child_process');
  // Use the repo that's already cloned in repoDir — just check out fix commit in a temp copy
  const fixDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentelo-fix-'));
  try {
    // Copy the .git dir from repoDir so we don't need to re-clone
    execFileSync('cp', ['-r', path.join(repoDir, '.git'), path.join(fixDir, '.git')], { stdio: 'pipe' });
    execFileSync('git', ['checkout', '-f', challenge.fixCommit], { cwd: fixDir, stdio: 'pipe' });
    copyTestFiles(fixDir, fixDir, repoDir);
  } catch (err) {
    console.warn('[scorer] Warning: could not inject fix-commit tests:', err.message);
  } finally {
    try { fs.rmSync(fixDir, { recursive: true, force: true }); } catch (_) {}
  }
}

function isTestFile(relPath) {
  const p = relPath.toLowerCase().replace(/\\/g, '/');
  return (
    p.includes('/test/')   || p.includes('/tests/') ||
    p.includes('/spec/')   || p.includes('/specs/') ||
    p.includes('.test.')   || p.includes('.spec.')  ||
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

/**
 * Run a command, capture output, optionally pipe to log file.
 * @returns {Promise<{exitCode: number, output: string}>}
 */
function runCommandWithOutput(cmd, args, cwd, logFile, timeoutMs) {
  return new Promise((resolve, reject) => {
    let outStream = null;
    if (logFile && logFile !== '/dev/null') {
      try { outStream = fs.createWriteStream(logFile, { flags: 'a' }); } catch (_) {}
    }

    const child = spawn(cmd, args, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', d => {
      output += d;
      if (outStream) outStream.write(d);
    });
    child.stderr.on('data', d => {
      output += d;
      if (outStream) outStream.write(d);
    });

    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      if (outStream) outStream.end();
      err.exitCode = 1;
      err.output = output;
      reject(err);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (outStream) outStream.end();
      const exitCode = code != null ? code : 1;
      if (timedOut) {
        const err = new Error(`Command timed out after ${timeoutMs}ms`);
        err.exitCode = 124;
        err.output = output;
        return reject(err);
      }
      if (exitCode !== 0) {
        const err = new Error(`Command exited with code ${exitCode}`);
        err.exitCode = exitCode;
        err.output = output;
        return reject(err);
      }
      resolve({ exitCode, output });
    });
  });
}

/**
 * Run a command with spawn, optionally piping stdout+stderr to a log file.
 * Resolves with exit code on success (exit code 0), rejects otherwise.
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} cwd
 * @param {string|null} logFile - path to append output to, or null for /dev/null
 * @param {number} timeoutMs
 * @returns {Promise<number>} exit code
 */
function runCommand(cmd, args, cwd, logFile, timeoutMs) {
  return new Promise((resolve, reject) => {
    let outStream = null;
    if (logFile && logFile !== '/dev/null') {
      try {
        outStream = fs.createWriteStream(logFile, { flags: 'a' });
      } catch (_) {
        outStream = null;
      }
    }

    const child = spawn(cmd, args, {
      cwd,
      shell: false,
      stdio: outStream ? ['ignore', 'pipe', 'pipe'] : 'ignore',
    });

    if (outStream) {
      child.stdout.pipe(outStream, { end: false });
      child.stderr.pipe(outStream, { end: false });
    }

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      if (outStream) outStream.end();
      reject(Object.assign(err, { exitCode: 1 }));
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (outStream) outStream.end();
      const exitCode = code != null ? code : (signal ? 1 : 1);
      if (timedOut) {
        const err = new Error(`Command timed out after ${timeoutMs}ms`);
        err.exitCode = 124;
        return reject(err);
      }
      if (exitCode !== 0) {
        const err = new Error(`Command exited with code ${exitCode}`);
        err.exitCode = exitCode;
        return reject(err);
      }
      resolve(exitCode);
    });
  });
}

/**
 * Very simple shell-like command parser — handles quoted strings and bare tokens.
 * Does NOT support pipes, redirects, env vars, etc.
 * @param {string} commandStr
 * @returns {string[]}
 */
function parseCommand(commandStr) {
  const tokens = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < commandStr.length; i++) {
    const ch = commandStr[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === ' ' && !inSingle && !inDouble) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

module.exports = { score };
