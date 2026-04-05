'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Load all result JSON files from a directory.
 * @param {string} resultsDir
 * @returns {object[]}
 */
function loadResults(resultsDir) {
  if (!fs.existsSync(resultsDir)) return [];
  const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json'));
  const results = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(resultsDir, file), 'utf8');
      results.push(JSON.parse(raw));
    } catch (_) {
      // skip malformed files
    }
  }
  return results;
}

/**
 * Sort results by started_at descending.
 * @param {object[]} results
 * @returns {object[]}
 */
function sortResultsByDate(results) {
  return results.slice().sort((a, b) => {
    const ta = a.started_at ? new Date(a.started_at).getTime() : 0;
    const tb = b.started_at ? new Date(b.started_at).getTime() : 0;
    return tb - ta;
  });
}

/**
 * Format results as a table string.
 * @param {object[]} results
 * @returns {string}
 */
function formatResultsTable(results) {
  const COL_RUN_ID = 36;
  const COL_CHALLENGE = 15;
  const COL_HARNESS = 13;
  const COL_MODEL = 21;
  const COL_PASS = 6;
  const COL_TIME = 8;

  const pad = (s, n) => String(s).padEnd(n);

  const header =
    pad('RUN ID', COL_RUN_ID) +
    pad('CHALLENGE', COL_CHALLENGE) +
    pad('HARNESS', COL_HARNESS) +
    pad('MODEL', COL_MODEL) +
    pad('PASS', COL_PASS) +
    pad('TIME', COL_TIME);

  const rows = results.map(r =>
    pad(r.run_id || '', COL_RUN_ID) +
    pad(r.challenge_id || '', COL_CHALLENGE) +
    pad(r.harness || '', COL_HARNESS) +
    pad(r.model || '', COL_MODEL) +
    pad(r.tests_passed ? 'YES' : 'NO', COL_PASS) +
    pad((r.time_seconds != null ? Math.round(r.time_seconds) + 's' : ''), COL_TIME)
  );

  return [header, ...rows].join('\n');
}

/**
 * Aggregate results by agent_hash for leaderboard.
 * @param {object[]} results
 * @returns {object[]} sorted leaderboard entries
 */
function aggregateLeaderboard(results) {
  const map = new Map();

  for (const r of results) {
    const key = r.agent_hash || 'unknown';
    if (!map.has(key)) {
      map.set(key, {
        agent_hash: key,
        harness: r.harness || '',
        model: r.model || '',
        total: 0,
        passed: 0,
        pass_times: [],
      });
    }
    const entry = map.get(key);
    entry.total += 1;
    if (r.tests_passed) {
      entry.passed += 1;
      if (r.time_seconds != null) {
        entry.pass_times.push(r.time_seconds);
      }
    }
  }

  const leaderboard = [];
  for (const entry of map.values()) {
    const pass_rate = entry.total > 0 ? Math.round((entry.passed / entry.total) * 100) : 0;
    const avg_time =
      entry.pass_times.length > 0
        ? Math.round(entry.pass_times.reduce((a, b) => a + b, 0) / entry.pass_times.length)
        : null;
    leaderboard.push({
      agent_hash: entry.agent_hash,
      harness: entry.harness,
      model: entry.model,
      challenges_attempted: entry.total,
      pass_rate,
      avg_time,
    });
  }

  // Sort by pass_rate desc, then avg_time asc (nulls last)
  leaderboard.sort((a, b) => {
    if (b.pass_rate !== a.pass_rate) return b.pass_rate - a.pass_rate;
    if (a.avg_time == null && b.avg_time == null) return 0;
    if (a.avg_time == null) return 1;
    if (b.avg_time == null) return -1;
    return a.avg_time - b.avg_time;
  });

  return leaderboard;
}

/**
 * Format leaderboard as a table string.
 * @param {object[]} leaderboard
 * @returns {string}
 */
function formatLeaderboardTable(leaderboard) {
  const COL_RANK = 6;
  const COL_HASH = 14;
  const COL_HARNESS = 13;
  const COL_MODEL = 21;
  const COL_PASS_RATE = 11;
  const COL_ATTEMPTS = 10;
  const COL_AVG_TIME = 10;

  const pad = (s, n) => String(s).padEnd(n);

  const header =
    pad('RANK', COL_RANK) +
    pad('AGENT HASH', COL_HASH) +
    pad('HARNESS', COL_HARNESS) +
    pad('MODEL', COL_MODEL) +
    pad('PASS RATE', COL_PASS_RATE) +
    pad('ATTEMPTS', COL_ATTEMPTS) +
    pad('AVG TIME', COL_AVG_TIME);

  const rows = leaderboard.map((entry, i) =>
    pad(i + 1, COL_RANK) +
    pad(entry.agent_hash, COL_HASH) +
    pad(entry.harness, COL_HARNESS) +
    pad(entry.model, COL_MODEL) +
    pad(entry.pass_rate + '%', COL_PASS_RATE) +
    pad(entry.challenges_attempted, COL_ATTEMPTS) +
    pad(entry.avg_time != null ? entry.avg_time + 's' : 'N/A', COL_AVG_TIME)
  );

  return [header, ...rows].join('\n');
}

module.exports = {
  loadResults,
  sortResultsByDate,
  formatResultsTable,
  aggregateLeaderboard,
  formatLeaderboardTable,
};
