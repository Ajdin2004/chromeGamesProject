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
    capture() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.12);
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
    }
};

// --- Unicode Chess Symbols ---
const PIECE_SYMBOLS = {
    'P': '♟', 'R': '♜', 'N': '♞', 'B': '♝', 'Q': '♛', 'K': '♚',
    'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚'
};

// Piece point values for Minimax Evaluation
const PIECE_VALUES = {
    'p': 10, 'n': 30, 'b': 30, 'r': 50, 'q': 90, 'k': 900,
    'P': -10, 'N': -30, 'B': -30, 'R': -50, 'Q': -90, 'K': -900
};

// Initial Starting Board Matrix
const INITIAL_BOARD = [
    ['r','n','b','q','k','b','n','r'],
    ['p','p','p','p','p','p','p','p'],
    ['.','.','.','.','.','.','.','.'],
    ['.','.','.','.','.','.','.','.'],
    ['.','.','.','.','.','.','.','.'],
    ['.','.','.','.','.','.','.','.'],
    ['P','P','P','P','P','P','P','P'],
    ['R','N','B','Q','K','B','N','R']
];

// Puzzle Database Definitions
const PUZZLES = [
    {
        name: "Mate in 1 - Scholar's Mate Finish",
        board: [
            ['r','n','b','q','k','b','.','r'],
            ['p','p','p','p','.','p','p','p'],
            ['.','.','.','.','p','.','.','.'],
            ['.','.','.','.','.','.','.','.'],
            ['.','.','.','B','.','.','.','.'],
            ['.','.','.','.','.','Q','.','.'],
            ['P','P','P','P','.','P','P','P'],
            ['R','N','B','.','K','.','N','R']
        ],
        solution: { fromR: 5, fromC: 5, toR: 1, toC: 5 }
    },
    {
        name: "Tactics - Back Rank Smother",
        board: [
            ['.','r','.','.','.','r','k','.'],
            ['p','p','.','.','.','p','p','p'],
            ['.','.','.','.','.','.','.','.'],
            ['.','.','.','.','Q','.','.','.'],
            ['.','.','.','.','.','.','.','.'],
            ['.','.','.','.','.','.','.','.'],
            ['P','P','P','.','.','P','P','P'],
            ['R','.','.','.','.','.','K','.']
        ],
        solution: { fromR: 3, fromC: 4, toR: 0, toC: 4 }
    }
];

// --- Engine State ---
let boardState = [];
let turn = 'w'; // 'w' or 'b'
let selectedSquare = null;
let validMoves = [];
let moveLog = [];
let gameMode = 'ai'; // 'ai' or 'puzzle'
let currentPuzzleIdx = 0;
let aiDifficulty = 3;

// --- DOM References ---
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const moveLogEl = document.getElementById('move-log');
const diffSlider = document.getElementById('difficulty-slider');
const diffVal = document.getElementById('diff-val');
const btnVsAi = document.getElementById('btn-vs-ai');
const btnPuzzles = document.getElementById('btn-puzzles');
const puzzlePanel = document.getElementById('puzzle-panel');
const puzzleDesc = document.getElementById('puzzle-desc');

// --- Initialization ---
function initBoard(customBoard = null) {
    boardState = customBoard 
        ? JSON.parse(JSON.stringify(customBoard))
        : JSON.parse(JSON.stringify(INITIAL_BOARD));
        
    turn = 'w';
    selectedSquare = null;
    validMoves = [];
    moveLog = [];
    renderLog();
    renderBoard();
    updateStatus();
}

// --- Render Board Grid ---
function renderBoard() {
    boardEl.innerHTML = '';
    
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = document.createElement('div');
            const isLight = (r + c) % 2 === 0;
            sq.className = `square ${isLight ? 'light' : 'dark'}`;
            sq.dataset.row = r;
            sq.dataset.col = c;

            const piece = boardState[r][c];
            if (piece !== '.') {
                const isWhite = piece === piece.toUpperCase();
                const pSpan = document.createElement('span');
                pSpan.className = isWhite ? 'white-piece' : 'black-piece';
                pSpan.textContent = PIECE_SYMBOLS[piece];
                sq.appendChild(pSpan);
            }

            // Highlight Selected Square
            if (selectedSquare && selectedSquare.r === r && selectedSquare.c === c) {
                sq.classList.add('selected');
            }

            // Highlight Valid Move Targets
            const isMove = validMoves.some(m => m.r === r && m.c === c);
            if (isMove) {
                if (boardState[r][c] !== '.') sq.classList.add('valid-capture');
                else sq.classList.add('valid-move');
            }

            sq.addEventListener('click', () => handleSquareClick(r, c));
            boardEl.appendChild(sq);
        }
    }
}

// --- Square Click Logic ---
function handleSquareClick(r, c) {
    initAudio();
    if (gameMode === 'ai' && turn === 'b') return; // Ignore input on AI turn

    const piece = boardState[r][c];
    const isWhite = piece !== '.' && piece === piece.toUpperCase();

    // Select Player Piece
    if (piece !== '.' && ((turn === 'w' && isWhite) || (turn === 'b' && !isWhite))) {
        selectedSquare = { r, c };
        validMoves = getValidMovesForPiece(r, c, boardState);
        renderBoard();
        return;
    }

    // Execute Move
    if (selectedSquare) {
        const targetMove = validMoves.find(m => m.r === r && m.c === c);
        if (targetMove) {
            makeMove(selectedSquare.r, selectedSquare.c, r, c);
            selectedSquare = null;
            validMoves = [];
            
            // Trigger AI turn if in AI mode
            if (gameMode === 'ai' && turn === 'b') {
                setTimeout(triggerAiMove, 300);
            }
        } else {
            selectedSquare = null;
            validMoves = [];
            renderBoard();
        }
    }
}

// --- Execute Move & Switch Turn ---
function makeMove(fromR, fromC, toR, toC) {
    const piece = boardState[fromR][fromC];
    const target = boardState[toR][toC];

    // Sound Trigger
    if (target !== '.') Sound.capture();
    else Sound.move();

    // Log Move Notation
    const colNames = ['a','b','c','d','e','f','g','h'];
    const notation = `${piece.toUpperCase()}${colNames[fromC]}${8-fromR} → ${colNames[toC]}${8-toC}`;
    moveLog.push(notation);
    renderLog();

    // Update Board Matrix
    boardState[toR][toC] = piece;
    boardState[fromR][fromC] = '.';

    // Puzzle Verification Logic
    if (gameMode === 'puzzle') {
        const puzzle = PUZZLES[currentPuzzleIdx];
        if (fromR === puzzle.solution.fromR && fromC === puzzle.solution.fromC &&
            toR === puzzle.solution.toR && toC === puzzle.solution.toC) {
            statusEl.textContent = "SOLVED! Great Job!";
            Sound.win();
            renderBoard();
            return;
        } else {
            statusEl.textContent = "Incorrect Solution. Try Again!";
        }
    }

    // Pawn Promotion (Auto-Queen)
    if (piece === 'P' && toR === 0) boardState[toR][toC] = 'Q';
    if (piece === 'p' && toR === 7) boardState[toR][toC] = 'q';

    turn = turn === 'w' ? 'b' : 'w';
    updateStatus();
    renderBoard();
}

// --- Move Generation Logic ---
function getValidMovesForPiece(r, c, board) {
    const piece = board[r][c];
    if (piece === '.') return [];

    const isWhite = piece === piece.toUpperCase();
    const type = piece.toLowerCase();
    const moves = [];

    const isEnemy = (target) => {
        if (target === '.') return false;
        return isWhite ? target === target.toLowerCase() : target === target.toUpperCase();
    };

    const addMove = (tr, tc) => {
        if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
            const target = board[tr][tc];
            if (target === '.' || isEnemy(target)) {
                moves.push({ r: tr, c: tc });
                return target === '.'; // Keep scanning ray if empty square
            }
        }
        return false;
    };

    // Pawns
    if (type === 'p') {
        const dir = isWhite ? -1 : 1;
        const startRow = isWhite ? 6 : 1;

        if (board[r + dir] && board[r + dir][c] === '.') {
            moves.push({ r: r + dir, c });
            if (r === startRow && board[r + 2 * dir][c] === '.') {
                moves.push({ r: r + 2 * dir, c });
            }
        }
        // Captures
        [-1, 1].forEach(dc => {
            if (c + dc >= 0 && c + dc < 8 && board[r + dir]) {
                const target = board[r + dir][c + dc];
                if (target !== '.' && isEnemy(target)) moves.push({ r: r + dir, c: c + dc });
            }
        });
    }

    // Knights
    if (type === 'n') {
        const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        offsets.forEach(([dr, dc]) => addMove(r + dr, c + dc));
    }

    // Bishops, Rooks, Queens, Kings
    const rayDirections = {
        'b': [[-1,-1],[-1,1],[1,-1],[1,1]],
        'r': [[-1,0],[1,0],[0,-1],[0,1]],
        'q': [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]],
        'k': [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]
    };

    if (rayDirections[type]) {
        rayDirections[type].forEach(([dr, dc]) => {
            let step = 1;
            while (addMove(r + dr * step, c + dc * step)) {
                if (type === 'k') break; // King steps only once
                step++;
            }
        });
    }

    return moves;
}

// --- AI Minimax Engine ---
function evaluateBoard(board) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece !== '.') score += PIECE_VALUES[piece] || 0;
        }
    }
    return score;
}

function minimax(board, depth, isMaximizing, alpha, beta) {
    if (depth === 0) return { score: evaluateBoard(board) };

    const side = isMaximizing ? 'b' : 'w';
    let bestMove = null;
    let bestScore = isMaximizing ? -Infinity : Infinity;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece !== '.' && ((side === 'w' && piece === piece.toUpperCase()) || (side === 'b' && piece === piece.toLowerCase()))) {
                const moves = getValidMovesForPiece(r, c, board);
                for (const move of moves) {
                    // Copy & Simulate Move
                    const boardCopy = JSON.parse(JSON.stringify(board));
                    boardCopy[move.r][move.c] = piece;
                    boardCopy[r][c] = '.';

                    const result = minimax(boardCopy, depth - 1, !isMaximizing, alpha, beta);

                    if (isMaximizing) {
                        if (result.score > bestScore) {
                            bestScore = result.score;
                            bestMove = { fromR: r, fromC: c, toR: move.r, toC: move.c };
                        }
                        alpha = Math.max(alpha, bestScore);
                    } else {
                        if (result.score < bestScore) {
                            bestScore = result.score;
                            bestMove = { fromR: r, fromC: c, toR: move.r, toC: move.c };
                        }
                        beta = Math.min(beta, bestScore);
                    }
                    if (beta <= alpha) break;
                }
            }
        }
    }

    return { score: bestScore, move: bestMove };
}

function triggerAiMove() {
    // Map slider level 1-5 to search depth
    const depth = Math.min(3, Math.ceil(aiDifficulty / 2));
    const result = minimax(boardState, depth, true, -Infinity, Infinity);

    if (result.move) {
        makeMove(result.move.fromR, result.move.fromC, result.move.toR, result.move.toC);
    }
}

// --- UI Updates ---
function updateStatus() {
    if (gameMode === 'ai') {
        statusEl.textContent = turn === 'w' ? "White's Turn (You)" : "Black's Turn (AI Thinking...)";
    }
}

function renderLog() {
    moveLogEl.innerHTML = '';
    moveLog.forEach((entry, idx) => {
        const div = document.createElement('div');
        div.className = 'move-entry';
        div.innerHTML = `<span>#${idx + 1}</span><span>${entry}</span>`;
        moveLogEl.appendChild(div);
    });
    moveLogEl.scrollTop = moveLogEl.scrollHeight;
}

// --- Control Event Listeners ---
diffSlider.addEventListener('input', (e) => {
    aiDifficulty = parseInt(e.target.value);
    diffVal.textContent = aiDifficulty;
});

btnVsAi.addEventListener('click', () => {
    gameMode = 'ai';
    btnVsAi.classList.add('active');
    btnPuzzles.classList.remove('active');
    puzzlePanel.style.display = 'none';
    document.getElementById('ai-difficulty-box').style.display = 'flex';
    initBoard();
});

btnPuzzles.addEventListener('click', () => {
    gameMode = 'puzzle';
    btnPuzzles.classList.add('active');
    btnVsAi.classList.remove('active');
    puzzlePanel.style.display = 'flex';
    document.getElementById('ai-difficulty-box').style.display = 'none';
    currentPuzzleIdx = 0;
    loadPuzzle(0);
});

document.getElementById('btn-next-puzzle').addEventListener('click', () => {
    currentPuzzleIdx = (currentPuzzleIdx + 1) % PUZZLES.length;
    loadPuzzle(currentPuzzleIdx);
});

function loadPuzzle(idx) {
    const puzzle = PUZZLES[idx];
    puzzleDesc.textContent = puzzle.name;
    initBoard(puzzle.board);
    statusEl.textContent = "White to Move";
}

document.getElementById('btn-reset').addEventListener('click', () => {
    if (gameMode === 'puzzle') loadPuzzle(currentPuzzleIdx);
    else initBoard();
});

// Start Default Game
initBoard();