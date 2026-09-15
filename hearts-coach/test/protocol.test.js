const test = require('node:test');
const assert = require('node:assert/strict');
global.HeartsCoach = require('../src/engine.js');
const P = require('../src/protocol.js');

// Verbatim message shapes captured from letsplayhearts.com.
const LINES = [
  ['received network message {"cmd":"waiting_for","waitingFor":[1,0,0,1]}', 'in'],
  ['sending message: {"cards":{"cards":"9H 10H JC"},"cmd":"pass"}', 'out'],
  ['received network message {"cmd":"pass","err":0,"response":true}', 'in'],
  ['received network message {"cards":{"cards":"KS QH JH"},"cmd":"cards_were_passed","hand":{"cards":"2C 6C 9C 10C JC KC AC 5D 6D 4S JS 2H 10H"}}', 'in'],
  ['received network message {"animate":true,"card":"2C","clearDirection":1,"clearTable":false,"cmd":"card_was_played","pid":0,"wasBrokenID":-1}', 'in'],
  ['animating {animate: true, card: 2C, clearDirection: 1, cmd: card_was_played, pid: 0}, wait time 300', 'in'],
  ['received network message {"animate":true,"card":"5C","clearDirection":2,"clearTable":false,"cmd":"card_was_played","pid":1,"wasBrokenID":-1}', 'in'],
];
for (const [l, d] of LINES) P.feed(l, d);

test('reads the post-pass hand out of cards_were_passed', () => {
  assert.equal(P.state.hand.length, 13);
  assert.equal(P.state.hand.map(c => c.id).join(' '), '2C 6C 9C TC JC KC AC 5D 6D 4S JS 2H TH');
});

test('captures what we passed and what came back', () => {
  assert.equal(P.state.passed.map(c => c.id).join(' '), '9H TH JC');
  assert.equal(P.state.received.map(c => c.id).join(' '), 'KS QH JH');
});

test('recognises card_was_played, keyed on pid', () => {
  const plays = P.state.plays;
  assert.ok(plays.length >= 2, `expected plays, got ${plays.length}`);
  assert.equal(plays[0].seat, 0);
  assert.equal(plays[0].card.id, '2C');
  assert.equal(plays[1].seat, 1);
  assert.equal(plays[1].card.id, '5C');
});

test('emits hand and play events in the order they arrived', () => {
  const kinds = P.state.events.map(e => e.kind);
  assert.equal(kinds[0], 'hand');
  assert.ok(kinds.slice(1).every(k => k === 'play'));
  const seqs = P.state.events.map(e => e.seq);
  assert.deepEqual(seqs, seqs.slice().sort((a, b) => a - b));
});

test('ignores non-JSON chatter and waiting_for noise', () => {
  const before = P.state.events.length;
  P.feed('waiting_for message processing took 0', 'in');
  P.feed('changing game state', 'in');
  P.feed('received network message {"cmd":"waiting_for","waitingFor":[0,0,2,0]}', 'in');
  assert.equal(P.state.events.length, before);
});

test('parses JSON followed by trailing prose', () => {
  const o = P.jsonFrom('animating {"cmd":"x","card":"QS"}, wait time 300');
  assert.equal(o.cmd, 'x');
});

test('a full hand is never mistaken for a play', () => {
  assert.ok(P.state.plays.every(p => p.card));
  assert.equal(P.state.unknown.length, 0);
});
