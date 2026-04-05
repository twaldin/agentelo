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
async function score(diff, repoDir, challenge, logFile) {
  if (!diff || diff.trim() === '') {
    return { tests_passed: false, exit_code: 1, time_seconds: 0, diff_lines: 0 };
  }

  const diffLines = diff.split('\n').filter(l => /^[+-]/.test(l) && !/^[+-]{3}/.test(l)).length;

  // Write diff to a temp file
  const tmpDir = os.tmpdir();
  const tmpPatch = path.join(tmpDir, `agentelo-patch-${Date.now()}-${process.pid}.patch`);

  try {
    fs.writeFileSync(tmpPatch, diff, 'utf8');
  } catch (err) {
    return { tests_passed: false, exit_code: 1, time_seconds: 0, diff_lines: diffLines };
  }

  // Apply the diff
  try {
    await runCommand('git', ['apply', '--whitespace=fix', tmpPatch], repoDir, null, 30000);
  } catch (err) {
    return { tests_passed: false, exit_code: 1, time_seconds: 0, diff_lines: diffLines };
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

  // Split the test_command string into argv
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
 * Clone the fix commit and copy test files into the agent's working dir.
 * Non-fatal: if anything fails, scoring falls back to the existing tests.
 */
async function injectFixTests(repoDir, challenge) {
  const { execFileSync } = require('child_process');
  const fixDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentelo-fix-'));
  try {
    execFileSync('git', ['clone', '--quiet', challenge.repo, fixDir], { stdio: 'pipe' });
    execFileSync('git', ['checkout', '--quiet', challenge.fixCommit], { cwd: fixDir, stdio: 'pipe' });
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
