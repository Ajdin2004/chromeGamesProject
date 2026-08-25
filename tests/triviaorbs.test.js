/* ============================================================
   Trivia Orbs — plain-Node unit tests (no framework needed)
   Run: node tests\triviaorbs.test.js
   Covers the pure game logic exported from wordGames/triviaorbs.js
   ============================================================ */
const assert = require('assert');
const path = require('path');

const core = require(path.join(__dirname, '..', 'wordGames', 'triviaorbs.js'));

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✔ ${name}`);
}

console.log('\nTrivia Orbs — logic tests\n-------------------------');

test('hashSeed is deterministic and stable', () => {
  assert.strictEqual(core.hashSeed('triviaorbs-2026-08-26'), core.hashSeed('triviaorbs-2026-08-26'));
  assert.notStrictEqual(core.hashSeed('day-1'), core.hashSeed('day-2'));
});

test('mulberry32 produces deterministic sequences in [0,1)', () => {
  const a = core.mulberry32(12345), b = core.mulberry32(12345);
  assert.deepStrictEqual([a(), a(), a()], [b(), b(), b()]);
});

test('shuffleSeeded keeps all elements and respects the seed', () => {
  const src = ['a', 'b', 'c', 'd', 'e'];
  const r1 = core.shuffleSeeded(src, core.mulberry32(core.hashSeed('seed-x')));
  const r2 = core.shuffleSeeded(src, core.mulberry32(core.hashSeed('seed-x')));
  assert.deepStrictEqual(r1, r2, 'same seed -> same shuffle');
  assert.deepStrictEqual(r1.slice().sort(), src, 'same multiset after shuffle');
  assert.deepStrictEqual(src, ['a', 'b', 'c', 'd', 'e'], 'input array untouched');
});

test('todayKey returns UTC YYYY-MM-DD', () => {
  const d = new Date(Date.UTC(2026, 7, 26, 23, 59, 59));
  assert.strictEqual(core.todayKey(d), '2026-08-26');
});

test('diffInDays computes whole-day gaps', () => {
  assert.strictEqual(core.diffInDays('2026-08-25', '2026-08-26'), 1);
  assert.strictEqual(core.diffInDays('2026-08-01', '2026-09-01'), 31);
  assert.strictEqual(core.diffInDays('2026-08-26', '2026-08-25'), -1);
});

test('scoreAnswer applies difficulty multiplier and capped streak bonus', () => {
  assert.strictEqual(core.scoreAnswer('easy', 0), 10);    // 10 * 1 + 0
  assert.strictEqual(core.scoreAnswer('easy', 3), 16);    // 10 + 3*2
  assert.strictEqual(core.scoreAnswer('medium', 0), 15);  // 10 * 1.5
  assert.strictEqual(core.scoreAnswer('hard', 10), 30);   // 20 + 5(cap)*2
  assert.strictEqual(core.scoreAnswer('unknown', 0), 10); // safe default
});

test('registerDailyPlay starts a fresh streak', () => {
  const s = core.defaultState();
  const r = core.registerDailyPlay(s, '2026-08-26', 8, 10, 100, true);
  assert.strictEqual(s.dailyStreak, 1);
  assert.strictEqual(s.bestStreak, 1);
  assert.strictEqual(s.orbs, 100);
  assert.deepStrictEqual(s.playedDates['2026-08-26'], { correct: 8, total: 10, orbs: 100 });
  assert.strictEqual(r.replay, false);
});

test('registerDailyPlay blocks same-day replays', () => {
  const s = core.defaultState();
  core.registerDailyPlay(s, '2026-08-26', 8, 10, 100, true);
  const r = core.registerDailyPlay(s, '2026-08-26', 10, 10, 999, true);
  assert.strictEqual(r.replay, true);
  assert.strictEqual(s.orbs, 100, 'no double orbs');
  assert.strictEqual(s.dailyStreak, 1, 'streak unchanged');
});

test('consecutive days extend the streak', () => {
  const s = core.defaultState();
  core.registerDailyPlay(s, '2026-08-25', 5, 10, 50, false);
  core.registerDailyPlay(s, '2026-08-26', 5, 10, 50, false);
  assert.strictEqual(s.dailyStreak, 2);
});

test('one missed day consumes a freeze token instead of breaking the streak', () => {
  const s = core.defaultState();
  core.registerDailyPlay(s, '2026-08-24', 5, 10, 50, false);
  const r = core.registerDailyPlay(s, '2026-08-26', 5, 10, 50, false); // missed the 25th
  assert.strictEqual(r.freezeSpent, 1);
  assert.strictEqual(s.freezeTokens, 1);
  assert.strictEqual(s.dailyStreak, 2, 'streak survived via freeze');
});

test('a long gap breaks the streak when no freeze tokens remain', () => {
  const s = core.defaultState();
  s.freezeTokens = 0;
  core.registerDailyPlay(s, '2026-08-20', 5, 10, 50, false);
  core.registerDailyPlay(s, '2026-08-26', 5, 10, 50, false);
  assert.strictEqual(s.dailyStreak, 1, 'reset then restarted');
});

test('perfect daily awards the perfect bonus', () => {
  const s = core.defaultState();
  const r = core.registerDailyPlay(s, '2026-08-26', 10, 10, 120, true);
  assert.strictEqual(r.perfectBonusAwarded, 25);
  assert.strictEqual(s.orbs, 145);
});

test('buildShareGrid renders the expected emoji summary', () => {
  const results = ['correct', 'correct', 'wrong', 'skipped', 'correct'];
  const out = core.buildShareGrid('2026-08-26', results, 3, 42, 6);
  assert.ok(out.includes('🟩🟩🟥🟨🟩'), 'grid line present');
  assert.ok(out.includes('3/5'), 'score present');
  assert.ok(out.includes('🪙 42 orbs'), 'orb count present');
  assert.ok(out.includes('🔥 6-day streak'), 'streak present');
});

test('normalizeAnswer compares answers leniently', () => {
  assert.strictEqual(core.normalizeAnswer('  Paris  '), core.normalizeAnswer('paris'));
});

test('buildHint mentions category, word count and first letter', () => {
  const hint = core.buildHint({ category: 'Geography', correct: 'Burkina Faso' });
  assert.ok(hint.includes('Geography'));
  assert.ok(hint.includes('2 words'));
  assert.ok(hint.includes('"B"'));
});

test('decodeBase64Utf8 decodes UTF-8 correctly', () => {
  const b64 = Buffer.from('Pï ñoño ✅', 'utf8').toString('base64');
  assert.strictEqual(core.decodeBase64Utf8(b64), 'Pï ñoño ✅');
});

test('loadState falls back safely without localStorage', () => {
  const s = core.loadState();
  assert.strictEqual(s.version, 1);
  assert.strictEqual(s.orbs, 0);
});



console.log(`\nAll ${passed} tests passed ✅\n`);
