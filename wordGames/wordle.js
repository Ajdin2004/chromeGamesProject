// --- Web Audio Synthesizer ---
let audioCtx = null;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

const Sound = {
    key() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.05);
    },
    flip() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(250, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(500, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    },
    win() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.setValueAtTime(659, now + 0.1);
        osc.frequency.setValueAtTime(783, now + 0.2);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.35);
    },
    fail() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.3);
    }
};

// Expanded Word Bank for Daily Targets
const TARGET_WORDS = [
    "APPLE", "BEACH", "BRAIN", "BREAD", "CHAIR", "CHEST", "CLOCK", "CLOUD",
    "CROWN", "DANCE", "DREAM", "DRIVE", "EARTH", "FAITH", "FIELD", "FLAME",
    "FRUIT", "GLASS", "GREEN", "HEART", "HOUSE", "LIGHT", "MONEY", "MUSIC",
    "OCEAN", "PARTY", "PHONE", "PLANT", "POWER", "RADIO", "RIVER", "SMILE",
    "SPACE", "STONE", "TABLE", "TIGER", "WATER", "WORLD", "YOUTH", "NIGHT"
];

// Local dictionary fallback cache
const VALID_GUESSES_CACHE = new Set([...TARGET_WORDS, 
    "ABACK", "ABUSE", "ACTOR", "ACUTE", "ADAPT", "ADMIT", "ADOPT", "ADULT", "AFTER", "AGAIN",
    "AGENT", "AGREE", "AHEAD", "ALARM", "ALBUM", "ALERT", "ALIEN", "ALIGN", "ALIKE", "ALIVE",
    "ALLOW", "ALONE", "ALONG", "ALTER", "AMONG", "ANGER", "ANGLE", "ANGRY", "APART", "APPLY",
    "ARENA", "ARGUE", "ARISE", "ARRAY", "ASIDE", "ASSET", "AUDIO", "AUDIT", "AVOID", "AWAKE",
    "AWARE", "BADLY", "BAKER", "BASES", "BASIC", "BASIS", "BEACH", "BEGAN", "BEGIN", "BEGUN",
    "BEING", "BELOW", "BENCH", "BILLY", "BIRTH", "BLACK", "BLAME", "BLIND", "BLOCK", "BLOOD",
    "BOARD", "BOOST", "BOOTH", "BOUND", "BRAIN", "BRAND", "BREAD", "BREAK", "BREED", "BRIEF",
    "BRING", "BROAD", "BROKE", "BROWN", "BUILD", "BUILT", "BUYER", "CABLE", "CALIF", "CARRY",
    "CATCH", "CAUSE", "CHAIN", "CHAIR", "CHART", "CHASE", "CHEAP", "CHECK", "CHEST", "CHIEF"
]);

// Deterministic Daily Seed (resets every midnight)
// Use the LOCAL date for both the seed and the save key so the saved game
// always corresponds to the word currently on the board (fixes midnight
// mismatch between UTC ISO string and local date components).
const TODAY_DATE_STR = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

// Prune old daily saves so localStorage doesn't grow forever
function pruneOldSaves() {
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('wordle_save_') && k !== `wordle_save_${TODAY_DATE_STR}`) {
            localStorage.removeItem(k);
        }
    }
}
function getDailyWord() {
    const now = new Date();
    const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    return TARGET_WORDS[seed % TARGET_WORDS.length];
}

const TARGET_WORD = getDailyWord();
const MAX_ATTEMPTS = 6;
const WORD_LENGTH = 5;

let currentAttempt = 0;
let currentGuess = "";
let gameOver = false;
let boardStateHistory = [];
let isSubmitting = false; // guards against double-submit while awaiting the dictionary API
let isRevealing = false;  // blocks input during flip animations

const boardEl = document.getElementById('board');
const toastEl = document.getElementById('toast');

// --- Initialization & LocalStorage Restore ---
function initBoard() {
    boardEl.innerHTML = '';
    for (let r = 0; r < MAX_ATTEMPTS; r++) {
        const row = document.createElement('div');
        row.className = 'row';
        for (let c = 0; c < WORD_LENGTH; c++) {
            const tile = document.createElement('div');
            tile.className = 'tile';
            tile.id = `tile-${r}-${c}`;
            row.appendChild(tile);
        }
        boardEl.appendChild(row);
    }

    restoreDailyProgress();
    pruneOldSaves();
}

function restoreDailyProgress() {
    const savedData = JSON.parse(localStorage.getItem(`wordle_save_${TODAY_DATE_STR}`));
    if (!savedData) return;

    boardStateHistory = savedData.history || [];
    currentAttempt = boardStateHistory.length;
    gameOver = savedData.gameOver;

    // Re-render past guesses onto the board
    boardStateHistory.forEach((item, r) => {
        const guessArr = item.guess.split('');
        guessArr.forEach((char, c) => {
            const tile = document.getElementById(`tile-${r}-${c}`);
            tile.textContent = char;
            tile.setAttribute('data-state', item.states[c]);

            const keyBtn = document.querySelector(`.key[data-key="${char}"]`);
            if (keyBtn) keyBtn.setAttribute('data-state', item.states[c]);
        });
    });

    if (gameOver) {
        const passed = savedData.passed;
        showToast(passed ? "Daily Wordle Complete!" : `Word was: ${TARGET_WORD}`);
    }
}

function saveDailyProgress(passed) {
    const data = {
        date: TODAY_DATE_STR,
        history: boardStateHistory,
        gameOver: gameOver,
        passed: passed
    };
    localStorage.setItem(`wordle_save_${TODAY_DATE_STR}`, JSON.stringify(data));
}

function updateStats(passed) {
    let stats = JSON.parse(localStorage.getItem('wordle_stats')) || {
        played: 0,
        wins: 0,
        currentStreak: 0,
        maxStreak: 0
    };

    stats.played++;
    if (passed) {
        stats.wins++;
        stats.currentStreak++;
        stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
    } else {
        stats.currentStreak = 0;
    }

    localStorage.setItem('wordle_stats', JSON.stringify(stats));
    localStorage.setItem('wordle_streak', stats.currentStreak); // Syncs with Arcade Hub Leaderboard
}

function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2500);
}

// --- Word List Loading ---
// Loads the full Wordle guess list (~15k five-letter words) once at startup
// and caches it in localStorage so guess validation works fully offline after
// the first load. No external dictionary API is used — it lacks CORS support,
// which caused console errors on every rejected guess.
const WORD_LIST_URL = 'https://cdn.jsdelivr.net/gh/tabatkins/wordle-list@main/words';
const WORD_LIST_STORAGE_KEY = 'wordle_wordlist_v1';

function addWordsToCache(text) {
    text.split(/\r?\n/).forEach(w => {
        const word = w.trim().toUpperCase();
        if (word.length === WORD_LENGTH) VALID_GUESSES_CACHE.add(word);
    });
}

function loadCachedWordList() {
    try {
        const cached = localStorage.getItem(WORD_LIST_STORAGE_KEY);
        if (cached) addWordsToCache(cached);
    } catch (e) { /* localStorage unavailable: use built-in list */ }
}

async function fetchWordList() {
    try {
        const res = await fetch(WORD_LIST_URL);
        if (res.ok) {
            const text = await res.text();
            addWordsToCache(text);
            try {
                localStorage.setItem(WORD_LIST_STORAGE_KEY, text);
            } catch (e) { /* storage full: list still active in memory */ }
        }
    } catch (e) {
        // Offline: the cached/built-in list is used; nothing else to do.
    }
}

// --- Word Verification ---
// Checks against the local VALID_GUESSES_CACHE only (built-in list + the
// loaded/cached full word list). No network call per guess, so no CORS
// console errors — and unknown garbage is always rejected.
async function isValidEnglishWord(word) {
    return VALID_GUESSES_CACHE.has(word);
}

// --- Key Input Handling ---
async function handleKey(key) {
    if (gameOver || isSubmitting || isRevealing) return;
    initAudio();

    if (key === 'ENTER') {
        if (currentGuess.length === WORD_LENGTH) {
            isSubmitting = true;
            let isValid = false;
            try {
                isValid = await isValidEnglishWord(currentGuess);
            } finally {
                isSubmitting = false;
            }
            if (isValid) {
                submitGuess();
            } else {
                showToast("Not in word list");
            }
        } else {
            showToast("Not enough letters");
        }
    } else if (key === 'BACKSPACE' || key === 'BACK') {
        if (currentGuess.length > 0) {
            currentGuess = currentGuess.slice(0, -1);
            updateRowUI();
            Sound.key();
        }
    } else if (/^[A-Z]$/.test(key)) {
        if (currentGuess.length < WORD_LENGTH) {
            currentGuess += key;
            updateRowUI();
            Sound.key();
        }
    }
}

function updateRowUI() {
    for (let c = 0; c < WORD_LENGTH; c++) {
        const tile = document.getElementById(`tile-${currentAttempt}-${c}`);
        if (c < currentGuess.length) {
            tile.textContent = currentGuess[c];
            tile.setAttribute('data-state', 'active');
        } else {
            tile.textContent = '';
            tile.removeAttribute('data-state');
        }
    }
}

// --- Submit & Process Guess ---
function submitGuess() {
    const guess = currentGuess;
    const guessArr = guess.split('');
    const targetArr = TARGET_WORD.split('');
    const letterStates = Array(WORD_LENGTH).fill('absent');

    // Pass 1: Correct letters (Green)
    guessArr.forEach((char, i) => {
        if (char === targetArr[i]) {
            letterStates[i] = 'correct';
            targetArr[i] = null;
        }
    });

    // Pass 2: Present letters (Yellow)
    guessArr.forEach((char, i) => {
        if (letterStates[i] !== 'correct' && targetArr.includes(char)) {
            letterStates[i] = 'present';
            targetArr[targetArr.indexOf(char)] = null;
        }
    });

    const rowIndex = currentAttempt;
    boardStateHistory.push({ guess: guess, states: letterStates });

    // Advance state IMMEDIATELY (before the flip animation) so a refresh
    // mid-animation can't desync the restored board. The animation targets
    // the saved row index instead of the now-advanced currentAttempt.
    currentAttempt++;
    currentGuess = "";
    isRevealing = true;

    // Flip Animations
    guessArr.forEach((char, i) => {
        setTimeout(() => {
            const tile = document.getElementById(`tile-${rowIndex}-${i}`);
            tile.setAttribute('data-state', letterStates[i]); // overwrites 'active'

            const keyBtn = document.querySelector(`.key[data-key="${char}"]`);
            if (keyBtn) {
                const currentState = keyBtn.getAttribute('data-state');
                if (currentState !== 'correct') {
                    keyBtn.setAttribute('data-state', letterStates[i]);
                }
            }
            Sound.flip();
        }, i * 200);
    });

    setTimeout(() => {
        isRevealing = false;
        if (guess === TARGET_WORD) {
            gameOver = true;
            showToast("Genius! Daily Wordle Passed!");
            Sound.win();
            updateStats(true);
            saveDailyProgress(true);
        } else if (rowIndex === MAX_ATTEMPTS - 1) {
            gameOver = true;
            showToast(`Game Over! Word was: ${TARGET_WORD}`);
            Sound.fail();
            updateStats(false);
            saveDailyProgress(false);
        } else {
            saveDailyProgress(false);
        }
    }, WORD_LENGTH * 200);
}

// Input Listeners
window.addEventListener('keydown', e => {
    // Ignore key presses with modifiers (e.g. Ctrl+R would otherwise type "R")
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    handleKey(e.key.toUpperCase());
});
document.querySelectorAll('.key').forEach(btn => {
    btn.addEventListener('click', () => handleKey(btn.dataset.key));
});

// --- Stats Modal & Share ---
loadCachedWordList(); // instant: populate from localStorage if we've run before
fetchWordList();      // background refresh of the full guess list

const statsModal = document.getElementById('stats-modal');
document.getElementById('stats-btn').addEventListener('click', () => {
    const stats = JSON.parse(localStorage.getItem('wordle_stats')) || {
        played: 0, wins: 0, currentStreak: 0, maxStreak: 0
    };
    const winPct = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
    document.getElementById('stat-played').textContent = stats.played;
    document.getElementById('stat-win-pct').textContent = winPct;
    document.getElementById('stat-streak').textContent = stats.currentStreak;
    document.getElementById('stat-max-streak').textContent = stats.maxStreak;
    statsModal.classList.add('show');
});
document.getElementById('stats-close').addEventListener('click', () => statsModal.classList.remove('show'));
statsModal.addEventListener('click', e => {
    if (e.target === statsModal) statsModal.classList.remove('show');
});

function buildShareGrid() {
    return boardStateHistory
        .map(item => item.states
            .map(s => s === 'correct' ? '\u{1F7E9}' : s === 'present' ? '\u{1F7E8}' : '\u2B1B')
            .join(''))
        .join('\n');
}

document.getElementById('share-btn').addEventListener('click', async () => {
    if (boardStateHistory.length === 0) {
        showToast("Make a guess first!");
        return;
    }
    const text = `Daily Wordle (Chromium Games) ${TODAY_DATE_STR}\n` +
        `${boardStateHistory.length}/${MAX_ATTEMPTS}\n\n${buildShareGrid()}`;
    try {
        await navigator.clipboard.writeText(text);
        showToast("Result copied to clipboard!");
    } catch (e) {
        showToast("Couldn't copy result");
    }
});

initBoard();