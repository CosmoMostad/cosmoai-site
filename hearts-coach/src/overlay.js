/*
 * Hearts Coach — cardgames.io overlay
 * Reads YOUR hand and the cards on the table from the page (never face-down cards),
 * feeds them to the HeartsCoach engine, and shows the recommended pass/play with reasons.
 *
 * Built into dist/hearts-coach.user.js together with engine.js. Do not load alone.
 */
(function () {
  'use strict';
  const H = (typeof HeartsCoach !== 'undefined') ? HeartsCoach : (typeof window !== 'undefined' && window.HeartsCoach);
  if (!H) { console.error('[hearts-coach] engine missing'); return; }
  if (window.__heartsCoachLoaded) return;
  window.__heartsCoachLoaded = true;

  // ------------------------------------------------------------ config
  const CFG_KEY = 'heartsCoach.cfg.v1';
  const DEFAULT_CFG = {
    passDirection: 'left',      // direction of the CURRENT hand; auto-rotates left → right → across → hold
    autoRotatePass: true,
    cardSelector: '',           // override, e.g. '.card' — blank = auto-detect
    pollMs: 200,
    log: false,                 // also print advice to console (used by watch/watch.mjs)
    minimized: false,
    x: null, y: null,
  };
  let cfg = Object.assign({}, DEFAULT_CFG);
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); } catch (e) { /* ignore */ }
  function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ } }

  // ------------------------------------------------------------ scraping
  const RANK_WORDS = 'two|three|four|five|six|seven|eight|nine|ten|jack|queen|king|ace';
  const TOKEN_RES = [
    /(?:^|[^a-z0-9])(10|[2-9]|[tjqka])[ _-]?(?:of[ _-]?)?([cdhs])(?:[^a-z0-9]|$)/i,
    /(?:^|[^a-z0-9])([cdhs])[ _-]?(10|[2-9]|[tjqka])(?:[^a-z0-9]|$)/i,
    new RegExp('(' + RANK_WORDS + ')[ _-]?(?:of[ _-]?)?(clubs?|diamonds?|hearts?|spades?)', 'i'),
    new RegExp('(clubs?|diamonds?|hearts?|spades?)[ _-]?(' + RANK_WORDS + ')', 'i'),
    /(?:^|[^a-z0-9])([cdhs])(1[0-4]|[1-9])(?:[^a-z0-9]|$)/i,
    /(?:^|[^a-z0-9])(1[0-4]|[1-9])([cdhs])(?:[^a-z0-9]|$)/i,
  ];
  function cardFromString(str) {
    if (!str) return null;
    const s = String(str);
    const direct = H.parseCard(s);
    if (direct) return direct;
    for (const re of TOKEN_RES) {
      const m = s.match(re);
      if (m) { const c = H.parseCard(m[1] + ' ' + m[2]); if (c) return c; }
    }
    return null;
  }
  /** Text on a card face, e.g. "4♥", "10♦", or "Q♠Q♠" when both corners are labelled. */
  function compactText(el) {
    const t = (el.innerText || el.textContent || '').replace(/\s+/g, '');
    if (!t || t.length > 8) return '';
    // A container holding several different cards is not itself a card.
    const m = t.match(/(10|[2-9TJQKA])([CDHS♣♦♥♠])/gi);
    if (m && m.length > 1 && new Set(m.map(x => x.toUpperCase())).size > 1) return '';
    return m ? m[0] : t;
  }
  function cardFromElement(el) {
    const tries = [
      el.dataset && (el.dataset.card || el.dataset.cardId || el.dataset.id || el.dataset.name),
      el.dataset && el.dataset.rank && el.dataset.suit && (el.dataset.rank + el.dataset.suit),
      el.getAttribute && el.getAttribute('aria-label'),
      el.getAttribute && el.getAttribute('alt'),
      el.getAttribute && el.getAttribute('title'),
      el.id,
      el.className && typeof el.className === 'string' ? el.className : '',
      el.getAttribute && el.getAttribute('src') ? el.getAttribute('src').split('/').pop().replace(/\.[a-z]+$/i, '') : '',
      el.style && el.style.backgroundImage ? el.style.backgroundImage.split('/').pop() : '',
    ];
    for (const t of tries) { if (t) { const c = t === el.id || typeof t === 'string' ? cardFromString(t) : null; if (c) return c; } }
    const txt = compactText(el);
    if (txt) { const c = H.parseCard(txt); if (c) return c; }
    return null;
  }
  function looksFaceDown(el) {
    const s = ((typeof el.className === 'string' ? el.className : '') + ' ' + el.id).toLowerCase();
    return /back|facedown|face-down|hidden|closed/.test(s);
  }
  function visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    const view = (el.ownerDocument && el.ownerDocument.defaultView) || window;
    const cs = view.getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) !== 0;
  }
  /** Documents to search: this one, plus any same-origin iframe, with its offset. */
  function searchRoots() {
    const roots = [{ doc: document, dx: 0, dy: 0 }];
    for (const f of document.querySelectorAll('iframe')) {
      let d = null;
      try { d = f.contentDocument; } catch (e) { d = null; }
      if (!d) continue;
      const r = f.getBoundingClientRect();
      roots.push({ doc: d, dx: r.left, dy: r.top });
    }
    return roots;
  }
  /** Large canvases and cross-origin iframes, which DOM scraping cannot see into. */
  function opaqueSurfaces() {
    const canvases = [], frames = [];
    for (const c of document.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect();
      if (r.width >= 300 && r.height >= 200) canvases.push({ el: c, w: Math.round(r.width), h: Math.round(r.height) });
    }
    for (const f of document.querySelectorAll('iframe')) {
      let ok = false;
      try { ok = !!f.contentDocument; } catch (e) { ok = false; }
      const r = f.getBoundingClientRect();
      if (!ok && r.width >= 300 && r.height >= 200) frames.push({ el: f, src: f.src || '(no src)', w: Math.round(r.width), h: Math.round(r.height) });
    }
    return { canvases, frames };
  }
  /** Find every face-up card element on the page with its position. */
  function scanCards() {
    const sel = cfg.cardSelector || '[class*="card" i], [id*="card" i], [data-card], [data-rank], [data-value], img, [class*="suit" i], [class*="hand" i] > *';
    const found = new Map(); // id -> {card, el, rect}
    for (const { doc, dx, dy } of searchRoots()) {
      let nodes;
      try { nodes = doc.querySelectorAll(sel); } catch (e) { try { nodes = doc.querySelectorAll('[class*="card" i]'); } catch (e2) { continue; } }
      for (const el of nodes) {
        if (el.closest && el.closest('#hearts-coach-panel')) continue;
        if (looksFaceDown(el) || !visible(el)) continue;
        const card = cardFromElement(el);
        if (!card) continue;
        const r = el.getBoundingClientRect();
        const rect = { left: r.left + dx, top: r.top + dy, width: r.width, height: r.height };
        const prev = found.get(card.id);
        if (!prev || rect.width * rect.height > prev.rect.width * prev.rect.height) found.set(card.id, { card, el, rect });
      }
    }
    return [...found.values()];
  }
  /** Split found cards into my hand (bottom row) and the trick (everything else). */
  function classify(items) {
    if (!items.length) return { hand: [], trick: [], center: null };
    const maxTop = Math.max(...items.map(i => i.rect.top));
    const h = Math.max(...items.map(i => i.rect.height));
    const hand = items.filter(i => maxTop - i.rect.top < h * 0.6);
    const trick = items.filter(i => !hand.includes(i));
    // Table centre: common ancestor of everything we found.
    let anc = items[0].el;
    for (const i of items) while (anc && !anc.contains(i.el)) anc = anc.parentElement;
    const r = anc ? anc.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    if (hand.length > 0 && trick.length > 4) {
      // Too many "trick" cards: probably a spread hand while the table is empty. Keep the 4 nearest the centre.
      trick.sort((a, b) => dist(a, center) - dist(b, center));
      trick.length = 4;
    }
    return { hand, trick, center };
  }
  function dist(i, c) { const x = i.rect.left + i.rect.width / 2 - c.x, y = i.rect.top + i.rect.height / 2 - c.y; return Math.hypot(x, y); }
  function seatByPosition(item, center) {
    const dx = item.rect.left + item.rect.width / 2 - center.x;
    const dy = item.rect.top + item.rect.height / 2 - center.y;
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 1 : 3;
    return dy > 0 ? 0 : 2;
  }

  // ------------------------------------------------------------ tracking
  let tracker = new H.HandTracker();
  let dealt = null;            // the 13 cards first seen this hand
  let lastAdviceKey = '';
  let lastProtoSeq = -1;
  const PROTO = (typeof HeartsProtocol !== 'undefined') ? HeartsProtocol : (window.HeartsProtocol || null);
  if (PROTO) { try { PROTO.start(); } catch (e) { console.warn('[hearts-coach] protocol tap failed', e); } }
  let status = 'Waiting for a hand…';
  let desync = null;

  function ids(items) { return items.map(i => i.card.id).sort().join(' '); }
  function sameSet(a, b) { return a.length === b.length && ids(a) === ids(b); }

  function step() {
    // A site that broadcasts its own state beats anything we can read off the screen.
    if (PROTO && PROTO.state.hand && PROTO.state.handSeq !== lastProtoSeq) {
      lastProtoSeq = PROTO.state.handSeq;
      handFromProtocol(PROTO.state);
    }
    let items;
    try { items = scanCards(); } catch (e) { status = 'scan error: ' + e.message; render(); return; }
    const { hand, trick, center } = classify(items);
    const handCards = hand.map(i => i.card);
    const trickIds = new Set(trick.map(i => i.card.id));

    // New hand? (Skipped once the protocol tap is feeding us hands.)
    if (!(PROTO && PROTO.state.hand) && handCards.length === 13 && (!dealt || (tracker.tricks.length === 0 && tracker.trick.plays.length === 0 && !sameSet(hand, dealt.map(c => ({ card: c })))))) {
      if (!dealt) {
        newHand(handCards);
      } else if (cfg.passDirection === 'hold' || tracker.receivedCards.length) {
        // A completely new deal while the previous one never started (e.g. New Game).
        newHand(handCards);
      } else {
        // Same deal, cards changed and nothing played: the pass happened.
        const passed = dealt.filter(c => !handCards.some(h => h.id === c.id));
        const received = handCards.filter(c => !dealt.some(d => d.id === c.id));
        if (passed.length === 3 && received.length === 3) {
          tracker.setPass(passed, cfg.passDirection);
          tracker.receive(received);
          dealt = tracker.hand.slice();
          status = `Passed ${H.fmtList(passed)} ${cfg.passDirection}, received ${H.fmtList(received)}.`;
          lastAdviceKey = '';
        } else {
          newHand(handCards);
        }
      }
    }
    if (!dealt) { status = handCards.length ? `Seeing ${handCards.length} cards — waiting for a full 13-card deal.` : noCardsHint(); render(); return; }

    // Passing phase: 13 cards, nothing played, direction not hold.
    const passing = !(PROTO && PROTO.state.hand) && tracker.tricks.length === 0 && tracker.trick.plays.length === 0 && !tracker.receivedCards.length && cfg.passDirection !== 'hold' && handCards.length >= 10 && trick.length === 0;
    if (passing) { renderPass(); return; }

    // Play phase: record new cards on the table in seat order.
    const known = new Set(tracker.trick.plays.map(p => p.card.id));
    let fresh = trick.filter(i => !known.has(i.card.id) && !tracker.isPlayed(i.card));
    if (tracker.trick.plays.length === 0 && trick.length === 0 && known.size === 0) { /* table clear between tricks */ }
    if (fresh.length) {
      if (fresh.length > 1 && center) {
        // Several cards appeared at once: order them by seat starting from whoever is on turn.
        const start = tracker.whoseTurn();
        const seatOf = i => seatByPosition(i, center);
        if (start != null) fresh.sort((a, b) => ((seatOf(a) - start + 4) % 4) - ((seatOf(b) - start + 4) % 4));
      }
      for (const i of fresh) {
        let seat = tracker.whoseTurn();
        if (seat == null) seat = center ? seatByPosition(i, center) : 0;
        if (seat === 0 && !tracker.hand.some(c => c.id === i.card.id)) {
          // We think it's our turn but the card isn't ours — position says otherwise. Trust position.
          seat = center ? seatByPosition(i, center) : seat;
        }
        try { tracker.play(seat, i.card); desync = null; }
        catch (e) { desync = e.message; }
      }
      lastAdviceKey = '';
    }
    // Sanity: our hand on screen should match the tracker.
    if (!sameSet(hand, tracker.hand.map(c => ({ card: c }))) && handCards.length && tracker.trick.plays.every(p => p.seat !== 0 || !handCards.some(h => h.id === p.card.id))) {
      const missing = tracker.hand.filter(c => !handCards.some(h => h.id === c.id));
      const extra = handCards.filter(c => !tracker.hand.some(h => h.id === c.id));
      if (missing.length || extra.length) desync = `Hand mismatch (tracker has ${H.fmtList(missing)} you don't; screen shows ${H.fmtList(extra)} the tracker lacks). Click Resync.`;
    }
    render();
  }

  /** Why we might be seeing nothing, in the user's terms. */
  function noCardsHint() {
    const { canvases, frames } = opaqueSurfaces();
    if (canvases.length) return `This game draws to a canvas (${canvases[0].w}x${canvases[0].h}), so there are no card elements to read. The overlay cannot work here — use the manual coach app instead.`;
    if (frames.length) return `The game sits in an iframe from another site (${frames[0].src}). Add that address to the script's @match list so the overlay loads inside it too.`;
    return 'No cards detected yet. Start a hand, then click Calibrate.';
  }

  /** Start a hand from the site's own message: authoritative, and already past the pass. */
  function handFromProtocol(ps) {
    tracker = new H.HandTracker();
    tracker.setHand(ps.hand);
    if (ps.passed || ps.received) tracker.setPassInfo(ps.passed, ps.received, cfg.passDirection);
    dealt = tracker.hand.slice();
    desync = null; lastAdviceKey = '';
    status = ps.passed
      ? `Hand read from the site. You passed ${H.fmtList(ps.passed)} and got ${H.fmtList(ps.received || [])}.`
      : 'Hand read from the site.';
  }

  function newHand(handCards) {
    if (dealt && cfg.autoRotatePass && tracker.tricks.length > 0) {
      const order = ['left', 'right', 'across', 'hold'];
      cfg.passDirection = order[(order.indexOf(cfg.passDirection) + 1) % 4];
      saveCfg();
    }
    tracker = new H.HandTracker();
    tracker.setHand(handCards);
    tracker.passDirection = cfg.passDirection;
    dealt = tracker.hand.slice();
    desync = null; lastAdviceKey = '';
    status = `New hand. Pass direction: ${cfg.passDirection}.`;
  }

  /** Rebuild the tracker from the screen after a missed trick, keeping everything we learned. */
  function resync() {
    const { hand } = classify(scanCards());
    const handCards = hand.map(i => i.card);
    if (!handCards.length) return;
    const old = tracker;
    const t = new H.HandTracker();
    t.setHand(handCards);
    if (old.passedCards.length) { t.passDirection = old.passDirection; t.passedCards = old.passedCards; t.receivedCards = old.receivedCards; }
    const seen = old.tricks.flatMap(x => x.plays).concat(old.trick.plays).map(p => p.card).concat(old.extraPlayed);
    if (seen.length) t.markSeen(seen);
    for (const s of [1, 2, 3]) for (const v of old.voids[s]) t.markVoid(s, v);
    t.setPointsTaken(old.pointsTaken);
    if (old.moonMode) t.setMoonMode(true);
    tracker = t;
    desync = null; lastAdviceKey = '';
    status = 'Resynced from screen. Trick history is incomplete, but card counts, voids and points carry over.';
    render();
  }

  // ------------------------------------------------------------ UI
  const panel = document.createElement('div');
  panel.id = 'hearts-coach-panel';
  panel.innerHTML = `
    <style>
      #hearts-coach-panel { position: fixed; z-index: 2147483000; top: 12px; right: 12px; width: 340px; max-height: 92vh; overflow: auto;
        background: #101a13; color: #e8efe9; border: 1px solid #2b4031; border-radius: 10px; font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; box-shadow: 0 8px 30px rgba(0,0,0,.5); }
      #hearts-coach-panel .hc-bar { cursor: move; padding: 8px 10px; background: #16241a; border-bottom: 1px solid #2b4031; display: flex; align-items: center; gap: 8px; border-radius: 10px 10px 0 0; }
      #hearts-coach-panel .hc-bar b { flex: 1; }
      #hearts-coach-panel button, #hearts-coach-panel select { background: #22362a; color: #e8efe9; border: 1px solid #2b4031; border-radius: 6px; padding: 3px 7px; font-size: 12px; cursor: pointer; }
      #hearts-coach-panel .hc-body { padding: 10px; }
      #hearts-coach-panel .hc-head { font-size: 22px; font-weight: 800; color: #ffd166; margin: 4px 0; }
      #hearts-coach-panel ul { margin: 4px 0 6px 16px; padding: 0; }
      #hearts-coach-panel .hc-intel, #hearts-coach-panel .hc-dim { color: #9db3a3; font-size: 12px; }
      #hearts-coach-panel .hc-moon { color: #ff6b6b; font-weight: 700; }
      #hearts-coach-panel .hc-status { color: #9db3a3; font-size: 11px; margin-top: 6px; }
      #hearts-coach-panel .hc-warn { color: #ffb4a2; font-size: 12px; margin-top: 6px; }
      #hearts-coach-panel .hc-row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 6px; }
      #hearts-coach-panel.hc-min .hc-body { display: none; }
      .hc-rec-card { outline: 4px solid #ffd166 !important; box-shadow: 0 0 14px #ffd166 !important; border-radius: 6px; }
    </style>
    <div class="hc-bar"><b>♥ Hearts Coach</b>
      <select class="hc-dir" title="Pass direction this hand"><option value="left">Pass left</option><option value="right">Pass right</option><option value="across">Pass across</option><option value="hold">No pass</option></select>
      <button class="hc-min-btn" title="Minimise">–</button></div>
    <div class="hc-body">
      <div class="hc-advice">Waiting for a hand…</div>
      <ul class="hc-intel"></ul>
      <div class="hc-warn"></div>
      <div class="hc-row">
        <label><input type="checkbox" class="hc-moon-cb"> Moon mode</label>
        <button class="hc-resync">Resync</button>
        <button class="hc-newhand">New hand</button>
        <button class="hc-calib">Calibrate</button>
        <button class="hc-proto" title="Copy this site's message log for diagnosis">Copy log</button>
        <label title="Print advice to the console (used by the terminal watcher)"><input type="checkbox" class="hc-log"> Log</label>
      </div>
      <div class="hc-status"></div>
    </div>`;
  const inSubFrame = (() => { try { return window.top !== window.self; } catch (e) { return true; } })();
  if (inSubFrame && !scanCards().length) { window.__heartsCoachLoaded = false; return; }
  document.documentElement.appendChild(panel);
  const q = s => panel.querySelector(s);
  q('.hc-dir').value = cfg.passDirection;
  q('.hc-dir').onchange = e => { cfg.passDirection = e.target.value; tracker.passDirection = cfg.passDirection; saveCfg(); lastAdviceKey = ''; render(); };
  q('.hc-min-btn').onclick = () => { cfg.minimized = !cfg.minimized; saveCfg(); panel.classList.toggle('hc-min', cfg.minimized); };
  panel.classList.toggle('hc-min', cfg.minimized);
  q('.hc-moon-cb').onchange = e => { tracker.setMoonMode(e.target.checked); lastAdviceKey = ''; render(); };
  q('.hc-resync').onclick = resync;
  q('.hc-newhand').onclick = () => { dealt = null; tracker = new H.HandTracker(); status = 'Reset. Waiting for 13 cards.'; render(); };
  q('.hc-log').checked = !!cfg.log;
  q('.hc-log').onchange = e => { cfg.log = e.target.checked; saveCfg(); };
  q('.hc-calib').onclick = calibrate;
  q('.hc-proto').onclick = () => {
    if (!PROTO) { alert('Protocol tap not loaded.'); return; }
    const text = PROTO.report();
    console.log('[hearts-coach] ' + text);
    let ok = false;
    try { navigator.clipboard.writeText(text); ok = true; } catch (e) { /* ignore */ }
    alert(text.split('\n').slice(0, 8).join('\n') + '\n\n' + (ok ? 'Full log copied to your clipboard — paste it to Claude.' : 'Full log printed to the console.'));
  };
  if (cfg.x != null) { panel.style.left = cfg.x + 'px'; panel.style.top = cfg.y + 'px'; panel.style.right = 'auto'; }
  (function drag() {
    let sx, sy, ox, oy, on = false;
    q('.hc-bar').addEventListener('mousedown', e => { if (e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return; on = true; sx = e.clientX; sy = e.clientY; const r = panel.getBoundingClientRect(); ox = r.left; oy = r.top; e.preventDefault(); });
    addEventListener('mousemove', e => { if (!on) return; panel.style.left = (ox + e.clientX - sx) + 'px'; panel.style.top = (oy + e.clientY - sy) + 'px'; panel.style.right = 'auto'; });
    addEventListener('mouseup', () => { if (!on) return; on = false; const r = panel.getBoundingClientRect(); cfg.x = r.left; cfg.y = r.top; saveCfg(); });
  })();

  let highlighted = null;
  function highlight(card) {
    if (highlighted) { highlighted.classList.remove('hc-rec-card'); highlighted = null; }
    if (!card) return;
    const items = scanCards();
    const it = items.find(i => i.card.id === card.id);
    if (it) { it.el.classList.add('hc-rec-card'); highlighted = it.el; }
  }
  function esc(s) { return String(s).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch])); }

  function renderPass() {
    const key = 'pass:' + tracker.hand.map(c => c.id).join(',') + cfg.passDirection;
    if (key === lastAdviceKey) return;
    lastAdviceKey = key;
    tracker.passDirection = cfg.passDirection;
    const r = H.recommendPass(tracker.hand, cfg.passDirection);
    let html = `<div class="hc-head">Pass ${esc(H.fmtList(r.pass))}</div><ul>${r.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    html += `<b>Plan:</b><ul>${r.plan.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    if (r.moon.level !== 'no') html += `<div class="hc-moon">Moon ${r.moon.level === 'strong' ? 'candidate' : 'possible'}: ${esc(r.moon.alternative.reason)}</div>`;
    q('.hc-advice').innerHTML = html;
    q('.hc-intel').innerHTML = '';
    q('.hc-warn').textContent = '';
    q('.hc-status').textContent = `Passing ${cfg.passDirection}. Hand: ${H.fmtList(tracker.hand)}`;
    highlight(null);
    log(`PASS ${H.fmtList(r.pass)} (${cfg.passDirection})\n  ${r.reasons.join('\n  ')}\n  Plan: ${r.plan.join(' ')}`);
  }

  function render() {
    const tap = PROTO && PROTO.state.active ? ' · reading the site\u2019s own messages' : '';
    q('.hc-status').textContent = status + tap + (tracker.hand.length ? ` · Trick ${Math.min(13, tracker.tricks.length + 1)} · hand ${H.fmtList(tracker.hand)}` : '');
    q('.hc-warn').textContent = desync || '';
    if (!dealt) { q('.hc-advice').textContent = 'Waiting for a hand…'; q('.hc-intel').innerHTML = ''; highlight(null); return; }
    const turn = tracker.whoseTurn();
    const key = 'play:' + tracker.log.length + ':' + turn + ':' + tracker.moonMode;
    if (key === lastAdviceKey) return;
    lastAdviceKey = key;
    if (tracker.handOver()) { q('.hc-advice').innerHTML = `<div class="hc-head">Hand over</div>Points: ${tracker.pointsTaken.map((p, i) => `${H.SEAT_NAMES[i]} ${p}`).join(', ')}`; highlight(null); return; }
    const rec = tracker.recommend();
    q('.hc-intel').innerHTML = rec.intel.map(l => `<li class="${/MOON/.test(l) ? 'hc-moon' : ''}">${esc(l)}</li>`).join('');
    if (turn === 0 || (turn == null && tracker.hand.some(c => c.id === '2C'))) {
      let html = `<div class="hc-head">${esc(rec.headline)}</div><ul>${rec.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
      if (rec.alternatives.length) html += `<div class="hc-intel">Also: ${rec.alternatives.map(a => `<b>${esc(H.fmt(a.card))}</b>${a.why ? ' — ' + esc(a.why) : ''}`).join(' · ')}</div>`;
      q('.hc-advice').innerHTML = html;
      highlight(rec.card);
      log(`YOUR TURN → ${rec.headline}\n  ${rec.reasons.join('\n  ')}` + (rec.alternatives.length ? `\n  also: ${rec.alternatives.map(a => H.fmt(a.card)).join(', ')}` : '') + `\n  intel: ${rec.intel.join(' | ')}`);
    } else {
      q('.hc-advice').innerHTML = `<div class="hc-dim">${turn == null ? 'Waiting for the 2♣ lead.' : `Waiting for ${H.SEAT_NAMES[turn]}…`}</div>`;
      highlight(null);
    }
  }

  function describe(el) {
    const a = [];
    if (el.id) a.push(`id="${el.id}"`);
    if (el.className && typeof el.className === 'string') a.push(`class="${el.className}"`);
    for (const k of Object.keys(el.dataset || {})) a.push(`data-${k}="${el.dataset[k]}"`);
    const src = el.getAttribute && el.getAttribute('src');
    if (src) a.push(`src="${src.split('/').slice(-2).join('/')}"`);
    const txt = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 20);
    if (txt) a.push(`text="${txt}"`);
    return `<${el.tagName.toLowerCase()} ${a.join(' ')}>`;
  }
  function diagnosticReport() {
    const items = scanCards();
    const { hand, trick, center } = classify(items);
    const { canvases, frames } = opaqueSurfaces();
    const lines = [
      `Hearts Coach diagnostic — ${location.href}`,
      `Selector: ${cfg.cardSelector || '(auto)'}`,
      `Face-up cards found: ${items.length}`,
      `Hand (${hand.length}): ${H.fmtList(hand.map(i => i.card))}`,
      `Table (${trick.length}): ${center ? trick.map(i => `${H.fmt(i.card)}->${H.SEAT_NAMES[seatByPosition(i, center)]}`).join(' ') : ''}`,
      `Large canvases: ${canvases.length ? canvases.map(c => `${c.w}x${c.h}`).join(', ') : 'none'}`,
      `Cross-origin iframes: ${frames.length ? frames.map(f => f.src).join(', ') : 'none'}`,
      '',
      'Matched elements:',
      ...items.slice(0, 8).map(i => `  ${H.fmt(i.card)}  ${describe(i.el)}`),
      '',
      'Unmatched candidates:',
    ];
    const seen = new Set(items.map(i => i.el));
    let n = 0;
    for (const { doc } of searchRoots()) {
      let nodes = [];
      try { nodes = doc.querySelectorAll('[class*="card" i], [id*="card" i], [data-card], [class*="hand" i] > *, img'); } catch (e) { continue; }
      for (const el of nodes) {
        if (seen.has(el) || (el.closest && el.closest('#hearts-coach-panel')) || !visible(el)) continue;
        lines.push('  ' + describe(el));
        if (++n >= 12) break;
      }
      if (n >= 12) break;
    }
    if (!n) lines.push('  (none)');
    return lines.join('\n');
  }
  function calibrate() {
    const report = diagnosticReport();
    console.log('[hearts-coach] diagnostic\n' + report);
    let copied = false;
    try { navigator.clipboard.writeText(report); copied = true; } catch (e) { /* ignore */ }
    const sel = prompt(report + '\n\n' + (copied ? 'Copied to your clipboard — paste it to Claude.' : 'Also printed to the console.') +
      '\n\nIf the hand or table is wrong, enter a CSS selector for card elements (blank = auto):', cfg.cardSelector);
    if (sel != null) { cfg.cardSelector = sel.trim(); saveCfg(); lastAdviceKey = ''; render(); }
  }

  function log(msg) { if (cfg.log) console.log('[hearts-coach] ' + msg); }

  // ------------------------------------------------------------ loop
  let timer = null;
  const tick = () => { try { step(); } catch (e) { status = 'error: ' + e.message; q('.hc-status').textContent = status; console.error('[hearts-coach]', e); } };
  setInterval(tick, cfg.pollMs);
  new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(tick, 60); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'src'] });
  tick();
  window.heartsCoach = { get tracker() { return tracker; }, scanCards, classify, resync, cfg, H };
})();
