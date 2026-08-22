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

const PIECE_SYMBOLS = {
    'P': '♟', 'R': '♜', 'N': '♞', 'B': '♝', 'Q': '♛', 'K': '♚',
    'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚'
};

const PIECE_VALUES = {
    'p': 10, 'n': 30, 'b': 30, 'r': 50, 'q': 90, 'k': 900,
    'P': -10, 'N': -30, 'B': -30, 'R': -50, 'Q': -90, 'K': -900
};

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
let turn = 'w';
let selectedSquare = null;
let lastMove = null;
let validMoves = [];
let moveLog = [];
let gameMode = 'ai'; // 'ai' | 'local' | 'puzzle'
let currentPuzzleIdx = 0;
let aiDifficulty = 3;
let isAnimating = false; // Prevents click overlap during motion
let castlingRights = { K: true, Q: true, k: true, q: true };
let enPassantTarget = null; // {r, c} square capturable via en passant
let halfmoveClock = 0;      // For the 50-move rule
let boardFlipped = false;   // 1v1 board view flip

// --- DOM References ---
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const moveLogEl = document.getElementById('move-log');
const diffSlider = document.getElementById('difficulty-slider');
const diffVal = document.getElementById('diff-val');
const btnVsAi = document.getElementById('btn-vs-ai');
const btnLocal = document.getElementById('btn-local');
const btnPuzzles = document.getElementById('btn-puzzles');
const puzzlePanel = document.getElementById('puzzle-panel');
const puzzleDesc = document.getElementById('puzzle-desc');

function initBoard(customBoard = null) {
    boardState = customBoard
        ? JSON.parse(JSON.stringify(customBoard))
        : JSON.parse(JSON.stringify(INITIAL_BOARD));

    turn = 'w';
    selectedSquare = null;
    lastMove = null;
    validMoves = [];
    moveLog = [];
    isAnimating = false;
    castlingRights = { K: true, Q: true, k: true, q: true };
    enPassantTarget = null;
    halfmoveClock = 0;
    renderLog();
    renderBoard();
    updateStatus();
}

// --- Optimized Render Board Grid ---
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
                const isWhite = piece === piece.toUpperCase();
                if (!pSpan) {
                    pSpan = document.createElement('span');
                    sq.appendChild(pSpan);
                }
                pSpan.className = `piece ${isWhite ? 'white-piece' : 'black-piece'}`;
                // Glyph wrapped in inner span so the board can be flipped
                // without breaking the slide animation transform on .piece
                pSpan.innerHTML = `<span class="glyph">${PIECE_SYMBOLS[piece]}</span>`;
                pSpan.style.transform = 'none'; // Reset animation offsets
                pSpan.style.zIndex = '1';
            } else if (pSpan) {
                pSpan.remove();
            }
        }
    }
}

// --- Animated Piece Motion Handler ---
function animateAndMove(fromR, fromC, toR, toC) {
    isAnimating = true;

    const fromSq = boardEl.children[fromR * 8 + fromC];
    const toSq = boardEl.children[toR * 8 + toC];
    const pieceEl = fromSq ? fromSq.querySelector('.piece') : null;

    if (!fromSq || !toSq || !pieceEl) {
        makeMove(fromR, fromC, toR, toC);
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
        makeMove(fromR, fromC, toR, toC);
        isAnimating = false;

        if (gameMode === 'ai' && turn === 'b') {
            setTimeout(triggerAiMove, 250);
        }
    }, 200);
}

function handleSquareClick(r, c) {
    if (isAnimating) return; // Block clicks while animating
    initAudio();
    if (gameMode === 'ai' && turn === 'b') return; // AI's turn

    const piece = boardState[r][c];
    const isWhite = piece !== '.' && piece === piece.toUpperCase();

    if (piece !== '.' && ((turn === 'w' && isWhite) || (turn === 'b' && !isWhite))) {
        selectedSquare = { r, c };
        validMoves = getLegalMovesForPiece(r, c, boardState);
        renderBoard();
        return;
    }

    if (selectedSquare) {
        const targetMove = validMoves.find(m => m.r === r && m.c === c);
        if (targetMove) {
            animateAndMove(selectedSquare.r, selectedSquare.c, r, c);
            selectedSquare = null;
            validMoves = [];
        } else {
            selectedSquare = null;
            validMoves = [];
            renderBoard();
        }
    }
}

function makeMove(fromR, fromC, toR, toC) {
    // Snapshot state so invalid puzzle attempts can be reverted cleanly
    const prevBoard = JSON.parse(JSON.stringify(boardState));
    const prevTurn = turn;
    const prevRights = { ...castlingRights };
    const prevEp = enPassantTarget ? { ...enPassantTarget } : null;
    const prevHalf = halfmoveClock;
    const prevLogLen = moveLog.length;

    const piece = boardState[fromR][fromC];
    const target = boardState[toR][toC];
    const type = piece.toLowerCase();

    lastMove = { fromR, fromC, toR, toC };

    if (target !== '.') Sound.capture();
    else Sound.move();

    // --- Build notation ---
    const colNames = ['a','b','c','d','e','f','g','h'];
    let notation;
    const isCastle = (type === 'k' && Math.abs(toC - fromC) === 2);
    if (isCastle) {
        notation = (toC > fromC) ? 'O-O' : 'O-O-O';
    } else {
        notation = `${piece.toUpperCase()}${colNames[fromC]}${8-fromR} → ${colNames[toC]}${8-toC}`;
    }

    // --- Apply the move ---
    boardState[toR][toC] = piece;
    boardState[fromR][fromC] = '.';

    // En passant capture: pawn moves diagonally to an empty square
    if (type === 'p' && toC !== fromC && target === '.') {
        boardState[fromR][toC] = '.'; // Remove the passed pawn
        notation += ' (e.p.)';
    }

    // Castling: also move the rook
    if (isCastle) {
        const homeRow = fromR;
        if (toC === 6) { // King-side
            boardState[homeRow][5] = boardState[homeRow][7];
            boardState[homeRow][7] = '.';
        } else { // Queen-side
            boardState[homeRow][3] = boardState[homeRow][0];
            boardState[homeRow][0] = '.';
        }
    }

    // Promotion (auto-queen)
    if (piece === 'P' && toR === 0) { boardState[toR][toC] = 'Q'; notation += ' =Q'; }
    if (piece === 'p' && toR === 7) { boardState[toR][toC] = 'q'; notation += ' =Q'; }

    // --- Update castling rights ---
    if (piece === 'K') { castlingRights.K = false; castlingRights.Q = false; }
    if (piece === 'k') { castlingRights.k = false; castlingRights.q = false; }
    if ((fromR === 7 && fromC === 0) || (toR === 7 && toC === 0)) castlingRights.Q = false; // a1 rook
    if ((fromR === 7 && fromC === 7) || (toR === 7 && toC === 7)) castlingRights.K = false; // h1 rook
    if ((fromR === 0 && fromC === 0) || (toR === 0 && toC === 0)) castlingRights.q = false; // a8 rook
    if ((fromR === 0 && fromC === 7) || (toR === 0 && toC === 7)) castlingRights.k = false; // h8 rook

    // --- Update en passant target ---
    if (type === 'p' && Math.abs(toR - fromR) === 2) {
        enPassantTarget = { r: (fromR + toR) / 2, c: fromC };
    } else {
        enPassantTarget = null;
    }

    // --- 50-move rule clock ---
    if (type === 'p' || target !== '.') halfmoveClock = 0;
    else halfmoveClock++;

    moveLog.push(notation);
    renderLog();

    // --- Puzzle mode validation ---
    if (gameMode === 'puzzle') {
        const puzzle = PUZZLES[currentPuzzleIdx];
        if (fromR === puzzle.solution.fromR && fromC === puzzle.solution.fromC &&
            toR === puzzle.solution.toR && toC === puzzle.solution.toC) {
            statusEl.textContent = "SOLVED! Great Job!";
            Sound.win();
            renderBoard();
            return;
        } else {
            // Revert the incorrect attempt completely
            boardState = prevBoard;
            turn = prevTurn;
            castlingRights = prevRights;
            enPassantTarget = prevEp;
            halfmoveClock = prevHalf;
            moveLog.length = prevLogLen;
            lastMove = null;
            renderLog();
            statusEl.textContent = "Incorrect Solution. Try Again!";
            renderBoard();
            return;
        }
    }

    turn = turn === 'w' ? 'b' : 'w';

    // Check for checkmate, stalemate, or draws
    const opponent = turn;
    const inCheck = isInCheck(boardState, opponent);
    const hasMoves = hasLegalMoves(boardState, opponent);

    if (!hasMoves) {
        if (inCheck) {
            const winner = opponent === 'w' ? 'Black' : 'White';
            statusEl.textContent = `♛ Checkmate! ${winner} Wins! ♛`;
            Sound.win();
            renderBoard();
            autoSaveGame();
            return;
        } else {
            statusEl.textContent = "Stalemate! It's a Draw!";
            renderBoard();
            autoSaveGame();
            return;
        }
    }

    // Draw detections
    if (isInsufficientMaterial(boardState)) {
        statusEl.textContent = "Draw - Insufficient Material!";
        renderBoard();
        autoSaveGame();
        return;
    }
    if (halfmoveClock >= 100) {
        statusEl.textContent = "Draw - 50 Move Rule!";
        renderBoard();
        autoSaveGame();
        return;
    }

    if (inCheck) {
        statusEl.textContent = `${opponent === 'w' ? "White" : "Black"} is in Check!`;
    }

    updateStatus();
    renderBoard();
    autoSaveGame();
}

// --- Attack / Check Detection ---
function isSquareAttacked(board, r, c, byWhite) {
    for (let sr = 0; sr < 8; sr++) {
        for (let sc = 0; sc < 8; sc++) {
            const piece = board[sr][sc];
            if (piece === '.') continue;
            const isAttackerWhite = piece === piece.toUpperCase();
            if (isAttackerWhite !== byWhite) continue;
            const rawMoves = getValidMovesForPiece(sr, sc, board);
            if (rawMoves.some(m => m.r === r && m.c === c)) return true;
        }
    }
    return false;
}

function isInCheck(board, side) {
    const kingChar = side === 'w' ? 'K' : 'k';
    let kingR = -1, kingC = -1;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] === kingChar) {
                kingR = r;
                kingC = c;
                break;
            }
        }
        if (kingR !== -1) break;
    }
    if (kingR === -1) return false;
    return isSquareAttacked(board, kingR, kingC, side === 'w' ? false : true);
}

function getLegalMovesForPiece(r, c, board) {
    const piece = board[r][c];
    if (piece === '.') return [];
    const side = piece === piece.toUpperCase() ? 'w' : 'b';
    const rawMoves = getValidMovesForPiece(r, c, board);

    // Castling generation (only for the king on its home square)
    const type = piece.toLowerCase();
    if (type === 'k') {
        const homeRow = side === 'w' ? 7 : 0;
        if (r === homeRow && c === 4) {
            const enemyIsWhite = side !== 'w';
            const rookChar = side === 'w' ? 'R' : 'r';

            const kRight = side === 'w' ? castlingRights.K : castlingRights.k;
            const qRight = side === 'w' ? castlingRights.Q : castlingRights.q;

            // King-side: f/g empty, rook present, king not passing through attacked squares
            if (kRight &&
                board[homeRow][5] === '.' && board[homeRow][6] === '.' &&
                board[homeRow][7] === rookChar &&
                !isSquareAttacked(board, homeRow, 4, enemyIsWhite) &&
                !isSquareAttacked(board, homeRow, 5, enemyIsWhite) &&
                !isSquareAttacked(board, homeRow, 6, enemyIsWhite)) {
                rawMoves.push({ r: homeRow, c: 6 });
            }
            // Queen-side: b/c/d empty, rook present
            if (qRight &&
                board[homeRow][1] === '.' && board[homeRow][2] === '.' && board[homeRow][3] === '.' &&
                board[homeRow][0] === rookChar &&
                !isSquareAttacked(board, homeRow, 4, enemyIsWhite) &&
                !isSquareAttacked(board, homeRow, 3, enemyIsWhite) &&
                !isSquareAttacked(board, homeRow, 2, enemyIsWhite)) {
                rawMoves.push({ r: homeRow, c: 2 });
            }
        }
    }

    // Filter out moves that would leave our own king in check
    return rawMoves.filter(move => {
        const boardCopy = JSON.parse(JSON.stringify(board));
        boardCopy[move.r][move.c] = piece;
        boardCopy[r][c] = '.';
        // En passant removes the captured pawn too
        if (type === 'p' && move.c !== c && board[move.r][move.c] === '.') {
            boardCopy[r][move.c] = '.';
        }
        return !isInCheck(boardCopy, side);
    });
}

function hasLegalMoves(board, side) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece === '.') continue;
            const isSidePiece = side === 'w' ? piece === piece.toUpperCase() : piece === piece.toLowerCase();
            if (isSidePiece && getLegalMovesForPiece(r, c, board).length > 0) {
                return true;
            }
        }
    }
    return false;
}

function isInsufficientMaterial(board) {
    const minors = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece === '.' || piece.toLowerCase() === 'k') continue;
            const type = piece.toLowerCase();
            if (type === 'p' || type === 'r' || type === 'q') return false;
            minors.push(type); // bishop or knight
        }
    }
    // K vs K, K+N vs K, K+B vs K
    return minors.length <= 1;
}

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
                return target === '.';
            }
        }
        return false;
    };

    if (type === 'p') {
        const dir = isWhite ? -1 : 1;
        const startRow = isWhite ? 6 : 1;

        if (board[r + dir] && board[r + dir][c] === '.') {
            moves.push({ r: r + dir, c });
            if (r === startRow && board[r + 2 * dir][c] === '.') {
                moves.push({ r: r + 2 * dir, c });
            }
        }
        [-1, 1].forEach(dc => {
            if (c + dc >= 0 && c + dc < 8 && board[r + dir]) {
                const target = board[r + dir][c + dc];
                if (target !== '.' && isEnemy(target)) {
                    moves.push({ r: r + dir, c: c + dc });
                }
                // En passant: diagonal onto the tracked target square
                else if (target === '.' && enPassantTarget &&
                         enPassantTarget.r === r + dir && enPassantTarget.c === c + dc) {
                    moves.push({ r: r + dir, c: c + dc });
                }
            }
        });
    }

    if (type === 'n') {
        const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        offsets.forEach(([dr, dc]) => addMove(r + dr, c + dc));
    }

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
                if (type === 'k') break;
                step++;
            }
        });
    }

    return moves;
}

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

function minimax(board, depth, isMaximizing, alpha, beta, ply = 0) {
    const side = isMaximizing ? 'b' : 'w';
    let bestMove = null;
    let bestScore = isMaximizing ? -Infinity : Infinity;
    let anyMove = false;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece !== '.' && ((side === 'w' && piece === piece.toUpperCase()) || (side === 'b' && piece === piece.toLowerCase()))) {
                const moves = getLegalMovesForPiece(r, c, board);
                for (const move of moves) {
                    anyMove = true;
                    const boardCopy = JSON.parse(JSON.stringify(board));
                    boardCopy[move.r][move.c] = piece;
                    boardCopy[r][c] = '.';
                    // Handle en passant capture in simulation
                    if (piece.toLowerCase() === 'p' && move.c !== c && board[move.r][move.c] === '.') {
                        boardCopy[r][move.c] = '.';
                    }

                    let result;
                    if (depth <= 1) {
                        result = { score: evaluateBoard(boardCopy) };
                    } else {
                        result = minimax(boardCopy, depth - 1, !isMaximizing, alpha, beta, ply + 1);
                    }

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

    // Terminal node: no legal moves = checkmate or stalemate
    if (!anyMove) {
        const inCheck = isInCheck(board, side);
        if (inCheck) {
            // Side to move is mated; heavily penalize from their perspective
            return { score: isMaximizing ? -(100000 - ply) : (100000 - ply), move: null };
        }
        return { score: 0, move: null }; // Stalemate
    }

    return { score: bestScore, move: bestMove };
}

// Each difficulty level gets distinct behavior: [searchDepth, randomMoveChance]
const DIFFICULTY_LEVELS = {
    1: { depth: 1, randomness: 0.6 },
    2: { depth: 1, randomness: 0.2 },
    3: { depth: 2, randomness: 0.1 },
    4: { depth: 2, randomness: 0.0 },
    5: { depth: 3, randomness: 0.0 }
};

function triggerAiMove() {
    const config = DIFFICULTY_LEVELS[aiDifficulty] || DIFFICULTY_LEVELS[3];

    // Low levels sometimes play a random legal move
    if (Math.random() < config.randomness) {
        const allMoves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = boardState[r][c];
                if (piece !== '.' && piece === piece.toLowerCase()) {
                    getLegalMovesForPiece(r, c, boardState).forEach(m =>
                        allMoves.push({ fromR: r, fromC: c, toR: m.r, toC: m.c }));
                }
            }
        }
        if (allMoves.length > 0) {
            const mv = allMoves[Math.floor(Math.random() * allMoves.length)];
            animateAndMove(mv.fromR, mv.fromC, mv.toR, mv.toC);
        }
        return;
    }

    const result = minimax(boardState, config.depth, true, -Infinity, Infinity);
    if (result.move) {
        animateAndMove(result.move.fromR, result.move.fromC, result.move.toR, result.move.toC);
    }
}

function autoSaveGame() {
    if (gameMode !== 'ai' && gameMode !== 'local') return;
    const saveState = {
        boardState, turn, moveLog, lastMove, aiDifficulty,
        gameMode, castlingRights,
        enPassantTarget, halfmoveClock
    };
    localStorage.setItem('neon_chess_autosave', JSON.stringify(saveState));
}

function manualSaveGame() {
    if (gameMode === 'puzzle') {
        statusEl.textContent = "Saving Not Available in Puzzle Mode!";
        return;
    }
    autoSaveGame();
    statusEl.textContent = "Game Saved Successfully!";
}

function syncModeUI(mode) {
    btnVsAi.classList.toggle('active', mode === 'ai');
    btnLocal.classList.toggle('active', mode === 'local');
    btnPuzzles.classList.toggle('active', mode === 'puzzle');
    puzzlePanel.style.display = mode === 'puzzle' ? 'flex' : 'none';
    document.getElementById('ai-difficulty-box').style.display =
        mode === 'ai' ? 'flex' : 'none';
}

function loadSavedGame() {
    const saved = JSON.parse(localStorage.getItem('neon_chess_autosave'));
    if (!saved) {
        statusEl.textContent = "No Saved Game Found!";
        return;
    }

    gameMode = saved.gameMode || 'ai';
    boardState = saved.boardState;
    turn = saved.turn;
    moveLog = saved.moveLog || [];
    lastMove = saved.lastMove || null;
    aiDifficulty = saved.aiDifficulty || 3;
    castlingRights = saved.castlingRights || { K: true, Q: true, k: true, q: true };
    enPassantTarget = saved.enPassantTarget || null;
    halfmoveClock = saved.halfmoveClock || 0;

    diffSlider.value = aiDifficulty;
    diffVal.textContent = aiDifficulty;

    syncModeUI(gameMode);

    renderLog();
    renderBoard();
    updateStatus();
    statusEl.textContent = "Game Loaded!";
}

function updateStatus() {
    if (gameMode === 'puzzle') return; // Puzzles manage their own status text

    const currentMsg = statusEl.textContent;
    if (currentMsg.includes('Checkmate') || currentMsg.includes('Stalemate') ||
        currentMsg.includes('Draw') || currentMsg.includes('SOLVED') ||
        currentMsg.includes('Incorrect') || currentMsg.includes('Saved') ||
        currentMsg.includes('Loaded')) {
        return;
    }

    const inCheck = isInCheck(boardState, turn);
    const checkSuffix = inCheck ? " - CHECK!" : "";

    if (gameMode === 'ai') {
        statusEl.textContent = turn === 'w'
            ? `White's Turn (You)${checkSuffix}`
            : `Black's Turn (AI Thinking...)${checkSuffix}`;
    } else if (gameMode === 'local') {
        statusEl.textContent = turn === 'w'
            ? `White's Turn${checkSuffix}`
            : `Black's Turn${checkSuffix}`;
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

// --- Mode Switching ---
diffSlider.addEventListener('input', (e) => {
    aiDifficulty = parseInt(e.target.value);
    diffVal.textContent = aiDifficulty;
});

btnVsAi.addEventListener('click', () => {
    initAudio();
    gameMode = 'ai';
    syncModeUI(gameMode);
    initBoard();
});

btnLocal.addEventListener('click', () => {
    initAudio();
    gameMode = 'local';
    syncModeUI(gameMode);
    initBoard();
});

btnPuzzles.addEventListener('click', () => {
    initAudio();
    gameMode = 'puzzle';
    syncModeUI(gameMode);
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

document.getElementById('btn-flip').addEventListener('click', () => {
    initAudio();
    boardFlipped = !boardFlipped;
    boardEl.classList.toggle('flipped', boardFlipped);
});

syncModeUI(gameMode);
initBoard();