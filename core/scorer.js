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
 * @param {{patchAlreadyApplied?: boolean}} [options] - Scoring options
 * @returns {Promise<{tests_passed: boolean, time_seconds: number, exit_code: number, diff_lines: number}>}
 */
/**
 * Strip test file hunks from a unified diff.
 * Only keep changes to non-test files so agents can't inflate scores by adding tests.
 */
function stripTestFiles(diff) {
  const testPatterns = ['/test/', '/tests/', '/__tests__/', '.test.', '.spec.', '_test.', 'test_'];
  const testPrefixes = ['test/', 'tests/', '__tests__/'];
  // Agent artifacts that should be stripped (aider gitignore, scratch files, configs)
  const artifactExact = ['.gitignore', '.aider.tags.cache.v3', '.aider.chat.history.md', '.aider.input.history'];
  const artifactPatterns = ['.aider'];
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
    const fileName = filePath.split('/').pop();
    const isTest = testPatterns.some(p => filePath.includes(p)) || testPrefixes.some(p => filePath.startsWith(p));
    const isArtifact = artifactExact.includes(fileName) || artifactPatterns.some(p => fileName.includes(p));
    // Strip agent scratch files at repo root that aren't project source
    // Only strip files we're SURE are junk: hello.py (aider creates empty), obvious scratch names
    const isRootFile = !filePath.includes('/');
    const scratchNames = ['hello.py', 'fix.py', 'solution.py', 'debug.py', 'scratch.py', 'temp.py'];
    const isScratch = isRootFile && scratchNames.includes(fileName);
    if (!isTest && !isArtifact && !isScratch) kept.push(chunk);
  }
  return kept.join('');
}

async function score(diff, repoDir, challenge, logFile, options = {}) {
  if (!diff || diff.trim() === '') {
    return { tests_passed: false, exit_code: 1, time_seconds: 0, diff_lines: 0, warnings: [], test_error: 'EMPTY_DIFF' };
  }

  // Strip test file changes from the diff — only score code changes.
  const strippedDiff = stripTestFiles(diff);
  if (!strippedDiff || strippedDiff.trim() === '') {
    return { tests_passed: false, exit_code: 1, time_seconds: 0, diff_lines: 0, warnings: [], test_error: 'DIFF_ONLY_TESTS_OR_ARTIFACTS' };
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

  // Apply the diff unless the caller already materialized the agent's changes.
  // bin/agentelo copies changed files into the clean scoring dir to preserve
  // untracked source additions, so re-applying the git diff there can create
  // false "apply failed" warnings against an already-patched tree.
  let applyFailed = false;
  if (!options.patchAlreadyApplied) {
    try {
      await runCommand('git', ['apply', '--whitespace=fix', tmpPatch], repoDir, null, 30000);
    } catch (err) {
      console.error('[scorer] git apply FAILED:', err.message?.slice(0, 200));
      try {
        await runCommand('git', ['apply', '--3way', tmpPatch], repoDir, null, 30000);
        console.log('[scorer] git apply --3way succeeded');
      } catch (err2) {
        console.error('[scorer] git apply --3way also FAILED:', err2.message?.slice(0, 200));
        try {
          await runCommand('git', ['apply', '--reject', '--whitespace=fix', tmpPatch], repoDir, null, 30000);
          console.log('[scorer] git apply --reject applied partial patch');
        } catch (err3) {
          console.error('[scorer] git apply --reject also FAILED');
          applyFailed = true;
        }
      }
    }
  }
  try { fs.unlinkSync(tmpPatch); } catch (_) {}
  // Track scoring integrity — any failure here means the score may be wrong
  const warnings = [];

  if (applyFailed) {
    warnings.push('DIFF_APPLY_FAILED');
    console.error('[scorer] ⚠ DIFF APPLY FAILED — refusing to score an unpatched tree');
    return {
      tests_passed: false,
      exit_code: 1,
      time_seconds: 0,
      diff_lines: diffLines,
      tests_total: 0,
      tests_ok: 0,
      tests_failed: 0,
      test_error: 'DIFF_APPLY_FAILED',
      test_output: '',
      warnings,
    };
  }

  // Re-install Python package so venv picks up the agent's code changes.
  // Without this, pytest imports from the pre-diff installed copy in .venv/,
  // not the modified src/ — making the agent's fix invisible to tests.
  const venvPython = path.join(repoDir, '.venv', 'bin', 'python');
  if (fs.existsSync(venvPython) && (fs.existsSync(path.join(repoDir, 'pyproject.toml')) || fs.existsSync(path.join(repoDir, 'setup.py')))) {
    try {
      const { execFileSync } = require('child_process');
      execFileSync('uv', ['pip', 'install', '.', '--python', venvPython], { cwd: repoDir, stdio: 'pipe', timeout: 120000 });
    } catch (err) {
      warnings.push('PYTHON_REINSTALL_FAILED');
      console.error('[scorer] ⚠ PYTHON REINSTALL FAILED — venv has stale code:', err.message?.slice(0, 100));
    }
  }

  // Force-reset all test paths to the baseline buggy_commit state.
  // Belt-and-suspenders anti-tampering: even if the agent slipped test
  // files through stripTestFiles/isTestFile (gaps for spec/, bench/,
  // pytest.ini, jest.config.*, __snapshots__/, conftest.py, etc.),
  // this step guarantees the final test tree = buggy_commit tests + fix-PR hunks.
  resetTestPathsToBaseline(repoDir);

  // Inject fix-commit test files so we score against the PR's test suite
  let testInjected = false;
  if (challenge.fixDiff || challenge.fixCommit) {
    testInjected = await injectFixTests(repoDir, challenge);
    if (!testInjected) {
      warnings.push('TEST_INJECTION_FAILED');
      console.error('[scorer] ⚠ TEST INJECTION FAILED — scoring with original tests (score may equal baseline)');
    }
  }

  // Resolve log file destination
  const resolvedLog = logFile || '/dev/null';

  // Run the test command
  const TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes (most test suites finish in <60s, fastify in ~90s)

  // Skip lint/coverage wrappers — find the fastest pure test command
  // Read package.json to find a direct test script (avoids lint/coverage overhead)
  let testCmd = challenge.test_command;
  if (testCmd === 'npm test' || testCmd === 'pnpm test') {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(repoDir, 'package.json'), 'utf8'));
      const s = pkg.scripts || {};
      const nmBinDir = path.join(repoDir, 'node_modules', '.bin');
      if (s.unit) {
        testCmd = testCmd.replace('test', 'run unit');
      } else if (s['tests-only']) {
        const testsOnlyScript = s['tests-only'];
        const scriptBin = (testsOnlyScript || '').split(/\s+/)[0];
        const binExists = !scriptBin || scriptBin === 'node' || scriptBin === 'npx' ||
          fs.existsSync(path.join(nmBinDir, scriptBin));
        if (binExists) {
          testCmd = testCmd.replace('test', 'run tests-only');
        } else {
          // Binary missing (e.g. nyc) — try to strip it and run the underlying command
          // "nyc tape 'test/**/*.js'" → "tape 'test/**/*.js'" if tape is available
          const parts = testsOnlyScript.split(/\s+/);
          for (let i = 1; i < parts.length; i++) {
            const fallbackBin = parts[i].replace(/['"]/g, '');
            if (fallbackBin.startsWith('-') || fallbackBin.startsWith('.') || fallbackBin.startsWith('/')) continue;
            if (fallbackBin === 'node' || fs.existsSync(path.join(nmBinDir, fallbackBin))) {
              // Found a usable binary — run tests-only but with npx to skip the missing wrapper
              testCmd = 'npx ' + parts.slice(i).join(' ');
              console.log(`[scorer] Stripped missing '${scriptBin}' wrapper, using: ${testCmd}`);
              break;
            }
          }
          // If still npm test, try 'node test' as last resort (common in qs-style repos)
          if (testCmd === 'npm test' && fs.existsSync(path.join(repoDir, 'test'))) {
            testCmd = 'node test';
            console.log('[scorer] Fallback to: node test');
          }
        }
      }
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

  // Override strict warning filters (e.g. click's filterwarnings=["error"])
  // so agent code with SyntaxWarnings (like '\:' on Python 3.12) doesn't crash
  // the test runner during collection. Tests should always RUN, not crash on import.
  const isPytest = testCmd.includes('pytest');
  if (isPytest) {
    args.push('-W', 'default::SyntaxWarning', '-W', 'default::DeprecationWarning');
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

  if (warnings.length > 0) {
    console.error('[scorer] Scoring completed with warnings: ' + warnings.join(', '));
  }
  if (testCounts.error) {
    console.error('[scorer] Test error: ' + testCounts.error);
  }

  return {
    tests_passed: exitCode === 0,
    time_seconds: timeSeconds,
    exit_code: exitCode,
    diff_lines: diffLines,
    tests_total: testCounts.total,
    tests_ok: testCounts.passed,
    tests_failed: testCounts.failed,
    test_error: testCounts.error || null,
    test_output: testOutput.slice(-8000), // last 8KB — enough for summary lines
    warnings,
  };
}

/**
 * Parse test pass/fail counts from test runner output.
 * Handles: node --test, borp, jest, pytest, vitest, mocha, tap.
 */
function parseTestCounts(output) {
  if (!output) return { total: 0, passed: 0, failed: 0, error: 'NO_OUTPUT' };

  // node --test / borp summary: "ℹ tests 2076" + "ℹ pass 2070" + "ℹ fail 2"
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

  // NOTE: removed ✔/✗ fallback — it double-counts because node --test prints
  // ✔/✗ for both individual tests AND suite summaries at every nesting level.
  // If ℹ summary is missing, the run likely crashed; fall through to other parsers.

  // pytest full summary: "3 failed, 870 passed, 22 skipped, 1 error in 0.95s"
  const pytestPassed = output.match(/(\d+)\s+passed/);
  const pytestFailed = output.match(/(\d+)\s+failed/);
  const pytestError  = output.match(/(\d+)\s+error/);
  if (pytestPassed || pytestFailed || pytestError) {
    const passed = pytestPassed ? parseInt(pytestPassed[1]) : 0;
    const failed = pytestFailed ? parseInt(pytestFailed[1]) : 0;
    const errors = pytestError  ? parseInt(pytestError[1])  : 0;
    return { total: passed + failed + errors, passed, failed: failed + errors,
             ...(errors > 0 ? { error: `PYTEST_ERRORS:${errors}` } : {}) };
  }

  // pytest collection failure: "Interrupted: 2 errors during collection"
  const collectionError = output.match(/(\d+)\s+errors?\s+during\s+collection/);
  if (collectionError) {
    const errors = parseInt(collectionError[1]);
    return { total: errors, passed: 0, failed: errors, error: `COLLECTION_ERROR:${errors}` };
  }

  // jest/vitest: "Tests:  2 passed, 1 failed, 3 total"
  const jestMatch = output.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+failed,\s+(\d+)\s+total/);
  if (jestMatch) {
    return { total: parseInt(jestMatch[3]), passed: parseInt(jestMatch[1]), failed: parseInt(jestMatch[2]) };
  }

  // TAP: "# pass  5" + "# fail  2" + "# ok" (total)
  const tapPass = output.match(/#\s*pass\s+(\d+)/);
  const tapFail = output.match(/#\s*fail\s+(\d+)/);
  if (tapPass) {
    const passed = parseInt(tapPass[1]);
    const failed = tapFail ? parseInt(tapFail[1]) : 0;
    return { total: passed + failed, passed, failed };
  }

  // TAP fallback: count individual "ok N" / "not ok N" lines
  const tapOks = output.match(/^ok\s+\d+/gm);
  const tapNotOks = output.match(/^not ok\s+\d+/gm);
  if (tapOks || tapNotOks) {
    const passed = tapOks ? tapOks.length : 0;
    const failed = tapNotOks ? tapNotOks.length : 0;
    return { total: passed + failed, passed, failed };
  }

  // Node.js crash: look for common crash indicators
  const hasCrash = /SyntaxError|ReferenceError|TypeError|ImportError|ModuleNotFoundError|Cannot find module|ERR_MODULE_NOT_FOUND|FATAL ERROR/i.test(output);
  if (hasCrash) {
    // Extract the error type
    const errMatch = output.match(/(SyntaxError|ReferenceError|TypeError|Error):\s*(.{0,80})/);
    const errMsg = errMatch ? errMatch[0].slice(0, 100) : 'unknown crash';
    return { total: 1, passed: 0, failed: 1, error: `CRASH:${errMsg}` };
  }

  // Last resort: if exit code was non-zero and we got output, something failed
  // Return error so caller knows parsing failed, not that tests passed
  return { total: 0, passed: 0, failed: 0, error: 'UNPARSEABLE:' + output.slice(-100).replace(/\n/g, ' ').trim() };
}

/**
 * Extract test-file hunks from the fix diff and apply them to the scoring dir.
 * This is more reliable than checking out the fix commit (which fails with partial clones).
 * Non-fatal: if anything fails, scoring falls back to the existing tests.
 */
async function injectFixTests(repoDir, challenge) {
  const { execFileSync } = require('child_process');

  // Prefer fixDiff (stored in challenge JSON) — no git checkout needed
  if (challenge.fixDiff) {
    const testDiff = extractTestHunks(challenge.fixDiff);
    if (testDiff) {
      const tmpPatch = path.join(os.tmpdir(), `agentelo-testpatch-${Date.now()}-${process.pid}.patch`);
      try {
        fs.writeFileSync(tmpPatch, testDiff, 'utf8');
        execFileSync('git', ['apply', '--whitespace=fix', tmpPatch], { cwd: repoDir, stdio: 'pipe' });
        console.log('[scorer] Injected fix-PR test hunks from fixDiff');
        return true;
      } catch (err) {
        // Try --3way fallback
        try {
          execFileSync('git', ['apply', '--3way', tmpPatch], { cwd: repoDir, stdio: 'pipe' });
          console.log('[scorer] Injected fix-PR test hunks from fixDiff (--3way)');
          return true;
        } catch (err2) {
          console.error('[scorer] ⚠ TEST INJECTION FAILED — scoring without PR tests (agent fix may not be measured):', err2.message?.slice(0, 200));
        }
      } finally {
        try { fs.unlinkSync(tmpPatch); } catch (_) {}
      }
    }
  }

  // Fallback: checkout fix commit and copy test files (original method)
  if (challenge.fixCommit) {
    const fixDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentelo-fix-'));
    try {
      execFileSync('cp', ['-r', path.join(repoDir, '.git'), path.join(fixDir, '.git')], { stdio: 'pipe' });
      execFileSync('git', ['checkout', '-f', challenge.fixCommit], { cwd: fixDir, stdio: 'pipe' });
      copyTestFiles(fixDir, fixDir, repoDir);
      console.log('[scorer] Injected fix-commit test files (fallback method)');
      return true;
    } catch (err) {
      console.error('[scorer] ⚠ TEST INJECTION FAILED (fallback):', err.message?.slice(0, 200));
    } finally {
      try { fs.rmSync(fixDir, { recursive: true, force: true }); } catch (_) {}
    }
  }

  console.error('[scorer] ⚠ NO TEST INJECTION SUCCEEDED — scoring with original tests only');
  return false;
}

/**
 * Force-reset all test paths in repoDir to the current HEAD state (buggy_commit).
 * This is the anti-tampering guarantee: regardless of what the agent did or what
 * slipped through our diff/copy filters, the test tree is restored to baseline
 * before we apply fix-PR test hunks and run the suite.
 *
 * Covers test directories, test config files, snapshots, and fixture/conftest files.
 * Uses `git checkout HEAD -- <path>` to restore modified tracked files, and
 * `git clean -fd <path>` to remove agent-added new files within test paths.
 */
function resetTestPathsToBaseline(repoDir) {
  const { execFileSync } = require('child_process');

  // Directories: restore tracked + remove untracked
  const TEST_DIRS = [
    'test', 'tests', '__tests__', 'spec', 'bench', '__bench__', 'e2e', '__snapshots__',
  ];
  // Individual files (checkout-only; no untracked-delete needed)
  const TEST_CONFIG_FILES = [
    'pytest.ini', 'setup.cfg', 'tox.ini', 'conftest.py',
    'jest.config.js', 'jest.config.ts', 'jest.config.mjs', 'jest.config.cjs', 'jest.config.json',
    'mocha.opts', '.mocharc.js', '.mocharc.cjs', '.mocharc.json', '.mocharc.yml', '.mocharc.yaml',
    'vitest.config.js', 'vitest.config.ts', 'vitest.config.mjs',
    'tap.js', '.tape.js', '.taprc',
  ];

  let resetCount = 0;
  for (const dir of TEST_DIRS) {
    const dirPath = path.join(repoDir, dir);
    if (!fs.existsSync(dirPath)) continue;
    try {
      execFileSync('git', ['checkout', 'HEAD', '--', dir], { cwd: repoDir, stdio: 'pipe' });
      execFileSync('git', ['clean', '-fd', '--', dir], { cwd: repoDir, stdio: 'pipe' });
      resetCount++;
    } catch (_) { /* path may not be tracked; skip */ }
  }

  for (const file of TEST_CONFIG_FILES) {
    const filePath = path.join(repoDir, file);
    if (!fs.existsSync(filePath)) continue;
    try {
      execFileSync('git', ['checkout', 'HEAD', '--', file], { cwd: repoDir, stdio: 'pipe' });
      resetCount++;
    } catch (_) { /* not tracked; skip */ }
  }

  // Also clean up root-level test files matching name patterns (e.g. foo.test.js at root)
  try {
    const rootFiles = fs.readdirSync(repoDir);
    for (const f of rootFiles) {
      const fl = f.toLowerCase();
      const isTestNamed = /\.(test|spec)\.[a-z]+$/.test(fl) || /^test_/.test(fl) || /_test\.[a-z]+$/.test(fl);
      if (!isTestNamed) continue;
      try {
        execFileSync('git', ['checkout', 'HEAD', '--', f], { cwd: repoDir, stdio: 'pipe' });
      } catch (_) {
        // Untracked: delete it
        try { fs.unlinkSync(path.join(repoDir, f)); } catch (_) {}
      }
    }
  } catch (_) {}

  if (resetCount > 0) {
    console.log(`[scorer] Reset ${resetCount} test path(s) to buggy_commit state`);
  }
}

/**
 * Extract only test-file hunks from a unified diff.
 * Returns a new diff containing only changes to test files, or null if none found.
 */
function extractTestHunks(diff) {
  if (!diff) return null;
  const chunks = diff.split(/^(diff --git )/m);
  const kept = [];
  for (let i = 0; i < chunks.length; i++) {
    if (!chunks[i].startsWith('diff --git ')) continue;
    const chunk = chunks[i] + (chunks[i + 1] || '');
    i++;
    const fileMatch = chunk.match(/^diff --git a\/(\S+)/);
    if (!fileMatch) continue;
    const filePath = fileMatch[1].toLowerCase();
    const testPatterns = ['/test/', '/tests/', '/__tests__/', '.test.', '.spec.', '_test.', 'test_'];
    const testPrefixes = ['test/', 'tests/', '__tests__/'];
    const isTest = testPatterns.some(p => filePath.includes(p)) || testPrefixes.some(p => filePath.startsWith(p));
    if (isTest) kept.push(chunk);
  }
  return kept.length > 0 ? kept.join('') : null;
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

    // Add node_modules/.bin and .venv/bin to PATH so tools like nyc, tape, pytest work
    const env = { ...process.env };
    const nmBin = path.join(cwd, 'node_modules', '.bin');
    if (fs.existsSync(nmBin)) {
      env.PATH = nmBin + ':' + (env.PATH || '');
    }
    const venvBin = path.join(cwd, '.venv', 'bin');
    if (fs.existsSync(venvBin)) {
      env.PATH = venvBin + ':' + (env.PATH || '');
      env.VIRTUAL_ENV = path.join(cwd, '.venv');
    }

    const child = spawn(cmd, args, {
      cwd,
      shell: false,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true, // Create new process group so we can kill all children
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
    const timer = setTimeout(() => {
      timedOut = true;
      // Kill the entire process group (borp/npm spawns child processes that outlive the parent)
      // Kill the entire process tree — borp/npm spawn grandchild processes in separate groups
      try {
        require('child_process').execSync(`pkill -9 -P ${child.pid}`, { stdio: 'ignore' });
      } catch (_) {}
      try { process.kill(-child.pid, 'SIGKILL'); } catch (_) {}
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      if (outStream) outStream.end();
      err.exitCode = 1;
      err.output = output;
      reject(err);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      // Kill any remaining grandchild processes (borp test workers)
      try { require('child_process').execSync(`pkill -9 -P ${child.pid}`, { stdio: 'ignore' }); } catch (_) {}
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

module.exports = { score, stripTestFiles };
