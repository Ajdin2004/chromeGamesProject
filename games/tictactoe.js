// --- Web Audio Synthesizer ---
let audioCtx = null;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

const Sound = {
    move() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.08);
    },
    win() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.setValueAtTime(600, now + 0.1);
        osc.frequency.setValueAtTime(800, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.35);
    },
    lose() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.3);
    },
    draw() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.setValueAtTime(300, now + 0.15);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.2);
    }
};

// --- Game State ---
const EMPTY = '';
const X = 'X';
const O = 'O';

let board = Array(9).fill(EMPTY);
let currentPlayer = X;
let gameMode = 'ai'; // 'ai', '2p', 'puzzle'
let aiDifficulty = 3;
let gameOver = false;
let winningLine = null;
let moveLog = [];
let currentPuzzleIdx = 0;
let isAiThinking = false;

// --- Puzzles (Win in 1 move scenarios) ---
const PUZZLES = [
    {
        name: "Win in 1 - Top Row Finish",
        board: [X, X, EMPTY, O, O, EMPTY, EMPTY, EMPTY, EMPTY],
        solution: 2,
        player: X
    },
    {
        name: "Win in 1 - Diagonal Finish",
        board: [X, O, EMPTY, EMPTY, X, O, EMPTY, EMPTY, EMPTY],
        solution: 8,
        player: X
    },
    {
        name: "Win in 1 - Middle Column",
        board: [O, X, EMPTY, EMPTY, X, O, EMPTY, EMPTY, EMPTY],
        solution: 7,
        player: X
    },
    {
        name: "Win in 1 - Bottom Row",
        board: [EMPTY, O, EMPTY, O, X, EMPTY, X, EMPTY, EMPTY],
        solution: 5,
        player: X
    },
    {
        name: "Win in 1 - Right Column",
        board: [O, EMPTY, X, EMPTY, O, X, EMPTY, EMPTY, EMPTY],
        solution: 8,
        player: X
    }
];

// --- DOM References ---
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const moveLogEl = document.getElementById('move-log');
const diffSlider = document.getElementById('difficulty-slider');
const diffVal = document.getElementById('diff-val');
const btnVsAi = document.getElementById('btn-vs-ai');
const btn2p = document.getElementById('btn-2p');
const btnPuzzles = document.getElementById('btn-puzzles');
const puzzlePanel = document.getElementById('puzzle-panel');
const puzzleDesc = document.getElementById('puzzle-desc');
const scoreWins = document.getElementById('score-wins');
const scoreLosses = document.getElementById('score-losses');
const scoreDraws = document.getElementById('score-draws');

// --- Scoreboard Persistence ---
const STATS_KEY = 'tictactoe_stats';
function loadStats() {
    try { return JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, draws: 0 }; }
    catch (e) { return { wins: 0, losses: 0, draws: 0 }; }
}
function saveStats(stats) {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { /* ignore */ }
}
function updateScoreboard() {
    const stats = loadStats();
    scoreWins.textContent = stats.wins;
    scoreLosses.textContent = stats.losses;
    scoreDraws.textContent = stats.draws;
}

// --- Board Rendering ---
function renderBoard() {
    if (boardEl.children.length !== 9) {
        boardEl.innerHTML = '';
        for (let i = 0; i < 9; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.index = i;
            cell.addEventListener('click', () => handleCellClick(i));
            boardEl.appendChild(cell);
        }
    }

    for (let i = 0; i < 9; i++) {
        const cell = boardEl.children[i];
        const val = board[i];

        cell.className = 'cell';
        if (val !== EMPTY) cell.classList.add('filled');
        if (winningLine && winningLine.includes(i)) cell.classList.add('winning');

        let markEl = cell.querySelector('.mark');
        if (val !== EMPTY) {
            if (!markEl) {
                markEl = document.createElement('span');
                cell.appendChild(markEl);
            }
            markEl.className = `mark ${val === X ? 'mark-x' : 'mark-o'}`;
            markEl.textContent = val === X ? '✕' : '◯';
        } else if (markEl) {
            markEl.remove();
        }
    }
}

// --- Win Detection ---
const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
    [0, 4, 8], [2, 4, 6]             // diagonals
];

function checkWinner(b) {
    for (const line of WIN_LINES) {
        const [a, c, d] = line;
        if (b[a] !== EMPTY && b[a] === b[c] && b[a] === b[d]) {
            return { winner: b[a], line };
        }
    }
    return null;
}

function isBoardFull(b) {
    return b.every(cell => cell !== EMPTY);
}

// --- Game Flow ---
function initBoard(customBoard = null) {
    board = customBoard ? [...customBoard] : Array(9).fill(EMPTY);
    currentPlayer = X;
    gameOver = false;
    winningLine = null;
    moveLog = [];
    isAiThinking = false;
    renderLog();
    renderBoard();
    updateStatus();
}

function handleCellClick(i) {
    initAudio();
    if (gameOver || isAiThinking) return;
    if (board[i] !== EMPTY) return;

    // In AI mode, only allow X (player) to move
    if (gameMode === 'ai' && currentPlayer !== X) return;

    makeMove(i, currentPlayer);
}

function makeMove(i, player) {
    board[i] = player;
    moveLog.push({ player, pos: i });
    renderLog();
    Sound.move();
    renderBoard();

    const result = checkWinner(board);
    if (result) {
        gameOver = true;
        winningLine = result.line;
        renderBoard();
        handleGameEnd(result.winner);
        return;
    }

    if (isBoardFull(board)) {
        gameOver = true;
        handleGameEnd(null);
        return;
    }

    currentPlayer = currentPlayer === X ? O : X;
    updateStatus();
    autoSaveGame();

    // Trigger AI move if in AI mode and it's O's turn
    if (gameMode === 'ai' && currentPlayer === O && !gameOver) {
        isAiThinking = true;
        statusEl.textContent = "AI Thinking...";
        setTimeout(triggerAiMove, 400);
    }
}

function handleGameEnd(winner) {
    const stats = loadStats();

    if (winner === null) {
        statusEl.textContent = "Draw!";
        Sound.draw();
        stats.draws++;
    } else if (gameMode === 'ai') {
        if (winner === X) {
            statusEl.textContent = "You Win! 🎉";
            Sound.win();
            stats.wins++;
        } else {
            statusEl.textContent = "AI Wins!";
            Sound.lose();
            stats.losses++;
        }
    } else if (gameMode === 'puzzle') {
        if (winner === X) {
            statusEl.textContent = "Puzzle Solved! 🎉";
            Sound.win();
            stats.wins++;
        } else {
            statusEl.textContent = "Incorrect! Try Again.";
            Sound.lose();
        }
    } else {
        // 2 Player mode
        statusEl.textContent = `${winner} Wins!`;
        Sound.win();
        if (winner === X) stats.wins++;
        else stats.losses++;
    }

    saveStats(stats);
    updateScoreboard();
    autoSaveGame();
}

function updateStatus() {
    if (gameOver) return;

    if (gameMode === 'ai') {
        statusEl.textContent = currentPlayer === X ? "Your Turn (X)" : "AI Thinking...";
    } else if (gameMode === 'puzzle') {
        statusEl.textContent = currentPlayer === X ? "Find the Winning Move (X)" : "O's Turn";
    } else {
        statusEl.textContent = `${currentPlayer}'s Turn`;
    }
}

// --- AI Logic ---
function getEmptyCells(b) {
    return b.map((v, i) => v === EMPTY ? i : -1).filter(i => i !== -1);
}

function minimax(b, depth, isMaximizing, alpha, beta) {
    const result = checkWinner(b);
    if (result) {
        return result.winner === O ? 10 - depth : depth - 10;
    }
    if (isBoardFull(b)) return 0;

    const empty = getEmptyCells(b);

    if (isMaximizing) {
        let best = -Infinity;
        for (const i of empty) {
            b[i] = O;
            best = Math.max(best, minimax(b, depth + 1, false, alpha, beta));
            b[i] = EMPTY;
            alpha = Math.max(alpha, best);
            if (beta <= alpha) break;
        }
        return best;
    } else {
        let best = Infinity;
        for (const i of empty) {
            b[i] = X;
            best = Math.min(best, minimax(b, depth + 1, true, alpha, beta));
            b[i] = EMPTY;
            beta = Math.min(beta, best);
            if (beta <= alpha) break;
        }
        return best;
    }
}

function getBestMove(b) {
    const empty = getEmptyCells(b);
    let bestScore = -Infinity;
    let bestMove = empty[0];

    for (const i of empty) {
        b[i] = O;
        const score = minimax(b, 0, false, -Infinity, Infinity);
        b[i] = EMPTY;
        if (score > bestScore) {
            bestScore = score;
            bestMove = i;
        }
    }
    return bestMove;
}

function triggerAiMove() {
    let move;

    if (aiDifficulty <= 2) {
        // Naive AI: random move, but occasionally blocks
        const empty = getEmptyCells(board);
        if (aiDifficulty === 2 && Math.random() < 0.5) {
            // Try to block player's win
            move = findBlockingMove();
        }
        if (move === undefined) {
            move = empty[Math.floor(Math.random() * empty.length)];
        }
    } else if (aiDifficulty === 3) {
        // Basic strategy: win if possible, block, then center/corners
        move = findWinningMove(O) ?? findBlockingMove() ?? findStrategicMove();
    } else {
        // Levels 4-5: Minimax (unbeatable at 5)
        move = getBestMove([...board]);
    }

    if (move !== undefined && !gameOver) {
        makeMove(move, O);
    }
    isAiThinking = false;
}

function findWinningMove(player) {
    const empty = getEmptyCells(board);
    for (const i of empty) {
        board[i] = player;
        if (checkWinner(board)) {
            board[i] = EMPTY;
            return i;
        }
        board[i] = EMPTY;
    }
    return undefined;
}

function findBlockingMove() {
    return findWinningMove(X);
}

function findStrategicMove() {
    const empty = getEmptyCells(board);
    // Prefer center
    if (board[4] === EMPTY) return 4;
    // Prefer corners
    const corners = [0, 2, 6, 8].filter(i => board[i] === EMPTY);
    if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];
    // Any remaining
    return empty[Math.floor(Math.random() * empty.length)];
}

// --- Move Log ---
function renderLog() {
    moveLogEl.innerHTML = '';
    moveLog.forEach((entry, idx) => {
        const div = document.createElement('div');
        div.className = 'move-entry';
        const row = Math.floor(entry.pos / 3) + 1;
        const col = (entry.pos % 3) + 1;
        div.innerHTML = `<span>#${idx + 1}</span><span>${entry.player} → ${row},${col}</span>`;
        moveLogEl.appendChild(div);
    });
    moveLogEl.scrollTop = moveLogEl.scrollHeight;
}

// --- Save / Load ---
function autoSaveGame() {
    if (gameMode === 'puzzle') return;
    const saveState = { board, currentPlayer, gameMode, aiDifficulty, moveLog, gameOver, winningLine };
    localStorage.setItem('tictactoe_autosave', JSON.stringify(saveState));
}

function manualSaveGame() {
    autoSaveGame();
    statusEl.textContent = "Game Saved Successfully!";
}

function loadSavedGame() {
    const saved = JSON.parse(localStorage.getItem('tictactoe_autosave'));
    if (!saved) {
        statusEl.textContent = "No Saved Game Found!";
        return;
    }

    board = saved.board;
    currentPlayer = saved.currentPlayer;
    gameMode = saved.gameMode || 'ai';
    aiDifficulty = saved.aiDifficulty || 3;
    moveLog = saved.moveLog || [];
    gameOver = saved.gameOver || false;
    winningLine = saved.winningLine || null;

    diffSlider.value = aiDifficulty;
    diffVal.textContent = aiDifficulty;

    // Sync mode buttons
    btnVsAi.classList.toggle('active', gameMode === 'ai');
    btn2p.classList.toggle('active', gameMode === '2p');
    btnPuzzles.classList.toggle('active', gameMode === 'puzzle');
    puzzlePanel.style.display = gameMode === 'puzzle' ? 'flex' : 'none';
    document.getElementById('ai-difficulty-box').style.display = gameMode === 'ai' ? 'flex' : 'none';

    renderLog();
    renderBoard();
    updateStatus();
    statusEl.textContent = "Game Loaded!";
}

// --- Puzzle Mode ---
function loadPuzzle(idx) {
    const puzzle = PUZZLES[idx];
    puzzleDesc.textContent = puzzle.name;
    initBoard(puzzle.board);
    currentPlayer = puzzle.player;
    statusEl.textContent = "Find the Winning Move (X)";
}

// --- Event Listeners ---
diffSlider.addEventListener('input', (e) => {
    aiDifficulty = parseInt(e.target.value);
    diffVal.textContent = aiDifficulty;
});

btnVsAi.addEventListener('click', () => {
    gameMode = 'ai';
    btnVsAi.classList.add('active');
    btn2p.classList.remove('active');
    btnPuzzles.classList.remove('active');
    puzzlePanel.style.display = 'none';
    document.getElementById('ai-difficulty-box').style.display = 'flex';
    initBoard();
});

btn2p.addEventListener('click', () => {
    gameMode = '2p';
    btn2p.classList.add('active');
    btnVsAi.classList.remove('active');
    btnPuzzles.classList.remove('active');
    puzzlePanel.style.display = 'none';
    document.getElementById('ai-difficulty-box').style.display = 'none';
    initBoard();
});

btnPuzzles.addEventListener('click', () => {
    gameMode = 'puzzle';
    btnPuzzles.classList.add('active');
    btnVsAi.classList.remove('active');
    btn2p.classList.remove('active');
    puzzlePanel.style.display = 'flex';
    document.getElementById('ai-difficulty-box').style.display = 'none';
    currentPuzzleIdx = 0;
    loadPuzzle(0);
});

document.getElementById('btn-next-puzzle').addEventListener('click', () => {
    currentPuzzleIdx = (currentPuzzleIdx + 1) % PUZZLES.length;
    loadPuzzle(currentPuzzleIdx);
});

document.getElementById('btn-reset').addEventListener('click', () => {
    initAudio();
    if (gameMode === 'puzzle') loadPuzzle(currentPuzzleIdx);
    else initBoard();
});

document.getElementById('btn-save').addEventListener('click', () => {
    initAudio();
    manualSaveGame();
});

document.getElementById('btn-load').addEventListener('click', () => {
    initAudio();
    loadSavedGame();
});

// --- Init ---
updateScoreboard();
initBoard();