/*
 * Hearts Coach — protocol tap
 *
 * Some Hearts sites (letsplayhearts.com among them) log their whole network
 * conversation to the browser console, e.g.
 *
 *   received network message {"cards":{"cards":"KS QH JH"},"cmd":"cards_were_passed",
 *                             "hand":{"cards":"3S 6S 8S 10S KS JH QH 5C 3D 7D 8D 10D QD"}}
 *
 * That is authoritative, unlike scraping pixels or markup: it states your hand
 * exactly, and it states it AFTER the pass, which is the one thing screen
 * reading cannot work out on its own.
 *
 * This tap watches console output and WebSocket traffic, pulls any JSON out of
 * it, and records what it understands. Anything it does not understand is kept
 * verbatim so it can be read later and taught.
 *
 * It only ever reads. It never sends, and never touches the page's own state.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HeartsProtocol = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const H = (typeof HeartsCoach !== 'undefined') ? HeartsCoach : (typeof window !== 'undefined' && window.HeartsCoach);

  const CARD_LIST = /^\s*(?:(?:10|[2-9TJQKA])[CDHS](?:\s+|$))+$/i;
  const SEAT_KEYS = ['pid', 'player', 'playerid', 'playerindex', 'playernum', 'playernumber', 'seat', 'seatid', 'position', 'pos', 'who', 'index', 'idx', 'from', 'turn'];
  const MAX = 400;

  const state = {
    active: false,
    raw: [],          // recent raw lines, newest last
    messages: [],     // recent parsed objects
    cmds: {},         // cmd -> how many times seen
    hand: null,       // latest full 13-card hand
    handSeq: 0,       // bumps whenever `hand` changes
    passed: null,     // cards we sent away
    received: null,   // cards we got back
    plays: [],        // {seat, card, seq} when a play message is recognised
    events: [],       // ordered stream the overlay consumes: {seq, kind:'hand'|'play', ...}
    seq: 0,
    unknown: [],      // messages carrying cards we could not interpret
  };

  function push(arr, v) { arr.push(v); if (arr.length > MAX) arr.shift(); }

  /** Every card list found anywhere in an object, with the key path that held it. */
  function findCardLists(obj) {
    const out = [];
    (function walk(o, path) {
      if (o == null) return;
      if (typeof o === 'string') {
        if (CARD_LIST.test(o)) { const cs = H ? H.parseCards(o) : []; if (cs.length) out.push({ path, cards: cs, text: o.trim() }); }
        return;
      }
      if (Array.isArray(o)) { o.forEach((v, i) => walk(v, path + '[' + i + ']')); return; }
      if (typeof o === 'object') { for (const k of Object.keys(o)) walk(o[k], path ? path + '.' + k : k); }
    })(obj, '');
    return out;
  }

  /** First integer 0-3 stored under a seat-ish key. */
  function findSeat(obj) {
    let found = null;
    (function walk(o) {
      if (found !== null || o == null || typeof o !== 'object') return;
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (Number.isInteger(v) && v >= 0 && v <= 3 && SEAT_KEYS.includes(k.toLowerCase())) { found = v; return; }
        if (v && typeof v === 'object') walk(v);
        if (found !== null) return;
      }
    })(obj);
    return found;
  }

  function emit(ev) { ev.seq = ++state.seq; push(state.events, ev); return ev; }

  function handle(msg, direction) {
    if (!msg || typeof msg !== 'object') return;
    push(state.messages, { t: Date.now(), direction, msg });
    const cmd = String(msg.cmd || msg.command || msg.type || '').toLowerCase();
    if (cmd) state.cmds[cmd] = (state.cmds[cmd] || 0) + 1;
    const lists = findCardLists(msg);
    if (!lists.length) return;

    // A full 13-card list is a hand, whatever the message is called.
    const full = lists.find(l => l.cards.length === 13);
    if (full) {
      const ids = full.cards.map(c => c.id).join(' ');
      if (!state.hand || state.hand.map(c => c.id).join(' ') !== ids) {
        state.hand = full.cards;
        state.handSeq++;
        emit({ kind: 'hand', cards: full.cards, passed: state.passed, received: state.received });
      }
    }
    // Our own outgoing pass, and the three that came back.
    if (direction === 'out' && /pass/.test(cmd)) {
      const three = lists.find(l => l.cards.length === 3);
      if (three) state.passed = three.cards;
    }
    if (/were_passed|cards_passed|receive/.test(cmd)) {
      const three = lists.find(l => l.cards.length === 3 && l.cards.length !== 13);
      if (three) state.received = three.cards;
    }
    // A single card plus a seat is very likely a play.
    const single = lists.filter(l => l.cards.length === 1);
    if (single.length === 1 && !full) {
      const seat = findSeat(msg);
      if (seat !== null && /play|card|trick|move/.test(cmd)) {
        const card = single[0].cards[0];
        const ev = emit({ kind: 'play', seat, card, cmd });
        push(state.plays, { seat, card, cmd, seq: ev.seq, path: single[0].path });
        return;
      }
      push(state.unknown, { cmd, path: single[0].path, text: single[0].text, msg });
    }
  }

  /** Pull the first JSON object out of a log line. */
  function jsonFrom(text) {
    const i = text.indexOf('{');
    if (i < 0) return null;
    const body = text.slice(i);
    try { return JSON.parse(body); } catch (e) { /* fall through */ }
    // Trailing prose after the JSON: walk braces to find where it closes.
    let depth = 0, inStr = false, esc = false;
    for (let j = 0; j < body.length; j++) {
      const ch = body[j];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (!depth) { try { return JSON.parse(body.slice(0, j + 1)); } catch (e) { return null; } } }
    }
    return null;
  }

  function feed(text, direction) {
    if (typeof text !== 'string' || text.length > 20000) return;
    if (text.indexOf('{') < 0) return;
    push(state.raw, direction + ' ' + text.slice(0, 600));
    const obj = jsonFrom(text);
    if (obj) { state.active = true; handle(obj, direction); }
  }

  function start() {
    if (state.started) return state;
    state.started = true;
    // Console tap. The game logs both directions; "sending" marks our own messages.
    for (const level of ['log', 'info', 'debug']) {
      const orig = console[level];
      if (typeof orig !== 'function') continue;
      console[level] = function () {
        try {
          const text = Array.prototype.map.call(arguments, a => (typeof a === 'string' ? a : safeStr(a))).join(' ');
          if (text.indexOf('[hearts-coach]') < 0) feed(text, /sending|send |outgoing|-->/i.test(text) ? 'out' : 'in');
        } catch (e) { /* never break the page's logging */ }
        return orig.apply(console, arguments);
      };
    }
    // WebSocket tap, for sites that do not log.
    try {
      const OrigWS = window.WebSocket;
      if (OrigWS) {
        const Wrapped = function (url, protocols) {
          const ws = protocols === undefined ? new OrigWS(url) : new OrigWS(url, protocols);
          ws.addEventListener('message', e => { try { feed(typeof e.data === 'string' ? e.data : '', 'in'); } catch (err) { /* ignore */ } });
          const send = ws.send;
          ws.send = function (d) { try { feed(typeof d === 'string' ? d : '', 'out'); } catch (err) { /* ignore */ } return send.apply(ws, arguments); };
          return ws;
        };
        Wrapped.prototype = OrigWS.prototype;
        for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) Wrapped[k] = OrigWS[k];
        window.WebSocket = Wrapped;
      }
    } catch (e) { /* ignore */ }
    return state;
  }

  function safeStr(v) { try { return JSON.stringify(v); } catch (e) { return String(v); } }

  /** A report to hand back to a human so the unknown messages can be taught. */
  function report() {
    const lines = [
      'Hearts Coach protocol log — ' + (typeof location !== 'undefined' ? location.href : ''),
      'Tap active: ' + state.active,
      'Commands seen: ' + (Object.keys(state.cmds).map(k => k + ' x' + state.cmds[k]).join(', ') || 'none'),
      'Hand: ' + (state.hand && H ? H.fmtList(state.hand) : 'none'),
      'Passed: ' + (state.passed && H ? H.fmtList(state.passed) : 'none') + '   Received: ' + (state.received && H ? H.fmtList(state.received) : 'none'),
      'Plays recognised: ' + state.plays.length + (state.plays.length && H ? ' (last: ' + state.plays.slice(-6).map(p => 'seat' + p.seat + ':' + H.fmt(p.card)).join(' ') + ')' : ''),
      '',
      'Single-card messages not recognised as plays (' + state.unknown.length + '):',
      ...state.unknown.slice(-8).map(u => '  cmd=' + u.cmd + ' path=' + u.path + ' card=' + u.text + ' :: ' + safeStr(u.msg).slice(0, 300)),
      '',
      'Last raw lines:',
      ...state.raw.slice(-25).map(r => '  ' + r),
    ];
    return lines.join('\n');
  }

  return { state, start, feed, report, findCardLists, findSeat, jsonFrom };
});
