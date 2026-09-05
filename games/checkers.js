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
// 'r' = black man (AI), 'R' = black king
// 'b' = white man (Player), 'B' = white king
const PIECE_SYMBOLS = {
    'r': '●', 'R': '●',
    'b': '●', 'B': '●'
};

const PIECE_VALUES = {
    'r': 100, 'R': 300,
    'b': -100, 'B': -300
};

// --- Initial Board Setup ---
// Red (AI) at top (rows 0-2), Blue (Player) at bottom (rows 5-7)
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
let turn = 'b'; // 'b' = Blue (Player) starts, 'r' = Red (AI)
let selectedSquare = null;
let lastMove = null;
let validMoves = [];
let moveLog = [];
let gameMode = 'ai'; // 'ai' or '2p'
let aiDifficulty = 3;
let isAnimating = false;
let gameOver = false;
let noCaptureCount = 0; 
let multiJumpPiece = null; 
let multiJumpFrom = null; 

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

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = boardEl.children[r * 8 + c];
            const piece = boardState[r][c];

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

            let pSpan = sq.querySelector('.piece');
            if (piece !== '.') {
                const isRed = piece === 'r' || piece === 'R';
                const isKing = piece === 'R' || piece === 'B';
                if (!pSpan) {
                    pSpan = document.createElement('span');
                    sq.appendChild(pSpan);
                }
                // Updated CSS reference to blue-piece
                pSpan.className = `piece ${isRed ? 'red-piece' : 'blue-piece'}${isKing ? ' king' : ''}`;
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

    pieceEl.style.zIndex = '100';
    pieceEl.style.transition = 'transform 0.2s ease-in-out';
    pieceEl.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

    setTimeout(() => {
        makeMove(fromR, fromC, toR, toC, capturedR, capturedC);
        isAnimating = false;

        if (multiJumpPiece) {
            selectedSquare = { r: toR, c: toC };
            validMoves = getCaptureMovesForPiece(toR, toC, boardState);
            renderBoard();
            
            // FIX: Ensure the AI continues its multi-jump sequence
            if (gameMode === 'ai' && turn === 'r' && !gameOver) {
                setTimeout(triggerAiMove, 250);
            }
            return;
        }

        // Trigger AI for a normal turn
        if (gameMode === 'ai' && turn === 'r' && !gameOver) {
            setTimeout(triggerAiMove, 250);
        }
    }, 200);
}

// --- Move Generation ---
function isRedPiece(piece) {
    return piece === 'r' || piece === 'R';
}

function isBluePiece(piece) {
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

    if (red || king) dirs.push([1, -1], [1, 1]); 
    if (!red || king) dirs.push([-1, -1], [-1, 1]); 

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

    if (red || king) dirs.push([1, -1], [1, 1]); 
    if (!red || king) dirs.push([-1, -1], [-1, 1]); 

    for (const [dr, dc] of dirs) {
        const mr = r + dr;
        const mc = c + dc;
        const nr = r + 2 * dr;
        const nc = c + 2 * dc;

        if (mr >= 0 && mr < 8 && mc >= 0 && mc < 8 && nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const mid = board[mr][mc];
            const dest = board[nr][nc];
            if (mid !== '.' && dest === '.') {
                const isEnemy = red ? isBluePiece(mid) : isRedPiece(mid);
                if (isEnemy) {
                    moves.push({ r: nr, c: nc, capture: true, capturedR: mr, capturedC: mc });
                }
            }
        }
    }
    return moves;
}

// --- Updated Move Generation ---
function getAllMovesForSide(board, side) {
    const allMoves = [];

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece === '.') continue;
            const isSidePiece = side === 'r' ? isRedPiece(piece) : isBluePiece(piece);
            if (!isSidePiece) continue;

            // Check captures and simple moves independently per piece
            const captures = getCaptureMovesForPiece(r, c, board);
            if (captures.length > 0) {
                for (const m of captures) {
                    allMoves.push({ fromR: r, fromC: c, toR: m.r, toC: m.c, capture: true, capturedR: m.capturedR, capturedC: m.capturedC });
                }
            } else {
                const simple = getSimpleMovesForPiece(r, c, board);
                for (const m of simple) {
                    allMoves.push({ fromR: r, fromC: c, toR: m.r, toC: m.c, capture: false });
                }
            }
        }
    }
    return allMoves;
}

function hasCaptureMoves(r, c, board) {
    return getCaptureMovesForPiece(r, c, board).length > 0;
}

// --- Game Flow ---
function initBoard() {
    boardState = createInitialBoard();
    turn = 'b'; // Ensure Blue (Player) starts
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
    
    // In case you ever swap to let AI start first:
    if (gameMode === 'ai' && turn === 'r') {
        setTimeout(triggerAiMove, 250);
    }
}

function handleSquareClick(r, c) {
    if (isAnimating || gameOver) return;
    initAudio();
    
    // Prevent player from clicking when it's AI's (Red) turn
    if (gameMode === 'ai' && turn === 'r') return;

    const piece = boardState[r][c];
    const isRed = piece !== '.' && isRedPiece(piece);
    const isBlue = piece !== '.' && isBluePiece(piece);

    if (multiJumpPiece) {
        if (piece !== '.' && r === multiJumpPiece.r && c === multiJumpPiece.c) {
            selectedSquare = { r, c };
            validMoves = getCaptureMovesForPiece(r, c, boardState);
            renderBoard();
            return;
        }
        selectedSquare = null;
        validMoves = [];
        renderBoard();
        return;
    }

    // Select own piece
    if (piece !== '.' && ((turn === 'r' && isRed) || (turn === 'b' && isBlue))) {
        selectedSquare = { r, c };
        validMoves = getValidMovesForPiece(r, c, boardState);
        renderBoard();
        return;
    }

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

// Update individual piece validation so clicking a non-capturing piece works normally if it has a legal move
function getValidMovesForPiece(r, c, board) {
    const piece = board[r][c];
    if (piece === '.') return [];

    const captures = getCaptureMovesForPiece(r, c, board);
    if (captures.length > 0) {
        return captures;
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

    boardState[toR][toC] = piece;
    boardState[fromR][fromC] = '.';

    let promoted = false;
    if (piece === 'r' && toR === 7) {
        boardState[toR][toC] = 'R';
        promoted = true;
    } else if (piece === 'b' && toR === 0) {
        boardState[toR][toC] = 'B';
        promoted = true;
    }

    const colNames = ['a','b','c','d','e','f','g','h'];
    const notation = `${piece.toUpperCase()}${colNames[fromC]}${8-fromR} ${isCapture ? '×' : '→'} ${colNames[toC]}${8-toR}${promoted ? ' (King)' : ''}`;
    moveLog.push(notation);
    renderLog();

    if (isCapture && !promoted && hasCaptureMoves(toR, toC, boardState)) {
        multiJumpPiece = { r: toR, c: toC };
        multiJumpFrom = { r: fromR, c: fromC };
        renderBoard();
        return; 
    }

    multiJumpPiece = null;
    multiJumpFrom = null;

    turn = turn === 'r' ? 'b' : 'r';

    const opponent = turn;
    const opponentMoves = getAllMovesForSide(boardState, opponent);

    if (opponentMoves.length === 0) {
        // Reflect Blue instead of Black
        const winner = opponent === 'r' ? 'Blue' : 'Red';
        handleGameEnd(winner);
        return;
    }

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
        if (winner === 'Blue') {
            statusEl.textContent = "You Win! 🎉";
            Sound.win();
            stats.wins++;
        } else {
            statusEl.textContent = "AI Wins!";
            Sound.lose();
            stats.losses++;
        }
    } else {
        statusEl.textContent = `${winner} Wins!`;
        Sound.win();
        if (winner === 'Blue') stats.wins++;
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
        statusEl.textContent = turn === 'b' ? "Your Turn (White)" : "AI Thinking...";
    } else {
        statusEl.textContent = turn === 'r' ? "Black's Turn" : "White's Turn";
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

            if (piece === 'r') {
                positional += r * 3;
                if (c >= 2 && c <= 5) positional += 2;
            } else if (piece === 'b') {
                positional -= (7 - r) * 3;
                if (c >= 2 && c <= 5) positional -= 2;
            } else if (piece === 'R' || piece === 'B') {
                if (c >= 2 && c <= 5) positional += (piece === 'R' ? 3 : -3);
            }

            if (piece === 'r' && r === 0) positional += 5;
            if (piece === 'b' && r === 7) positional -= 5;

            score += base + positional;
        }
    }
    return score;
}

function minimax(board, depth, isMaximizing, alpha, beta) {
    if (depth === 0) return { score: evaluateBoard(board) };

    // FIX: Red ('r') wants the score to go up (Maximize), Blue ('b') wants it down
    const side = isMaximizing ? 'r' : 'b';
    const moves = getAllMovesForSide(board, side);

    if (moves.length === 0) {
        return { score: isMaximizing ? -10000 - depth : 10000 + depth };
    }

    let bestMove = null;
    let bestScore = isMaximizing ? -Infinity : Infinity;

    if (depth <= 2) {
        for (let i = moves.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [moves[i], moves[j]] = [moves[j], moves[i]];
        }
    }

    for (const move of moves) {
        const boardCopy = JSON.parse(JSON.stringify(board));
        const piece = boardCopy[move.fromR][move.fromC];

        if (move.capture) {
            boardCopy[move.capturedR][move.capturedC] = '.';
        }

        boardCopy[move.toR][move.toC] = piece;
        boardCopy[move.fromR][move.fromC] = '.';

        let promoted = false;
        if (piece === 'r' && move.toR === 7) { 
            boardCopy[move.toR][move.toC] = 'R'; 
            promoted = true; 
        }
        if (piece === 'b' && move.toR === 0) { 
            boardCopy[move.toR][move.toC] = 'B'; 
            promoted = true; 
        }

        let result;
        if (move.capture && !promoted && hasCaptureMoves(move.toR, move.toC, boardCopy)) {
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

        let promoted = false;
        if (piece === 'r' && cap.r === 7) { 
            boardCopy[cap.r][cap.c] = 'R'; 
            promoted = true; 
        }
        if (piece === 'b' && cap.r === 0) { 
            boardCopy[cap.r][cap.c] = 'B'; 
            promoted = true; 
        }

        let result;
        if (!promoted && hasCaptureMoves(cap.r, cap.c, boardCopy)) {
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
    let depth;
    switch (aiDifficulty) {
        case 1: depth = 2; break;
        case 2: depth = 3; break;
        case 3: depth = 4; break;
        case 4: depth = 6; break;
        case 5: depth = 8; break;
        default: depth = 4;
    }

    let finalMove = null;

    // FIX: If the AI is locked into a multi-jump, it must jump again with that specific piece
    if (multiJumpPiece) {
        const captures = getCaptureMovesForPiece(multiJumpPiece.r, multiJumpPiece.c, boardState);
        if (captures.length > 0) {
            finalMove = {
                fromR: multiJumpPiece.r,
                fromC: multiJumpPiece.c,
                toR: captures[0].r,
                toC: captures[0].c,
                capture: true,
                capturedR: captures[0].capturedR,
                capturedC: captures[0].capturedC
            };
        }
    } else {
        // Normal minimax search
        const result = minimax(boardState, depth, true, -Infinity, Infinity);
        finalMove = result.move;
    }

    if (finalMove) {
        animateAndMove(finalMove.fromR, finalMove.fromC, finalMove.toR, finalMove.toC, finalMove.capturedR, finalMove.capturedC);
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