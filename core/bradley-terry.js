'use strict';

/**
 * Bradley-Terry model for pairwise rankings.
 *
 * Given a set of pairwise outcomes (wins, losses, draws),
 * computes a maximum-likelihood strength parameter for each player.
 * No ordering dependency — all outcomes are solved simultaneously.
 *
 * Output ratings are scaled to an ELO-like range (mean 1500, spread ~400-2500)
 * for display compatibility.
 */

const ELO_SCALE = 400; // points per 10x strength difference
const BASE_RATING = 1500;
const MAX_ITERATIONS = 200;
const CONVERGENCE = 1e-6;

/**
 * Compute Bradley-Terry ratings from pairwise outcomes.
 *
 * @param {Map<string, Map<string, { wins: number, losses: number, draws: number }>>} outcomes
 *   outcomes.get(a).get(b) = { wins, losses, draws } for a vs b
 *   Draws count as 0.5 win + 0.5 loss for both sides.
 * @returns {Map<string, number>} agentId → ELO-scaled rating
 */
function computeRatings(outcomes) {
  const players = [...outcomes.keys()];
  const n = players.length;
  if (n === 0) return new Map();
  if (n === 1) return new Map([[players[0], BASE_RATING]]);

  const idx = new Map(players.map((p, i) => [p, i]));

  // Build win matrix: W[i][j] = effective wins of i over j
  // Draws count as 0.5 for each side
  const W = Array.from({ length: n }, () => new Float64Array(n));
  for (const [a, opps] of outcomes) {
    const i = idx.get(a);
    for (const [b, record] of opps) {
      const j = idx.get(b);
      if (j === undefined) continue;
      W[i][j] = record.wins + record.draws * 0.5;
    }
  }

  // Total games for each pair: N[i][j] = W[i][j] + W[j][i]
  const N = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const total = W[i][j] + W[j][i];
      N[i][j] = total;
      N[j][i] = total;
    }
  }

  // Initialize strength parameters (all equal)
  const p = new Float64Array(n).fill(1.0);

  // Iterative MM algorithm (minorization-maximization)
  // Update rule: p_i = (total wins of i) / sum_j(N[i][j] / (p_i + p_j))
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const pOld = Float64Array.from(p);

    for (let i = 0; i < n; i++) {
      let totalWins = 0;
      let denom = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        totalWins += W[i][j];
        if (N[i][j] > 0) {
          denom += N[i][j] / (pOld[i] + pOld[j]);
        }
      }
      if (denom > 0 && totalWins > 0) {
        p[i] = totalWins / denom;
      } else {
        // No wins at all — set to minimum strength
        p[i] = 1e-10;
      }
    }

    // Normalize so geometric mean = 1 (prevents drift)
    const logMean = p.reduce((s, v) => s + Math.log(Math.max(v, 1e-300)), 0) / n;
    const scale = Math.exp(logMean);
    for (let i = 0; i < n; i++) p[i] /= scale;

    // Check convergence
    let maxDiff = 0;
    for (let i = 0; i < n; i++) {
      const diff = Math.abs(p[i] - pOld[i]) / Math.max(pOld[i], 1e-10);
      if (diff > maxDiff) maxDiff = diff;
    }
    if (maxDiff < CONVERGENCE) break;
  }

  // Convert to ELO scale: rating = BASE + ELO_SCALE * log10(p)
  const ratings = new Map();
  for (let i = 0; i < n; i++) {
    const elo = BASE_RATING + ELO_SCALE * Math.log10(Math.max(p[i], 1e-300));
    ratings.set(players[i], elo);
  }

  return ratings;
}

module.exports = { computeRatings };
