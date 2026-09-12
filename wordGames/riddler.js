/* Riddler — Daily variable-letter word riddle game */

const JSON_DATA_PATH = '../data/riddle_entries_356.json';
const TODAY_DATE_STR = new Date().toISOString().slice(0, 10);
const SEED = new Date().getFullYear() * 10000 + (new Date().getMonth() + 1) * 100 + new Date().getDate();
const MAX_ATTEMPTS = 5;
const SAVE_KEY = `riddler_save_${TODAY_DATE_STR}_v7`;
const MAX_GUESS_LENGTH = 7;
const MIN_GUESS_LENGTH = 5;

let dailyEntry = null;
let targetWord = '';
let targetLength = 7;
let relatedWords = new Set();
let RIDDLE_ENTRIES = [];
let currentAttempt = 0;
let currentGuess = "";
let gameOver = false;
let checkingGuess = false;
let previousGuesses = [];

const dictCache = {};

const boardEl = document.getElementById('board');
const riddleTextEl = document.getElementById('riddle-text');
const lengthBadgeEl = document.getElementById('length-badge');
const attemptsInfoEl = document.getElementById('attempts-info');
const relatedHintEl = document.getElementById('related-hint');
const messageEl = document.getElementById('message');

function setMessage(text, type = 'info') {
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
}

async function isValidDictionaryWord(word) {
    const key = word.toUpperCase();
    if (dictCache[key] !== undefined) return dictCache[key];

    const valid = /^[A-Z]+$/.test(key) && key.length >= MIN_GUESS_LENGTH && key.length <= MAX_GUESS_LENGTH;
    dictCache[key] = valid;
    return valid;
}

// --- Daily Word Selection ---
async function fetchDailyEntry() {
    if (RIDDLE_ENTRIES.length === 0) {
        try {
            const res = await fetch(JSON_DATA_PATH);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            RIDDLE_ENTRIES = await res.json();
        } catch (err) {
            console.error('Failed to load riddle dataset:', err);
            RIDDLE_ENTRIES = [{
                word: 'WEATHER',
                clue: 'The state of the atmosphere at a place and time.',
                related: ['CLIMATE', 'STORMS', 'CLOUDS', 'FREEZE']
            }];
        }
    }

    const startIdx = SEED % RIDDLE_ENTRIES.length;
    for (let i = 0; i < RIDDLE_ENTRIES.length; i++) {
        const idx = (startIdx + i) % RIDDLE_ENTRIES.length;
        const candidate = RIDDLE_ENTRIES[idx];
        if (await isValidDictionaryWord(candidate.word)) return candidate;
    }
    return RIDDLE_ENTRIES[startIdx];
}

function initBoard() {
    boardEl.innerHTML = '';
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const row = document.createElement('div');
        row.className = 'board-row';
        // Set column count based on daily target word length
        row.style.gridTemplateColumns = `repeat(${targetLength}, clamp(30px, 9vw, 54px))`;
        for (let j = 0; j < targetLength; j++) {
            const tile = document.createElement('div');
            tile.className = 'tile empty';
            tile.id = `tile-${i}-${j}`;
            row.appendChild(tile);
        }
        boardEl.appendChild(row);
    }
}

function restoreProgress() {
    const savedData = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!savedData) return;

    currentAttempt = savedData.currentAttempt || 0;
    gameOver = savedData.gameOver || false;
    previousGuesses = savedData.previousGuesses || [];

    previousGuesses.forEach((entry, attempt) => {
        const [guess, states] = [entry.guess, entry.states];
        if (!guess || guess.length !== targetLength) return;
        
        for (let pos = 0; pos < targetLength; pos++) {
            const tile = document.getElementById(`tile-${attempt}-${pos}`);
            tile.textContent = guess[pos] || '';
            tile.className = `tile ${states[pos]}`;
            updateKeyboardUI(guess[pos], states[pos]);
        }
    });

    if (gameOver) {
        const solved = previousGuesses.some(entry => entry.guess === targetWord);
        setMessage(solved ? 'You already solved today\'s riddle.' : `The answer was ${targetWord}.`, solved ? 'success' : 'error');
    }

    updateDashboard();
}

function saveProgress() {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
        currentAttempt,
        gameOver,
        previousGuesses
    }));
}

function updateDashboard(relatedStatus = 'Submit a guess to see if it connects.') {
    attemptsInfoEl.textContent = `${currentAttempt} / ${MAX_ATTEMPTS}`;
    relatedHintEl.textContent = relatedStatus;
}

function getWordStates(guess) {
    const results = Array(targetLength).fill('absent');
    const targetArray = targetWord.split('');

    guess.split('').forEach((letter, index) => {
        if (letter === targetArray[index]) {
            results[index] = 'correct';
            targetArray[index] = null;
        }
    });

    guess.split('').forEach((letter, index) => {
        if (results[index] === 'correct') return;
        const foundIndex = targetArray.indexOf(letter);
        if (foundIndex !== -1) {
            results[index] = 'present';
            targetArray[foundIndex] = null;
        }
    });

    return results;
}

function updateKeyboardUI(letter, state) {
    const keyBtn = document.querySelector(`.key[data-key="${letter}"]`);
    if (!keyBtn) return;
    const currentState = keyBtn.className;
    
    // Prioritize correct > present > absent styling
    if (state === 'correct' || (state === 'present' && !currentState.includes('correct'))) {
        keyBtn.className = `key ${state}`;
    } else if (state === 'absent' && !currentState.includes('correct') && !currentState.includes('present')) {
        keyBtn.className = `key absent`;
    }
}

// --- Keyboard Input Logic ---
function updateRowUI() {
    for (let c = 0; c < targetLength; c++) {
        const tile = document.getElementById(`tile-${currentAttempt}-${c}`);
        if (!tile) continue;
        
        if (c < currentGuess.length) {
            tile.textContent = currentGuess[c];
            tile.classList.remove('empty');
            tile.style.borderColor = 'var(--accent)';
        } else {
            tile.textContent = '';
            tile.classList.add('empty');
            tile.style.borderColor = '';
        }
    }
}

function handleKey(key) {
    if (gameOver || checkingGuess) return;

    if (key === 'ENTER') {
        handleGuessSubmit();
    } else if (key === 'BACKSPACE' || key === 'BACK') {
        if (currentGuess.length > 0) {
            currentGuess = currentGuess.slice(0, -1);
            updateRowUI();
        }
    } else if (/^[A-Z]$/.test(key)) {
        if (currentGuess.length < targetLength) {
            currentGuess += key;
            updateRowUI();
        }
    }
}

async function handleGuessSubmit() {
    if (currentGuess.length < MIN_GUESS_LENGTH || currentGuess.length > MAX_GUESS_LENGTH) {
        setMessage(`Guess must be between ${MIN_GUESS_LENGTH} and ${MAX_GUESS_LENGTH} letters.`, 'warning');
        return;
    }

    if (previousGuesses.some(entry => entry.guess === currentGuess)) {
        setMessage('You already tried that word.', 'warning');
        return;
    }

    checkingGuess = true;
    setMessage(`Checking "${currentGuess}"...`, 'info');
    const inDictionary = await isValidDictionaryWord(currentGuess);
    checkingGuess = false;

    if (!inDictionary) {
        setMessage(`"${currentGuess}" is not in the dictionary.`, 'warning');
        return;
    }

    const isRelated = relatedWords.has(currentGuess);
    const relatedText = isRelated 
        ? 'This guess is RELATED to the secret answer!' 
        : 'This guess is NOT one of the related words.';

    // Word matches target length: apply to board
    if (currentGuess.length === targetLength) {
        const states = getWordStates(currentGuess);
        previousGuesses.push({ guess: currentGuess, states });

        for (let pos = 0; pos < targetLength; pos++) {
            const tile = document.getElementById(`tile-${currentAttempt}-${pos}`);
            tile.style.borderColor = ''; // clear active typing border
            tile.className = `tile ${states[pos]}`;
            updateKeyboardUI(currentGuess[pos], states[pos]);
        }

        if (currentGuess === targetWord) {
            setMessage(`Correct! The answer is ${targetWord}.`, 'success');
            gameOver = true;
            updateDashboard(relatedText);
            saveProgress();
            return;
        }

        currentAttempt += 1;
        if (currentAttempt >= MAX_ATTEMPTS) {
            setMessage(`Out of guesses! Today's answer was ${targetWord}.`, 'error');
            gameOver = true;
        } else {
            setMessage(`Board updated! ${relatedText}`, 'info');
        }
    } else {
        // Shorter word guess: Check relatedness, then clear row for retry
        setMessage(`Submitted ${currentGuess.length}-letter word. ${relatedText}`, 'info');
    }

    currentGuess = "";
    if (!gameOver) updateRowUI(); 
    
    saveProgress();
    updateDashboard(relatedText);
}

// Listeners
window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    handleKey(e.key.toUpperCase());
});

document.querySelectorAll('.key').forEach(btn => {
    btn.addEventListener('click', () => handleKey(btn.dataset.key));
});

async function initializeGame() {
    setMessage('Loading today\'s riddle...');

    dailyEntry = await fetchDailyEntry();
    targetWord = dailyEntry.word.toUpperCase();
    targetLength = targetWord.length;
    relatedWords = new Set(dailyEntry.related.map(word => word.toUpperCase()));

    // Populate Unified Clue Box
    riddleTextEl.textContent = dailyEntry.clue;
    lengthBadgeEl.textContent = `${targetLength} letters`;

    initBoard();
    restoreProgress();

    if (!gameOver && previousGuesses.length === 0) {
        setMessage('Type a word. You can guess shorter words to test related clues.', 'info');
    } else if (!gameOver && previousGuesses.length > 0) {
        setMessage('Continue solving the riddle.', 'info');
    }
}

// --- Help Modal Logic ---
const helpModal = document.getElementById('help-modal');
document.getElementById('help-btn')?.addEventListener('click', () => helpModal.classList.add('active'));
document.getElementById('help-close')?.addEventListener('click', () => helpModal.classList.remove('active'));
document.getElementById('help-ok')?.addEventListener('click', () => helpModal.classList.remove('active'));
helpModal?.addEventListener('click', e => {
    if (e.target === helpModal) helpModal.classList.remove('active');
});

// --- Wallpaper & Particle Interactions ---
let particlesActive = localStorage.getItem('riddler_wallpaper') !== 'true'; // default to true if not set
const btnWallpaper = document.getElementById('btn-wallpaper');
const particles = document.querySelectorAll('.particle');

if (!particlesActive) {
    particles.forEach(p => p.style.display = 'none');
}

if (btnWallpaper) {
    btnWallpaper.addEventListener('click', () => {
        particlesActive = !particlesActive;
        localStorage.setItem('riddler_wallpaper', particlesActive); 
        
        if (!particlesActive) {
            particles.forEach(p => {
                const rect = p.getBoundingClientRect();
                p.dataset.origStyle = p.style.cssText; 
                
                p.style.left = rect.left + 'px';
                p.style.top = rect.top + 'px';
                p.style.bottom = 'auto';
                
                p.classList.add('popping');
                setTimeout(() => {
                    if (!particlesActive) p.style.display = 'none'; 
                }, 400);
            });
        } else {
            particles.forEach(p => {
                if (p.dataset.origStyle) p.style.cssText = p.dataset.origStyle;
                p.style.display = 'block';
                p.classList.remove('popping');
                p.style.animationName = 'none';
                p.offsetHeight;
                p.style.animationName = ''; 
            });
        }
    });
}

document.addEventListener('click', function(e) {
    if (e.target.classList.contains('particle') && particlesActive) {
        const p = e.target;
        const rect = p.getBoundingClientRect();
        const originalCssText = p.style.cssText;
        
        p.style.left = rect.left + 'px';
        p.style.top = rect.top + 'px';
        p.style.bottom = 'auto';
        p.classList.add('popping');
        
        setTimeout(() => {
            if (particlesActive) {
                p.classList.remove('popping');
                p.style.cssText = originalCssText;
                p.style.animationName = 'none';
                p.offsetHeight;
                p.style.animationName = '';
            }
        }, 400);
    }
});

initializeGame();