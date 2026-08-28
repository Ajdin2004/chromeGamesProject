/* ============================================================
   TYPING RUSH — progressively harder dictionary words.
   Rush mode: 3 lives, per-word timer, wrong key / timeout costs a heart.
   Practice mode: no timer, no lives, WPM tracking.
   Words load from ../data/typingrush_words.json (12 escalating tiers)
   with a built-in offline fallback list.
   ============================================================ */
'use strict';

// ---- Web Audio Synthesizer (mirrors wordle.js conventions) ----
let audioCtx = null;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

let soundOn = true;
const Sound = {
    _tone(freq, type, dur, vol) {
        if (!audioCtx || !soundOn) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + dur);
    },
    key() { this._tone(340 + Math.random() * 60, 'sine', 0.05, 0.05); },
    wrong() { this._tone(130, 'sawtooth', 0.18, 0.12); },
    word() {
        if (!audioCtx || !soundOn) return;
        const now = audioCtx.currentTime;
        [392, 523, 659].forEach((f, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, now + i * 0.07);
            gain.gain.setValueAtTime(0.12, now + i * 0.07);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.18);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now + i * 0.07); osc.stop(now + i * 0.07 + 0.2);
        });
    },
    tier() {
        if (!audioCtx || !soundOn) return;
        const now = audioCtx.currentTime;
        [523, 659, 784, 1047].forEach((f, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(f, now + i * 0.08);
            gain.gain.setValueAtTime(0.07, now + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now + i * 0.08); osc.stop(now + i * 0.08 + 0.28);
        });
    },
    life() { this._tone(880, 'sine', 0.25, 0.1); },
    over() {
        if (!audioCtx || !soundOn) return;
        const now = audioCtx.currentTime;
        [330, 262, 196, 131].forEach((f, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(f, now + i * 0.18);
            gain.gain.setValueAtTime(0.1, now + i * 0.18);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 0.3);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now + i * 0.18); osc.stop(now + i * 0.18 + 0.32);
        });
    }
};

// ---- Config ----
const DATA_URL = '../data/typingrush_words.json';
const HIGHSCORE_KEY = 'typingrush_highscore';
const STATS_KEY = 'typingrush_stats';
const TIER_COUNT = 12;
const WORDS_PER_TIER = 3;       // words completed to advance a tier
const START_LIVES = 3;
const MAX_LIVES = 5;
const EXTRA_LIFE_EVERY = 8;     // words -> +1 heart in Rush

// ---- DOM ----
const els = {
    scoreVal: document.getElementById('score-val'),
    bestVal: document.getElementById('best-val'),
    comboVal: document.getElementById('combo-val'),
    tierVal: document.getElementById('tier-val'),
    wordsVal: document.getElementById('words-val'),
    livesRow: document.getElementById('lives-row'),
    livesVal: document.getElementById('lives-val'),
    modeTag: document.getElementById('mode-tag'),
    wordArea: document.getElementById('word-area'),
    wordTiles: document.getElementById('word-tiles'),
    timerWrap: document.getElementById('timer-wrap'),
    timerFill: document.getElementById('timer-fill'),
    feedback: document.getElementById('feedback'),
    skipBtn: document.getElementById('skip-btn'),
    keyCapture: document.getElementById('key-capture'),
    startOverlay: document.getElementById('start-overlay'),
    modeRush: document.getElementById('mode-rush'),
    modePractice: document.getElementById('mode-practice'),
    startBtn: document.getElementById('start-btn'),
    gameoverOverlay: document.getElementById('gameover-overlay'),
    goNewBest: document.getElementById('go-newbest'),
    goScore: document.getElementById('go-score'),
    goWords: document.getElementById('go-words'),
    goTier: document.getElementById('go-tier'),
    goWpm: document.getElementById('go-wpm'),
    goAcc: document.getElementById('go-acc'),
    goCombo: document.getElementById('go-combo'),
    goBest: document.getElementById('go-best'),
    playAgainBtn: document.getElementById('playagain-btn'),
    menuBtn: document.getElementById('menu-btn'),
    statsModal: document.getElementById('stats-modal'),
    statsClose: document.getElementById('stats-close'),
    toast: document.getElementById('toast'),
    soundBtn: document.getElementById('sound-btn'),
    statsBtn: document.getElementById('stats-btn'),
    statGames: document.getElementById('stat-games'),
    statBestScore: document.getElementById('stat-best-score'),
    statBestWpm: document.getElementById('stat-best-wpm'),
    statBestTier: document.getElementById('stat-best-tier'),
    statCombo: document.getElementById('stat-combo'),
    statAcc: document.getElementById('stat-acc')
};
// ---- State ----
let mode = 'rush';
let state = 'idle';             // idle | playing | paused | over
let tier = 1;
let maxTierReached = 1;
let score = 0;
let startBest = 0;
let bestScore = parseInt(localStorage.getItem(HIGHSCORE_KEY) || '0', 10);
let combo = 0;
let largestCombo = 0;
let lives = START_LIVES;
let wordsCompleted = 0;
let wordsInTier = 0;
let currentWord = '';
let progress = 0;
let mistakeThisWord = false;
let totalKeys = 0;
let totalCorrectKeys = 0;
let gameStartTime = 0;
let wordStart = 0;
let budgetMs = 0;
let remainingMs = 0;
let timerInterval = null;
let lock = false;
let transitionTimer = null;
let lastKeyProcess = 0;
let toastTimer = null;
let WORD_TIERS = null;

// ---- Offline fallback word bank (used only if the JSON fetch fails) ----
const FALLBACK_TIERS = [
    // Tier 1 — 3-letter
    ["the", "and", "you", "for", "not", "all", "can", "get", "new", "now",
     "one", "out", "say", "see", "two", "way", "who", "why", "cat", "dog",
     "sun", "red", "box", "key", "top", "map", "sky", "hat", "cup", "bug",
     "jet", "fan", "ice", "pen", "fox", "egg", "bee", "ant", "cow", "pig",
     "hen", "rat", "bat", "car", "bus", "bed", "log", "net", "jam", "zip"],
    // Tier 2 — 4-letter common
    ["able", "back", "ball", "bank", "bear", "beat", "bill", "bird", "blue",
     "boat", "body", "bone", "book", "boot", "both", "burn", "cake", "call",
     "calm", "camp", "card", "care", "case", "cash", "chat", "city", "club",
     "coal", "coat", "code", "coin", "cold", "come", "cook", "cool", "cost",
     "dark", "date", "dawn", "deal", "deep", "desk", "door", "down", "draw",
     "drop", "drum", "duck", "dust", "each"],
    // Tier 3 — 5-letter
    ["about", "above", "actor", "admit", "adult", "after", "again", "agent",
     "agree", "ahead", "alarm", "album", "alert", "alien", "alive", "allow",
     "alone", "along", "anger", "angle", "angry", "apart", "apple", "apply",
     "arena", "argue", "arise", "array", "aside", "asset", "audio", "audit",
     "avoid", "awake", "aware", "basic", "basis", "beach", "begin", "being",
     "below", "bench", "berry", "birth", "black", "blade", "blame", "blank",
     "blast", "blaze"],
    // Tier 4 — 5-letter harder
    ["bleed", "blend", "blind", "block", "blood", "bloom", "board", "boast",
     "bonus", "boost", "bound", "brain", "brand", "brave", "bread", "break",
     "breed", "brick", "bride", "brief", "bring", "broad", "brook", "brown",
     "brush", "build", "built", "bunch", "burst", "cabin", "cable", "camel",
     "candy", "cargo", "carry", "cause", "cease", "chain", "chalk", "charm",
     "chart", "chase", "cheat", "check", "cheek", "cheer", "chest", "chief",
     "child", "chill"],
    // Tier 5 — 6-letter
    ["vision", "camera", "candle", "canvas", "carbon", "career", "carpet",
     "castle", "center", "chance", "change", "charge", "choice", "choose",
     "circle", "client", "clinic", "coffee", "colony", "combat", "comedy",
     "common", "corner", "cosmic", "cotton", "council", "course", "crystal",
     "custom", "damage", "danger", "debate", "decade", "decide", "defeat",
     "defend", "define", "degree", "demand", "depart", "depend", "desert",
     "design", "desire", "detail", "detect", "device", "devote", "dinner",
     "direct"],
    // Tier 6 — 6-letter harder
    ["divide", "dollar", "domain", "double", "dragon", "during", "easily",
     "economy", "effort", "empire", "employ", "enable", "energy", "engage",
     "engine", "enough", "ensure", "entire", "entity", "escape", "estate",
     "evolve", "exceed", "except", "excite", "expand", "expect", "expert",
     "export", "expose", "extend", "fabric", "factor", "famous", "farmer",
     "feature", "figure", "filter", "final", "finance", "finger", "finish",
     "flavor", "flight", "flower", "formal", "format", "freedom", "freeze",
     "friend"],
    // Tier 7 — 7-letter
    ["history", "hollow", "honest", "horizon", "hostile", "hunger", "hunter",
     "imagine", "impact", "import", "income", "indeed", "indoor", "infant",
     "inform", "injury", "insect", "insert", "insist", "intact", "intend",
     "invest", "invite", "island", "jacket", "jungle", "junior", "kayak",
     "kernel", "kettle", "kingdom", "kitten", "knight", "label", "labor",
     "latter", "launch", "lawyer", "leader", "leather", "lecture", "legend",
     "leisure", "letter", "library", "license", "likely", "linear", "liquid",
     "listen"],
    // Tier 8 — 7-letter harder
    ["machine", "magnet", "manner", "manual", "marble", "margin", "marine",
     "market", "master", "matter", "mature", "maximum", "measure", "medical",
     "medium", "member", "memory", "mental", "mention", "mentor", "metal",
     "method", "middle", "mighty", "minute", "miracle", "mirror", "mission",
     "mobile", "modern", "modest", "module", "moment", "monitor", "monkey",
     "mountain", "movement", "museum", "musical", "mutual", "mystery", "nature",
     "nectar", "needle", "nerve", "network", "neutral", "notice", "notion",
     "novel"],
    // Tier 9 — 8-letter
    ["nuclear", "nursery", "obstacle", "obvious", "occupy", "offend", "operate",
     "opinion", "oppose", "optical", "orange", "orbit", "organic", "origin",
     "outcome", "outline", "pacific", "package", "palace", "parade", "parcel",
     "passage", "passion", "pattern", "payment", "pencil", "pepper", "perfect",
     "perform", "period", "permit", "personal", "petition", "phrase", "physics",
     "picture", "planets", "plastic", "pocket", "poetry", "police", "policy",
     "popular", "portion", "position", "pottery", "poverty", "prayer", "precise",
     "predict"],
    // Tier 10 — 8-9-letter
    ["preserve", "pressure", "prevent", "primary", "prison", "privacy", "private",
     "problem", "process", "produce", "product", "profile", "program", "progress",
     "project", "promise", "promote", "prospect", "protect", "provide", "publish",
     "quantum", "quarter", "question", "radical", "reality", "realize", "receive",
     "recent", "recover", "reflect", "regular", "relaxed", "remember", "removal",
     "republic", "request", "require", "research", "reserve", "resolve", "respect",
     "respond", "restore", "retrieve", "reveal", "reverse", "revision", "rhythm",
     "sanctuary"],
    // Tier 11 — 10-letter
    ["scholarship", "scientific", "sculpture", "secondary", "sensation", "sentence",
     "separately", "settlement", "significant", "silhouette", "simplicity",
     "situation", "skyscraper", "spaceship", "spectacular", "spontaneous",
     "strawberry", "subsequent", "substance", "substitute", "suggestion",
     "supermarket", "surprising", "surrounding", "suspicious", "technology",
     "telephone", "television", "temperature", "temporary", "tenderness",
     "territory", "themselves", "threshold", "throughout", "tradition", "transition",
     "transparent", "tremendous", "triangular", "troublesome", "ultimately",
     "unbelievable", "undertaking", "understanding", "unfortunate", "university",
     "unnecessary", "utensils"],
    // Tier 12 — 11+ letters
    ["unpredictable", "conglomerate", "pharmaceutical", "implementation",
     "miscommunication", "disqualification", "cyberpunk", "counterclockwise",
     "intellectualize", "conservatorship", "acknowledgement", "disproportionate",
     "extraterrestrial", "infrastructure", "intercontinental", "jurisdictional",
     "knowledgeable", "merchandising", "neuropsychology", "overcomplicate",
     "perpendicular", "polypropylene", "quadrilateral", "reconciliation",
     "representative", "simultaneously", "stethoscope", "transcendental",
     "ultraviolet", "unmistakable", "verisimilitude", "vocabulary"]
];

// ---- Helpers ----
function showToast(msg, ms = 1800) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms);
}

function showFeedback(msg, isBad = false) {
    els.feedback.textContent = msg;
    els.feedback.classList.toggle('bad', isBad);
}

function focusInput() {
    try { els.keyCapture.focus({ preventScroll: true }); } catch (e) { /* older browsers */ }
}

function shake() {
    els.wordArea.classList.remove('shake');
    void els.wordArea.offsetWidth;
    els.wordArea.classList.add('shake');
}

function floatScore(text) {
    const div = document.createElement('div');
    div.className = 'score-float';
    div.textContent = text;
    els.wordArea.appendChild(div);
    setTimeout(() => div.remove(), 900);
}

// ---- Word data loading ----
async function ensureWords() {
    if (WORD_TIERS) return;
    try {
        const res = await fetch(DATA_URL);
        if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.tiers) && data.tiers.length === TIER_COUNT) {
                WORD_TIERS = data.tiers.map(tier => tier.map(w => w.toLowerCase()));
            }
        }
    } catch (e) {
        // offline / file:// — fall back below
    }
    if (!WORD_TIERS) {
        WORD_TIERS = FALLBACK_TIERS.slice();
        showToast('Offline: using built-in word list');
    }
}

// ---- Rendering ----
function renderHUD() {
    els.scoreVal.textContent = score.toLocaleString();
    els.bestVal.textContent = bestScore.toLocaleString();
    els.comboVal.textContent = '×' + Math.max(combo, 1);
    els.tierVal.textContent = tier + '/' + TIER_COUNT;
    els.wordsVal.textContent = wordsCompleted;
}

function renderHearts() {
    els.livesVal.innerHTML = '';
    for (let i = 0; i < MAX_LIVES; i++) {
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-heart ' + (i < lives ? 'filled' : 'empty');
        els.livesVal.appendChild(icon);
    }
    els.livesRow.classList.toggle('hidden', mode !== 'rush');
}

function renderModeTag() {
    els.modeTag.textContent = mode === 'rush' ? 'Rush' : 'Practice';
    els.modeTag.className = 'mode-tag ' + mode;
}

function renderWord() {
    const len = currentWord.length;
    els.wordTiles.className = 'word-tiles' + (len > 11 ? ' len12' : len > 8 ? ' len9' : '');
    els.wordTiles.innerHTML = '';
    for (let i = 0; i < len; i++) {
        const tile = document.createElement('div');
        tile.className = 'word-tile' + (i === 0 ? ' active' : '');
        tile.textContent = currentWord[i].toUpperCase();
        els.wordTiles.appendChild(tile);
    }
    progress = 0;
    mistakeThisWord = false;
}

// ---- Word picking ----
function pickWord() {
    const bucket = (WORD_TIERS && WORD_TIERS[tier - 1]) || FALLBACK_TIERS[tier - 1];
    if (!bucket || bucket.length === 0) return 'type';
    let w = '';
    let guard = 0;
    do {
        w = bucket[Math.floor(Math.random() * bucket.length)];
        guard++;
    } while (w === currentWord && bucket.length > 1 && guard < 20);
    return w.toLowerCase();
}

// ---- Timer ----
function startTimer(budgetOverride) {
    stopTimer();
    const base = budgetOverride != null
        ? budgetOverride
        : (Math.max(2600, 8000 - tier * 420) + currentWord.length * 140);
    budgetMs = base;
    wordStart = performance.now();
    remainingMs = base;
    updateTimerBar(1);
    timerInterval = setInterval(() => {
        if (state !== 'playing') return;
        const elapsed = performance.now() - wordStart;
        remainingMs = Math.max(0, budgetMs - elapsed);
        updateTimerBar(remainingMs / budgetMs);
        if (remainingMs <= 0) {
            stopTimer();
            onTimeout();
        }
    }, 60);
}

function updateTimerBar(frac) {
    els.timerFill.style.width = Math.round(frac * 100) + '%';
    els.timerFill.classList.toggle('danger', frac < 0.3);
}

function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}
// ---- Input handling ----
function handleChar(ch) {
    if (state !== 'playing' || lock) return;
    if (!/^[a-z]$/.test(ch)) return;

    totalKeys++;
    const expected = currentWord[progress] || '';
    const tiles = els.wordTiles.children;

    if (ch === expected) {
        totalCorrectKeys++;
        Sound.key();
        const tile = tiles[progress];
        tile.classList.remove('active');
        tile.classList.add('correct');
        progress++;
        if (progress < currentWord.length) {
            tiles[progress].classList.add('active');
        } else {
            wordComplete();
        }
    } else {
        mistakeThisWord = true;
        combo = 0;
        renderHUD();
        const tile = tiles[progress];
        tile.classList.remove('active');
        tile.classList.add('wrong');
        Sound.wrong();
        setTimeout(() => {
            tile.classList.remove('wrong');
            tile.classList.add('active');
        }, 160);
        if (mode === 'rush') {
            loseLife('wrong');
        } else {
            showFeedback('Wrong letter — try again!', true);
            shake();
        }
    }
}

// ---- Word complete ----
function wordComplete() {
    stopTimer();
    lock = true;

    const elapsed = performance.now() - wordStart;
    const frac = mode === 'rush' ? Math.max(0, 1 - elapsed / budgetMs) : 1;

    wordsCompleted++;
    wordsInTier++;

    if (!mistakeThisWord) {
        combo++;
        largestCombo = Math.max(largestCombo, combo);
    }

    const base = currentWord.length * 10;
    const tierMult = 1 + (tier - 1) * 0.15;
    const comboMult = 1 + Math.min(combo, 15) * 0.08;
    const timeBonus = mode === 'rush' ? Math.round(base * frac * 0.6) : 0;
    const gain = Math.round(base * tierMult * comboMult) + timeBonus;
    score += gain;

    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem(HIGHSCORE_KEY, String(bestScore));
    }

    maxTierReached = Math.max(maxTierReached, tier);
    renderHUD();
    floatScore('+' + gain.toLocaleString() + (timeBonus > 0 ? ' ⚡' : ''));
    Sound.word();

    // Extra life every few words (Rush only)
    let extraMsg = '';
    if (mode === 'rush' && wordsCompleted % EXTRA_LIFE_EVERY === 0 && lives < MAX_LIVES) {
        lives++;
        renderHearts();
        Sound.life();
        extraMsg = ' ♥ Extra life!';
    }

    // Tier progression
    if (wordsInTier >= WORDS_PER_TIER && tier < TIER_COUNT) {
        tier++;
        wordsInTier = 0;
        Sound.tier();
        showFeedback('⚡ Tier ' + tier + ' — words get faster!' + extraMsg);
    } else {
        showFeedback('Nice! ✨' + extraMsg);
    }

    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => {
        lock = false;
        startWord();
    }, 750);
}

// ---- Lifes / progression ----
function loseLife(reason) {
    lives--;
    renderHearts();
    shake();
    Sound.wrong();
    if (lives <= 0) {
        endGame();
        return;
    }
    const msg = { timeout: "Time's up! -1 ♥", wrong: 'Wrong letter! -1 ♥', skip: 'Skipped! -1 ♥' };
    showFeedback(msg[reason] || 'Oops! -1 ♥', true);
}

function onTimeout() {
    if (state !== 'playing' || lock) return;
    mistakeThisWord = true;
    combo = 0;
    renderHUD();
    Sound.wrong();
    loseLife('timeout');
    if (state !== 'over') advanceToNext();
}

function skipWord() {
    if (state !== 'playing' || lock) return;
    mistakeThisWord = true;
    combo = 0;
    renderHUD();
    if (mode === 'rush') {
        Sound.wrong();
        loseLife('skip');
        if (state === 'over') return;
    } else {
        showFeedback('Skipped.', true);
    }
    advanceToNext();
}

function advanceToNext() {
    lock = true;
    stopTimer();
    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => {
        lock = false;
        startWord();
    }, 450);
}

function startWord() {
    currentWord = pickWord();
    renderWord();
    if (mode === 'rush') {
        els.timerWrap.classList.remove('practice');
        startTimer();
    } else {
        els.timerWrap.classList.add('practice');
        updateTimerBar(1);
    }
    wordStart = performance.now();
}
// ---- Game lifecycle ----
async function startGame(selectedMode) {
    initAudio();
    await ensureWords();
    mode = selectedMode;
    tier = 1;
    maxTierReached = 1;
    score = 0;
    combo = 0;
    largestCombo = 0;
    lives = START_LIVES;
    wordsCompleted = 0;
    wordsInTier = 0;
    totalKeys = 0;
    totalCorrectKeys = 0;
    lock = false;
    clearTimeout(transitionTimer);
    stopTimer();
    startBest = bestScore;
    gameStartTime = performance.now();

    els.startOverlay.classList.add('hidden');
    els.gameoverOverlay.classList.add('hidden');
    els.statsModal.classList.add('hidden');

    renderModeTag();
    renderHearts();
    renderHUD();
    state = 'playing';
    showFeedback('');
    startWord();
    focusInput();
}

function endGame() {
    state = 'over';
    stopTimer();
    Sound.over();

    const elapsed = (performance.now() - gameStartTime) / 1000;
    const minutes = elapsed / 60;
    const wpm = minutes > 0 ? Math.max(0, Math.round((totalCorrectKeys / 5) / minutes)) : 0;
    const acc = totalKeys > 0 ? Math.round((totalCorrectKeys / totalKeys) * 100) : 100;

    const isNewBest = mode === 'rush' && score > startBest;
    localStorage.setItem(HIGHSCORE_KEY, String(bestScore));
    saveStats(wpm, acc);

    els.goScore.textContent = score.toLocaleString();
    els.goWords.textContent = wordsCompleted;
    els.goTier.textContent = maxTierReached + '/' + TIER_COUNT;
    els.goWpm.textContent = wpm;
    els.goAcc.textContent = acc + '%';
    els.goCombo.textContent = '×' + Math.max(largestCombo, 1);
    els.goBest.textContent = bestScore.toLocaleString();
    els.goNewBest.classList.toggle('hidden', !isNewBest);

    els.wordTiles.classList.remove('len9', 'len12');
    els.feedback.textContent = '';
    els.gameoverOverlay.classList.remove('hidden');
}

function saveStats(finalWpm, finalAccuracy) {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(STATS_KEY) || 'null') || {}; } catch (e) { /* fresh */ }
    s.plays = (s.plays || 0) + 1;
    if (mode === 'rush') s.bestScore = Math.max(s.bestScore || 0, score);
    s.bestWpm = Math.max(s.bestWpm || 0, finalWpm);
    s.bestTier = Math.max(s.bestTier || 1, maxTierReached);
    s.longestCombo = Math.max(s.longestCombo || 1, largestCombo);
    s.totalWords = (s.totalWords || 0) + wordsCompleted;
    s.totalKeys = (s.totalKeys || 0) + totalKeys;
    s.totalWrong = (s.totalWrong || 0) + (totalKeys - totalCorrectKeys);
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
}

function openStats() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(STATS_KEY) || 'null') || {}; } catch (e) { /* fresh */ }
    const acc = (s.totalKeys || 0) > 0
        ? Math.round(((s.totalKeys - (s.totalWrong || 0)) / s.totalKeys) * 100)
        : 100;
    els.statGames.textContent = s.plays || 0;
    els.statBestScore.textContent = (s.bestScore || 0).toLocaleString();
    els.statBestWpm.textContent = s.bestWpm || 0;
    els.statBestTier.textContent = s.bestTier || 1;
    els.statCombo.textContent = '×' + (s.longestCombo || 1);
    els.statAcc.textContent = acc + '%';
    els.statsModal.classList.remove('hidden');
}

function resetToMenu() {
    state = 'idle';
    stopTimer();
    lock = false;
    clearTimeout(transitionTimer);
    els.startOverlay.classList.remove('hidden');
    els.gameoverOverlay.classList.add('hidden');
    els.statsModal.classList.add('hidden');
    els.wordTiles.innerHTML = '';
    els.wordTiles.className = 'word-tiles';
    els.feedback.textContent = 'Ready when you are…';
    els.timerWrap.classList.remove('practice');
    updateTimerBar(1);
    renderHUD();
    renderHearts();
}

// ---- Pause / resume on tab switch ----
document.addEventListener('visibilitychange', () => {
    if (state === 'playing' && document.hidden) {
        stopTimer();
        remainingMs = Math.max(0, budgetMs - (performance.now() - wordStart));
        state = 'paused';
        showToast('Paused');
    } else if (state === 'paused' && !document.hidden) {
        state = 'playing';
        if (mode === 'rush') {
            if (remainingMs > 0) {
                startTimer(remainingMs);
            } else {
                onTimeout();
            }
        }
        document.getElementById('toast').classList.remove('show');
    }
});
// ---- Mode selection ----
function selectMode(m) {
    mode = m;
    els.modeRush.classList.toggle('active', m === 'rush');
    els.modePractice.classList.toggle('active', m === 'practice');
}
els.modeRush.addEventListener('click', () => selectMode('rush'));
els.modePractice.addEventListener('click', () => selectMode('practice'));

els.startBtn.addEventListener('click', () => startGame(mode));
els.playAgainBtn.addEventListener('click', () => startGame(mode));
els.menuBtn.addEventListener('click', resetToMenu);

// ---- Stats modal ----
els.statsBtn.addEventListener('click', openStats);
els.statsClose.addEventListener('click', () => els.statsModal.classList.add('hidden'));
els.statsModal.addEventListener('click', e => {
    if (e.target === els.statsModal) els.statsModal.classList.add('hidden');
});

// ---- Sound toggle ----
els.soundBtn.addEventListener('click', () => {
    initAudio();
    soundOn = !soundOn;
    els.soundBtn.classList.toggle('off', !soundOn);
    els.soundBtn.innerHTML = soundOn
        ? '<i class="fa-solid fa-volume-high"></i>'
        : '<i class="fa-solid fa-volume-xmark"></i>';
});

// ---- On-screen keyboard ----
document.querySelectorAll('#keyboard .key').forEach(btn => {
    btn.addEventListener('pointerdown', e => e.preventDefault());
    btn.addEventListener('click', () => {
        if (state !== 'playing') return;
        btn.classList.add('pressed');
        setTimeout(() => btn.classList.remove('pressed'), 120);
        handleChar(btn.dataset.key);
        focusInput();
    });
});

els.skipBtn.addEventListener('click', () => {
    if (state === 'playing') { skipWord(); focusInput(); }
});

// ---- Physical / mobile keyboard ----
window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;

    if (k === 'Enter' && (state === 'idle' || state === 'over')) {
        startGame(mode);
        return;
    }
    if (k === ' ') {
        if (state === 'playing') { e.preventDefault(); skipWord(); }
        return;
    }
    if (state === 'playing' && k.length === 1 && /^[a-zA-Z]$/.test(k)) {
        lastKeyProcess = Date.now();
        handleChar(k.toLowerCase());
    }
});

els.keyCapture.addEventListener('input', () => {
    const v = els.keyCapture.value;
    els.keyCapture.value = '';
    if (!v) return;
    if (Date.now() - lastKeyProcess < 120) return; // desktop: keydown already handled it
    for (const ch of v) {
        const lc = ch.toLowerCase();
        if (/^[a-z]$/.test(lc)) handleChar(lc);
    }
});

document.body.addEventListener('click', e => {
    if (state === 'playing' && !e.target.closest('.overlay')) focusInput();
});

// ---- Init ----
initAudio();
els.bestVal.textContent = bestScore.toLocaleString();
renderHearts();
renderModeTag();
renderHUD();
ensureWords();