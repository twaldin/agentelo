'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { updateRating, defaultRating } = require('../core/glicko2');

test('defaultRating returns 1500/350/0.06', () => {
  const r = defaultRating();
  assert.equal(r.rating, 1500);
  assert.equal(r.rd, 350);
  assert.equal(r.volatility, 0.06);
});

test('beating a 1500-rated opponent raises rating', () => {
  const current = { rating: 1500, rd: 200, volatility: 0.06 };
  const after = updateRating(current, [
    { opponentRating: 1500, opponentRd: 200, score: 1 },
  ]);
  assert.ok(after.rating > current.rating, `Expected ${after.rating} > ${current.rating}`);
  assert.ok(after.rd < current.rd, `Expected rd to decrease: ${after.rd} < ${current.rd}`);
});

test('losing to a 1500-rated opponent lowers rating', () => {
  const current = { rating: 1500, rd: 200, volatility: 0.06 };
  const after = updateRating(current, [
    { opponentRating: 1500, opponentRd: 200, score: 0 },
  ]);
  assert.ok(after.rating < current.rating);
});

test('draw against equal-rated opponent barely changes rating', () => {
  const current = { rating: 1500, rd: 200, volatility: 0.06 };
  const after = updateRating(current, [
    { opponentRating: 1500, opponentRd: 200, score: 0.5 },
  ]);
  assert.ok(Math.abs(after.rating - current.rating) < 5, `Draw should barely change rating: delta=${after.rating - current.rating}`);
});

test('high RD agent converges faster (more rating change)', () => {
  const high = { rating: 1500, rd: 350, volatility: 0.06 };
  const low  = { rating: 1500, rd: 50,  volatility: 0.06 };
  const game = [{ opponentRating: 1800, opponentRd: 100, score: 1 }];
  const afterHigh = updateRating(high, game);
  const afterLow  = updateRating(low, game);
  assert.ok(
    Math.abs(afterHigh.rating - 1500) > Math.abs(afterLow.rating - 1500),
    'High RD should change more'
  );
});

test('multiple wins push rating up significantly', () => {
  const current = { rating: 1500, rd: 200, volatility: 0.06 };
  const games = Array(5).fill({ opponentRating: 1600, opponentRd: 150, score: 1 });
  const after = updateRating(current, games);
  assert.ok(after.rating > 1600, `After 5 wins vs 1600-rated: ${after.rating}`);
});
