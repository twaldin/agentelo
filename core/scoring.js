'use strict';

function getFixedTests(submission = {}, baselinePassing = 0) {
  return (submission.tests_ok || 0) - baselinePassing;
}

/**
 * Compute game score between two submissions using baseline-relative tests-fixed.
 * Rules:
 *  - More fixed tests wins
 *  - Same fixed count -> draw (including both non-positive)
 *  - Tiebreak on both solving ALL broken tests, using cost then time
 */
function computeScore(a = {}, b = {}, options = {}) {
  const baselinePassing = options.baseline_passing ?? 0;
  const brokenByBug = options.broken_by_bug ?? 0;

  const aFixed = getFixedTests(a, baselinePassing);
  const bFixed = getFixedTests(b, baselinePassing);

  if (aFixed > bFixed) return 1;
  if (aFixed < bFixed) return 0;

  // Same fixed count
  if (aFixed <= 0 && bFixed <= 0) return 0.5;

  const bothPerfect = brokenByBug > 0 && aFixed >= brokenByBug && bFixed >= brokenByBug;
  if (!bothPerfect) return 0.5;

  const aCost = a.cost_usd || 0;
  const bCost = b.cost_usd || 0;
  if (aCost > 0 && bCost > 0) {
    if (aCost < bCost) return 1;
    if (aCost > bCost) return 0;
  } else {
    const aTime = a.agent_time_seconds || 0;
    const bTime = b.agent_time_seconds || 0;
    if (aTime < bTime) return 1;
    if (aTime > bTime) return 0;
  }

  return 0.5;
}

module.exports = {
  getFixedTests,
  computeScore,
};

