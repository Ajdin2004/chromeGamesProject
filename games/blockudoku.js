const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('wrapper');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const finalScoreEl = document.getElementById('finalScore');
const restartBtn = document.getElementById('restartBtn');

const GRID_SIZE = 9;
const SUB_GRID = 3;
let cellSize = 40;

// --- Web Audio Synthesizer ---
let audioCtx = null;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

const Sound = {
    place() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.08);
    },
    clear() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.setValueAtTime(600, now + 0.08);
        osc.frequency.setValueAtTime(800, now + 0.16);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.25);
    },
    subClear() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.setValueAtTime(700, now + 0.1);
        osc.frequency.setValueAtTime(900, now + 0.2);
        osc.frequency.setValueAtTime(1200, now + 0.3);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.4);
    },
    gameOver() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.6);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.6);
    }
};

// --- Piece Definitions (polyominoes) ---
const PIECE_TYPES = [
    { name: 'single', color: '#00f2fe', matrix: [[1]] },
    { name: 'domino', color: '#3b82f6', matrix: [[1, 1]] },
    { name: 'tromino-i', color: '#f97316', matrix: [[1, 1, 1]] },
    { name: 'tromino-l', color: '#22c55e', matrix: [[1, 0], [1, 1]] },
    { name: 'tetromino-i', color: '#a855f7', matrix: [[1, 1, 1, 1]] },
    { name: 'tetromino-o', color: '#facc15', matrix: [[1, 1], [1, 1]] },
    { name: 'tetromino-l', color: '#ef4444', matrix: [[1, 0, 0], [1, 1, 1]] },
    { name: 'tetromino-j', color: '#6366f1', matrix: [[0, 0, 1], [1, 1, 1]] },
    { name: 'tetromino-t', color: '#ec4899', matrix: [[0, 1, 0], [1, 1, 1]] },
    { name: 'tetromino-s', color: '#14b8a6', matrix: [[0, 1, 1], [1, 1, 0]] },
    { name: 'tetromino-z', color: '#f43f5e', matrix: [[1, 1, 0], [0, 1, 1]] },
    { name: 'pentomino-p', color: '#8b5cf6', matrix: [[1, 1], [1, 1], [1, 0]] },
    { name: 'pentomino-plus', color: '#06b6d4', matrix: [[0, 1, 0], [1, 1, 1], [0, 1, 0]] },
    { name: 'pentomino-u', color: '#0ea5e9', matrix: [[1, 0, 1], [1, 1, 1]] },
    { name: 'pentomino-v', color: '#eab308', matrix: [[1, 0], [1, 0], [1, 1]] }
];

// --- Game State ---
let board = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
let pieces = []; // Array of 3 pieces
let score = 0;
let highScore = parseInt(localStorage.getItem('blockudoku_highscore')) || 0;
let isGameOver = false;

// --- Drag State ---
let dragging = null; // { slotIndex, piece, offsetX, offsetY }
let hoverCell = null; // { row, col } or null
let hoverValid = false;

// --- Tap-to-Place State ---
let selectedSlot = null; // index of selected piece slot (0, 1, 2) or null

// --- Animation State ---
let clearAnimations = []; // { type: 'row'|'col'|'sub', index, progress }
let particles = []; // floating particles for clear effects
let scorePopups = []; // floating score text
let placedAnimations = []; // { row, col, color, progress } for piece placement scale-in
let lastTime = 0;

highScoreEl.textContent = highScore;

// --- Dynamic Scaling ---
function resizeCanvas() {
    const rect = wrapper.getBoundingClientRect();
    // Use the smaller dimension to fit the square grid inside the wrapper
    const size = Math.max(180, Math.min(rect.width, rect.height));
    cellSize = size / GRID_SIZE;
    canvas.width = cellSize * GRID_SIZE;
    canvas.height = cellSize * GRID_SIZE;
    draw();
    drawAllPieces();
}

window.addEventListener('resize', resizeCanvas);

// --- Piece Helpers ---
function rotateMatrix(matrix) {
    const rows = matrix.length;
    const cols = matrix[0].length;
    const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            rotated[c][rows - 1 - r] = matrix[r][c];
        }
    }
    return rotated;
}

function getRandomPiece() {
    const p = PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
    let matrix = p.matrix.map(row => [...row]);
    // Apply 0-3 random rotations for variety
    const rotations = Math.floor(Math.random() * 4);
    for (let i = 0; i < rotations; i++) {
        matrix = rotateMatrix(matrix);
    }
    return {
        matrix,
        color: p.color
    };
}

function getPieceSize(piece) {
    return {
        rows: piece.matrix.length,
        cols: piece.matrix[0].length
    };
}

function canPlace(piece, row, col) {
    const { rows, cols } = getPieceSize(piece);
    if (row < 0 || col < 0 || row + rows > GRID_SIZE || col + cols > GRID_SIZE) return false;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (piece.matrix[r][c] && board[row + r][col + c]) return false;
        }
    }
    return true;
}

function placePiece(piece, row, col) {
    const { rows, cols } = getPieceSize(piece);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (piece.matrix[r][c]) {
                board[row + r][col + c] = piece.color;
                // Add placement scale-in animation
                placedAnimations.push({ row: row + r, col: col + c, color: piece.color, progress: 0 });
            }
        }
    }
    score += piece.matrix.flat().filter(v => v).length * 10;
    updateScore();
    Sound.place();
    checkClears();
}

// --- Clear Detection ---
function checkClears() {
    const cleared = { rows: [], cols: [], subs: [] };

    // Check rows
    for (let r = 0; r < GRID_SIZE; r++) {
        if (board[r].every(cell => cell !== 0)) cleared.rows.push(r);
    }

    // Check columns
    for (let c = 0; c < GRID_SIZE; c++) {
        let full = true;
        for (let r = 0; r < GRID_SIZE; r++) {
            if (!board[r][c]) { full = false; break; }
        }
        if (full) cleared.cols.push(c);
    }

    // Check 3x3 sub-grids
    for (let sr = 0; sr < GRID_SIZE; sr += SUB_GRID) {
        for (let sc = 0; sc < GRID_SIZE; sc += SUB_GRID) {
            let full = true;
            for (let r = sr; r < sr + SUB_GRID; r++) {
                for (let c = sc; c < sc + SUB_GRID; c++) {
                    if (!board[r][c]) { full = false; break; }
                }
                if (!full) break;
            }
            if (full) cleared.subs.push({ row: sr, col: sc });
        }
    }

    const totalClears = cleared.rows.length + cleared.cols.length + cleared.subs.length;
    if (totalClears > 0) {
        // Add score bonuses
        const lineBonus = (cleared.rows.length + cleared.cols.length) * 50;
        const subBonus = cleared.subs.length * 100;
        const comboBonus = totalClears > 1 ? (totalClears - 1) * 50 : 0;
        score += lineBonus + subBonus + comboBonus;
        updateScore();

        // Play sound
        if (cleared.subs.length > 0) {
            Sound.subClear();
        } else {
            Sound.clear();
        }

        // Animate clears
        clearAnimations = [];
        cleared.rows.forEach(r => clearAnimations.push({ type: 'row', index: r, progress: 0 }));
        cleared.cols.forEach(c => clearAnimations.push({ type: 'col', index: c, progress: 0 }));
        cleared.subs.forEach(s => clearAnimations.push({ type: 'sub', row: s.row, col: s.col, progress: 0 }));

        // Spawn particle bursts at clear locations
        const burstColors = ['#00f2fe', '#a855f7', '#facc15', '#22c55e', '#ef4444', '#3b82f6'];
        cleared.rows.forEach(r => {
            for (let c = 0; c < GRID_SIZE; c++) {
                spawnParticleBurst(c * cellSize + cellSize / 2, r * cellSize + cellSize / 2, burstColors);
            }
        });
        cleared.cols.forEach(c => {
            for (let r = 0; r < GRID_SIZE; r++) {
                spawnParticleBurst(c * cellSize + cellSize / 2, r * cellSize + cellSize / 2, burstColors);
            }
        });
        cleared.subs.forEach(s => {
            const cx = s.col * cellSize + cellSize * 1.5;
            const cy = s.row * cellSize + cellSize * 1.5;
            spawnParticleBurst(cx, cy, burstColors, 30);
        });

        // Add floating score popup
        const popupText = `+${lineBonus + subBonus + comboBonus}`;
        const popupX = canvas.width / 2;
        const popupY = canvas.height / 2;
        scorePopups.push({ text: popupText, x: popupX, y: popupY, progress: 0, color: cleared.subs.length > 0 ? '#facc15' : '#00f2fe' });

        // Actually clear after animation
        setTimeout(() => {
            cleared.rows.forEach(r => {
                for (let c = 0; c < GRID_SIZE; c++) board[r][c] = 0;
            });
            cleared.cols.forEach(c => {
                for (let r = 0; r < GRID_SIZE; r++) board[r][c] = 0;
            });
            cleared.subs.forEach(s => {
                for (let r = s.row; r < s.row + SUB_GRID; r++) {
                    for (let c = s.col; c < s.col + SUB_GRID; c++) {
                        board[r][c] = 0;
                    }
                }
            });
            clearAnimations = [];
            draw();
        }, 300);
    }
}

// --- Piece Management ---
function spawnPieces() {
    pieces = [getRandomPiece(), getRandomPiece(), getRandomPiece()];
    drawAllPieces();
}

function removePiece(slotIndex) {
    pieces[slotIndex] = getRandomPiece();
    drawAllPieces();
}

function canAnyPiecePlace() {
    for (const piece of pieces) {
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (canPlace(piece, r, c)) return true;
            }
        }
    }
    return false;
}

function checkGameOver() {
    if (!canAnyPiecePlace()) {
        isGameOver = true;
        Sound.gameOver();
        finalScoreEl.textContent = score;
        gameOverOverlay.classList.add('visible');

        if (score > highScore) {
            highScore = score;
            localStorage.setItem('blockudoku_highscore', highScore);
            highScoreEl.textContent = highScore;
        }
    }
}

// --- Score ---
function updateScore() {
    scoreEl.textContent = score;
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('blockudoku_highscore', highScore);
        highScoreEl.textContent = highScore;
    }
}

// --- Drawing ---
function drawBlock(x, y, color, size = cellSize, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);

    // Highlight top edge
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(x * size + 1, y * size + 1, size - 2, Math.max(2, size * 0.12));

    // Shadow bottom edge
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(x * size + 1, y * size + size - Math.max(2, size * 0.12) - 1, size - 2, Math.max(2, size * 0.12));
    ctx.globalAlpha = 1;
}

function drawGrid() {
    ctx.fillStyle = '#0f1426';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw sub-grid backgrounds (3x3 blocks)
    for (let sr = 0; sr < GRID_SIZE; sr += SUB_GRID) {
        for (let sc = 0; sc < GRID_SIZE; sc += SUB_GRID) {
            const isDark = ((sr / SUB_GRID) + (sc / SUB_GRID)) % 2 === 0;
            ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.05)';
            ctx.fillRect(sc * cellSize, sr * cellSize, cellSize * SUB_GRID, cellSize * SUB_GRID);
        }
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_SIZE; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellSize, 0);
        ctx.lineTo(i * cellSize, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * cellSize);
        ctx.lineTo(canvas.width, i * cellSize);
        ctx.stroke();
    }

    // Thicker sub-grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= GRID_SIZE; i += SUB_GRID) {
        ctx.beginPath();
        ctx.moveTo(i * cellSize, 0);
        ctx.lineTo(i * cellSize, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * cellSize);
        ctx.lineTo(canvas.width, i * cellSize);
        ctx.stroke();
    }
}

function spawnParticleBurst(x, y, colors, count = 8) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 3;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: 2 + Math.random() * 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            life: 0,
            maxLife: 400 + Math.random() * 300
        });
    }
}

function draw() {
    drawGrid();

    // Draw board pieces with placement scale-in animation
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (board[r][c]) {
                // Check if this cell has a placement animation
                const anim = placedAnimations.find(a => a.row === r && a.col === c);
                if (anim) {
                    const scale = Math.min(1, anim.progress / 150);
                    const size = cellSize * (0.3 + 0.7 * scale);
                    const offset = (cellSize - size) / 2;
                    ctx.globalAlpha = Math.min(1, anim.progress / 100);
                    ctx.fillStyle = anim.color;
                    ctx.fillRect(c * cellSize + offset + 1, r * cellSize + offset + 1, size - 2, size - 2);
                    ctx.globalAlpha = 1;
                } else {
                    drawBlock(c, r, board[r][c]);
                }
            }
        }
    }

    // Draw hover preview (for drag or tap-to-place)
    if ((dragging || selectedSlot !== null) && hoverCell) {
        const piece = dragging ? dragging.piece : pieces[selectedSlot];
        if (!piece) return;
        const { rows, cols } = getPieceSize(piece);
        const row = hoverCell.row;
        const col = hoverCell.col;

        // Draw ghost cells
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (piece.matrix[r][c]) {
                    const x = col + c;
                    const y = row + r;
                    if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
                        ctx.fillStyle = hoverValid ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)';
                        ctx.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
                        ctx.strokeStyle = hoverValid ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
                    }
                }
            }
        }
    }

    // Draw clear animations
    clearAnimations.forEach(anim => {
        const alpha = 1 - (anim.progress / 300);
        if (anim.type === 'row') {
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
            ctx.fillRect(0, anim.index * cellSize, canvas.width, cellSize);
        } else if (anim.type === 'col') {
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
            ctx.fillRect(anim.index * cellSize, 0, cellSize, canvas.height);
        } else if (anim.type === 'sub') {
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
            ctx.fillRect(anim.col * cellSize, anim.row * cellSize, cellSize * SUB_GRID, cellSize * SUB_GRID);
        }
    });

    // Draw particles
    particles.forEach(p => {
        const alpha = 1 - (p.life / p.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Draw floating score popups
    scorePopups.forEach(popup => {
        const alpha = 1 - (popup.progress / 1000);
        const yOffset = -popup.progress * 0.05;
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = popup.color;
        ctx.font = `800 ${Math.max(16, cellSize * 0.8)}px Outfit, sans-serif`;
        ctx.textAlign = 'center';
        ctx.shadowColor = popup.color;
        ctx.shadowBlur = 10;
        ctx.fillText(popup.text, popup.x, popup.y + yOffset);
        ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;
}

// --- Piece Preview Drawing ---
function drawPieceOnCanvas(pieceCanvas, piece) {
    const pCtx = pieceCanvas.getContext('2d');
    const slot = pieceCanvas.parentElement;
    const maxW = slot.clientWidth - 8;
    const maxH = slot.clientHeight - 8;
    const { rows, cols } = getPieceSize(piece);
    // Use a consistent cell size across all pieces.
    // Max piece is 4 cells wide (tetromino-i) and 3 cells tall (plus shape).
    const size = Math.min(maxW / 4, maxH / 3);
    pieceCanvas.width = cols * size;
    pieceCanvas.height = rows * size;

    pCtx.clearRect(0, 0, pieceCanvas.width, pieceCanvas.height);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (piece.matrix[r][c]) {
                pCtx.fillStyle = piece.color;
                pCtx.fillRect(c * size + 1, r * size + 1, size - 2, size - 2);
                pCtx.fillStyle = 'rgba(255, 255, 255, 0.25)';
                pCtx.fillRect(c * size + 1, r * size + 1, size - 2, Math.max(2, size * 0.12));
            }
        }
    }
}

function drawAllPieces() {
    for (let i = 0; i < 3; i++) {
        const pieceCanvas = document.getElementById(`pieceCanvas${i}`);
        const slot = pieceCanvas.parentElement;
        if (pieces[i]) {
            slot.classList.remove('empty');
            drawPieceOnCanvas(pieceCanvas, pieces[i]);
        } else {
            slot.classList.add('empty');
            const pCtx = pieceCanvas.getContext('2d');
            pCtx.clearRect(0, 0, pieceCanvas.width, pieceCanvas.height);
        }
    }
}

// --- Input: Mouse ---
function getGridPos(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    return {
        col: Math.floor(x / cellSize),
        row: Math.floor(y / cellSize)
    };
}

function clearSelection() {
    if (selectedSlot !== null) {
        const prevSlot = document.querySelector(`.piece-slot[data-slot="${selectedSlot}"]`);
        if (prevSlot) prevSlot.classList.remove('selected');
        selectedSlot = null;
    }
}

function selectPiece(slotIndex) {
    if (isGameOver) return;
    initAudio();
    const piece = pieces[slotIndex];
    if (!piece) return;

    // Toggle: if same slot tapped again, deselect
    if (selectedSlot === slotIndex) {
        clearSelection();
        hoverCell = null;
        hoverValid = false;
        draw();
        return;
    }

    // Clear previous selection
    clearSelection();

    const slot = document.querySelector(`.piece-slot[data-slot="${slotIndex}"]`);
    selectedSlot = slotIndex;
    slot.classList.add('selected');
    hoverCell = null;
    hoverValid = false;
    draw();
}

function startDrag(slotIndex, e) {
    if (isGameOver) return;
    initAudio();
    const piece = pieces[slotIndex];
    if (!piece) return;

    // If already dragging another piece, cancel it first
    if (dragging) {
        const prevSlot = document.querySelector(`.piece-slot[data-slot="${dragging.slotIndex}"]`);
        if (prevSlot) prevSlot.classList.remove('dragging');
    }

    // Clear tap-to-place selection when starting a drag
    clearSelection();

    const slot = document.querySelector(`.piece-slot[data-slot="${slotIndex}"]`);
    const pieceCanvas = document.getElementById(`pieceCanvas${slotIndex}`);
    const pRect = pieceCanvas.getBoundingClientRect();

    // Calculate offset from piece center
    const offsetX = e.clientX - pRect.left;
    const offsetY = e.clientY - pRect.top;

    dragging = { slotIndex, piece, offsetX, offsetY };
    slot.classList.add('dragging');
    hoverCell = null;
    hoverValid = false;
}

function updateDrag(e) {
    if (!dragging) return;
    const pos = getGridPos(e.clientX, e.clientY);
    if (pos) {
        const { rows, cols } = getPieceSize(dragging.piece);
        const row = pos.row - Math.floor(rows / 2);
        const col = pos.col - Math.floor(cols / 2);
        hoverCell = { row, col };
        hoverValid = canPlace(dragging.piece, row, col);
    } else {
        hoverCell = null;
        hoverValid = false;
    }
    draw();
}

function endDrag(e) {
    if (!dragging) return;
    const slot = document.querySelector(`.piece-slot[data-slot="${dragging.slotIndex}"]`);
    if (slot) slot.classList.remove('dragging');

    if (hoverCell && hoverValid) {
        placePiece(dragging.piece, hoverCell.row, hoverCell.col);
        removePiece(dragging.slotIndex);
        checkGameOver();
    }

    dragging = null;
    hoverCell = null;
    hoverValid = false;
    draw();
}

// Mouse events
canvas.addEventListener('mousemove', (e) => {
    if (dragging) updateDrag(e);
});

canvas.addEventListener('mouseup', (e) => {
    if (dragging) endDrag(e);
});

canvas.addEventListener('mouseleave', () => {
    if (dragging) {
        hoverCell = null;
        hoverValid = false;
        draw();
    }
});

// Piece slot mouse events
document.querySelectorAll('.piece-slot').forEach(slot => {
    slot.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const slotIndex = parseInt(slot.dataset.slot);
        startDrag(slotIndex, e);
    });
});

// --- Input: Touch (Tap-to-Place + Drag) ---
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let touchMoved = false;
let touchMovedDist = 0;
const TAP_DIST = 15; // max px movement to count as a tap

function handleCanvasTap(touch) {
    if (isGameOver) return;
    initAudio();
    const pos = getGridPos(touch.clientX, touch.clientY);
    if (!pos) return;

    if (selectedSlot !== null) {
        const piece = pieces[selectedSlot];
        if (!piece) return;

        const { rows, cols } = getPieceSize(piece);
        const row = pos.row - Math.floor(rows / 2);
        const col = pos.col - Math.floor(cols / 2);

        if (canPlace(piece, row, col)) {
            // Place the selected piece
            placePiece(piece, row, col);
            removePiece(selectedSlot);
            clearSelection();
            hoverCell = null;
            hoverValid = false;
            draw();
            checkGameOver();
        }
    }
    // If no piece selected, tapping the grid does nothing
}

function handleSlotTap(slotIndex) {
    selectPiece(slotIndex);
}

document.querySelectorAll('.piece-slot').forEach(slot => {
    slot.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartTime = Date.now();
        touchMoved = false;
        touchMovedDist = 0;
        slot._startedDrag = false;
    }, { passive: false });

    slot.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;
        touchMovedDist = Math.max(touchMovedDist, Math.abs(dx), Math.abs(dy));

        if (touchMovedDist > TAP_DIST && !touchMoved) {
            touchMoved = true;
            slot._startedDrag = true;
            const slotIndex = parseInt(slot.dataset.slot);
            startDrag(slotIndex, touch);
        }

        if (touchMoved && dragging) {
            updateDrag(touch);
        }
    }, { passive: false });

    slot.addEventListener('touchend', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];

        if (!touchMoved && !slot._startedDrag) {
            // It was a tap - select the piece
            const slotIndex = parseInt(slot.dataset.slot);
            handleSlotTap(slotIndex);
        } else if (dragging) {
            endDrag(touch);
        }
        slot._startedDrag = false;
        touchMoved = false;
    }, { passive: false });
});

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    touchMoved = false;
    touchMovedDist = 0;
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    touchMovedDist = Math.max(touchMovedDist, Math.abs(dx), Math.abs(dy));

    if (touchMovedDist > TAP_DIST) {
        touchMoved = true;
    }

    if (touchMoved && dragging) {
        updateDrag(touch);
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];

    if (!touchMoved) {
        // It was a tap on the canvas - place selected piece if any
        handleCanvasTap(touch);
    } else if (dragging) {
        endDrag(touch);
    }

    touchMoved = false;
}, { passive: false });

// --- Restart ---
function resetGame() {
    board = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
    score = 0;
    isGameOver = false;
    clearAnimations = [];
    particles = [];
    scorePopups = [];
    placedAnimations = [];
    dragging = null;
    hoverCell = null;
    hoverValid = false;
    clearSelection();
    scoreEl.textContent = 0;
    gameOverOverlay.classList.remove('visible');
    spawnPieces();
    draw();
}

restartBtn.addEventListener('click', resetGame);

// --- Animation Loop ---
function animate(time) {
    const delta = time - lastTime;
    lastTime = time;

    let needsRedraw = false;

    // Update clear animations
    if (clearAnimations.length > 0) {
        clearAnimations.forEach(anim => {
            anim.progress += delta;
        });
        needsRedraw = true;
    }

    // Update placement animations
    if (placedAnimations.length > 0) {
        placedAnimations.forEach(anim => {
            anim.progress += delta;
        });
        placedAnimations = placedAnimations.filter(a => a.progress < 200);
        needsRedraw = true;
    }

    // Update particles
    if (particles.length > 0) {
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05; // gravity
            p.vx *= 0.98; // friction
            p.vy *= 0.98;
            p.life += delta;
        });
        particles = particles.filter(p => p.life < p.maxLife);
        needsRedraw = true;
    }

    // Update score popups
    if (scorePopups.length > 0) {
        scorePopups.forEach(popup => {
            popup.progress += delta;
        });
        scorePopups = scorePopups.filter(p => p.progress < 1000);
        needsRedraw = true;
    }

    if (needsRedraw) draw();

    requestAnimationFrame(animate);
}

// --- Init ---
resizeCanvas();
spawnPieces();
requestAnimationFrame(animate);

// Re-run resize after layout is fully computed to ensure correct scaling
requestAnimationFrame(() => {
    resizeCanvas();
});
window.addEventListener('load', resizeCanvas);
