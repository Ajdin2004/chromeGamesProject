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
    "SPACE", "STONE", "TABLE", "TIGER", "WATER", "WORLD", "YOUTH", "NEONX"
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
const TODAY_DATE_STR = new Date().toISOString().slice(0, 10);
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

// --- API Word Verification ---
async function isValidEnglishWord(word) {
    if (VALID_GUESSES_CACHE.has(word)) return true;

    try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
        if (res.ok) {
            VALID_GUESSES_CACHE.add(word); // Cache valid word locally
            return true;
        }
    } catch (e) {
        return true; // Fallback to allow play if offline/network fails
    }
    return false;
}

// --- Key Input Handling ---
async function handleKey(key) {
    if (gameOver) return;
    initAudio();

    if (key === 'ENTER') {
        if (currentGuess.length === WORD_LENGTH) {
            const isValid = await isValidEnglishWord(currentGuess);
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
    const guessArr = currentGuess.split('');
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

    boardStateHistory.push({ guess: currentGuess, states: letterStates });

    // Flip Animations
    guessArr.forEach((char, i) => {
        setTimeout(() => {
            const tile = document.getElementById(`tile-${currentAttempt}-${i}`);
            tile.setAttribute('data-state', letterStates[i]);

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
        if (currentGuess === TARGET_WORD) {
            showToast("Genius! Daily Wordle Passed!");
            Sound.win();
            gameOver = true;
            updateStats(true);
            saveDailyProgress(true);
        } else if (currentAttempt === MAX_ATTEMPTS - 1) {
            showToast(`Game Over! Word was: ${TARGET_WORD}`);
            Sound.fail();
            gameOver = true;
            updateStats(false);
            saveDailyProgress(false);
        } else {
            currentAttempt++;
            currentGuess = "";
            saveDailyProgress(false);
        }
    }, WORD_LENGTH * 200);
}

// Input Listeners
window.addEventListener('keydown', e => handleKey(e.key.toUpperCase()));
document.querySelectorAll('.key').forEach(btn => {
    btn.addEventListener('click', () => handleKey(btn.dataset.key));
});

initBoard();