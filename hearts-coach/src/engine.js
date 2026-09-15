/*
 * Hearts Coach — strategy engine
 * Pure, dependency-free. Works in Node (module.exports) and browsers (window.HeartsCoach).
 *
 * Rules assumed (cardgames.io defaults): 4 players, pass 3 cards L/R/Across/Hold,
 * 2♣ leads the first trick, no points may be played on the first trick,
 * hearts cannot be led until broken (unless you hold only hearts),
 * Q♠ = 13, hearts = 1 each, shooting the moon gives everyone else 26.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HeartsCoach = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- cards
  const RANKS = '23456789TJQKA';
  const SUITS = 'CDHS';
  const SUIT_SYMBOL = { C: '♣', D: '♦', H: '♥', S: '♠' };
  const SUIT_NAME = { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' };
  const SUIT_ONE = { C: 'club', D: 'diamond', H: 'heart', S: 'spade' };
  const SEAT_NAMES = ['You', 'Left', 'Across', 'Right'];
  const DIRECTION_SEAT = { left: 1, across: 2, right: 3, hold: null };

  function makeCard(r, s) {
    return Object.freeze({ r, s, v: RANKS.indexOf(r) + 2, id: r + s });
  }
  const DECK = [];
  const CARD_BY_ID = {};
  for (const s of SUITS) for (const r of RANKS) { const c = makeCard(r, s); DECK.push(c); CARD_BY_ID[c.id] = c; }

  const WORD_RANK = { TWO: '2', THREE: '3', FOUR: '4', FIVE: '5', SIX: '6', SEVEN: '7', EIGHT: '8', NINE: '9', TEN: 'T', JACK: 'J', QUEEN: 'Q', KING: 'K', ACE: 'A' };
  const NUM_RANK = { 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

  /** Parse "QS", "q♠", "10h", "queen of spades", "spades_queen", "s12", {id:'QS'} → card or null. */
  function parseCard(input) {
    if (input == null) return null;
    if (typeof input === 'object') return input.id ? CARD_BY_ID[input.id] || null : null;
    let str = String(input).trim().toUpperCase()
      .replace(/♣/g, 'C').replace(/♦/g, 'D').replace(/♥/g, 'H').replace(/♠/g, 'S')
      .replace(/CLUBS?/g, 'C').replace(/DIAMONDS?/g, 'D').replace(/HEARTS?/g, 'H').replace(/SPADES?/g, 'S')
      .replace(/[\s_\-.]+/g, ' ').replace(/\bOF\b/g, ' ').trim();
    for (const w in WORD_RANK) str = str.replace(new RegExp('\\b' + w + '\\b'), WORD_RANK[w]);
    str = str.replace(/\s+/g, '');
    let m = str.match(/^(10|[2-9]|[TJQKA])([CDHS])$/) || str.match(/^([CDHS])(10|[2-9]|[TJQKA])$/);
    if (m) {
      const rank = /[CDHS]/.test(m[1]) ? m[2] : m[1];
      const suit = /[CDHS]/.test(m[1]) ? m[1] : m[2];
      return CARD_BY_ID[(rank === '10' ? 'T' : rank) + suit] || null;
    }
    m = str.match(/^([CDHS])(1[0-4]|[1-9])$/) || str.match(/^(1[0-4]|[1-9])([CDHS])$/);
    if (m) {
      const num = /[CDHS]/.test(m[1]) ? m[2] : m[1];
      const suit = /[CDHS]/.test(m[1]) ? m[1] : m[2];
      return CARD_BY_ID[NUM_RANK[Number(num)] + suit] || null;
    }
    return null;
  }

  function parseCards(text) {
    if (Array.isArray(text)) return text.map(parseCard).filter(Boolean);
    const out = [];
    for (const tok of String(text || '').split(/[\s,;]+/)) { const c = parseCard(tok); if (c) out.push(c); }
    return out;
  }

  function fmt(card) { return card ? (card.r === 'T' ? '10' : card.r) + SUIT_SYMBOL[card.s] : '—'; }
  function fmtList(cards) { return cards.map(fmt).join(' '); }
  function isPoint(c) { return c.s === 'H' || c.id === 'QS'; }
  function pointValue(c) { return c.s === 'H' ? 1 : c.id === 'QS' ? 13 : 0; }
  function byValue(a, b) { return a.v - b.v; }
  const SUIT_ORDER = { C: 0, D: 1, S: 2, H: 3 };
  function sortHand(cards) {
    return cards.slice().sort((a, b) => SUIT_ORDER[a.s] - SUIT_ORDER[b.s] || a.v - b.v);
  }
  function groupBySuit(cards) {
    const g = { C: [], D: [], H: [], S: [] };
    for (const c of cards) g[c.s].push(c);
    for (const s of SUITS) g[s].sort(byValue);
    return g;
  }
  function has(cards, id) { return cards.some(c => c.id === id); }
  function lowest(cards) { return cards.reduce((m, c) => (!m || c.v < m.v ? c : m), null); }
  function highest(cards) { return cards.reduce((m, c) => (!m || c.v > m.v ? c : m), null); }
  function uniq(cards) { const seen = new Set(); return cards.filter(c => !seen.has(c.id) && seen.add(c.id)); }

  // ------------------------------------------------------------- passing
  /** Rough "can I shoot the moon" estimate for a 13-card hand. */
  function evaluateMoon(hand) {
    hand = uniq(parseCards(hand));
    const g = groupBySuit(hand);
    let score = 0;
    const notes = [];
    const topHearts = g.H.filter(c => c.v >= 10);
    const lowHearts = g.H.filter(c => c.v <= 6);
    score += topHearts.length * 9 + (g.H.length >= 5 ? 8 : 0) - lowHearts.length * 4;
    if (topHearts.length >= 3) notes.push(`${topHearts.length} top hearts (${fmtList(topHearts)})`);
    if (g.H.length >= 5) notes.push(`long hearts (${g.H.length})`);
    for (const id of ['AS', 'KS', 'QS']) if (has(hand, id)) score += id === 'AS' ? 9 : 7;
    const spadeHonours = g.S.filter(c => c.v >= 12);
    if (spadeHonours.length >= 2) notes.push(`spade control (${fmtList(spadeHonours)})`);
    for (const s of ['C', 'D']) {
      for (const c of g[s]) {
        if (c.v === 14) score += 7; else if (c.v === 13) score += 5; else if (c.v === 12) score += 3; else if (c.v <= 8) score -= 3;
      }
      if (g[s].length === 0) { score += 5; notes.push(`void in ${SUIT_NAME[s]}`); }
      else if (g[s].length === 1) { score += 3; notes.push(`singleton ${SUIT_NAME[s]}`); }
    }
    score -= g.S.filter(c => c.v <= 9).length * 2;
    const level = score >= 58 ? 'strong' : score >= 44 ? 'possible' : 'no';
    return { score, level, notes };
  }

  /** Danger score for each card if kept (higher = pass it). */
  function passDanger(card, hand, direction, opts) {
    opts = opts || {};
    const g = groupBySuit(hand);
    const spadesBelowQ = g.S.filter(c => c.v < 12).length;
    const hasQ = has(hand, 'QS');
    let d = 0;
    const why = [];
    const suitLen = g[card.s].length;
    if (card.s === 'S') {
      if (card.id === 'QS') {
        if (spadesBelowQ >= 3) { d = 22; why.push(`Q♠ is protected by ${spadesBelowQ} lower spades — you can usually keep it and control when it goes`); }
        else if (spadesBelowQ === 2) { d = 62; why.push('Q♠ with only two low spades is thin cover — one or two spade leads and you are forced to eat it'); }
        else { d = 100; why.push(`Q♠ with ${spadesBelowQ === 1 ? 'one low spade' : 'no low spades'} is a 13-point liability — pass it`); }
        if (direction === 'left') { d -= 10; why.push('passing left is the worst seat for the Queen (they play right after you), so only pass it if it is truly unprotected'); }
        else if (direction === 'right') { d += 8; why.push('passing right is ideal: the Queen holder plays before you, so you see it come out before you commit'); }
      } else if (card.v >= 13) {
        if (hasQ && g.S.length >= 4) { d = 15; why.push(`${fmt(card)} is fine beside your own Q♠ with ${g.S.length} spades`); }
        else if (spadesBelowQ >= 3) { d = 40; why.push(`${fmt(card)} has ${spadesBelowQ} low spades under it, so you can duck spade leads for a while`); }
        else { d = card.v === 14 ? 88 : 82; why.push(`${fmt(card)} with ${spadesBelowQ} low spades will win a spade trick and catch the Q♠`); }
        if (direction === 'right') d += 5;
      } else {
        d = card.v <= 6 ? -60 : card.v <= 9 ? -35 : -15;
        why.push(`${fmt(card)} is a low spade — the safest card in Hearts, never pass it`);
      }
    } else if (card.s === 'H') {
      const table = { 14: 85, 13: 80, 12: 70, 11: 55, 10: 45, 9: 35, 8: 25, 7: 15, 6: 5, 5: -5, 4: -15, 3: -25, 2: -35 };
      d = table[card.v];
      if (card.v >= 10) why.push(`${fmt(card)} will win a heart trick and probably collect 3-4 points`);
      else if (card.v <= 5) why.push(`${fmt(card)} is a low heart — it lets you follow hearts without winning`);
      if (g.H.length >= 5 && card.v >= 10) { d -= 20; why.push('long hearts soften this: you have low hearts to hide behind'); }
      if (g.H.length <= 2 && card.v >= 9) { d += 15; why.push('short high hearts: passing them makes you void in hearts'); }
    } else {
      const club = card.s === 'C';
      const table = club
        ? { 14: 42, 13: 36, 12: 28, 11: 18, 10: 10, 9: 5, 8: 2, 7: 0, 6: 0, 5: 0, 4: -12, 3: -12, 2: -12 }
        : { 14: 60, 13: 50, 12: 38, 11: 25, 10: 14, 9: 6, 8: 2, 7: 0, 6: 0, 5: 0, 4: -12, 3: -12, 2: -12 };
      d = table[card.v];
      if (club && card.v >= 13 && has(hand, '2C')) { d += 10; why.push('you hold the 2♣ so you lead trick one and cannot dump this club on the free first trick'); }
      else if (club && card.v >= 13) why.push(`${fmt(card)} can often be shed on the point-free first trick, so it is only mildly dangerous`);
      if (!club && card.v >= 12) why.push(`${fmt(card)} tends to win a diamond trick late, exactly when hearts get dumped on it`);
      if (card.v <= 4) why.push(`${fmt(card)} is a safe exit card — keep it`);
      if (suitLen === 1) { d += 45; why.push(`singleton ${SUIT_NAME[card.s]}: passing it makes you void, so you can dump the Q♠ or high hearts on ${SUIT_NAME[card.s]} leads`); }
      else if (suitLen === 2) { d += 28; why.push(`only two ${SUIT_NAME[card.s]}: passing both creates a void`); }
      else if (suitLen === 3) { d += 8; }
    }
    return { card, danger: d, why };
  }

  /**
   * recommendPass(hand, direction, opts) → { pass, reasons, plan, moon, candidates }
   * direction: 'left' | 'right' | 'across' | 'hold'
   */
  function recommendPass(hand, direction, opts) {
    hand = uniq(parseCards(hand));
    direction = direction || 'left';
    if (direction === 'hold') return { pass: [], reasons: ['No pass this hand.'], plan: planSummary(hand, []), moon: evaluateMoon(hand), candidates: [] };
    const moon = evaluateMoon(hand);
    const scored = hand.map(c => passDanger(c, hand, direction, opts)).sort((a, b) => b.danger - a.danger);
    const pass = scored.slice(0, 3);
    const reasons = pass.map(p => `${fmt(p.card)}: ${p.why[0] || 'highest remaining liability'}${p.why.length > 1 ? ' (' + p.why.slice(1).join('; ') + ')' : ''}`);
    let moonPass = null;
    if (moon.level !== 'no') {
      // Moon pass: get rid of the lowest losers instead.
      const losers = hand.slice().sort((a, b) => a.v - b.v || (a.s === 'H' ? 1 : 0) - (b.s === 'H' ? 1 : 0)).slice(0, 3);
      moonPass = { pass: losers, reason: `Moon ${moon.level === 'strong' ? 'is on' : 'is possible'} (${moon.notes.join(', ')}). To shoot, pass your lowest losers ${fmtList(losers)} and keep every winner.` };
    }
    return {
      pass: pass.map(p => p.card),
      reasons,
      plan: planSummary(hand, pass.map(p => p.card)),
      moon: Object.assign({}, moon, moonPass ? { alternative: moonPass } : {}),
      candidates: scored.map(p => ({ card: p.card, danger: p.danger, why: p.why })),
    };
  }

  function planSummary(hand, passing) {
    const keep = hand.filter(c => !has(passing, c.id));
    const g = groupBySuit(keep);
    const lines = [];
    for (const s of ['C', 'D']) {
      if (g[s].length === 0) lines.push(`Void in ${SUIT_NAME[s]} after the pass — every ${SUIT_NAME[s]} lead is a free discard for you.`);
      else if (g[s].length === 1) lines.push(`Singleton ${fmt(g[s][0])}: lead it early to open a void.`);
    }
    const spadesBelowQ = g.S.filter(c => c.v < 12);
    if (has(keep, 'QS')) lines.push(`You keep the Q♠ with ${spadesBelowQ.length} lower spades. Never lead spades; wait to drop it on someone else's trick.`);
    else if (g.S.length && g.S.every(c => c.v < 12)) lines.push(`Spades ${fmtList(g.S)} are all under the Queen: lead them to flush the Q♠ out of someone else's hand.`);
    else if (g.S.some(c => c.v >= 13)) lines.push(`You still hold ${fmtList(g.S.filter(c => c.v >= 13))} without the Queen: do not lead spades, and shed them the first time you are void.`);
    if (g.H.length && g.H.every(c => c.v <= 7)) lines.push(`Hearts ${fmtList(g.H)} are all low: you can follow hearts safely.`);
    else if (g.H.some(c => c.v >= 12)) lines.push(`High hearts ${fmtList(g.H.filter(c => c.v >= 12))} remain: dump them on the first trick you cannot follow.`);
    return lines;
  }

  // ------------------------------------------------------------- play
  function legalPlays(state) {
    const { hand, trick } = state;
    const first = state.tricks.length === 0;
    const opts = state.opts || {};
    const noPointsFirst = opts.noPointsFirstTrick !== false;
    if (trick.plays.length === 0) {
      if (first && has(hand, '2C')) return [CARD_BY_ID['2C']];
      if (!state.heartsBroken) {
        const nonHearts = hand.filter(c => c.s !== 'H');
        if (nonHearts.length) return nonHearts;
      }
      return hand.slice();
    }
    const led = trick.plays[0].card.s;
    const follow = hand.filter(c => c.s === led);
    if (follow.length) return follow;
    if (first && noPointsFirst) {
      const nonPoints = hand.filter(c => !isPoint(c));
      if (nonPoints.length) return nonPoints;
    }
    return hand.slice();
  }

  function trickWinner(plays) {
    const led = plays[0].card.s;
    let best = plays[0];
    for (const p of plays) if (p.card.s === led && p.card.v > best.card.v) best = p;
    return best;
  }
  function trickPoints(plays) { return plays.reduce((n, p) => n + pointValue(p.card), 0); }

  function seatName(state, seat) { return (state.seatNames && state.seatNames[seat]) || SEAT_NAMES[seat]; }

  /** Derive counting / intel facts from a state. */
  function analyze(state) {
    const hand = state.hand;
    const inHand = new Set(hand.map(c => c.id));
    const played = new Set();
    for (const t of state.tricks) for (const p of t.plays) played.add(p.card.id);
    for (const p of state.trick.plays) played.add(p.card.id);
    for (const c of (state.extraPlayed || [])) played.add(c.id);
    const outstanding = DECK.filter(c => !inHand.has(c.id) && !played.has(c.id));
    const out = groupBySuit(outstanding);
    const passedTo = state.passedTo == null ? null : state.passedTo;
    const passedCards = state.passedCards || [];
    let qs = played.has('QS') ? 'played' : inHand.has('QS') ? 'mine' : 'out';
    let qsHolder = null;
    if (qs === 'out' && passedTo != null && has(passedCards, 'QS')) qsHolder = passedTo;
    const heartsBroken = state.heartsBroken != null ? state.heartsBroken
      : outstanding.length + hand.length < 52 && DECK.some(c => c.s === 'H' && played.has(c.id));
    const pointsTaken = state.pointsTaken || [0, 0, 0, 0];
    const totalTaken = pointsTaken.reduce((a, b) => a + b, 0);
    let moon = null;
    const heartsTaken = [0, 0, 0, 0];
    for (const t of state.tricks) heartsTaken[t.winner] += t.plays.filter(p => p.card.s === 'H').length;
    for (let s = 0; s < 4; s++) {
      if (pointsTaken[s] > 0 && pointsTaken[s] === totalTaken) {
        const h = heartsTaken[s];
        const level = h >= 6 || (h >= 3 && pointsTaken[s] >= 13) ? 'high' : h >= 3 || (h >= 1 && pointsTaken[s] >= 13) ? 'watch' : 'low';
        moon = { seat: s, points: totalTaken, hearts: h, level };
      }
    }
    const voids = state.voids || {};
    return { inHand, played, outstanding, out, qs, qsHolder, heartsBroken, pointsTaken, totalTaken, moon, voids, passedTo, passedCards,
      heartsOut: out.H.length, heartsInHand: hand.filter(c => c.s === 'H').length };
  }

  function voidSeatsFor(a, suit, seats) {
    return seats.filter(s => a.voids[s] && a.voids[s].has(suit));
  }

  function intelLines(state, a) {
    const lines = [];
    if (a.qs === 'played') lines.push('Q♠ is gone — spades are a normal suit now.');
    else if (a.qs === 'mine') lines.push('You hold the Q♠. Never lead spades; drop it on a trick someone else is winning.');
    else if (a.qsHolder != null) lines.push(`Q♠ is out — you passed it to ${seatName(state, a.qsHolder)}.`);
    else lines.push('Q♠ is still out.');
    const heartsPlayed = 13 - a.heartsOut - a.heartsInHand;
    lines.push(`Hearts: ${heartsPlayed} played, ${a.heartsOut} in other hands, ${a.heartsInHand} in yours. ${a.heartsBroken ? 'Broken.' : 'Not broken yet.'}`);
    const suitBits = SUITS.split('').map(s => `${SUIT_SYMBOL[s]}${a.out[s].length}${a.out[s].length ? ' (top ' + fmt(highest(a.out[s])) + ')' : ''}`);
    lines.push('Still in other hands: ' + suitBits.join('  '));
    for (let s = 1; s <= 3; s++) {
      const v = a.voids[s];
      if (v && v.size) lines.push(`${seatName(state, s)} is void in ${[...v].map(x => SUIT_SYMBOL[x]).join(' ')}.`);
    }
    if (a.moon && a.moon.seat !== 0 && a.moon.level !== 'low') {
      lines.push(`MOON WATCH: ${seatName(state, a.moon.seat)} has taken every point so far (${a.moon.points}). Take one heart trick to stop it.`);
    }
    if (a.moon && a.moon.seat === 0 && a.moon.points >= 4) lines.push(`You have every point so far (${a.moon.points}). Toggle moon mode if your hand can win the rest.`);
    return lines;
  }

  function recommendLead(state, a, legal) {
    const g = groupBySuit(state.hand);
    const trickNo = 13 - state.hand.length + 1;
    const others = [1, 2, 3];
    const moonMode = !!state.moonMode;
    const cands = legal.map(c => {
      const out = a.out[c.s];
      const mine = g[c.s];
      const higherOut = out.filter(x => x.v > c.v).length;
      const lowerOut = out.length - higherOut;
      const voidSeats = voidSeatsFor(a, c.s, others);
      let score = 0;
      const why = [];
      if (moonMode) {
        if (higherOut === 0 && out.length) { score += 60; why.push(`${fmt(c)} is the top ${SUIT_ONE[c.s]} left — it wins`); }
        else score -= 30 + higherOut * 10;
        if (c.s === 'H') score += 10;
        score += c.v;
        return { card: c, score, why };
      }
      if (trickNo === 1 && c.id === '2C') return { card: c, score: 1000, why: ['2♣ must lead the first trick'] };
      if (out.length === 0) { score -= 70; why.push(`nobody else holds ${SUIT_NAME[c.s]} — all three will dump on this`); }
      else {
        if (higherOut === 0) { score -= 45; why.push(`${fmt(c)} is the highest ${SUIT_ONE[c.s]} left, so you will win this trick`); }
        else if (lowerOut === 0) { score += 42; why.push(`${fmt(c)} is the lowest ${SUIT_ONE[c.s]} in play — it cannot win`); }
        else { score += Math.round(38 * higherOut / out.length) - Math.min(12, lowerOut * 3); why.push(`${higherOut} of ${out.length} outstanding ${SUIT_NAME[c.s]} beat ${fmt(c)}`); }
        if (voidSeats.length) {
          const pen = 30 * voidSeats.length + (a.qs === 'out' ? 25 : 0) + (a.heartsOut > 3 ? 10 : 0);
          score -= pen;
          why.push(`${voidSeats.map(s => seatName(state, s)).join(' and ')} ${voidSeats.length > 1 ? 'are' : 'is'} void in ${SUIT_NAME[c.s]} and will dump ${a.qs === 'out' ? 'the Q♠ or ' : ''}hearts on it`);
        } else if (out.length < 3) { score -= 18; why.push(`only ${out.length} ${SUIT_NAME[c.s]} left out — someone is void`); }
      }
      if (c.s === 'S') {
        if (a.qs === 'out') {
          if (c.v < 12) { score += 35; why.push('spade under the Queen: leading it costs nothing and forces the Q♠ holder to sweat'); }
          else { score -= 70; why.push(`leading ${fmt(c)} with the Q♠ still out is volunteering for 13 points`); }
        } else if (a.qs === 'mine') {
          if (c.id === 'QS') { score -= 80; why.push('leading the Q♠ hands yourself 13 unless A♠/K♠ are both still out and get played'); }
          else if (g.S.length < 5) { score -= 15; why.push('you hold the Q♠: each spade lead burns cover you need'); }
        }
      }
      if (c.s === 'H') {
        if (a.moon && a.moon.seat !== 0 && a.moon.level !== 'low' && c.v === highest(g.H).v && higherOut === 0) { score += 70; why.push(`take a heart trick now to stop ${seatName(state, a.moon.seat)} shooting the moon`); }
        else if (lowerOut === 0) { score += 8; why.push('a losing heart lead pushes points onto the others'); }
        else score -= 6;
      }
      if (mine.length === 1) { score += 12; why.push('singleton — leading it opens a void'); }
      else if (mine.length === 2) score += 5;
      if (higherOut === 0 && out.length >= 5 && !voidSeats.length && a.qs !== 'out' && trickNo <= 6 && c.s !== 'H') {
        score += 30; why.push(`cash it now: everyone still follows ${SUIT_NAME[c.s]} and the Queen is gone, so this winner is free today and a liability later`);
      }
      score -= c.v * 0.5;
      return { card: c, score, why };
    });
    cands.sort((x, y) => y.score - x.score);
    return cands;
  }

  function recommendFollow(state, a, legal) {
    const plays = state.trick.plays;
    const led = plays[0].card.s;
    const winner = trickWinner(plays);
    const pts = trickPoints(plays);
    const pos = plays.length; // 1..3 already played
    const last = pos === 3;
    const seatsAfter = [];
    for (let i = pos + 1; i < 4; i++) seatsAfter.push((state.trick.leader + i) % 4);
    const first = state.tricks.length === 0;
    const mine = legal.slice().sort(byValue);
    const under = mine.filter(c => c.v < winner.card.v);
    const over = mine.filter(c => c.v > winner.card.v);
    const dumpVoids = seatsAfter.filter(s => a.voids[s] && a.voids[s].has(led));
    const outLed = a.out[led].length;
    const dumpRisk = dumpVoids.length ? 'known' : (outLed < seatsAfter.length + 2 ? 'likely' : 'low');
    const moonMode = !!state.moonMode;
    const w = (card, why) => ({ card, why });

    if (moonMode) {
      if (over.length) return w(highest(over), [`moon mode: take the trick with ${fmt(highest(over))}`]);
      return w(lowest(mine), ['moon mode but you cannot win this one — dump your lowest']);
    }
    if (first) {
      return w(highest(mine), [`first trick can never carry points: unload your highest club (${fmt(highest(mine))}) for free`]);
    }
    // Spades with the Queen in hand.
    if (led === 'S' && has(mine, 'QS')) {
      if (winner.card.v > 12) return w(CARD_BY_ID.QS, [`${fmt(winner.card)} is already winning — drop the Q♠ under it now, this is the moment you were waiting for`]);
      const underNoQ = under.filter(c => c.id !== 'QS');
      if (underNoQ.length) return w(highest(underNoQ), [`duck with ${fmt(highest(underNoQ))}, the highest spade that stays under ${fmt(winner.card)}; keep the Q♠ hidden`]);
      const overNoQ = over.filter(c => c.id !== 'QS');
      if (overNoQ.length) {
        const pick = last ? highest(overNoQ) : lowest(overNoQ);
        return w(pick, [`you cannot duck; play ${fmt(pick)} rather than the Queen and hope ${last ? 'nothing' : 'someone still'} overtakes`]);
      }
      return w(CARD_BY_ID.QS, ['only the Q♠ left in spades — forced']);
    }
    // Last to play and no points on the table: free trick.
    if (last && pts === 0 && over.length) {
      const pick = highest(over);
      const why = [`you are last and the trick is clean: win it with ${fmt(pick)} and lead next`];
      if (led === 'S' && a.qs === 'out' && pick.v >= 13) why.push(`this sheds a dangerous ${fmt(pick)} while the Q♠ cannot fall on it`);
      if (!safeLeadsExist(state, a, pick)) {
        if (under.length) return w(highest(under), [`the trick is clean but winning it leaves you on lead with no safe exit; duck with ${fmt(highest(under))} instead`]);
      }
      return w(pick, why);
    }
    if (under.length) {
      const pick = highest(under);
      const why = [`duck as high as you can: ${fmt(pick)} stays under ${fmt(winner.card)} and saves your other ${SUIT_NAME[led]}`];
      if (pts) why.push(`${pts} point${pts > 1 ? 's' : ''} on the table — let ${seatName(state, winner.seat)} keep them`);
      // Not last: consider winning cheaply when safe and useful.
      if (!last && pts === 0 && dumpRisk === 'low' && over.length && a.qs !== 'out' && over.some(c => a.out[led].every(x => x.v < c.v))) {
        const win = highest(over);
        return w(win, [`${fmt(win)} is the top ${SUIT_ONE[led]} left and nobody after you is void: take this clean trick and shed a high card now, before hearts start flying`]);
      }
      return w(pick, why);
    }
    // Must win.
    if (last) return w(highest(over), [`no way under ${fmt(winner.card)} and you are last: take it with your highest ${fmt(highest(over))} so your smaller ones survive`, pts ? `you collect ${pts} — unavoidable` : 'no points on it, so this is fine']);
    const pick = lowest(over);
    const why = [`every ${SUIT_ONE[led]} you hold beats ${fmt(winner.card)}; play the lowest (${fmt(pick)}) so ${seatsAfter.map(s => seatName(state, s)).join('/')} can still overtake you`];
    if (led === 'S' && a.qs === 'out' && pick.v >= 13) why.push(`danger: the Q♠ is out and ${dumpRisk === 'known' ? seatName(state, dumpVoids[0]) + ' is void in spades' : 'a void player could drop it on you'}`);
    return w(pick, why);
  }

  function safeLeadsExist(state, a, excluding) {
    const hand = state.hand.filter(c => c.id !== excluding.id);
    if (!hand.length) return true;
    return hand.some(c => {
      if (c.s === 'H' && !a.heartsBroken) return false;
      const out = a.out[c.s];
      const higher = out.filter(x => x.v > c.v).length;
      return higher >= 2 && !voidSeatsFor(a, c.s, [1, 2, 3]).length;
    });
  }

  function recommendDiscard(state, a, legal) {
    const plays = state.trick.plays;
    const winner = trickWinner(plays);
    const g = groupBySuit(state.hand);
    const moonMode = !!state.moonMode;
    const shooter = a.moon && a.moon.seat !== 0 && a.moon.level !== 'low' && winner.seat === a.moon.seat;
    const cands = legal.map(c => {
      let score = 0;
      const why = [];
      if (moonMode) { score = -c.v - (isPoint(c) ? 50 : 0); why.push('moon mode: throw your lowest non-point card'); return { card: c, score, why }; }
      if (c.id === 'QS') { score = 200; why.push(`dump the Q♠ on ${seatName(state, winner.seat)}'s trick — 13 points gone for free`); }
      else if (c.s === 'S' && c.v >= 13 && a.qs === 'out') { score = 150 + c.v; why.push(`${fmt(c)} is a Queen-catcher while the Q♠ is out — shed it now`); }
      else if (c.s === 'H') {
        score = 60 + c.v * 3;
        if (c.v >= 10) why.push(`${fmt(c)} would win a heart trick later; give it away now`);
        else why.push(`heart — the points go to ${seatName(state, winner.seat)}`);
        if (shooter) { score -= 120; why.push(`do NOT feed hearts to ${seatName(state, winner.seat)}, who is shooting the moon`); }
      } else {
        const suitCards = g[c.s];
        const lowCover = suitCards.filter(x => x.v <= 7).length;
        score = c.v * 4 - lowCover * 6;
        if (c.v >= 12) why.push(`${fmt(c)} is a high ${SUIT_ONE[c.s]} that will win a trick when points are on it`);
        if (suitCards.length === 1) { score += 30; why.push(`singleton — throwing it makes you void in ${SUIT_NAME[c.s]}`); }
        else if (suitCards.length === 2) score += 10;
        if (c.s === 'S' && c.v < 12 && a.qs === 'out') { score -= 40; why.push('low spade: keep it to hunt the Queen'); }
        if (c.v <= 4) { score -= 15; why.push('low exit card — keep'); }
      }
      return { card: c, score, why };
    });
    cands.sort((x, y) => y.score - x.score);
    return cands;
  }

  /**
   * recommendPlay(state) → { card, headline, reasons, alternatives, intel, legal, phase }
   * state: { hand, trick:{leader, plays:[{seat,card}]}, tricks:[{leader,plays,winner,points}],
   *          voids:{seat:Set}, pointsTaken:[4], heartsBroken?, passedTo?, passedCards?, opts?, moonMode?, seatNames? }
   */
  function recommendPlay(state) {
    state = normalizeState(state);
    const a = analyze(state);
    const legal = legalPlays(state);
    const intel = intelLines(state, a);
    if (!legal.length) return { card: null, headline: 'No cards', reasons: [], alternatives: [], intel, legal, phase: 'none' };
    const leading = state.trick.plays.length === 0;
    const led = leading ? null : state.trick.plays[0].card.s;
    const phase = leading ? 'lead' : (legal[0].s === led ? 'follow' : 'discard');
    let card, reasons, alternatives = [];
    if (legal.length === 1) {
      card = legal[0];
      reasons = [phase === 'follow' ? `only ${SUIT_NAME[led]} you hold` : 'only legal card'];
    } else if (phase === 'lead') {
      const cands = recommendLead(state, a, legal);
      card = cands[0].card; reasons = cands[0].why;
      alternatives = cands.slice(1, 3).map(c => ({ card: c.card, why: c.why[0] || '' }));
    } else if (phase === 'follow') {
      const r = recommendFollow(state, a, legal);
      card = r.card; reasons = r.why;
    } else {
      const cands = recommendDiscard(state, a, legal);
      card = cands[0].card; reasons = cands[0].why;
      alternatives = cands.slice(1, 3).map(c => ({ card: c.card, why: c.why[0] || '' }));
    }
    const headline = `${phase === 'lead' ? 'Lead' : 'Play'} ${fmt(card)}`;
    return { card, headline, reasons, alternatives, intel, legal, phase, analysis: a };
  }

  function normalizeState(s) {
    const st = Object.assign({}, s);
    st.hand = uniq(parseCards(st.hand || []));
    st.tricks = (st.tricks || []).map(t => ({ leader: t.leader, plays: t.plays.map(p => ({ seat: p.seat, card: parseCard(p.card) })), winner: t.winner, points: t.points }));
    st.trick = st.trick ? { leader: st.trick.leader, plays: (st.trick.plays || []).map(p => ({ seat: p.seat, card: parseCard(p.card) })) } : { leader: 0, plays: [] };
    st.voids = st.voids || {};
    for (const k in st.voids) if (!(st.voids[k] instanceof Set)) st.voids[k] = new Set(st.voids[k]);
    if (st.passedCards) st.passedCards = parseCards(st.passedCards);
    st.extraPlayed = parseCards(st.extraPlayed || []);
    if (st.heartsBroken == null) {
      st.heartsBroken = st.tricks.some(t => t.plays.some(p => p.card.s === 'H')) || st.trick.plays.some(p => p.card.s === 'H');
      if (st.opts && st.opts.qsBreaksHearts) st.heartsBroken = st.heartsBroken || st.tricks.some(t => t.plays.some(p => p.card.id === 'QS'));
    }
    if (!st.pointsTaken) {
      st.pointsTaken = [0, 0, 0, 0];
      for (const t of st.tricks) st.pointsTaken[t.winner] += t.points != null ? t.points : trickPoints(t.plays);
    }
    return st;
  }

  // ------------------------------------------------------------- tracker
  class HandTracker {
    constructor(opts) {
      this.opts = Object.assign({ noPointsFirstTrick: true, qsBreaksHearts: false }, opts || {});
      this.seatNames = SEAT_NAMES.slice();
      this.reset();
    }
    reset() {
      this.log = [];
      this._rebuild();
    }
    _rebuild() {
      this.hand = [];
      this.dealt = [];
      this.tricks = [];
      this.trick = { leader: null, plays: [] };
      this.voids = { 1: new Set(), 2: new Set(), 3: new Set() };
      this.pointsTaken = [0, 0, 0, 0];
      this.passDirection = 'hold';
      this.passedCards = [];
      this.receivedCards = [];
      this.moonMode = false;
      this.extraPlayed = [];
      for (const op of this.log) this._apply(op);
    }
    _apply(op) {
      switch (op.type) {
        case 'hand': this.hand = sortHand(uniq(parseCards(op.cards))); this.dealt = this.hand.slice(); break;
        case 'pass': this.passDirection = op.direction; this.passedCards = parseCards(op.cards); this.hand = sortHand(this.hand.filter(c => !has(this.passedCards, c.id))); break;
        case 'receive': this.receivedCards = parseCards(op.cards); this.hand = sortHand(uniq(this.hand.concat(this.receivedCards))); break;
        case 'moon': this.moonMode = !!op.on; break;
        case 'seen': this.extraPlayed = uniq(this.extraPlayed.concat(parseCards(op.cards))); break;
        case 'void': this.voids[op.seat].add(op.suit); break;
        case 'points': this.pointsTaken = op.pointsTaken.slice(); break;
        case 'leader': this.trick.leader = op.seat; break;
        case 'play': {
          const card = parseCard(op.card);
          const seat = op.seat;
          if (this.trick.plays.length === 0) this.trick.leader = seat;
          const led = this.trick.plays.length ? this.trick.plays[0].card.s : card.s;
          if (seat !== 0 && card.s !== led) this.voids[seat].add(led);
          this.trick.plays.push({ seat, card });
          if (seat === 0) this.hand = this.hand.filter(c => c.id !== card.id);
          if (this.trick.plays.length === 4) {
            const winner = trickWinner(this.trick.plays);
            const points = trickPoints(this.trick.plays);
            this.pointsTaken[winner.seat] += points;
            this.tricks.push({ leader: this.trick.leader, plays: this.trick.plays, winner: winner.seat, points });
            this.trick = { leader: winner.seat, plays: [] };
          }
          break;
        }
      }
    }
    _push(op) { this.log.push(op); this._apply(op); return this; }
    setHand(cards) { return this._push({ type: 'hand', cards: parseCards(cards).map(c => c.id) }); }
    setPass(cards, direction) { return this._push({ type: 'pass', cards: parseCards(cards).map(c => c.id), direction: direction || 'left' }); }
    receive(cards) { return this._push({ type: 'receive', cards: parseCards(cards).map(c => c.id) }); }
    setMoonMode(on) { return this._push({ type: 'moon', on: !!on }); }
    /** Mark cards as already played without knowing who played them (used when a trick was missed). */
    markSeen(cards) { return this._push({ type: 'seen', cards: parseCards(cards).map(c => c.id) }); }
    markVoid(seat, suit) { return this._push({ type: 'void', seat, suit }); }
    setPointsTaken(arr) { return this._push({ type: 'points', pointsTaken: arr.slice() }); }
    setLeader(seat) { return this._push({ type: 'leader', seat }); }
    /** Record a play. seat: 0 you, 1 left, 2 across, 3 right. Throws on out-of-turn plays. */
    play(seat, card) {
      const c = parseCard(card);
      if (!c) throw new Error('Unknown card: ' + card);
      const expected = this.whoseTurn();
      if (expected != null && expected !== seat) throw new Error(`Expected ${this.seatNames[expected]} to play, got ${this.seatNames[seat]}`);
      if (seat === 0 && !has(this.hand, c.id)) throw new Error(`${fmt(c)} is not in your hand`);
      if (seat !== 0 && has(this.hand, c.id)) throw new Error(`${fmt(c)} is in your hand, ${this.seatNames[seat]} cannot play it`);
      if (this.isPlayed(c)) throw new Error(`${fmt(c)} was already played`);
      return this._push({ type: 'play', seat, card: c.id });
    }
    undo() { if (this.log.length) { this.log.pop(); this._rebuild(); } return this; }
    isPlayed(card) { const c = parseCard(card); return this.tricks.some(t => t.plays.some(p => p.card.id === c.id)) || this.trick.plays.some(p => p.card.id === c.id) || has(this.extraPlayed, c.id); }
    whoseTurn() {
      if (this.trick.plays.length) return (this.trick.leader + this.trick.plays.length) % 4;
      if (this.trick.leader != null) return this.trick.leader;
      if (this.tricks.length === 0) return has(this.hand, '2C') ? 0 : null; // unknown until 2♣ appears
      return null;
    }
    get heartsBroken() {
      const all = this.tricks.flatMap(t => t.plays).concat(this.trick.plays);
      return all.some(p => p.card.s === 'H') || (this.opts.qsBreaksHearts && all.some(p => p.card.id === 'QS'));
    }
    get passedTo() { return DIRECTION_SEAT[this.passDirection]; }
    state() {
      return {
        hand: this.hand, trick: this.trick, tricks: this.tricks, voids: this.voids, pointsTaken: this.pointsTaken,
        heartsBroken: this.heartsBroken, passedTo: this.passedTo, passedCards: this.passedCards, opts: this.opts,
        moonMode: this.moonMode, seatNames: this.seatNames, extraPlayed: this.extraPlayed,
      };
    }
    recommend() { return recommendPlay(this.state()); }
    recommendPass() { return recommendPass(this.hand, this.passDirection); }
    legal() { return legalPlays(normalizeState(this.state())); }
    handOver() { return this.tricks.length === 13; }
  }

  return {
    RANKS, SUITS, SUIT_SYMBOL, SUIT_NAME, SUIT_ONE, SEAT_NAMES, DECK, CARD_BY_ID, DIRECTION_SEAT,
    parseCard, parseCards, fmt, fmtList, sortHand, groupBySuit, isPoint, pointValue,
    evaluateMoon, recommendPass, passDanger, legalPlays, recommendPlay, analyze, trickWinner, trickPoints,
    HandTracker,
  };
});
