/* Riddler — Daily 5-letter word riddle validated against the Dictionary API */

const RIDDLE_ENTRIES = [
    {
        word: 'WATER',
        clue: 'A clear, colorless liquid essential for all life.',
        related: ['DRINK', 'OCEAN', 'FLUID', 'CLEAR', 'RAINY']
    },
    {
        word: 'LIGHT',
        clue: 'The natural force that lets us see, produced by the sun or a lamp.',
        related: ['GLARE', 'BEAMS', 'GLOWS', 'SHINE', 'SUNNY']
    },
    {
        word: 'EARTH',
        clue: 'The planet we live on, the third from the sun.',
        related: ['WORLD', 'GLOBE', 'SOILS', 'ORBIT', 'MUDDY']
    },
    {
        word: 'SMILE',
        clue: 'A happy look with upward-curved lips.',
        related: ['GRINS', 'CHEER', 'HAPPY', 'LAUGH', 'MOUTH']
    },
    {
        word: 'STORM',
        clue: 'Fierce weather with strong winds and heavy rain.',
        related: ['RAINS', 'WINDY', 'CLOUD', 'GUSTS', 'FLASH']
    },
    {
        word: 'SLEEP',
        clue: 'A natural rest state where the body and mind recharge.',
        related: ['DREAM', 'NIGHT', 'DOZES', 'TIRED', 'SNORE']
    },
    {
        word: 'MUSIC',
        clue: 'Sounds arranged in a pleasant way, often with rhythm.',
        related: ['SINGS', 'LYRIC', 'TUNES', 'BEATS', 'CHORD']
    },
    {
        word: 'OCEAN',
        clue: 'A vast body of salt water that covers most of the planet.',
        related: ['WAVES', 'SALTY', 'TIDES', 'DEEPS', 'BLUES']
    },
    {
        word: 'HEART',
        clue: 'The organ that keeps blood moving through your body.',
        related: ['CHEST', 'BLOOD', 'PUMPS', 'ORGAN', 'BEATS']
    },
    {
        word: 'CLOUD',
        clue: 'A floating mass of water droplets high in the sky.',
        related: ['FLOAT', 'SKIES', 'MISTY', 'VAPOR', 'RAINS']
    },
    {
        word: 'SWEET',
        clue: 'Tasting like sugar or honey.',
        related: ['SUGAR', 'HONEY', 'CANDY', 'TASTE', 'MELON']
    },
    {
        word: 'GREEN',
        clue: 'The color of grass and fresh leaves.',
        related: ['GRASS', 'LEAFY', 'OLIVE', 'FRESH', 'COLOR']
    }
];

const TODAY_DATE_STR = new Date().toISOString().slice(0, 10);
const SEED = new Date().getFullYear() * 10000 + (new Date().getMonth() + 1) * 100 + new Date().getDate();
const MAX_ATTEMPTS = 5;
const SAVE_KEY = `riddler_save_${TODAY_DATE_STR}_v2`;
const DICT_API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

// Resolved once today's entry is fetched and validated
let dailyEntry = null;
let targetWord = '';
let targetLength = 5;
let relatedWords = new Set();

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

// --- Dictionary API Validation ---
async function isValidDictionaryWord(word) {
    const key = word.toUpperCase();
    if (dictCache[key] !== undefined) return dictCache[key];

    try {
        const res = await fetch(`${DICT_API}${encodeURIComponent(word.toLowerCase())}`);
        const valid = res.ok;
        dictCache[key] = valid;
        return valid;
    } catch (e) {
        // Offline / API failure fallback: stay lenient so the game remains playable
        dictCache[key] = true;
        return true;
    }
}

// --- Daily Word Selection (5-letter, dictionary-verified) ---
async function fetchDailyEntry() {
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
    return /^[A-Z]+$/.test(guess) && guess.length === targetLength;
}

async function handleGuess(evt) {
    if (evt) evt.preventDefault();
    if (gameOver || checkingGuess) return;

    const rawGuess = guessInput.value.trim().toUpperCase();
    if (rawGuess.length !== targetLength) {
        setMessage(`Guess must be exactly ${targetLength} letters.`, 'warning');
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

    // Validate the guess is a real word via the Dictionary API
    checkingGuess = true;
    setMessage(`Checking "${rawGuess}" in the dictionary...`, 'info');
    const inDictionary = await isValidDictionaryWord(rawGuess);
    checkingGuess = false;

    if (!inDictionary) {
        setMessage(`"${rawGuess}" is not in the dictionary.`, 'warning');
        return;
    }

    if (gameOver) return;

    const states = getWordStates(rawGuess);
    previousGuesses.push({ guess: rawGuess, states });

    for (let pos = 0; pos < targetLength; pos++) {
        const tile = document.getElementById(`tile-${currentAttempt}-${pos}`);
        tile.textContent = rawGuess[pos];
        tile.className = `tile ${states[pos]}`;
    }

    const isRelated = relatedWords.has(rawGuess);
    const relatedText = isRelated ? 'This guess is related to the answer.' : 'This guess is not one of the related words.';
    updateDashboard(relatedText);

    if (rawGuess === targetWord) {
        setMessage(`Correct! The answer is ${targetWord}.`, 'success');
        gameOver = true;
        guessInput.disabled = true;
        saveProgress();
        return;
    }

    currentAttempt += 1;
    if (currentAttempt >= MAX_ATTEMPTS) {
        setMessage(`Out of guesses! Today's answer was ${targetWord}.`, 'error');
        gameOver = true;
        guessInput.disabled = true;
    } else {
        setMessage(`Not quite. ${relatedText} Target word length is ${targetLength}.`, 'info');
    }

    saveProgress();
    guessInput.value = '';
    guessInput.focus();
    updateDashboard(relatedText);
}

async function initializeGame() {
    setMessage('Loading today\'s riddle...');

    // Fetch & dictionary-verify today's 5-letter word
    dailyEntry = await fetchDailyEntry();
    targetWord = dailyEntry.word.toUpperCase();
    targetLength = targetWord.length;
    relatedWords = new Set(dailyEntry.related.map(word => word.toUpperCase()));

    riddleTextEl.textContent = dailyEntry.clue;
    lengthBadgeEl.textContent = `${targetLength} letters`;
    initBoard();
    restoreProgress();
    guessInput.placeholder = `Guess a ${targetLength}-letter word...`;
    guessInput.maxLength = targetLength;

    if (!gameOver && previousGuesses.length === 0) {
        setMessage('Good luck! Try to solve the riddle in 5 guesses.', 'info');
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