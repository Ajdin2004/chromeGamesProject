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

// --- Piece Constants ---
// 'r' = red man (player), 'R' = red king
// 'b' = black man (AI), 'B' = black king
const PIECE_SYMBOLS = {
    'r': '●', 'R': '●',
    'b': '●', 'B': '●'
};

const PIECE_VALUES = {
    'r': 100, 'R': 300,
    'b': -100, 'B': -300
};

// --- Initial Board Setup ---
// Standard 8x8 checkers: red at top (rows 0-2), black at bottom (rows 5-7)
// Only dark squares (where (r + c) % 2 === 1) are playable
function createInitialBoard() {
    const board = Array(8).fill(null).map(() => Array(8).fill('.'));
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 === 1) board[r][c] = 'r';
        }
    }
    for (let r = 5; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 === 1) board[r][c] = 'b';
        }
    }
    return board;
}

// --- Engine State ---
let boardState = [];
let turn = 'r'; // 'r' = red (player), 'b' = black (AI)
let selectedSquare = null;
let lastMove = null;
let validMoves = [];
let moveLog = [];
let gameMode = 'ai'; // 'ai' or '2p'
let aiDifficulty = 3;
let isAnimating = false;
let gameOver = false;
let noCaptureCount = 0; // For draw detection (40-move rule)
let multiJumpPiece = null; // Piece that must continue jumping
let multiJumpFrom = null; // Original position of multi-jump piece

// --- DOM References ---
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const moveLogEl = document.getElementById('move-log');
const diffSlider = document.getElementById('difficulty-slider');
const diffVal = document.getElementById('diff-val');
const btnVsAi = document.getElementById('btn-vs-ai');
const btn2p = document.getElementById('btn-2p');
const scoreWins = document.getElementById('score-wins');
const scoreLosses = document.getElementById('score-losses');
const scoreDraws = document.getElementById('score-draws');

// --- Scoreboard Persistence ---
const STATS_KEY = 'checkers_stats';
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
    // Only build the DOM elements on initial load or full reset
    if (boardEl.children.length !== 64) {
        boardEl.innerHTML = '';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const sq = document.createElement('div');
                const isLight = (r + c) % 2 === 0;
                sq.className = `square ${isLight ? 'light' : 'dark'}`;
                sq.dataset.row = r;
                sq.dataset.col = c;
                sq.addEventListener('click', () => handleSquareClick(r, c));
                boardEl.appendChild(sq);
            }
        }
    }

    // Smoothly update board squares without destroying DOM elements
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = boardEl.children[r * 8 + c];
            const piece = boardState[r][c];

            // Update square selection & move highlight classes
            sq.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;

            if (selectedSquare && selectedSquare.r === r && selectedSquare.c === c) {
                sq.classList.add('selected');
            }

            if (lastMove) {
                if (lastMove.fromR === r && lastMove.fromC === c) sq.classList.add('last-move-from');
                if (lastMove.toR === r && lastMove.toC === c) sq.classList.add('last-move-to');
            }

            const isMove = validMoves.some(m => m.r === r && m.c === c);
            if (isMove) {
                if (boardState[r][c] !== '.') sq.classList.add('valid-capture');
                else sq.classList.add('valid-move');
            }

            // Sync piece contents
            let pSpan = sq.querySelector('.piece');
            if (piece !== '.') {
                const isRed = piece === 'r' || piece === 'R';
                const isKing = piece === 'R' || piece === 'B';
                if (!pSpan) {
                    pSpan = document.createElement('span');
                    sq.appendChild(pSpan);
                }
                pSpan.className = `piece ${isRed ? 'red-piece' : 'black-piece'}${isKing ? ' king' : ''}`;
                pSpan.textContent = PIECE_SYMBOLS[piece];
                pSpan.style.transform = 'none';
                pSpan.style.zIndex = '1';
            } else if (pSpan) {
                pSpan.remove();
            }
        }
    }
}

// --- Animated Piece Motion Handler ---
function animateAndMove(fromR, fromC, toR, toC, capturedR = null, capturedC = null) {
    isAnimating = true;

    const fromSq = boardEl.children[fromR * 8 + fromC];
    const toSq = boardEl.children[toR * 8 + toC];
    const pieceEl = fromSq ? fromSq.querySelector('.piece') : null;

    if (!fromSq || !toSq || !pieceEl) {
        makeMove(fromR, fromC, toR, toC, capturedR, capturedC);
        isAnimating = false;
        return;
    }

    const fromRect = fromSq.getBoundingClientRect();
    const toRect = toSq.getBoundingClientRect();

    const deltaX = toRect.left - fromRect.left;
    const deltaY = toRect.top - fromRect.top;

    // Apply smooth linear sliding transition
    pieceEl.style.zIndex = '100';
    pieceEl.style.transition = 'transform 0.2s ease-in-out';
    pieceEl.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

    setTimeout(() => {
        makeMove(fromR, fromC, toR, toC, capturedR, capturedC);
        isAnimating = false;

        // Check if multi-jump is required
        if (multiJumpPiece) {
            // Continue with the same piece
            selectedSquare = { r: toR, c: toC };
            validMoves = getCaptureMovesForPiece(toR, toC, boardState);
            renderBoard();
            return;
        }

        if (gameMode === 'ai' && turn === 'b' && !gameOver) {
            setTimeout(triggerAiMove, 250);
        }
    }, 200);
}

// --- Move Generation ---
function isRedPiece(piece) {
    return piece === 'r' || piece === 'R';
}

function isBlackPiece(piece) {
    return piece === 'b' || piece === 'B';
}

function isKing(piece) {
    return piece === 'R' || piece === 'B';
}

function getSimpleMovesForPiece(r, c, board) {
    const piece = board[r][c];
    if (piece === '.') return [];
    const moves = [];
    const red = isRedPiece(piece);
    const king = isKing(piece);
    const dirs = [];

    // Red moves DOWN (increasing row), Black moves UP (decreasing row)
    if (red || king) dirs.push([1, -1], [1, 1]); // Down
    if (!red || king) dirs.push([-1, -1], [-1, 1]); // Up

    for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === '.') {
            moves.push({ r: nr, c: nc, capture: false });
        }
    }
    return moves;
}

function getCaptureMovesForPiece(r, c, board) {
    const piece = board[r][c];
    if (piece === '.') return [];
    const moves = [];
    const red = isRedPiece(piece);
    const king = isKing(piece);
    const dirs = [];

    // Red moves DOWN (increasing row), Black moves UP (decreasing row)
    if (red || king) dirs.push([1, -1], [1, 1]); // Down
    if (!red || king) dirs.push([-1, -1], [-1, 1]); // Up

    for (const [dr, dc] of dirs) {
        const mr = r + dr;
        const mc = c + dc;
        const nr = r + 2 * dr;
        const nc = c + 2 * dc;

        if (mr >= 0 && mr < 8 && mc >= 0 && mc < 8 && nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const mid = board[mr][mc];
            const dest = board[nr][nc];
            if (mid !== '.' && dest === '.') {
                const isEnemy = red ? isBlackPiece(mid) : isRedPiece(mid);
                if (isEnemy) {
                    moves.push({ r: nr, c: nc, capture: true, capturedR: mr, capturedC: mc });
                }
            }
        }
    }
    return moves;
}

function getAllMovesForSide(board, side) {
    const allMoves = [];
    const hasCaptures = [];

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece === '.') continue;
            const isSidePiece = side === 'r' ? isRedPiece(piece) : isBlackPiece(piece);
            if (!isSidePiece) continue;

            const captures = getCaptureMovesForPiece(r, c, board);
            if (captures.length > 0) {
                hasCaptures.push({ r, c, moves: captures });
            }
        }
    }

    // Mandatory capture rule: if any capture exists, only captures are allowed
    if (hasCaptures.length > 0) {
        for (const { r, c, moves } of hasCaptures) {
            for (const m of moves) {
                allMoves.push({ fromR: r, fromC: c, toR: m.r, toC: m.c, capture: true, capturedR: m.capturedR, capturedC: m.capturedC });
            }
        }
        return allMoves;
    }

    // No captures available, return simple moves
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece === '.') continue;
            const isSidePiece = side === 'r' ? isRedPiece(piece) : isBlackPiece(piece);
            if (!isSidePiece) continue;

            const simple = getSimpleMovesForPiece(r, c, board);
            for (const m of simple) {
                allMoves.push({ fromR: r, fromC: c, toR: m.r, toC: m.c, capture: false });
            }
        }
    }
    return allMoves;
}

// Check if a piece has any capture moves (for multi-jump continuation)
function hasCaptureMoves(r, c, board) {
    return getCaptureMovesForPiece(r, c, board).length > 0;
}

// --- Game Flow ---
function initBoard() {
    boardState = createInitialBoard();
    turn = 'r';
    selectedSquare = null;
    lastMove = null;
    validMoves = [];
    moveLog = [];
    gameOver = false;
    isAnimating = false;
    noCaptureCount = 0;
    multiJumpPiece = null;
    multiJumpFrom = null;
    renderLog();
    renderBoard();
    updateStatus();
}

function handleSquareClick(r, c) {
    if (isAnimating || gameOver) return;
    initAudio();
    if (gameMode === 'ai' && turn === 'b') return;

    const piece = boardState[r][c];
    const isRed = piece !== '.' && isRedPiece(piece);
    const isBlack = piece !== '.' && isBlackPiece(piece);

    // If a multi-jump is in progress, only allow the jumping piece to move
    if (multiJumpPiece) {
        if (piece !== '.' && r === multiJumpPiece.r && c === multiJumpPiece.c) {
            selectedSquare = { r, c };
            validMoves = getCaptureMovesForPiece(r, c, boardState);
            renderBoard();
            return;
        }
        // Clicking elsewhere deselects
        selectedSquare = null;
        validMoves = [];
        renderBoard();
        return;
    }

    // Select own piece
    if (piece !== '.' && ((turn === 'r' && isRed) || (turn === 'b' && isBlack))) {
        selectedSquare = { r, c };
        validMoves = getValidMovesForPiece(r, c, boardState);
        renderBoard();
        return;
    }

    // Try to move to a valid square
    if (selectedSquare) {
        const targetMove = validMoves.find(m => m.r === r && m.c === c);
        if (targetMove) {
            const fromR = selectedSquare.r;
            const fromC = selectedSquare.c;
            selectedSquare = null;
            validMoves = [];
            animateAndMove(fromR, fromC, r, c, targetMove.capturedR, targetMove.capturedC);
        } else {
            selectedSquare = null;
            validMoves = [];
            renderBoard();
        }
    }
}

function getValidMovesForPiece(r, c, board) {
    const piece = board[r][c];
    if (piece === '.') return [];

    // Check if any capture exists for this side (mandatory capture rule)
    const side = isRedPiece(piece) ? 'r' : 'b';
    const allMoves = getAllMovesForSide(board, side);
    const hasAnyCapture = allMoves.some(m => m.capture);

    if (hasAnyCapture) {
        return getCaptureMovesForPiece(r, c, board);
    }
    return getSimpleMovesForPiece(r, c, board);
}

function makeMove(fromR, fromC, toR, toC, capturedR = null, capturedC = null) {
    const piece = boardState[fromR][fromC];
    const isCapture = capturedR != null && capturedC != null;

    lastMove = { fromR, fromC, toR, toC };

    if (isCapture) {
        Sound.capture();
        boardState[capturedR][capturedC] = '.';
        noCaptureCount = 0;
    } else {
        Sound.move();
        noCaptureCount++;
    }

    // Move the piece
    boardState[toR][toC] = piece;
    boardState[fromR][fromC] = '.';

    // King promotion
    let promoted = false;
    if (piece === 'r' && toR === 7) {
        boardState[toR][toC] = 'R';
        promoted = true;
    } else if (piece === 'b' && toR === 0) {
        boardState[toR][toC] = 'B';
        promoted = true;
    }

    // Move log notation
    const colNames = ['a','b','c','d','e','f','g','h'];
    const notation = `${piece.toUpperCase()}${colNames[fromC]}${8-fromR} ${isCapture ? '×' : '→'} ${colNames[toC]}${8-toR}${promoted ? ' (King)' : ''}`;
    moveLog.push(notation);
    renderLog();

    // Multi-jump: if capture was made and piece can capture again (and wasn't promoted), continue
    if (isCapture && !promoted && hasCaptureMoves(toR, toC, boardState)) {
        multiJumpPiece = { r: toR, c: toC };
        multiJumpFrom = { r: fromR, c: fromC };
        renderBoard();
        return; // Don't switch turns yet
    }

    multiJumpPiece = null;
    multiJumpFrom = null;

    // Switch turns
    turn = turn === 'r' ? 'b' : 'r';

    // Check for game over
    const opponent = turn;
    const opponentMoves = getAllMovesForSide(boardState, opponent);
    const currentMoves = getAllMovesForSide(boardState, turn === 'r' ? 'b' : 'r');

    if (opponentMoves.length === 0) {
        const winner = opponent === 'r' ? 'Black' : 'Red';
        handleGameEnd(winner);
        return;
    }

    // Draw detection: 40 moves without a capture
    if (noCaptureCount >= 40) {
        handleGameEnd(null);
        return;
    }

    updateStatus();
    renderBoard();
    autoSaveGame();
}

function handleGameEnd(winner) {
    gameOver = true;
    const stats = loadStats();

    if (winner === null) {
        statusEl.textContent = "Draw!";
        Sound.draw();
        stats.draws++;
    } else if (gameMode === 'ai') {
        if (winner === 'Red') {
            statusEl.textContent = "You Win! 🎉";
            Sound.win();
            stats.wins++;
        } else {
            statusEl.textContent = "AI Wins!";
            Sound.lose();
            stats.losses++;
        }
    } else {
        // 2 Player mode
        statusEl.textContent = `${winner} Wins!`;
        Sound.win();
        if (winner === 'Red') stats.wins++;
        else stats.losses++;
    }

    saveStats(stats);
    updateScoreboard();
    renderBoard();
    autoSaveGame();
}

function updateStatus() {
    if (gameOver) return;

    if (gameMode === 'ai') {
        statusEl.textContent = turn === 'r' ? "Your Turn" : "AI Thinking...";
    } else {
        statusEl.textContent = turn === 'r' ? "Red's Turn" : "Black's Turn";
    }
}

// --- AI Logic ---
function evaluateBoard(board) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece === '.') continue;

            const base = PIECE_VALUES[piece] || 0;
            let positional = 0;

            // Positional bonuses
            if (piece === 'r') {
                // Advancement bonus: closer to promotion = better
                positional += r * 3;
                // Center control
                if (c >= 2 && c <= 5) positional += 2;
            } else if (piece === 'b') {
                positional -= (7 - r) * 3;
                if (c >= 2 && c <= 5) positional -= 2;
            } else if (piece === 'R' || piece === 'B') {
                // Kings prefer center
                if (c >= 2 && c <= 5) positional += (piece === 'R' ? 3 : -3);
            }

            // Back row safety bonus
            if (piece === 'r' && r === 0) positional += 5;
            if (piece === 'b' && r === 7) positional -= 5;

            score += base + positional;
        }
    }
    return score;
}

function minimax(board, depth, isMaximizing, alpha, beta) {
    if (depth === 0) return { score: evaluateBoard(board) };

    const side = isMaximizing ? 'b' : 'r';
    const moves = getAllMovesForSide(board, side);

    if (moves.length === 0) {
        // No moves = loss for this side
        return { score: isMaximizing ? -10000 - depth : 10000 + depth };
    }

    let bestMove = null;
    let bestScore = isMaximizing ? -Infinity : Infinity;

    // Shuffle moves for variety at lower depths
    if (depth <= 2) {
        for (let i = moves.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [moves[i], moves[j]] = [moves[j], moves[i]];
        }
    }

    for (const move of moves) {
        const boardCopy = JSON.parse(JSON.stringify(board));
        const piece = boardCopy[move.fromR][move.fromC];

        // Apply capture
        if (move.capture) {
            boardCopy[move.capturedR][move.capturedC] = '.';
        }

        // Move piece
        boardCopy[move.toR][move.toC] = piece;
        boardCopy[move.fromR][move.fromC] = '.';

        // King promotion
        if (piece === 'r' && move.toR === 7) boardCopy[move.toR][move.toC] = 'R';
        if (piece === 'b' && move.toR === 0) boardCopy[move.toR][move.toC] = 'B';

        // Multi-jump: if capture and can capture again, continue with same piece
        let result;
        if (move.capture && hasCaptureMoves(move.toR, move.toC, boardCopy)) {
            // Simulate multi-jump by searching deeper with same side
            result = minimaxMultiJump(boardCopy, move.toR, move.toC, depth, isMaximizing, alpha, beta);
        } else {
            result = minimax(boardCopy, depth - 1, !isMaximizing, alpha, beta);
        }

        if (isMaximizing) {
            if (result.score > bestScore) {
                bestScore = result.score;
                bestMove = move;
            }
            alpha = Math.max(alpha, bestScore);
        } else {
            if (result.score < bestScore) {
                bestScore = result.score;
                bestMove = move;
            }
            beta = Math.min(beta, bestScore);
        }
        if (beta <= alpha) break;
    }

    return { score: bestScore, move: bestMove };
}

// Handle multi-jump sequences in minimax
function minimaxMultiJump(board, r, c, depth, isMaximizing, alpha, beta) {
    const captures = getCaptureMovesForPiece(r, c, board);
    if (captures.length === 0 || depth === 0) {
        return { score: evaluateBoard(board) };
    }

    const piece = board[r][c];
    let bestScore = isMaximizing ? -Infinity : Infinity;

    for (const cap of captures) {
        const boardCopy = JSON.parse(JSON.stringify(board));
        boardCopy[cap.capturedR][cap.capturedC] = '.';
        boardCopy[cap.r][cap.c] = piece;
        boardCopy[r][c] = '.';

        // King promotion during multi-jump
        if (piece === 'r' && cap.r === 7) boardCopy[cap.r][cap.c] = 'R';
        if (piece === 'b' && cap.r === 0) boardCopy[cap.r][cap.c] = 'B';

        let result;
        if (hasCaptureMoves(cap.r, cap.c, boardCopy)) {
            result = minimaxMultiJump(boardCopy, cap.r, cap.c, depth - 1, isMaximizing, alpha, beta);
        } else {
            result = minimax(boardCopy, depth - 1, !isMaximizing, alpha, beta);
        }

        if (isMaximizing) {
            bestScore = Math.max(bestScore, result.score);
            alpha = Math.max(alpha, bestScore);
        } else {
            bestScore = Math.min(bestScore, result.score);
            beta = Math.min(beta, bestScore);
        }
        if (beta <= alpha) break;
    }

    return { score: bestScore };
}

function triggerAiMove() {
    // Determine depth based on difficulty
    let depth;
    switch (aiDifficulty) {
        case 1: depth = 2; break;
        case 2: depth = 3; break;
        case 3: depth = 4; break;
        case 4: depth = 6; break;
        case 5: depth = 8; break;
        default: depth = 4;
    }

    const result = minimax(boardState, depth, true, -Infinity, Infinity);

    if (result.move) {
        const move = result.move;
        animateAndMove(move.fromR, move.fromC, move.toR, move.toC, move.capturedR, move.capturedC);
    }
}

// --- Move Log ---
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

// --- Save / Load ---
function autoSaveGame() {
    const saveState = { boardState, turn, moveLog, lastMove, aiDifficulty, gameMode, gameOver, noCaptureCount, multiJumpPiece, multiJumpFrom };
    localStorage.setItem('neon_checkers_autosave', JSON.stringify(saveState));
}

function manualSaveGame() {
    autoSaveGame();
    statusEl.textContent = "Game Saved Successfully!";
}

function loadSavedGame() {
    const saved = JSON.parse(localStorage.getItem('neon_checkers_autosave'));
    if (!saved) {
        statusEl.textContent = "No Saved Game Found!";
        return;
    }

    boardState = saved.boardState;
    turn = saved.turn;
    moveLog = saved.moveLog || [];
    lastMove = saved.lastMove || null;
    aiDifficulty = saved.aiDifficulty || 3;
    gameMode = saved.gameMode || 'ai';
    gameOver = saved.gameOver || false;
    noCaptureCount = saved.noCaptureCount || 0;
    multiJumpPiece = saved.multiJumpPiece || null;
    multiJumpFrom = saved.multiJumpFrom || null;

    diffSlider.value = aiDifficulty;
    diffVal.textContent = aiDifficulty;

    // Sync mode buttons
    btnVsAi.classList.toggle('active', gameMode === 'ai');
    btn2p.classList.toggle('active', gameMode === '2p');
    document.getElementById('ai-difficulty-box').style.display = gameMode === 'ai' ? 'flex' : 'none';

    renderLog();
    renderBoard();
    updateStatus();
    statusEl.textContent = "Game Loaded!";
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
    document.getElementById('ai-difficulty-box').style.display = 'flex';
    initBoard();
});

btn2p.addEventListener('click', () => {
    gameMode = '2p';
    btn2p.classList.add('active');
    btnVsAi.classList.remove('active');
    document.getElementById('ai-difficulty-box').style.display = 'none';
    initBoard();
});

document.getElementById('btn-reset').addEventListener('click', () => {
    initAudio();
    initBoard();
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