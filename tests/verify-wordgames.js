// verify-wordgames.mjs — checks that every element ID referenced by a game's
// JS actually exists in its HTML, and that atelier assets are linked.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'wordGames');

const games = process.argv.slice(1);
if (!games.length) { console.log('usage: node verify-wordgames.mjs <game.js> ...'); process.exit(2); }

let fail = 0;
for (const jsName of games) {
    const jsPath = path.join(dir, jsName);
    if (!fs.existsSync(jsPath)) { console.log('SKIP (no js):', jsName); continue; }
    const c = fs.readFileSync(jsPath, 'utf8');
    const htmlName = jsName.replace(/\.js$/, '.html');
    const htmlPath = path.join(dir, htmlName);
    const h = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';

    // element IDs referenced via getElementById / el('...') / $('...') / on('...')
    const ids = new Set();
    const dynamic = new Set();
    for (const m of c.matchAll(/getElementById\(\s*['"]([A-Za-z0-9_-]+)['"]\s*\)/g)) ids.add(m[1]);
    for (const m of c.matchAll(/(?:el|on|\$)\(\s*['"]([A-Za-z0-9_-]+)['"]/g)) ids.add(m[1]);
    // dynamic concatenation templates like $('tab' + i) / el('screen-' + tab) — not real IDs
    for (const m of c.matchAll(/(?:el|on|\$)\(\s*'([A-Za-z0-9_-]+)'\s*\+/g)) dynamic.add(m[1]);
    dynamic.forEach(id => ids.delete(id));

    const missing = [...ids].filter(id => /^[A-Za-z0-9_]+$/.test(id) && !h.includes('id="' + id + '"'));
    const skippedDynamic = [...ids].filter(id => !/^[A-Za-z0-9_]+$/.test(id));
    console.log('== ' + jsName + ' == (' + ids.size + ' ids)');
    if (missing.length) { console.log('   MISSING IDs: ' + missing.join(', ')); fail++; }
    else console.log('   all element IDs present');
    if (!h.includes('atelier-shared.css')) { console.log('   !! atelier-shared.css NOT linked'); fail++; }
    if (!h.includes('atelier-shell.js')) { console.log('   !! atelier-shell.js NOT linked'); fail++; }
}
console.log(fail ? 'RESULT: ' + fail + ' problems' : 'RESULT: OK');
process.exit(fail ? 1 : 0);