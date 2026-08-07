const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('nextCanvas');
const nextCtx = nextCanvas.getContext('2d');
const wrapper = document.getElementById('wrapper');

const COLS = 10;
const ROWS = 20;
let blockSize = 24;

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
        osc.frequency.setValueAtTime(120, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.05);
    },
    rotate() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(500, audioCtx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
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
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.25);
    },
    drop() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(60, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    }
};

// --- Dynamic Dynamic Scaling ---
function resizeCanvas() {
    const rect = wrapper.getBoundingClientRect();
    const targetRatio = COLS / ROWS;
    
    let w = rect.width;
    let h = rect.height;

    if (w / h > targetRatio) {
        w = h * targetRatio;
    } else {
        h = w / targetRatio;
    }

    blockSize = h / ROWS;
    
    // Scale main canvas
    canvas.width = blockSize * COLS;
    canvas.height = blockSize * ROWS;

    // Scale preview canvas
    const nextSize = Math.min(80, Math.max(48, blockSize * 2.5));
    nextCanvas.width = nextSize;
    nextCanvas.height = nextSize;

    draw();
    if (nextPiece) drawNextPiece();
}

window.addEventListener('resize', resizeCanvas);

// --- Tetromino Definitions & Colors ---
const PIECES = [
    { name: 'I', color: '#00f2fe', matrix: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
    { name: 'J', color: '#3b82f6', matrix: [[1,0,0],[1,1,1],[0,0,0]] },
    { name: 'L', color: '#f97316', matrix: [[0,0,1],[1,1,1],[0,0,0]] },
    { name: 'O', color: '#facc15', matrix: [[1,1],[1,1]] },
    { name: 'S', color: '#22c55e', matrix: [[0,1,1],[1,1,0],[0,0,0]] },
    { name: 'T', color: '#a855f7', matrix: [[0,1,0],[1,1,1],[0,0,0]] },
    { name: 'Z', color: '#ef4444', matrix: [[1,1,0],[0,1,1],[0,0,0]] }
];

let board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
let score = 0;
let linesCleared = 0;
let level = 1;

let activePiece = null;
let nextPiece = null;
let pieceX = 0;
let pieceY = 0;

let lastDropTime = 0;
let dropInterval = 800;
let isGameOver = false;

function getRandomPiece() {
    const p = PIECES[Math.floor(Math.random() * PIECES.length)];
    return {
        matrix: p.matrix.map(row => [...row]),
        color: p.color
    };
}

function resetGame() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    score = 0; linesCleared = 0; level = 1; dropInterval = 800;
    document.getElementById('score').textContent = 0;
    document.getElementById('lines').textContent = 0;
    document.getElementById('level').textContent = 1;
    isGameOver = false;
    spawnPiece();
}

function spawnPiece() {
    activePiece = nextPiece || getRandomPiece();
    nextPiece = getRandomPiece();
    
    pieceX = Math.floor((COLS - activePiece.matrix[0].length) / 2);
    pieceY = 0;

    if (collide(activePiece.matrix, pieceX, pieceY)) {
        isGameOver = true;
    }

    drawNextPiece();
}

function collide(matrix, offsetX, offsetY) {
    for (let y = 0; y < matrix.length; y++) {
        for (let x = 0; x < matrix[y].length; x++) {
            if (matrix[y][x]) {
                const newX = offsetX + x;
                const newY = offsetY + y;

                if (newX < 0 || newX >= COLS || newY >= ROWS) return true;
                if (newY >= 0 && board[newY][newX]) return true;
            }
        }
    }
    return false;
}

function rotateMatrix(matrix) {
    return matrix[0].map((_, i) => matrix.map(row => row[i]).reverse());
}

function rotatePiece() {
    const rotated = rotateMatrix(activePiece.matrix);
    if (!collide(rotated, pieceX, pieceY)) {
        activePiece.matrix = rotated;
        Sound.rotate();
    }
}

function lockPiece() {
    activePiece.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value && pieceY + y >= 0) {
                board[pieceY + y][pieceX + x] = activePiece.color;
            }
        });
    });

    clearLines();
    spawnPiece();
}

function clearLines() {
    let lines = 0;

    for (let y = ROWS - 1; y >= 0; y--) {
        if (board[y].every(cell => cell !== 0)) {
            board.splice(y, 1);
            board.unshift(Array(COLS).fill(0));
            lines++;
            y++;
        }
    }

    if (lines > 0) {
        Sound.clear();
        linesCleared += lines;
        const lineScores = [0, 100, 300, 500, 800];
        score += lineScores[lines] * level;
        level = Math.floor(linesCleared / 10) + 1;
        dropInterval = Math.max(100, 800 - (level - 1) * 70);

        document.getElementById('score').textContent = score;
        document.getElementById('lines').textContent = linesCleared;
        document.getElementById('level').textContent = level;
    }
}

function moveLeft() {
    if (!collide(activePiece.matrix, pieceX - 1, pieceY)) {
        pieceX--; Sound.move();
    }
}

function moveRight() {
    if (!collide(activePiece.matrix, pieceX + 1, pieceY)) {
        pieceX++; Sound.move();
    }
}

function moveDown() {
    if (!collide(activePiece.matrix, pieceX, pieceY + 1)) {
        pieceY++;
    } else {
        lockPiece();
    }
}

function hardDrop() {
    while (!collide(activePiece.matrix, pieceX, pieceY + 1)) {
        pieceY++;
        score += 2;
    }
    document.getElementById('score').textContent = score;
    Sound.drop();
    lockPiece();
}

// --- Drawing ---
function drawBlock(ctxRef, x, y, color, size = blockSize) {
    ctxRef.fillStyle = color;
    ctxRef.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);

    ctxRef.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctxRef.fillRect(x * size + 1, y * size + 1, size - 2, Math.max(2, size * 0.1));
}

function drawGrid() {
    ctx.fillStyle = '#0f1426';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(x * blockSize, 0);
        ctx.lineTo(x * blockSize, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * blockSize);
        ctx.lineTo(canvas.width, y * blockSize);
        ctx.stroke();
    }
}

function drawNextPiece() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    const matrix = nextPiece.matrix;
    const size = nextCanvas.width / 5;
    const offsetX = (nextCanvas.width - matrix[0].length * size) / 2 / size;
    const offsetY = (nextCanvas.height - matrix.length * size) / 2 / size;

    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value) {
                drawBlock(nextCtx, offsetX + x, offsetY + y, nextPiece.color, size);
            }
        });
    });
}

function draw() {
    drawGrid();

    board.forEach((row, y) => {
        row.forEach((color, x) => {
            if (color) drawBlock(ctx, x, y, color);
        });
    });

    if (activePiece) {
        let ghostY = pieceY;
        while (!collide(activePiece.matrix, pieceX, ghostY + 1)) ghostY++;

        activePiece.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                    ctx.fillRect((pieceX + x) * blockSize + 1, (ghostY + y) * blockSize + 1, blockSize - 2, blockSize - 2);
                }
            });
        });

        activePiece.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value) drawBlock(ctx, pieceX + x, pieceY + y, activePiece.color);
            });
        });
    }

    if (isGameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, canvas.height / 2 - 50, canvas.width, 100);

        ctx.fillStyle = '#ef4444';
        ctx.font = `800 ${Math.max(16, blockSize)}px Outfit, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 5);

        ctx.fillStyle = '#fff';
        ctx.font = `400 ${Math.max(10, blockSize * 0.45)}px Outfit, sans-serif`;
        ctx.fillText('Tap screen to restart', canvas.width / 2, canvas.height / 2 + 25);
    }
}

// --- Gesture & Input Controls ---
let startX = 0;
let startY = 0;
let startTime = 0;
let lastMoveX = 0;

// --- Keyboard: Track held keys for smooth simultaneous input ---
const keysPressed = new Set();
const keyRepeatTimes = {};

function handleKeyAction(key, isFirstPress) {
    switch (key) {
        case 'ArrowLeft': case 'a': moveLeft(); break;
        case 'ArrowRight': case 'd': moveRight(); break;
        case 'ArrowDown': case 's': moveDown(); break;
        case 'ArrowUp': case 'w':
            if (isFirstPress) rotatePiece();
            break;
        case ' ':
            if (isFirstPress) hardDrop();
            break;
    }
}

window.addEventListener('keydown', e => {
    initAudio();
    if (isGameOver) {
        resetGame();
        return;
    }

    const key = e.key;
    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ', 'a', 'd', 's', 'w'].includes(key)) {
        e.preventDefault();
    }

    // Only act on the first press; held keys are repeated in the game loop
    if (!keysPressed.has(key)) {
        keysPressed.add(key);
        keyRepeatTimes[key] = performance.now();
        handleKeyAction(key, true);
    }
});

window.addEventListener('keyup', e => {
    keysPressed.delete(e.key);
    delete keyRepeatTimes[e.key];
});

function processKeys() {
    if (isGameOver) return;
    const now = performance.now();

    keysPressed.forEach(key => {
        const lastRepeat = keyRepeatTimes[key] || 0;
        const repeatInterval = (key === 'ArrowDown' || key === 's') ? 50 : 120;

        if (now - lastRepeat > repeatInterval) {
            keyRepeatTimes[key] = now;
            handleKeyAction(key, false);
        }
    });
}

// Gesture Handling directly on Window/Document
window.addEventListener('touchstart', e => {
    initAudio();
    if (isGameOver) {
        resetGame();
        return;
    }

    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    lastMoveX = touch.clientX;
    startTime = Date.now();
}, { passive: false });

window.addEventListener('touchmove', e => {
    if (isGameOver) return;

    const touch = e.touches[0];
    const diffX = touch.clientX - lastMoveX;
    const diffY = touch.clientY - startY;

    // Drag horizontally cell by cell
    if (Math.abs(diffX) > blockSize) {
        if (diffX > 0) moveRight();
        else moveLeft();
        lastMoveX = touch.clientX;
    }

    // Soft drop when dragging downwards continuously
    if (diffY > blockSize * 1.5) {
        moveDown();
        startY = touch.clientY; // reset baseline
    }
}, { passive: false });

// --- Double-tap detection for rotation (prevents accidental rotates) ---
let lastTapTime = 0;
let lastTapX = 0;
let lastTapY = 0;
const DOUBLE_TAP_DELAY = 300;
const DOUBLE_TAP_DIST = 30;

window.addEventListener('touchend', e => {
    if (isGameOver) return;

    const touch = e.changedTouches[0];
    const totalX = touch.clientX - startX;
    const totalY = touch.clientY - startY;
    const duration = Date.now() - startTime;

    // Fast swipe down triggers Hard Drop
    if (totalY > 100 && duration < 250 && Math.abs(totalX) < 60) {
        hardDrop();
    } 
    // Tap (short duration, minimal movement) — double-tap triggers Rotate
    else if (Math.abs(totalX) < 15 && Math.abs(totalY) < 15 && duration < 250) {
        const now = Date.now();
        const timeSinceLastTap = now - lastTapTime;
        const distFromLastTap = Math.hypot(touch.clientX - lastTapX, touch.clientY - lastTapY);

        if (timeSinceLastTap < DOUBLE_TAP_DELAY && distFromLastTap < DOUBLE_TAP_DIST) {
            rotatePiece();
            lastTapTime = 0; // reset so a third tap doesn't rotate again
        } else {
            lastTapTime = now;
            lastTapX = touch.clientX;
            lastTapY = touch.clientY;
        }
    }
});

// Initial Setup
resizeCanvas();
spawnPiece();
update();

function update(time = 0) {
    const deltaTime = time - lastDropTime;

    // Process held keys each frame so multiple inputs work simultaneously
    processKeys();

    if (!isGameOver && deltaTime > dropInterval) {
        moveDown();
        lastDropTime = time;
    }

    draw();
    requestAnimationFrame(update);
}
