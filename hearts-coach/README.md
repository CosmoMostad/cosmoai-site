# Hearts Coach

Pro-level Hearts decision support: which three cards to pass, what to play on every trick, and **why**. The overlay works on any Hearts site that draws its cards with HTML elements, including [cardgames.io](https://cardgames.io/hearts/) and [letsplayhearts.com](https://letsplayhearts.com/); the engine itself is site-agnostic.

Three ways to use it:

| Mode | What it does | Setup |
|---|---|---|
| **Overlay** (`dist/hearts-coach.user.js`) | Reads your hand and the table from the game page and shows advice in a floating panel, highlighting the recommended card. | Tampermonkey / Safari Userscripts, one install |
| **Terminal watcher** (`npm run watch`) | Opens cardgames.io in a Chromium window with the overlay injected and prints each recommendation to your terminal, chat-style. | Node + Playwright |
| **Manual coach app** (`app/index.html`) | Enter your hand and each card as it is played; the coach advises every decision. Works with any Hearts game, online or at a kitchen table. | Open the file |

Setup for each mode is in [INSTALL.md](INSTALL.md). The strategy the coach follows is written up in [docs/STRATEGY.md](docs/STRATEGY.md).

## Quick start

```bash
git clone https://github.com/cosmomostad/hearts-coach
cd hearts-coach
npm test          # engine tests
npm run build     # writes dist/hearts-coach.user.js and dist/index.html
```

### Overlay on cardgames.io

1. Install a userscript manager. Safari: [Userscripts](https://apps.apple.com/us/app/userscripts/id1463298887) from the App Store. Chrome/Firefox/Edge: Tampermonkey.
2. Add `dist/hearts-coach.user.js` as a new script (paste its contents, or point the manager at the raw file on GitHub).
3. Open https://cardgames.io/hearts/ . A panel appears top right. Pick the pass direction for the current hand in the panel's dropdown; it rotates automatically each hand after that (left, right, across, hold).
4. Play. On your turn the panel shows **Lead 4♠** (or whatever) with the reasons, and the card is outlined in gold on the table.

The overlay never reads face-down cards. It only uses what you can see: your hand and the cards played to the table.

**If the panel says it cannot see cards**, click **Calibrate**. It copies a diagnostic report to your clipboard listing what matched, what did not, and whether the page uses a canvas or a cross-origin iframe, and lets you enter a CSS selector. A canvas-drawn game cannot be read at all; use the manual app for those.

**If the coach falls out of sync** (fast animations can hide a card from the poll), click **Resync**. It re-reads your hand and keeps the card counts, voids and points it already knows.

### Terminal watcher

```bash
npm install
npm run build
npm run watch
```

A Chromium window opens on cardgames.io with the overlay loaded, and every recommendation is also printed in the terminal. The browser profile lives in `~/.hearts-coach-profile` so logins and settings persist. To use your installed Chrome instead of the Playwright build, set `CHROME_PATH`.

### Manual coach app

Open `app/index.html` (or `dist/index.html`, which is self-contained) in a browser.

1. Set the pass direction and your opponents' names.
2. Click or type your 13 cards and press **Get pass advice**.
3. Mark what you actually passed and received, then **Start play**.
4. Enter each card as it is played (type `7d` and Enter, or click). When it is your turn the coach shows its pick, the reasoning, alternatives, and the table intel (Queen location, hearts remaining, who is void).

**Moon mode** flips the engine to maximise winning tricks when you are going for all 26.

## Engine API

`src/engine.js` has no dependencies and runs in Node or the browser (`window.HeartsCoach`).

```js
const H = require('./src/engine.js');

H.recommendPass('QS AS 3S 2C 5C 9C 4D 7D JD 3H 6H 9H KH', 'left');
// → { pass: [Q♠, A♠, K♥], reasons: [...], plan: [...], moon: { level, score, alternative } }

const t = new H.HandTracker();
t.setHand('2C 5C 9C AS 4S 4H 9H AD KD 3D 7S 8S 2D');
t.play(0, '2C'); t.play(1, '3C'); t.play(2, 'KC'); t.play(3, 'AC');
t.play(3, '4D');
t.recommend();
// → { card: 3♦, headline: 'Play 3♦', reasons: [...], alternatives: [...], intel: [...] }
```

Seats are `0` you, `1` left, `2` across, `3` right; play goes clockwise. Cards accept `QS`, `q♠`, `10h`, `queen of spades`, `s12` and similar.

Rules assumed (cardgames.io defaults): no points on the first trick, hearts must be broken before being led, Q♠ does not break hearts, no Jack of Diamonds bonus. Change with `new HandTracker({ noPointsFirstTrick, qsBreaksHearts })`.

## Layout

```
src/engine.js     strategy engine + hand tracker (tested)
src/overlay.js    cardgames.io DOM reader + floating panel
app/index.html    manual-entry coach
watch/watch.mjs   Playwright terminal watcher
scripts/build.js  bundles dist/
docs/STRATEGY.md  the playbook
test/             node --test
```

## License

MIT
