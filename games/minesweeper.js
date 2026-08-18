// --- Web Audio Synthesizer ---
let audioCtx = null;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

const Sound = {
    reveal() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.06);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.06);
    },
    flag() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.05);
    },
    win() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.12);
            gain.gain.setValueAtTime(0.15, now + i * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.15);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now + i * 0.12); osc.stop(now + i * 0.12 + 0.15);
        });
    },
    lose() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.5);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.5);
    }
};

// --- Difficulty Settings ---
const DIFFICULTIES = {
    beginner: { rows: 9, cols: 9, mines: 10, name: 'Beginner' },
    intermediate: { rows: 16, cols: 16, mines: 40, name: 'Intermediate' },
    expert: { rows: 16, cols: 30, mines: 99, name: 'Expert' }
};

// --- Game State ---
let difficulty = 'beginner';
let board = [];          // 2D array: { mine, revealed, flagged, adjacent }
let gameOver = false;
let gameWon = false;
let firstClick = true;
let timerInterval = null;
let elapsedTime = 0;
let flagsPlaced = 0;

// --- DOM References ---
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const mineCounterEl = document.getElementById('mine-counter').querySelector('span');
const timerEl = document.getElementById('timer').querySelector('span');
const resetBtn = document.getElementById('btn-reset');
const btnNewGame = document.getElementById('btn-new-game');
const btnBeginner = document.getElementById('btn-beginner');
const btnIntermediate = document.getElementById('btn-intermediate');
const btnExpert = document.getElementById('btn-expert');
const scoreWins = document.getElementById('score-wins');
const scoreLosses = document.getElementById('score-losses');
const scoreBest = document.getElementById('score-best');

// --- Scoreboard Persistence ---
const STATS_KEY = 'minesweeper_stats';
function loadStats() {
    try { return JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, bestTime: null }; }
    catch (e) { return { wins: 0, losses: 0, bestTime: null }; }
}
function saveStats(stats) {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { /* ignore */ }
}
function updateScoreboard() {
    const stats = loadStats();
    scoreWins.textContent = stats.wins;
    scoreLosses.textContent = stats.losses;
    scoreBest.textContent = stats.bestTime !== null ? `${stats.bestTime}s` : '--';
}

// --- Board Setup ---
function initBoard() {
    const config = DIFFICULTIES[difficulty];
    const { rows, cols, mines } = config;

    // Reset state
    board = [];
    gameOver = false;
    gameWon = false;
    firstClick = true;
    flagsPlaced = 0;
    elapsedTime = 0;
    clearInterval(timerInterval);
    timerInterval = null;

    // Create empty board
    for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) {
            row.push({ mine: false, revealed: false, flagged: false, adjacent: 0 });
        }
        board.push(row);
    }

    // Update UI
    mineCounterEl.textContent = mines;
    timerEl.textContent = '0';
    statusEl.textContent = 'Click a cell to start!';
    resetBtn.innerHTML = '<i class="fa-solid fa-face-smile"></i>';
    renderBoard();
}

function placeMines(safeRow, safeCol) {
    const config = DIFFICULTIES[difficulty];
    const { rows, cols, mines } = config;

    let placed = 0;
    while (placed < mines) {
        const r = Math.floor(Math.random() * rows);
        const c = Math.floor(Math.random() * cols);
        // Skip if already a mine or if it's the safe cell or adjacent to it
        if (board[r][c].mine) continue;
        if (Math.abs(r - safeRow) <= 1 && Math.abs(c - safeCol) <= 1) continue;
        board[r][c].mine = true;
        placed++;
    }

    // Calculate adjacent mine counts
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!board[r][c].mine) {
                board[r][c].adjacent = countAdjacentMines(r, c);
            }
        }
    }
}

function countAdjacentMines(r, c) {
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < board.length && nc >= 0 && nc < board[0].length && board[nr][nc].mine) {
                count++;
            }
        }
    }
    return count;
}

// --- Board Rendering ---
function renderBoard() {
    const config = DIFFICULTIES[difficulty];
    const { rows, cols } = config;

    // Dynamically calculate cell size to fill available space
    const gameWrapper = document.querySelector('.game-wrapper');
    const infoBarHeight = document.querySelector('.info-bar').offsetHeight;
    const wrapperPadding = 32; // 2 * 16px padding
    const gap = 2;
    const boardGapTotal = gap * (cols - 1);
    const maxWidth = Math.min(gameWrapper.clientWidth - wrapperPadding, window.innerWidth - 32);
    const availableHeight = window.innerHeight - infoBarHeight - wrapperPadding - 150; // account for header, controls, footer
    const maxCellByWidth = Math.floor((maxWidth - boardGapTotal) / cols);
    const maxCellByHeight = Math.floor((availableHeight - gap * (rows - 1)) / rows);
    const cellSize = Math.max(20, Math.min(maxCellByWidth, maxCellByHeight, 40));

    boardEl.style.setProperty('--cell-size', `${cellSize}px`);
    boardEl.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
    boardEl.style.gridTemplateRows = `repeat(${rows}, ${cellSize}px)`;
    boardEl.innerHTML = '';

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = r;
            cell.dataset.col = c;

            // Event listeners
            cell.addEventListener('click', () => handleCellClick(r, c));
            cell.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                handleCellRightClick(r, c);
            });

            boardEl.appendChild(cell);
        }
    }

    // Re-apply board state to cells (for resize re-renders)
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            updateCellDisplay(r, c);
        }
    }
}

function updateCellDisplay(r, c) {
    const cell = boardEl.children[r * board[0].length + c];
    const data = board[r][c];

    cell.className = 'cell';

    if (data.revealed) {
        cell.classList.add('revealed');
        if (data.mine) {
            cell.classList.add('mine');
            cell.innerHTML = '<i class="fa-solid fa-bomb"></i>';
        } else if (data.adjacent > 0) {
            cell.classList.add(`num-${data.adjacent}`);
            cell.textContent = data.adjacent;
        }
    } else if (data.flagged) {
        cell.classList.add('flagged');
        cell.innerHTML = '<i class="fa-solid fa-flag"></i>';
    }
}

function revealAllMines(hitRow, hitCol) {
    const config = DIFFICULTIES[difficulty];
    const { rows, cols } = config;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const data = board[r][c];
            if (data.mine) {
                data.revealed = true;
                const cell = boardEl.children[r * cols + c];
                cell.classList.add('mine');
                if (r === hitRow && c === hitCol) {
                    cell.classList.add('mine-hit');
                }
                cell.innerHTML = '<i class="fa-solid fa-bomb"></i>';
            } else if (data.flagged) {
                // Wrong flag
                const cell = boardEl.children[r * cols + c];
                cell.classList.add('wrong-flag');
                cell.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            }
        }
    }
}

function markWinningCells() {
    const config = DIFFICULTIES[difficulty];
    const { rows, cols } = config;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const data = board[r][c];
            if (data.mine && !data.flagged) {
                data.flagged = true;
                const cell = boardEl.children[r * cols + c];
                cell.classList.add('flagged', 'winning');
                cell.innerHTML = '<i class="fa-solid fa-flag"></i>';
            }
        }
    }
}

// --- Game Logic ---
function handleCellClick(r, c) {
    initAudio();
    if (gameOver || gameWon) return;
    const data = board[r][c];
    if (data.revealed || data.flagged) return;

    // First click: place mines safely
    if (firstClick) {
        firstClick = false;
        placeMines(r, c);
        startTimer();
    }

    if (data.mine) {
        // Hit a mine
        gameOver = true;
        data.revealed = true;
        clearInterval(timerInterval);
        revealAllMines(r, c);
        updateCellDisplay(r, c);
        statusEl.textContent = 'Game Over! 💥';
        resetBtn.innerHTML = '<i class="fa-solid fa-face-frown"></i>';
        Sound.lose();

        // Update stats
        const stats = loadStats();
        stats.losses++;
        saveStats(stats);
        updateScoreboard();
        localStorage.setItem('minesweeper_wins', stats.wins);
        return;
    }

    // Reveal cell (flood fill for empty cells)
    revealCell(r, c);
    Sound.reveal();

    // Check win
    if (checkWin()) {
        gameWon = true;
        clearInterval(timerInterval);
        markWinningCells();
        statusEl.textContent = 'You Win! 🎉';
        resetBtn.innerHTML = '<i class="fa-solid fa-face-grin-stars"></i>';
        Sound.win();

        // Update stats
        const stats = loadStats();
        stats.wins++;
        if (stats.bestTime === null || elapsedTime < stats.bestTime) {
            stats.bestTime = elapsedTime;
        }
        saveStats(stats);
        updateScoreboard();
        localStorage.setItem('minesweeper_wins', stats.wins);
    }
}

function handleCellRightClick(r, c) {
    initAudio();
    if (gameOver || gameWon) return;
    const data = board[r][c];
    if (data.revealed) return;

    data.flagged = !data.flagged;
    if (data.flagged) {
        flagsPlaced++;
        Sound.flag();
    } else {
        flagsPlaced--;
    }

    const config = DIFFICULTIES[difficulty];
    mineCounterEl.textContent = config.mines - flagsPlaced;
    updateCellDisplay(r, c);
}

function revealCell(r, c) {
    const data = board[r][c];
    if (data.revealed || data.flagged || data.mine) return;

    data.revealed = true;
    updateCellDisplay(r, c);

    // Flood fill for empty cells
    if (data.adjacent === 0) {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= 0 && nr < board.length && nc >= 0 && nc < board[0].length) {
                    const neighbor = board[nr][nc];
                    if (!neighbor.revealed && !neighbor.flagged && !neighbor.mine) {
                        revealCell(nr, nc);
                    }
                }
            }
        }
    }
}

function checkWin() {
    const config = DIFFICULTIES[difficulty];
    const { rows, cols, mines } = config;
    let revealedCount = 0;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (board[r][c].revealed) revealedCount++;
        }
    }

    return revealedCount === (rows * cols - mines);
}

// --- Timer ---
function startTimer() {
    clearInterval(timerInterval);
    elapsedTime = 0;
    timerEl.textContent = '0';
    timerInterval = setInterval(() => {
        elapsedTime++;
        timerEl.textContent = elapsedTime;
    }, 1000);
}

// --- Event Listeners ---
btnBeginner.addEventListener('click', () => {
    difficulty = 'beginner';
    btnBeginner.classList.add('active');
    btnIntermediate.classList.remove('active');
    btnExpert.classList.remove('active');
    initBoard();
});

btnIntermediate.addEventListener('click', () => {
    difficulty = 'intermediate';
    btnIntermediate.classList.add('active');
    btnBeginner.classList.remove('active');
    btnExpert.classList.remove('active');
    initBoard();
});

btnExpert.addEventListener('click', () => {
    difficulty = 'expert';
    btnExpert.classList.add('active');
    btnBeginner.classList.remove('active');
    btnIntermediate.classList.remove('active');
    initBoard();
});

btnNewGame.addEventListener('click', () => {
    initAudio();
    initBoard();
});

resetBtn.addEventListener('click', () => {
    initAudio();
    initBoard();
});

// --- Resize Handler ---
let resizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        // Re-render the board to recalculate cell sizes
        renderBoard();
    }, 100);
});

// --- Init ---
updateScoreboard();
initBoard();
