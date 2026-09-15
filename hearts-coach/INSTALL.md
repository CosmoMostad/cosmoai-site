# Turning the live overlay on

Three ways, fastest first. All of them read only what is already on your screen: your own hand and the cards played to the table. Face-down cards are ignored.

## Reading the site's own messages

Some sites, letsplayhearts.com among them, print their whole network conversation to the browser console:

```
received network message {"cards":{"cards":"KS QH JH"},"cmd":"cards_were_passed",
                          "hand":{"cards":"3S 6S 8S 10S KS JH QH 5C 3D 7D 8D 10D QD"}}
```

The overlay watches for that and prefers it over reading the screen, because it is exact and because it states your hand *after* the pass, which screen reading cannot work out by itself. When the tap is live the panel's footer says so. Nothing is ever sent; the tap only listens.

The tap starts working from the next deal after you load the overlay, so if you paste mid-hand it falls back to reading the screen until the next hand begins.

**Copy log** in the panel copies what the site has said so far, including any message the tap did not understand. That is the fastest way to teach it a new site.

## Which sites it works on

The overlay is not tied to one site. It looks for card elements by id, class, `data-*` attributes, image filenames and the rank and suit printed on the card face, and it searches same-origin iframes as well as the main page. The bundled `@match` list covers cardgames.io, letsplayhearts.com, playok.com and worldofcardgames.com; add any other address to that list at the top of the file.

**One hard limit.** If a site draws its table to a `<canvas>` rather than with HTML elements, there is nothing in the page for the overlay to read, and no selector will change that. The panel says so plainly when it detects this. Use the manual coach app for those sites.

## Get the code onto your machine

```bash
git clone https://github.com/cosmomostad/cosmoai-site
cd cosmoai-site
git checkout claude/hearts-decision-support-9n9ff3
cd hearts-coach
npm run build      # writes dist/hearts-coach.user.js
```

`dist/hearts-coach.user.js` is the whole overlay in one file. Nothing else is required to run it.

## 1. Console paste (30 seconds, lasts until you reload)

Good for trying it out right now.

```bash
npm run copy       # macOS: copies dist/hearts-coach.user.js to the clipboard
```

1. Open https://cardgames.io/hearts/ .
2. Open the JavaScript console.
   - **Chrome / Edge / Firefox**: `Option+Cmd+J` (Mac) or `Ctrl+Shift+J` (Windows).
   - **Safari**: first turn on Settings → Advanced → "Show features for web developers", then `Option+Cmd+C`.
   - Safari also asks you to type `allow pasting` (Chrome) or confirm once before it accepts pasted code.
3. Paste, press Enter. The panel appears in the top right.

It disappears on reload. For a permanent install use option 2.

## 2. Userscript manager (permanent, recommended)

The overlay loads itself every time you open the game.

**Safari (macOS/iOS)**

1. Install [Userscripts](https://apps.apple.com/us/app/userscripts/id1463298887) from the App Store. It is free and open source.
2. Safari → Settings → Extensions → turn on Userscripts, and set it to **Allow** on cardgames.io.
3. Click the Userscripts button in the toolbar → **Open Extension Page**, then set a scripts folder if it asks.
4. Click **+** → **New Javascript**, delete the placeholder, paste the contents of `dist/hearts-coach.user.js`, and save.
5. Reload https://cardgames.io/hearts/ .

**Chrome / Edge / Firefox**

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Chrome only: `chrome://extensions` → Tampermonkey → **Details** → turn on **Allow User Scripts** (or enable Developer mode).
3. Tampermonkey icon → **Create a new script**, select all, paste `dist/hearts-coach.user.js`, `Cmd/Ctrl+S`.
4. Reload the game.

## 3. Terminal watcher (advice printed in your terminal)

Plays the game in a Chromium window that the coach drives, and prints every recommendation to your terminal as you go.

```bash
npm install
npm run build
npm run watch
```

The browser profile persists in `~/.hearts-coach-profile`, so settings and logins survive restarts. To drive your installed Chrome instead of Playwright's, set `CHROME_PATH=/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome`.

## Using the panel

- **Pass direction dropdown**: set it to match the current hand. After that it rotates by itself (left, right, across, hold).
- **Gold outline**: the card the coach wants you to play, highlighted on the table itself.
- **Moon mode**: flip it on when you are going for all 26. The engine switches from avoiding points to winning every trick.
- **Resync**: click if the coach falls behind after a fast animation. It re-reads your hand and keeps the counts, voids and points it already knows.
- **New hand**: forget everything and wait for the next 13-card deal.
- **Calibrate**: shows what the detector found and lets you enter a CSS selector for card elements.

## If the panel says it cannot see cards

cardgames.io changes its markup from time to time. The detector tries element ids, classes, `data-*` attributes, image filenames, and the rank and suit text on the card face.

Click **Calibrate**. It builds a diagnostic report, copies it to your clipboard and prints it to the console. The report lists the cards it matched, the elements they came from, the elements it rejected, and whether the page uses a canvas or a cross-origin iframe. Paste that report back to Claude and the selector can be pinned in one line.
