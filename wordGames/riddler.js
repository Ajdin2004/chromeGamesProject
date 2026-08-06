const RIDDLE_ENTRIES = [
    {
        word: 'HORIZON',
        clue: 'The distant line where the earth and sky appear to meet.',
        related: ['SUNSET', 'DAWN', 'SKYLINE', 'TWILIGHT', 'VIEW']
    },
    {
        word: 'ENIGMA',
        clue: 'A puzzling mystery or riddle whose solution requires thought.',
        related: ['MYSTERY', 'PUZZLE', 'RIDDLE', 'CLUE', 'HIDDEN']
    },
    {
        word: 'GALAXY',
        clue: 'A massive collection of stars, gas, and dust held together by gravity.',
        related: ['COSMOS', 'UNIVERSE', 'STARS', 'SPACE', 'ORBIT']
    },
    {
        word: 'FOREST',
        clue: 'A large area filled with trees and wild plant life.',
        related: ['WOODS', 'JUNGLE', 'TREES', 'NATURE', 'GROVE']
    },
    {
        word: 'LEGEND',
        clue: 'A story passed through generations, often heroic or mythical.',
        related: ['MYTH', 'TALE', 'FOLKLORE', 'HERO', 'EPIC']
    },
    {
        word: 'BALANCE',
        clue: 'A state where opposing forces are equal and steady.',
        related: ['EQUILIBRIUM', 'SCALE', 'EQUAL', 'HARMONY', 'WEIGHT']
    },
    {
        word: 'ORCHARD',
        clue: 'A planted area of fruit trees maintained for harvesting.',
        related: ['APPLES', 'GARDEN', 'FRUITS', 'PLANT', 'GROWTH']
    },
    {
        word: 'SALVAGE',
        clue: 'To recover valuable material from something damaged or wrecked.',
        related: ['RECOVER', 'RESCUE', 'RECLAIM', 'REUSE', 'SAVE']
    },
    {
        word: 'ORIENT',
        clue: 'To align or position something relative to a known direction.',
        related: ['DIRECTION', 'LOCATE', 'POSITION', 'ALIGN', 'FIND']
    },
    {
        word: 'NOVELTY',
        clue: 'Something new and unusual that catches attention.',
        related: ['UNIQUE', 'FRESH', 'ORIGINAL', 'TRENDY', 'CURIOUS']
    }
];

const TODAY_DATE_STR = new Date().toISOString().slice(0, 10);
const DAILY_INDEX = (new Date().getFullYear() * 10000 + (new Date().getMonth() + 1) * 100 + new Date().getDate()) % RIDDLE_ENTRIES.length;
const DAILY_ENTRY = RIDDLE_ENTRIES[DAILY_INDEX];
const TARGET_WORD = DAILY_ENTRY.word.toUpperCase();
const TARGET_LENGTH = TARGET_WORD.length;
const TARGET_CLUE = DAILY_ENTRY.clue;
const RELATED_WORDS = new Set(DAILY_ENTRY.related.map(word => word.toUpperCase()));
const MAX_ATTEMPTS = 7;

let currentAttempt = 0;
let gameOver = false;
let previousGuesses = [];

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

function initBoard() {
    boardEl.innerHTML = '';
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const row = document.createElement('div');
        row.className = 'board-row';
        row.style.gridTemplateColumns = `repeat(${TARGET_LENGTH}, 1fr)`;
        for (let j = 0; j < TARGET_LENGTH; j++) {
            const tile = document.createElement('div');
            tile.className = 'tile empty';
            tile.id = `tile-${i}-${j}`;
            row.appendChild(tile);
        }
        boardEl.appendChild(row);
    }
}

function restoreProgress() {
    const savedData = JSON.parse(localStorage.getItem(`riddler_save_${TODAY_DATE_STR}`));
    if (!savedData) return;

    currentAttempt = savedData.currentAttempt || 0;
    gameOver = savedData.gameOver || false;
    previousGuesses = savedData.previousGuesses || [];

    previousGuesses.forEach((entry, attempt) => {
        const [guess, states] = [entry.guess, entry.states];
        for (let pos = 0; pos < TARGET_LENGTH; pos++) {
            const tile = document.getElementById(`tile-${attempt}-${pos}`);
            tile.textContent = guess[pos] || '';
            tile.className = `tile ${states[pos]}`;
        }
    });

    if (gameOver) {
        const solved = previousGuesses.some(entry => entry.guess === TARGET_WORD);
        const resultText = solved
            ? 'You already solved today\'s riddle.'
            : `The answer was ${TARGET_WORD}.`;
        setMessage(resultText, solved ? 'success' : 'error');
        guessInput.disabled = true;
    }

    updateDashboard();
}

function saveProgress() {
    localStorage.setItem(`riddler_save_${TODAY_DATE_STR}`, JSON.stringify({
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
    const results = Array(TARGET_LENGTH).fill('absent');
    const targetArray = TARGET_WORD.split('');

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
    return /^[A-Z]+$/.test(guess) && guess.length === TARGET_LENGTH;
}

function handleGuess(evt) {
    if (evt) evt.preventDefault();
    if (gameOver) return;

    const rawGuess = guessInput.value.trim().toUpperCase();
    if (rawGuess.length !== TARGET_LENGTH) {
        setMessage(`Guess must be exactly ${TARGET_LENGTH} letters.`, 'warning');
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

    const states = getWordStates(rawGuess);
    previousGuesses.push({ guess: rawGuess, states });

    for (let pos = 0; pos < TARGET_LENGTH; pos++) {
        const tile = document.getElementById(`tile-${currentAttempt}-${pos}`);
        tile.textContent = rawGuess[pos];
        tile.className = `tile ${states[pos]}`;
    }

    const isRelated = RELATED_WORDS.has(rawGuess);
    const relatedText = isRelated ? 'This guess is related to the answer.' : 'This guess is not one of the related words.';
    updateDashboard(relatedText);

    if (rawGuess === TARGET_WORD) {
        setMessage(`Correct! The answer is ${TARGET_WORD}.`, 'success');
        gameOver = true;
        guessInput.disabled = true;
        saveProgress();
        return;
    }

    currentAttempt += 1;
    if (currentAttempt >= MAX_ATTEMPTS) {
        setMessage(`Out of guesses! Today's answer was ${TARGET_WORD}.`, 'error');
        gameOver = true;
        guessInput.disabled = true;
    } else {
        setMessage(`Not quite. ${relatedText} Target word length is ${TARGET_LENGTH}.`, 'info');
    }

    saveProgress();
    guessInput.value = '';
    guessInput.focus();
    updateDashboard(relatedText);
}

function initializeGame() {
    riddleTextEl.textContent = TARGET_CLUE;
    lengthBadgeEl.textContent = `${TARGET_LENGTH} letters`;
    initBoard();
    restoreProgress();
    guessInput.placeholder = `Guess a ${TARGET_LENGTH}-letter word...`;
    guessInput.maxLength = TARGET_LENGTH;

    if (!gameOver && previousGuesses.length === 0) {
        setMessage('Good luck! Try to solve the riddle in 7 guesses.', 'info');
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
