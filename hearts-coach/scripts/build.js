// Builds dist/hearts-coach.user.js (Tampermonkey/Userscripts overlay) and dist/index.html (self-contained app).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });

const header = `// ==UserScript==
// @name         Hearts Coach
// @namespace    https://github.com/cosmomostad/hearts-coach
// @version      ${pkg.version}
// @description  Pro-level Hearts pass and play advice, with the reasoning, overlaid on the Hearts site you are playing
// @author       cosmomostad
// @match        https://cardgames.io/*
// @match        https://*.cardgames.io/*
// @match        https://letsplayhearts.com/*
// @match        https://*.letsplayhearts.com/*
// @match        https://*.playok.com/*
// @match        https://worldofcardgames.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
`;
const userscript = header + '\n' + read('src/engine.js') + '\n' + read('src/overlay.js');
fs.writeFileSync(path.join(root, 'dist/hearts-coach.user.js'), userscript);

const app = read('app/index.html').replace('<script src="../src/engine.js"></script>', '<script>\n' + read('src/engine.js') + '\n</script>');
fs.writeFileSync(path.join(root, 'dist/index.html'), app);
// Artifact variant: body-only (the host supplies the document skeleton).
const inner = app.replace(/^[\s\S]*?<head>/, '').replace(/<meta[^>]*>\s*/g, '').replace(/<\/head>\s*<body>/, '').replace(/<\/body>\s*<\/html>\s*$/, '');
fs.writeFileSync(path.join(root, 'dist/artifact.html'), inner);
console.log('built dist/hearts-coach.user.js, dist/index.html and dist/artifact.html');
