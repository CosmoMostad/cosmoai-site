const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../src/engine.js');
const ids = cards => cards.map(c => c.id);

test('parses many card spellings', () => {
  assert.equal(H.parseCard('QS').id, 'QS');
  assert.equal(H.parseCard('10h').id, 'TH');
  assert.equal(H.parseCard('queen of spades').id, 'QS');
  assert.equal(H.parseCard('spades_queen').id, 'QS');
  assert.equal(H.parseCard('s12').id, 'QS');
  assert.equal(H.parseCard('4♣').id, '4C');
  assert.equal(H.parseCard('ace_of_diamonds').id, 'AD');
  assert.equal(H.parseCard('h1').id, 'AH');
  assert.equal(H.parseCard('foo'), null);
});

test('pass: unprotected Q♠ and bare A♠ go, low spades stay', () => {
  const r = H.recommendPass('QS AS 3S 2C 5C 9C 4D 7D JD 3H 6H 9H KH', 'left');
  assert.ok(ids(r.pass).includes('QS'), 'QS passed');
  assert.ok(ids(r.pass).includes('AS'), 'AS passed');
  assert.ok(!ids(r.pass).includes('3S'), '3S kept');
  assert.equal(r.pass.length, 3);
});

test('pass: protected Q♠ stays, singleton diamond and high heart go', () => {
  const r = H.recommendPass('QS 9S 5S 3S 2S 4C 6C 8C AD 3H 6H AH KH', 'right');
  assert.ok(!ids(r.pass).includes('QS'), 'protected QS kept');
  assert.ok(ids(r.pass).includes('AD'), 'singleton AD passed for a void');
  assert.ok(ids(r.pass).includes('AH'), 'AH passed');
  assert.ok(r.plan.some(l => /Void in diamonds/.test(l)));
});

test('pass: hold direction passes nothing', () => {
  const r = H.recommendPass('QS 9S 5S 3S 2S 4C 6C 8C AD 3H 6H AH KH', 'hold');
  assert.equal(r.pass.length, 0);
});

test('moon evaluation flags a monster hand', () => {
  const m = H.evaluateMoon('AS KS QS AH KH QH JH TH AD KD AC KC 9C');
  assert.equal(m.level, 'strong');
  assert.equal(H.evaluateMoon('2S 3S 4S 5H 6H 7C 8C 9C 2D 3D 4D 5D 6D').level, 'no');
});

test('legal plays: 2♣ leads, no points on first trick, hearts unbroken', () => {
  const t = new H.HandTracker();
  t.setHand('2C 5C AS QS 4H 9H AD KD 3D 7S 8S 2D 6C');
  assert.deepEqual(ids(t.legal()), ['2C']);
  t.play(0, '2C');
  t.play(1, '3C'); t.play(2, 'KC'); t.play(3, 'AC');
  assert.equal(t.trick.leader, 3);
  assert.equal(t.tricks.length, 1);
  assert.equal(t.tricks[0].winner, 3);
  t.play(3, '4D');
  // no hearts led; following diamonds only
  assert.deepEqual(ids(t.legal()).sort(), ['3D', 'AD', 'KD', '2D'].sort());
});

test('first-trick discard cannot be a point card', () => {
  const s = { hand: H.parseCards('QS AH 4D 7S'), trick: { leader: 1, plays: [{ seat: 1, card: '2C' }] }, tricks: [] };
  assert.deepEqual(ids(H.legalPlays(Object.assign({ opts: {} }, s, { hand: H.parseCards('QS AH 4D 7S') }))).sort(), ['4D', '7S'].sort());
});

test('follow: ducks as high as possible under the winner', () => {
  const r = H.recommendPlay({
    hand: '3D 8D JD KD 4S 9H', tricks: [{ leader: 1, plays: [{ seat: 1, card: '2C' }, { seat: 2, card: '5C' }, { seat: 3, card: '9C' }, { seat: 0, card: '3C' }], winner: 3, points: 0 }],
    trick: { leader: 3, plays: [{ seat: 3, card: 'QD' }] },
  });
  assert.equal(r.card.id, 'JD');
  assert.match(r.reasons[0], /duck/i);
});

test('follow: last to play on a clean trick wins with the highest card', () => {
  const r = H.recommendPlay({
    hand: '3D 8D JD KD 4S 9H 5C', tricks: [{ leader: 1, plays: [{ seat: 1, card: '2C' }, { seat: 2, card: '5C' }, { seat: 3, card: '9C' }, { seat: 0, card: '3C' }], winner: 3, points: 0 }],
    trick: { leader: 1, plays: [{ seat: 1, card: '4D' }, { seat: 2, card: '7D' }, { seat: 3, card: 'TD' }] },
  });
  assert.equal(r.card.id, 'KD');
  assert.match(r.reasons[0], /last/i);
});

test('follow: drops Q♠ under an A♠ lead', () => {
  const r = H.recommendPlay({
    hand: 'QS 3S 9D 4H', tricks: [{ leader: 1, plays: [{ seat: 1, card: '2C' }, { seat: 2, card: '5C' }, { seat: 3, card: '9C' }, { seat: 0, card: '3C' }], winner: 3, points: 0 }],
    trick: { leader: 3, plays: [{ seat: 3, card: 'AS' }] },
  });
  assert.equal(r.card.id, 'QS');
});

test('follow: keeps Q♠ hidden and ducks when a low spade is led', () => {
  const r = H.recommendPlay({
    hand: 'QS 3S 8S 9D 4H', tricks: [{ leader: 1, plays: [{ seat: 1, card: '2C' }, { seat: 2, card: '5C' }, { seat: 3, card: '9C' }, { seat: 0, card: '3C' }], winner: 3, points: 0 }],
    trick: { leader: 3, plays: [{ seat: 3, card: 'TS' }] },
  });
  assert.equal(r.card.id, '8S');
});

test('discard: Q♠ first, then Queen-catchers, then high hearts', () => {
  const base = { tricks: [{ leader: 1, plays: [{ seat: 1, card: '2C' }, { seat: 2, card: '5C' }, { seat: 3, card: '9C' }, { seat: 0, card: '3C' }], winner: 3, points: 0 }], trick: { leader: 3, plays: [{ seat: 3, card: 'KD' }] } };
  assert.equal(H.recommendPlay(Object.assign({ hand: 'QS AS AH 4C' }, base)).card.id, 'QS');
  assert.equal(H.recommendPlay(Object.assign({ hand: 'AS AH 4C 5S' }, base)).card.id, 'AS');
  assert.equal(H.recommendPlay(Object.assign({ hand: 'AH 4C 5S 9H' }, base)).card.id, 'AH');
});

test('discard: never feeds hearts to a moon shooter', () => {
  const tricks = [
    { leader: 1, plays: [{ seat: 1, card: '2C' }, { seat: 2, card: '5C' }, { seat: 3, card: '9C' }, { seat: 0, card: '3C' }], winner: 3, points: 0 },
    { leader: 3, plays: [{ seat: 3, card: 'AH' }, { seat: 0, card: '2H' }, { seat: 1, card: '3H' }, { seat: 2, card: '5H' }], winner: 3, points: 4 },
    { leader: 3, plays: [{ seat: 3, card: 'KH' }, { seat: 0, card: '4H' }, { seat: 1, card: '6H' }, { seat: 2, card: '7H' }], winner: 3, points: 4 },
  ];
  const r = H.recommendPlay({ hand: 'JH 4C 9D KC', tricks, trick: { leader: 3, plays: [{ seat: 3, card: 'AS' }] } });
  assert.notEqual(r.card.id, 'JH');
  assert.ok(r.intel.some(l => /MOON WATCH/.test(l)));
});

test('lead: hunts the Queen with a low spade', () => {
  const r = H.recommendPlay({
    hand: '4S 5S AD JD 7H 9C', tricks: [{ leader: 1, plays: [{ seat: 1, card: '2C' }, { seat: 2, card: '5C' }, { seat: 3, card: '9C' }, { seat: 0, card: 'AC' }], winner: 0, points: 0 }],
    trick: { leader: 0, plays: [] },
  });
  assert.equal(r.card.id, '4S');
  assert.match(r.reasons.join(' '), /Queen/);
});

test('lead: avoids a suit where an opponent is void and the Queen is out', () => {
  const r = H.recommendPlay({
    hand: '3D 9C AS', tricks: [{ leader: 1, plays: [{ seat: 1, card: '2C' }, { seat: 2, card: '5C' }, { seat: 3, card: '9C' }, { seat: 0, card: 'AC' }], winner: 0, points: 0 }],
    trick: { leader: 0, plays: [] }, voids: { 1: ['D'] },
  });
  assert.equal(r.card.id, '9C');
});

test('tracker: infers voids, tracks points, undo works', () => {
  const t = new H.HandTracker();
  t.setHand('2C 5C 9C AS 4S 4H 9H AD KD 3D 7S 8S 2D');
  t.play(0, '2C'); t.play(1, '3C'); t.play(2, 'KC'); t.play(3, 'AC');
  t.play(3, '4D'); t.play(0, '3D'); t.play(1, 'QS'); t.play(2, '9D');
  assert.ok(t.voids[1].has('D'));
  assert.equal(t.pointsTaken[2], 13);
  assert.throws(() => t.play(1, '5H'), /Expected/);
  t.undo();
  assert.equal(t.tricks.length, 1);
  assert.equal(t.trick.plays.length, 3);
});

test('tracker: pass and receive update the hand', () => {
  const t = new H.HandTracker();
  t.setHand('2C 5C 9C AS 4S 4H 9H AD KD 3D 7S 8S 2D');
  t.setPass('AS AD KD', 'left');
  t.receive('QH JH 6S');
  assert.equal(t.hand.length, 13);
  assert.ok(!t.hand.some(c => c.id === 'AS'));
  assert.ok(t.hand.some(c => c.id === 'QH'));
  assert.equal(t.passedTo, 1);
});

test('moon watch does not fire on the Queen alone', () => {
  const tricks = [
    { leader: 1, plays: [{ seat: 1, card: '2C' }, { seat: 2, card: '5C' }, { seat: 3, card: '9C' }, { seat: 0, card: '3C' }], winner: 3, points: 0 },
    { leader: 3, plays: [{ seat: 3, card: 'AS' }, { seat: 0, card: '2S' }, { seat: 1, card: 'QS' }, { seat: 2, card: '5S' }], winner: 3, points: 13 },
  ];
  const r = H.recommendPlay({ hand: 'JH 4C 9D KC', tricks, trick: { leader: 3, plays: [{ seat: 3, card: 'AD' }] } });
  assert.ok(!r.intel.some(l => /MOON WATCH/.test(l)));
});

test('tracker rejects an opponent playing a card from your hand', () => {
  const t = new H.HandTracker();
  t.setHand('2C 5C 9C AS 4S 4H 9H AD KD 3D 7S 8S 2D');
  t.play(0, '2C');
  assert.throws(() => t.play(1, '5C'), /in your hand/);
});
