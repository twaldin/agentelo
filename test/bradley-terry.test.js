'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeRatings } = require('../core/bradley-terry');

function makeOutcomes(records) {
  const outcomes = new Map();
  for (const [a, b, wins, losses, draws] of records) {
    if (!outcomes.has(a)) outcomes.set(a, new Map());
    if (!outcomes.has(b)) outcomes.set(b, new Map());
    outcomes.get(a).set(b, { wins, losses, draws: draws || 0 });
    outcomes.get(b).set(a, { wins: losses, losses: wins, draws: draws || 0 });
  }
  return outcomes;
}

test('single player returns base rating', () => {
  const outcomes = new Map([['alice', new Map()]]);
  const ratings = computeRatings(outcomes);
  assert.equal(ratings.get('alice'), 1500);
});

test('dominant player rated higher', () => {
  const outcomes = makeOutcomes([
    ['alice', 'bob', 10, 0, 0],
  ]);
  const ratings = computeRatings(outcomes);
  assert.ok(ratings.get('alice') > ratings.get('bob'),
    `alice (${ratings.get('alice')}) should be > bob (${ratings.get('bob')})`);
});

test('equal records produce equal ratings', () => {
  const outcomes = makeOutcomes([
    ['alice', 'bob', 5, 5, 0],
  ]);
  const ratings = computeRatings(outcomes);
  assert.ok(Math.abs(ratings.get('alice') - ratings.get('bob')) < 1,
    `Should be equal: alice=${ratings.get('alice')} bob=${ratings.get('bob')}`);
});

test('draws count as half win/loss', () => {
  const outcomes = makeOutcomes([
    ['alice', 'bob', 0, 0, 10],
  ]);
  const ratings = computeRatings(outcomes);
  assert.ok(Math.abs(ratings.get('alice') - ratings.get('bob')) < 1,
    `All draws should produce equal ratings`);
});

test('transitive rankings are consistent', () => {
  // alice > bob > carol
  const outcomes = makeOutcomes([
    ['alice', 'bob', 8, 2, 0],
    ['bob', 'carol', 8, 2, 0],
    ['alice', 'carol', 9, 1, 0],
  ]);
  const ratings = computeRatings(outcomes);
  assert.ok(ratings.get('alice') > ratings.get('bob'), 'alice > bob');
  assert.ok(ratings.get('bob') > ratings.get('carol'), 'bob > carol');
});

test('ordering of input does not affect results', () => {
  const order1 = makeOutcomes([
    ['alice', 'bob', 7, 3, 0],
    ['bob', 'carol', 6, 4, 0],
    ['alice', 'carol', 8, 2, 0],
  ]);
  const order2 = makeOutcomes([
    ['carol', 'alice', 2, 8, 0],
    ['alice', 'bob', 7, 3, 0],
    ['carol', 'bob', 4, 6, 0],
  ]);
  const r1 = computeRatings(order1);
  const r2 = computeRatings(order2);
  for (const p of ['alice', 'bob', 'carol']) {
    assert.ok(Math.abs(r1.get(p) - r2.get(p)) < 0.1,
      `${p}: order1=${r1.get(p)} order2=${r2.get(p)}`);
  }
});

test('player who loses to everyone gets lowest rating', () => {
  const outcomes = makeOutcomes([
    ['alice', 'bob', 10, 0, 0],
    ['alice', 'carol', 10, 0, 0],
    ['bob', 'carol', 8, 2, 0],
  ]);
  const ratings = computeRatings(outcomes);
  assert.ok(ratings.get('alice') > ratings.get('bob'), 'alice > bob');
  assert.ok(ratings.get('bob') > ratings.get('carol'), 'bob > carol');
});

test('many players produce spread ratings', () => {
  // Ladder: p0 > p1 > p2 > p3 > p4
  const records = [];
  const players = ['p0', 'p1', 'p2', 'p3', 'p4'];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      records.push([players[i], players[j], 7, 3, 0]);
    }
  }
  const outcomes = makeOutcomes(records);
  const ratings = computeRatings(outcomes);
  for (let i = 0; i < players.length - 1; i++) {
    assert.ok(ratings.get(players[i]) > ratings.get(players[i + 1]),
      `${players[i]} (${ratings.get(players[i])}) > ${players[i + 1]} (${ratings.get(players[i + 1])})`);
  }
});
