/* ============================================================
   Trivia Orbs — a cozy daily trivia game for Chromium Games
   Questions powered by the Open Trivia Database (opentdb.com),
   CC BY-SA 4.0. Questions are proxied/cached via /api/trivia
   (netlify/functions/trivia.js) with a direct-API fallback.

   Features:
   - Daily "Orb Drop": 10 questions, refreshed every day at
     local midnight
   - Endless practice rounds (category + difficulty picker)
   - Orbs currency, streaks with forgiving freeze tokens,
     and orb-priced lifelines (50/50, Hint, Skip)
   ============================================================ */

(function () {
'use strict';

/* ---------------- Tunable economy ---------------- */
var CONFIG = {
  DAILY_QUESTIONS: 10,
  ENDLESS_QUESTIONS: 10,
  BASE_ORBS: 10,
  STREAK_BONUS_PER: 2,     // extra orbs per consecutive correct answer
  STREAK_BONUS_CAP: 5,     // cap on consecutive-correct bonus steps
  PERFECT_BONUS: 25,       // bonus for a flawless daily round
  MAX_FREEZE_TOKENS: 2,    // auto-repairs the daily streak after a missed day
  FREEZE_MILESTONE: 7,     // earn a freeze token every N-day streak
  STORAGE_KEY: 'triviaOrbs.v1',
  API_URL: '/api/trivia',
  FALLBACK_URL: 'https://opentdb.com/api.php',
  LIFELINES: {
    fifty: { cost: 15, label: '50 / 50' },
    hint:  { cost: 10, label: 'Hint' },
    skip:  { cost: 5,  label: 'Skip' }
  }
};

var DIFFICULTY_MULTIPLIER = { easy: 1, medium: 1.5, hard: 2 };

var CATEGORIES = [
  { id: 0,  name: 'Mixed Categories' },
  { id: 9,  name: 'General Knowledge' },
  { id: 11, name: 'Film' },
  { id: 12, name: 'Music' },
  { id: 15, name: 'Video Games' },
  { id: 17, name: 'Science & Nature' },
  { id: 18, name: 'Computers' },
  { id: 22, name: 'Geography' },
  { id: 23, name: 'History' },
  { id: 21, name: 'Sports' },
  { id: 25, name: 'Art' },
  { id: 27, name: 'Animals' }
];

/* ============================================================
   PURE LOGIC (no DOM) — unit-tested in tests/triviaorbs.test.js
   ============================================================ */

/** FNV-1a style string hash -> unsigned 32-bit int. */
function hashSeed(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32). */
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded Fisher-Yates. Returns a NEW array; input untouched. */
function shuffleSeeded(arr, rng) {
  var out = arr.slice();
  for (var i = out.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

/** LOCAL calendar day key, e.g. '2026-08-26'. Dailies reset at local midnight. */
function todayKey(date) {
  var d = date || new Date();
  var y = d.getFullYear();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + day;
}

/** Whole days from date key a to date key b (b - a). */
function diffInDays(a, b) {
  var da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  var db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((db - da) / 86400000);
}

/** Orbs earned for one answer. consecutiveCorrect = streak BEFORE this answer. */
function scoreAnswer(difficulty, consecutiveCorrect) {
  var mult = DIFFICULTY_MULTIPLIER[difficulty] || 1;
  var bonus = Math.min(consecutiveCorrect, CONFIG.STREAK_BONUS_CAP) * CONFIG.STREAK_BONUS_PER;
  return Math.round(CONFIG.BASE_ORBS * mult) + bonus;
}

function defaultState() {
  return {
    version: 1,
    orbs: 0,
    dailyStreak: 0,
    bestStreak: 0,
    freezeTokens: CONFIG.MAX_FREEZE_TOKENS,
    lastPlayedDate: null,
    playedDates: {},       // dateKey -> { correct, total, orbs }
    stats: { totalCorrect: 0, totalAnswered: 0, endlessRounds: 0 },
    settings: { sound: true }
  };
}

/**
 * Record a completed daily round. Forgiving streak logic:
 * missed days consume a freeze token before breaking the streak.
 * Returns { replay, streak, freezeSpent, brokeStreak, perfectBonusAwarded }.
 */
function registerDailyPlay(state, dateKey, correctCount, total, orbsEarned, awardPerfectBonus) {
  var res = { replay: false, streak: state.dailyStreak, freezeSpent: 0, brokeStreak: false, perfectBonusAwarded: 0 };
  if (state.playedDates[dateKey]) { res.replay = true; return res; }

  if (state.lastPlayedDate && state.lastPlayedDate !== dateKey) {
    var missed = diffInDays(state.lastPlayedDate, dateKey) - 1;
    for (var i = 0; i < missed; i++) {
      if (state.freezeTokens > 0) { state.freezeTokens--; res.freezeSpent++; }
      else { state.dailyStreak = 0; res.brokeStreak = true; }
    }
  }

  state.dailyStreak += 1;
  state.lastPlayedDate = dateKey;
  if (state.dailyStreak > state.bestStreak) state.bestStreak = state.dailyStreak;
  if (state.dailyStreak > 0 && state.dailyStreak % CONFIG.FREEZE_MILESTONE === 0 &&
      state.freezeTokens < CONFIG.MAX_FREEZE_TOKENS) {
    state.freezeTokens++;
  }

  state.orbs += orbsEarned;
  if (awardPerfectBonus && correctCount === total && total > 0) {
    state.orbs += CONFIG.PERFECT_BONUS;
    res.perfectBonusAwarded = CONFIG.PERFECT_BONUS;
  }
  state.playedDates[dateKey] = { correct: correctCount, total: total, orbs: orbsEarned + res.perfectBonusAwarded };
  state.stats.totalAnswered += total;
  state.stats.totalCorrect += correctCount;

  res.streak = state.dailyStreak;
  return res;
}

/** Record an endless/practice round (no daily-streak impact). */
function registerEndlessPlay(state, correctCount, total) {
  state.stats.totalAnswered += total;
  state.stats.totalCorrect += correctCount;
  state.stats.endlessRounds += 1;
}

/** Wordle-style shareable summary. results: 'correct'|'wrong'|'skipped'|null */
function buildShareGrid(dateKey, results, correctCount, orbsEarned, streakDays) {
  var icons = { correct: '🟩', wrong: '🟥', skipped: '🟨' };
  var grid = results.map(function (r) { return r ? icons[r] : '⬛'; }).join('');
  return '🪐 Trivia Orbs — ' + dateKey + '\n' + grid + '\n' +
    correctCount + '/' + results.length + ' · 🪙 ' + orbsEarned + ' orbs · 🔥 ' +
    streakDays + '-day streak';
}

/** Gentle, generated hint built from question metadata. */
function buildHint(q) {
  var words = String(q.correct).trim().split(/\s+/).length;
  var letter = String(q.correct).trim().charAt(0).toUpperCase();
  return 'Category: ' + q.category + ' · ' + words +
    (words === 1 ? ' word' : ' words') + ' · starts with "' + letter + '"';
}

/** Case/whitespace-insensitive answer comparison. */
function normalizeAnswer(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ');
}

/** base64 -> UTF-8 string (works in browsers and Node >= 16). */
function decodeBase64Utf8(b64) {
  var bin = atob(b64);
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

/* ---------- Persistence (localStorage guarded for Node tests) ---------- */
var hasStorage = typeof localStorage !== 'undefined';

function loadState() {
  if (!hasStorage) return defaultState();
  try {
    var raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (!raw) return defaultState();
    var s = JSON.parse(raw);
    var def = defaultState();
    for (var k in def) if (s[k] === undefined) s[k] = def[k];
    for (var k2 in def.stats) if (s.stats[k2] === undefined) s.stats[k2] = def.stats[k2];
    return s;
  } catch (e) {
    return defaultState();
  }
}

function saveState(state) {
  if (!hasStorage) return;
  try { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* quota */ }
}

/* ============================================================
   BROWSER LAYER — everything below touches the DOM and is
   skipped entirely when this file is require()d by the tests.
   ============================================================ */
var state = null;
var round = null;      // active round object
var countdownTimer = null;

function el(id) { return document.getElementById(id); }

function init() {
  state = loadState();
  buildCategoryOptions();
  wireEvents();
  updateHud();
  refreshHomeScreens();
  showTab('daily');
}

function buildCategoryOptions() {
  var sel = el('endless-category');
  if (!sel) return;
  CATEGORIES.forEach(function (c) {
    var opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
}

function wireEvents() {
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { showTab(btn.dataset.tab); });
  });
  el('btn-play-daily').addEventListener('click', startDaily);
  el('btn-view-results').addEventListener('click', function () {
    var rec = state.playedDates[todayKey()];
    if (rec) showResultsFromHistory(rec);
  });
  el('btn-start-endless').addEventListener('click', startEndless);
  el('btn-ll-fifty').addEventListener('click', useFifty);
  el('btn-ll-hint').addEventListener('click', useHint);
  el('btn-ll-skip').addEventListener('click', useSkip);
  el('btn-share').addEventListener('click', shareResult);
  el('btn-results-endless').addEventListener('click', function () { showTab('endless'); });
  el('btn-results-home').addEventListener('click', function () { showTab('daily'); });
  el('btn-toggle-sound').addEventListener('click', toggleSound);
  document.addEventListener('keydown', onKeyDown);
}

function showTab(tab) {
  ['daily', 'endless', 'stats'].forEach(function (t) {
    el('screen-' + t).style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('.tab-btn').forEach(function (b) {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  // Always leave any active round/results view when returning to a tab.
  if (tab === 'daily') showScreen('screen-daily-wrap');
  stopCountdown();
  if (tab === 'stats') renderStats();
  refreshHomeScreens();
}

function showScreen(name) {
  ['screen-daily-wrap', 'screen-round', 'screen-results'].forEach(function (id) {
    el(id).style.display = id === name ? '' : 'none';
  });
}

/* ---------------- HUD / home ---------------- */

function updateHud() {
  el('hud-orbs').textContent = state.orbs;
  el('hud-streak').textContent = state.dailyStreak;
  saveState(state);
}

function refreshHomeScreens() {
  var today = todayKey();
  var played = !!state.playedDates[today];
  el('daily-played-badge').style.display = played ? '' : 'none';
  el('btn-play-daily').disabled = played;
  el('btn-play-daily').innerHTML = played
    ? '<i class="fa-solid fa-check"></i> Today\'s drop collected'
    : '<i class="fa-solid fa-meteor"></i> Play Today\'s Orb Drop';
  el('btn-view-results').style.display = played ? '' : 'none';
  el('home-freeze-tokens').textContent = state.freezeTokens > 0
    ? '❄️ ' + state.freezeTokens + ' streak freeze' + (state.freezeTokens > 1 ? 's' : '') + ' banked'
    : 'no streak freezes banked';
  startCountdown();
}

/* ---------------- Question fetching ---------------- */

function apiGet(url) {
  return fetch(url).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

/** Normalize any payload into { category, difficulty, question, options[], correct } */
function normalizeQuestion(q) {
  var correct;
  if (q.answer_key) correct = decodeBase64Utf8(q.answer_key);
  else if (q.correct_answer) correct = q.correct_answer;
  else correct = q.correct;

  var options = q.options || [correct].concat(q.incorrect_answers || []);
  // Deterministic per-question option order so replays look identical.
  options = shuffleSeeded(options.map(String), mulberry32(hashSeed(q.question)));
  return { category: q.category, difficulty: q.difficulty || 'medium', question: q.question, options: options, correct: correct };
}

function fetchDailyQuestions() {
  // Pass the player's local date so the server seeds/caches per local day.
  return apiGet(CONFIG.API_URL + '?mode=daily&date=' + todayKey()).then(function (data) {
    if (!data.questions || !data.questions.length) throw new Error('empty daily set');
    return data.questions.map(normalizeQuestion);
  }).catch(function (err) {
    console.warn('[Trivia Orbs] API proxy failed, using OpenTDB directly:', err);
    return apiGet(CONFIG.FALLBACK_URL + '?amount=' + CONFIG.DAILY_QUESTIONS + '&type=multiple&encode=base64')
      .then(function (data) {
        if (data.response_code !== 0 || !data.results || !data.results.length) throw new Error('OpenTDB unavailable');
        return data.results.map(normalizeQuestion);
      });
  });
}

function fetchEndlessQuestions(categoryId, difficulty) {
  var qs = '?mode=endless&amount=' + CONFIG.ENDLESS_QUESTIONS;
  if (categoryId > 0) qs += '&category=' + categoryId;
  if (difficulty !== 'any') qs += '&difficulty=' + difficulty;
  var fallbackUrl = CONFIG.FALLBACK_URL + '?amount=' + CONFIG.ENDLESS_QUESTIONS + '&type=multiple&encode=base64';
  if (categoryId > 0) fallbackUrl += '&category=' + categoryId;
  if (difficulty !== 'any') fallbackUrl += '&difficulty=' + difficulty;

  return apiGet(CONFIG.API_URL + qs).then(function (data) {
    return data.results.map(normalizeQuestion);
  }).catch(function () {
    return apiGet(fallbackUrl).then(function (data) {
      if (data.response_code !== 0 || !data.results || !data.results.length) throw new Error('OpenTDB unavailable');
      return data.results.map(normalizeQuestion);
    });
  });
}

/* ---------------- Round flow ---------------- */

function beginRound(mode, questions) {
  round = {
    mode: mode,
    questions: questions,
    index: 0,
    results: [],          // 'correct' | 'wrong' | 'skipped'
    earnedOrbs: 0,
    runStreak: 0,         // consecutive correct within this round
    answered: false
  };
  showScreen('screen-round');
  renderQuestion();
}

function startDaily() {
  var btn = el('btn-play-daily');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading drop...';
  fetchDailyQuestions().then(function (qs) {
    btn.disabled = false;
    beginRound('daily', qs);
  }).catch(function (err) {
    console.error(err);
    alert("Could not load today's questions. Please check your connection and try again.");
    refreshHomeScreens();
  });
}

function startEndless() {
  var categoryId = parseInt(el('endless-category').value, 10) || 0;
  var difficulty = el('endless-difficulty').value;
  var btn = el('btn-start-endless');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';
  fetchEndlessQuestions(categoryId, difficulty).then(function (qs) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-play"></i> Start Endless Round';
    beginRound('endless', qs);
  }).catch(function (err) {
    console.error(err);
    alert('Could not load practice questions. Please try again.');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-play"></i> Start Endless Round';
  });
}

/* ---------------- Rendering a question ---------------- */

function renderQuestion() {
  var q = round.questions[round.index];
  round.answered = false;
  round.fiftyUsedThisQ = false;
  round.hintUsedThisQ = false;

  el('round-mode-label').textContent = round.mode === 'daily' ? "Today's Orb Drop" : 'Endless Practice';
  el('round-progress').textContent = 'Question ' + (round.index + 1) + ' / ' + round.questions.length;
  el('q-category').textContent = q.category;
  el('q-difficulty').textContent = q.difficulty.toUpperCase();
  el('q-difficulty').className = 'diff-chip diff-' + q.difficulty;
  el('question-text').textContent = q.question;
  el('hint-text').style.display = 'none';
  el('ll-status').innerHTML = '';
  renderProgressDots();
  updateLifelineButtons();

  var wrap = el('answers');
  wrap.innerHTML = '';
  q.options.forEach(function (opt, i) {
    var b = document.createElement('button');
    b.className = 'answer-btn';
    b.innerHTML = '<span class="answer-key">' + (i + 1) + '</span><span class="answer-text"></span>';
    b.querySelector('.answer-text').textContent = opt;
    b.addEventListener('click', function () { chooseAnswer(i); });
    wrap.appendChild(b);
  });
}

function renderProgressDots() {
  var dots = el('progress-dots');
  dots.innerHTML = '';
  for (var i = 0; i < round.questions.length; i++) {
    var d = document.createElement('span');
    d.className = 'dot' +
      (i < round.results.length ? ' dot-' + round.results[i] : '') +
      (i === round.index && i >= round.results.length ? ' dot-current' : '');
    dots.appendChild(d);
  }
}

function updateLifelineButtons() {
  [['btn-ll-fifty', 'fifty'], ['btn-ll-hint', 'hint'], ['btn-ll-skip', 'skip']].forEach(function (pair) {
    var btn = el(pair[0]);
    var cost = CONFIG.LIFELINES[pair[1]].cost;
    btn.querySelector('.ll-cost').textContent = cost;
    btn.disabled = state.orbs < cost || (round && round.answered);
  });
}

/* ---------------- Lifelines ---------------- */

function useFifty() {
  if (!round || round.answered || round.fiftyUsedThisQ || state.orbs < CONFIG.LIFELINES.fifty.cost) return;
  var q = round.questions[round.index];
  var buttons = Array.prototype.slice.call(document.querySelectorAll('#answers .answer-btn'));
  var wrongIdx = [];
  buttons.forEach(function (b, i) {
    if (normalizeAnswer(q.options[i]) !== normalizeAnswer(q.correct)) wrongIdx.push(i);
  });
  shuffleSeeded(wrongIdx, mulberry32(Date.now())).slice(0, Math.max(wrongIdx.length - 1, 1)).forEach(function (i) {
    buttons[i].classList.add('removed');
    buttons[i].disabled = true;
  });
  spendOrbs(CONFIG.LIFELINES.fifty.cost);
  round.fiftyUsedThisQ = true;
  noteLifeline('50/50 used — two wrong answers removed');
}

function useHint() {
  if (!round || round.answered || round.hintUsedThisQ || state.orbs < CONFIG.LIFELINES.hint.cost) return;
  var hintEl = el('hint-text');
  hintEl.textContent = '💡 ' + buildHint(round.questions[round.index]);
  hintEl.style.display = '';
  spendOrbs(CONFIG.LIFELINES.hint.cost);
  round.hintUsedThisQ = true;
  noteLifeline('Hint revealed');
}

function useSkip() {
  if (!round || round.answered || state.orbs < CONFIG.LIFELINES.skip.cost) return;
  spendOrbs(CONFIG.LIFELINES.skip.cost);
  revealAnswer(null);
  advanceAfterDelay('skipped', 0);
}

function noteLifeline(msg) {
  el('ll-status').innerHTML = '<i class="fa-solid fa-circle-info"></i> ' + msg;
  updateHud();
  updateLifelineButtons();
}

function spendOrbs(cost) {
  state.orbs -= cost;
  saveState(state);
  el('hud-orbs').textContent = state.orbs;
}

/* ---------------- Answering ---------------- */

function chooseAnswer(idx) {
  if (!round || round.answered) return;
  var q = round.questions[round.index];
  round.answered = true;
  var correct = normalizeAnswer(q.options[idx]) === normalizeAnswer(q.correct);
  revealAnswer(idx);
  var earned = 0;
  if (correct) {
    earned = scoreAnswer(q.difficulty, round.runStreak);
    round.runStreak += 1;
    round.earnedOrbs += earned;
    state.orbs += earned;
    playSound(true);
    floatOrbs('+' + earned);
  } else {
    round.runStreak = 0;
    playSound(false);
  }
  updateHud();
  updateLifelineButtons();
  advanceAfterDelay(correct ? 'correct' : 'wrong', earned);
}

/** Highlight the chosen answer and the correct one. chosenIdx=null for skips. */
function revealAnswer(chosenIdx) {
  var q = round.questions[round.index];
  var buttons = Array.prototype.slice.call(document.querySelectorAll('#answers .answer-btn'));
  buttons.forEach(function (b, i) {
    b.disabled = true;
    if (normalizeAnswer(q.options[i]) === normalizeAnswer(q.correct)) b.classList.add('is-correct');
    else if (chosenIdx === i) b.classList.add('is-wrong');
  });
}

function advanceAfterDelay(result, earned) {
  round.results.push(result);
  renderProgressDots();
  setTimeout(function () {
    if (round.index + 1 >= round.questions.length) finishRound();
    else { round.index++; renderQuestion(); }
  }, result === 'correct' ? 1100 : 1500);
}

/* ---------------- Results ---------------- */

function finishRound() {
  var correctCount = round.results.filter(function (r) { return r === 'correct'; }).length;
  var total = round.questions.length;
  var res = null;

  if (round.mode === 'daily') {
    res = registerDailyPlay(state, todayKey(), correctCount, total, round.earnedOrbs, true);
    if (res.replay) {
      // Shouldn't happen (button is disabled), but never double-award.
      state.orbs -= round.earnedOrbs;
      round.earnedOrbs = 0;
    }
  } else {
    registerEndlessPlay(state, correctCount, total);
  }

  el('hud-orbs').textContent = state.orbs;
  el('hud-streak').textContent = state.dailyStreak;
  saveState(state);

  showResults(res, correctCount, total, todayKey());
}

function showResultsFromHistory(rec) {
  showResults(null, rec.correct, rec.total, todayKey());
}

function showResults(res, correctCount, total, dateKey) {
  showScreen('screen-results');
  var perfect = correctCount === total && total > 0;
  el('result-title').textContent = perfect ? '🌟 Perfect Drop!' :
    (correctCount >= total / 2 ? 'Nice haul! 🪙' : 'Thanks for playing!');

  var lines = ['<div class="big-score">' + correctCount + ' <span>/ ' + total + '</span></div>'];
  if (res && !res.replay) {
    var bonusTxt = res.perfectBonusAwarded ? ' <em>(incl. +' + res.perfectBonusAwarded + ' perfect bonus)</em>' : '';
    lines.push('<p><i class="fa-solid fa-coins"></i> +' + (round ? round.earnedOrbs : 0) + ' orbs this round' + bonusTxt + '</p>');
    lines.push('<p><i class="fa-solid fa-fire"></i> ' + res.streak + '-day streak' +
      (res.freezeSpent ? ' <span class="muted">(❄️ freeze protected it)</span>' : '') + '</p>');
  } else if (!res) {
    lines.push('<p class="muted">Today\'s completed drop</p>');
  }
  el('result-summary').innerHTML = lines.join('');

  el('share-grid').textContent = buildShareGrid(
    dateKey,
    round ? round.results : [],
    correctCount,
    round ? round.earnedOrbs : 0,
    state.dailyStreak
  );
  startCountdown();
}

function shareResult() {
  var text = el('share-grid').textContent;
  function copied() {
    var btn = el('btn-share');
    var old = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
    setTimeout(function () { btn.innerHTML = old; }, 1600);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(copied).catch(function () { fallbackCopy(text, copied); });
  } else {
    fallbackCopy(text, copied);
  }
}

function fallbackCopy(text, done) {
  var ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
  document.body.removeChild(ta);
}

/* ---------------- Countdown / stats / misc ---------------- */

function msUntilNextDrop() {
  var now = new Date();
  // Next local midnight
  var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - now.getTime();
}

function startCountdown() {
  stopCountdown();
  function tick() {
    var ms = msUntilNextDrop();
    var h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
    var txt = 'Next drop in ' + h + 'h ' + m + 'm ' + s + 's';
    ['countdown-home', 'countdown-results'].forEach(function (id) {
      var e2 = el(id); if (e2) e2.textContent = txt;
    });
  }
  tick();
  countdownTimer = setInterval(tick, 1000);
}

function stopCountdown() {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
}

function renderStats() {
  var acc = state.stats.totalAnswered > 0
    ? Math.round(100 * state.stats.totalCorrect / state.stats.totalAnswered)
    : 0;
  el('stat-orbs').textContent = state.orbs;
  el('stat-accuracy').textContent = acc + '%';
  el('stat-best-streak').textContent = state.bestStreak + ' days';
  el('stat-endless').textContent = state.stats.endlessRounds;

  var list = el('history-list');
  list.innerHTML = '';
  var dates = Object.keys(state.playedDates).sort().reverse().slice(0, 7);
  if (!dates.length) {
    list.innerHTML = '<li class="muted">No dailies played yet — today\'s drop is waiting!</li>';
  }
  dates.forEach(function (d) {
    var rec = state.playedDates[d];
    var li = document.createElement('li');
    li.innerHTML = '<i class="fa-solid fa-calendar-day"></i> ' + d +
      ' — ' + rec.correct + '/' + rec.total + ' · 🪙 ' + rec.orbs;
    list.appendChild(li);
  });

  el('btn-toggle-sound').innerHTML = state.settings.sound
    ? '<i class="fa-solid fa-volume-high"></i> Sound On'
    : '<i class="fa-solid fa-volume-xmark"></i> Sound Off';
}

function toggleSound() {
  state.settings.sound = !state.settings.sound;
  saveState(state);
  renderStats();
}

/* ---------------- Sound & juice ---------------- */

var audioCtx = null;
function playSound(good) {
  if (!state || !state.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = good ? 660 : 220;
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.25);
    if (good) osc.frequency.exponentialRampToValueAtTime(990, audioCtx.currentTime + 0.18);
  } catch (e) { /* audio unavailable */ }
}

function floatOrbs(txt) {
  var chip = el('hud-orbs').parentElement;
  var f = document.createElement('span');
  f.className = 'float-orb';
  f.textContent = txt;
  chip.appendChild(f);
  setTimeout(function () { f.remove(); }, 900);
}

function onKeyDown(ev) {
  if (!round || round.answered) return;
  if (el('screen-round').style.display === 'none') return;
  var idx = ['1', '2', '3', '4'].indexOf(ev.key);
  if (idx !== -1) {
    var buttons = document.querySelectorAll('#answers .answer-btn');
    if (buttons[idx] && !buttons[idx].disabled) buttons[idx].click();
  }
}

/* ---------------- Bootstrap ---------------- */
if (typeof document !== 'undefined' && document.getElementById('to-app')) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

/* Exports for Node-based unit tests (tests/triviaorbs.test.js). */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CONFIG: CONFIG,
    DIFFICULTY_MULTIPLIER: DIFFICULTY_MULTIPLIER,
    hashSeed: hashSeed,
    mulberry32: mulberry32,
    shuffleSeeded: shuffleSeeded,
    todayKey: todayKey,
    diffInDays: diffInDays,
    scoreAnswer: scoreAnswer,
    defaultState: defaultState,
    loadState: loadState,
    saveState: saveState,
    registerDailyPlay: registerDailyPlay,
    registerEndlessPlay: registerEndlessPlay,
    buildShareGrid: buildShareGrid,
    buildHint: buildHint,
    normalizeAnswer: normalizeAnswer,
    decodeBase64Utf8: decodeBase64Utf8
  };
}

})();






