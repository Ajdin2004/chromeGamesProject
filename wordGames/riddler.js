/* Riddler — Daily 7-letter word riddle validated against the Dictionary API */

const JSON_DATA_PATH = '../data/riddler_entries.json';
const TODAY_DATE_STR = new Date().toISOString().slice(0, 10);
const SEED = new Date().getFullYear() * 10000 + (new Date().getMonth() + 1) * 100 + new Date().getDate();
const MAX_ATTEMPTS = 5;
const SAVE_KEY = `riddler_save_${TODAY_DATE_STR}_v7`;
const DICT_API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const MAX_GUESS_LENGTH = 7;
const MIN_GUESS_LENGTH = 5;



let dailyEntry = null;
let targetWord = '';
let targetLength = 7;
let relatedWords = new Set();
let RIDDLE_ENTRIES = [];
let currentAttempt = 0;
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
const guessForm = document.getElementById('guess-form');
const guessInput = document.getElementById('guess-input');

function setMessage(text, type = 'info') {
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
}

async function isValidDictionaryWord(word) {
    const key = word.toUpperCase();
    if (dictCache[key] !== undefined) return dictCache[key];

    try {
        const res = await fetch(`${DICT_API}${encodeURIComponent(word.toLowerCase())}`);
        const valid = res.ok;
        dictCache[key] = valid;
        return valid;
    } catch (e) {
        dictCache[key] = true;
        return true;
    }
}

// --- Daily Word Selection (7-letter, dictionary-verified) ---
async function fetchDailyEntry() {
    // Load entries dynamically from the generated JSON dataset
    if (RIDDLE_ENTRIES.length === 0) {
        try {
            const res = await fetch(JSON_DATA_PATH);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            RIDDLE_ENTRIES = await res.json();
        } catch (err) {
            console.error('Failed to load riddle dataset:', err);
            // Fallback entry if loading fails
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
        row.style.gridTemplateColumns = `repeat(${targetLength}, 1fr)`;
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
        }
    });

    if (gameOver) {
        const solved = previousGuesses.some(entry => entry.guess === targetWord);
        const resultText = solved
            ? 'You already solved today\'s riddle.'
            : `The answer was ${targetWord}.`;
        setMessage(resultText, solved ? 'success' : 'error');
        guessInput.disabled = true;
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

function isValidWord(guess) {
    return /^[A-Z]+$/.test(guess) && guess.length >= MIN_GUESS_LENGTH && guess.length <= MAX_GUESS_LENGTH;
}

async function handleGuess(evt) {
    if (evt) evt.preventDefault();
    if (gameOver || checkingGuess) return;

    const rawGuess = guessInput.value.trim().toUpperCase();

    // Check if the guess length falls within the allowed 5 to 7 letter range
    if (rawGuess.length < MIN_GUESS_LENGTH || rawGuess.length > MAX_GUESS_LENGTH) {
        setMessage(`Guess must be between ${MIN_GUESS_LENGTH} and ${MAX_GUESS_LENGTH} letters long.`, 'warning');
        return;
    }

    if (!isValidWord(rawGuess)) {
        setMessage('Please type only letters for your guess.', 'error');
        return;
    }

    if (previousGuesses.some(entry => entry.guess === rawGuess)) {
        setMessage('You already tried that word.', 'warning');
        return;
    }

    checkingGuess = true;
    setMessage(`Checking "${rawGuess}" in the dictionary...`, 'info');
    const inDictionary = await isValidDictionaryWord(rawGuess);
    checkingGuess = false;

    if (!inDictionary) {
        setMessage(`"${rawGuess}" is not in the dictionary.`, 'warning');
        return;
    }

    if (gameOver) return;

    const isRelated = relatedWords.has(rawGuess);
    const relatedText = isRelated 
        ? 'This guess is RELATED to the secret answer!' 
        : 'This guess is NOT one of the related words.';

    // If the guess length matches the daily target word, populate the board tiles
    if (rawGuess.length === targetLength) {
        const states = getWordStates(rawGuess);
        previousGuesses.push({ guess: rawGuess, states });

        for (let pos = 0; pos < targetLength; pos++) {
            const tile = document.getElementById(`tile-${currentAttempt}-${pos}`);
            tile.textContent = rawGuess[pos];
            tile.className = `tile ${states[pos]}`;
        }

        if (rawGuess === targetWord) {
            setMessage(`Correct! The answer is ${targetWord}.`, 'success');
            gameOver = true;
            guessInput.disabled = true;
            updateDashboard(relatedText);
            saveProgress();
            return;
        }

        currentAttempt += 1;
        if (currentAttempt >= MAX_ATTEMPTS) {
            setMessage(`Out of guesses! Today's answer was ${targetWord}.`, 'error');
            gameOver = true;
            guessInput.disabled = true;
        } else {
            setMessage(`Board updated! ${relatedText}`, 'info');
        }
    } else {
        // Handle guesses with alternative lengths (e.g., 5 or 6 letters)
        setMessage(`Submitted ${rawGuess.length}-letter word. ${relatedText}`, 'info');
    }

    saveProgress();
    guessInput.value = '';
    guessInput.focus();
    updateDashboard(relatedText);
}

async function initializeGame() {
    setMessage('Loading today\'s riddle...');

    dailyEntry = await fetchDailyEntry();
    targetWord = dailyEntry.word.toUpperCase();
    targetLength = targetWord.length;
    relatedWords = new Set(dailyEntry.related.map(word => word.toUpperCase()));

    riddleTextEl.textContent = dailyEntry.clue;
    lengthBadgeEl.textContent = `${targetLength} letters`;
    initBoard();
    restoreProgress();

    // Adjust input properties for flexible length entry
    guessInput.placeholder = `Guess a ${MIN_GUESS_LENGTH}-${MAX_GUESS_LENGTH} letter word...`;
    guessInput.maxLength = MAX_GUESS_LENGTH;

    if (!gameOver && previousGuesses.length === 0) {
        setMessage('Good luck! You can guess 5, 6, or 7-letter words to test related clues.', 'info');
    } else if (!gameOver && previousGuesses.length > 0) {
        setMessage('Continue solving the riddle with your next guess.', 'info');
    }
}

guessForm.addEventListener('submit', handleGuess);
guessInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        handleGuess(event);
    }
});

initializeGame();