// Terminal watcher: opens cardgames.io Hearts in a real Chromium window with the overlay injected,
// and prints every recommendation to your terminal as you play.
//
//   npm run build && npm run watch
//
// Requires: npm i -D playwright  (or playwright-core with a local Chrome; see README).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = fs.readFileSync(path.join(here, '..', 'dist', 'hearts-coach.user.js'), 'utf8');
const url = process.argv[2] || 'https://cardgames.io/hearts/';
const profile = path.join(os.homedir(), '.hearts-coach-profile');

const ctx = await chromium.launchPersistentContext(profile, {
  headless: false,
  viewport: null,
  args: ['--window-size=1200,1000'],
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});
const page = ctx.pages()[0] || await ctx.newPage();
await page.addInitScript(script.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '') + '\n;try{localStorage.setItem("heartsCoach.cfg.v1", JSON.stringify(Object.assign(JSON.parse(localStorage.getItem("heartsCoach.cfg.v1")||"{}"),{log:true})))}catch(e){}');
page.on('console', msg => {
  const t = msg.text();
  if (t.startsWith('[hearts-coach] ')) console.log('\n' + t.slice(15));
});
console.log(`Opening ${url} — play in the window; advice appears here and in the overlay.`);
await page.goto(url);
await new Promise(() => {});
