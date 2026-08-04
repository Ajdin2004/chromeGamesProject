const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('nextCanvas');
const nextCtx = nextCanvas.getContext('2d');

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 24;

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

// Board state (0 = empty, color string = filled block)
let board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

let score = 0;
let linesCleared = 0;
let level = 1;

let activePiece = null;
let nextPiece = null;
let pieceX = 0;
let pieceY = 0;

let lastDropTime = 0;
let dropInterval = 800; // ms per drop tick
let isGameOver = false;

// --- Helper Functions ---
function getRandomPiece() {
    const p = PIECES[Math.floor(Math.random() * PIECES.length)];
    return {
        matrix: p.matrix.map(row => [...row]),
        color: p.color
    };
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
            y++; // Check same row again
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
function drawBlock(ctxRef, x, y, color, size = BLOCK_SIZE) {
    ctxRef.fillStyle = color;
    ctxRef.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);

    // Subtle inner bevel gradient
    ctxRef.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctxRef.fillRect(x * size + 1, y * size + 1, size - 2, 3);
}

function drawGrid() {
    ctx.fillStyle = '#0f1426';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(x * BLOCK_SIZE, 0);
        ctx.lineTo(x * BLOCK_SIZE, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * BLOCK_SIZE);
        ctx.lineTo(canvas.width, y * BLOCK_SIZE);
        ctx.stroke();
    }
}

function drawNextPiece() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    const matrix = nextPiece.matrix;
    const size = 20;
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

    // Draw Locked Board Blocks
    board.forEach((row, y) => {
        row.forEach((color, x) => {
            if (color) drawBlock(ctx, x, y, color);
        });
    });

    // Draw Ghost Piece
    if (activePiece) {
        let ghostY = pieceY;
        while (!collide(activePiece.matrix, pieceX, ghostY + 1)) ghostY++;

        activePiece.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                    ctx.fillRect((pieceX + x) * BLOCK_SIZE + 1, (ghostY + y) * BLOCK_SIZE + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
                }
            });
        });

        // Draw Active Piece
        activePiece.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value) drawBlock(ctx, pieceX + x, pieceY + y, activePiece.color);
            });
        });
    }

    if (isGameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(0, 160, canvas.width, 120);

        ctx.fillStyle = '#ef4444';
        ctx.font = '800 24px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, 210);

        ctx.fillStyle = '#fff';
        ctx.font = '400 14px Outfit, sans-serif';
        ctx.fillText('Press Key to Restart', canvas.width / 2, 240);
    }
}

// --- Controls ---
window.addEventListener('keydown', e => {
    initAudio();

    if (isGameOver) {
        board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
        score = 0; linesCleared = 0; level = 1; dropInterval = 800;
        document.getElementById('score').textContent = 0;
        document.getElementById('lines').textContent = 0;
        document.getElementById('level').textContent = 1;
        isGameOver = false;
        spawnPiece();
        return;
    }

    switch (e.key) {
        case 'ArrowLeft':
        case 'a':
            if (!collide(activePiece.matrix, pieceX - 1, pieceY)) {
                pieceX--; Sound.move();
            }
            break;
        case 'ArrowRight':
        case 'd':
            if (!collide(activePiece.matrix, pieceX + 1, pieceY)) {
                pieceX++; Sound.move();
            }
            break;
        case 'ArrowDown':
        case 's':
            moveDown();
            break;
        case 'ArrowUp':
        case 'w':
            rotatePiece();
            break;
        case ' ':
            e.preventDefault();
            hardDrop();
            break;
    }
});

// --- Game Loop ---
function update(time = 0) {
    const deltaTime = time - lastDropTime;

    if (!isGameOver && deltaTime > dropInterval) {
        moveDown();
        lastDropTime = time;
    }

    draw();
    requestAnimationFrame(update);
}

spawnPiece();
update();