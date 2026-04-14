'use strict';

const fs = require('fs');
const path = require('path');

const CHALLENGES_DIR = path.resolve(__dirname, '..', 'challenges');
const metaCache = new Map();
const baselineCache = new Map();

function getChallengePath(challengeId) {
  if (!challengeId) return null;
  return path.join(CHALLENGES_DIR, `${challengeId}.json`);
}

function getChallengeMeta(challengeId) {
  const cached = metaCache.get(challengeId);
  if (cached !== undefined) return cached;

  const p = getChallengePath(challengeId);
  if (!p) {
    metaCache.set(challengeId, null);
    baselineCache.set(challengeId, { baseline_passing: null, broken_by_bug: null });
    return null;
  }

  try {
    const meta = JSON.parse(fs.readFileSync(p, 'utf8'));
    metaCache.set(challengeId, meta);
    baselineCache.set(challengeId, {
      baseline_passing: meta.baseline_passing != null ? meta.baseline_passing : null,
      broken_by_bug: meta.broken_by_bug != null ? meta.broken_by_bug : null,
    });
    return meta;
  } catch (_) {
    metaCache.set(challengeId, null);
    baselineCache.set(challengeId, { baseline_passing: null, broken_by_bug: null });
    return null;
  }
}

function getChallengeBaseline(challengeId) {
  if (baselineCache.has(challengeId)) return baselineCache.get(challengeId);

  const meta = getChallengeMeta(challengeId);
  if (meta) {
    return {
      baseline_passing: meta.baseline_passing != null ? meta.baseline_passing : null,
      broken_by_bug: meta.broken_by_bug != null ? meta.broken_by_bug : null,
    };
  }

  const empty = { baseline_passing: null, broken_by_bug: null };
  baselineCache.set(challengeId, empty);
  return empty;
}

module.exports = {
  CHALLENGES_DIR,
  getChallengeMeta,
  getChallengeBaseline,
};

