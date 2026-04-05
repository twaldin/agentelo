'use strict';

const SCALE   = 173.7178;   // converts between Glicko-1 and Glicko-2 internal scales
const TAU     = 0.5;        // system constant — controls how fast volatility changes
const EPSILON = 0.000001;   // convergence tolerance for Illinois algorithm

function defaultRating() {
  return { rating: 1500, rd: 350, volatility: 0.06 };
}

// g(φ) — reduces influence of opponents with high RD
function _g(phi) {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

// E(μ, μj, φj) — expected score against opponent
function _E(mu, muj, phij) {
  return 1 / (1 + Math.exp(-_g(phij) * (mu - muj)));
}

/**
 * Update a rating given a list of game outcomes in a single rating period.
 * @param {{ rating: number, rd: number, volatility: number }} current
 * @param {Array<{ opponentRating: number, opponentRd: number, score: number }>} games
 *   score: 1 = win, 0.5 = draw, 0 = loss
 * @returns {{ rating: number, rd: number, volatility: number }}
 */
function updateRating(current, games) {
  if (games.length === 0) {
    return { ...current };
  }

  // Step 1: convert to Glicko-2 internal scale
  const mu    = (current.rating - 1500) / SCALE;
  const phi   = current.rd / SCALE;
  const sigma = current.volatility;

  // Step 2: compute g, E for each game
  const gameData = games.map(g => {
    const muj  = (g.opponentRating - 1500) / SCALE;
    const phij = g.opponentRd / SCALE;
    const gj   = _g(phij);
    const Ej   = _E(mu, muj, phij);
    return { gj, Ej, sj: g.score };
  });

  // Step 3: estimated variance v
  const v = 1 / gameData.reduce((sum, { gj, Ej }) => sum + gj * gj * Ej * (1 - Ej), 0);

  // Step 4: estimated improvement Δ
  const Delta = v * gameData.reduce((sum, { gj, Ej, sj }) => sum + gj * (sj - Ej), 0);

  // Step 5: update volatility σ' via Illinois algorithm
  function f(x) {
    const ex  = Math.exp(x);
    const num = ex * (Delta * Delta - phi * phi - v - ex);
    const den = 2 * Math.pow(phi * phi + v + ex, 2);
    return num / den - (x - Math.log(sigma * sigma)) / (TAU * TAU);
  }

  let A = Math.log(sigma * sigma);
  let B;
  if (Delta * Delta > phi * phi + v) {
    B = Math.log(Delta * Delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(A - k * TAU) < 0) k++;
    B = A - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPSILON) {
    const C  = A + (A - B) * fA / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B; fA = fB;
    } else {
      fA /= 2;
    }
    B = C; fB = fC;
  }
  const sigmaPrime = Math.exp(A / 2);

  // Step 6: pre-rating-period RD
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);

  // Step 7: new rating and RD
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime  = mu + phiPrime * phiPrime * gameData.reduce((sum, { gj, Ej, sj }) => sum + gj * (sj - Ej), 0);

  // Step 8: convert back to Glicko-1 scale
  return {
    rating:     SCALE * muPrime + 1500,
    rd:         SCALE * phiPrime,
    volatility: sigmaPrime,
  };
}

module.exports = { updateRating, defaultRating };
