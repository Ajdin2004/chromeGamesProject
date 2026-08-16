const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Virtual Coordinate System ---
// All game logic runs in a fixed 600x400 virtual space.
// The canvas is resized to fill the screen and ctx.setTransform
// scales the virtual space to the actual canvas size.
const VIRTUAL_WIDTH = 600;
const VIRTUAL_HEIGHT = 400;

let scaleX = 1;
let scaleY = 1;

// --- Web Audio API Setup ---
let audioCtx = null;

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

const Sound = {
    paddleHit() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.08);
    },
    wallHit() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.05);
    },
    score() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.1);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.2);
    }
};

// --- Game Settings & Configuration ---
let gameMode = 'ai'; 
let WINNING_SCORE = 5;

// AI Difficulty Profiles
const AI_PROFILES = {
    easy: { speed: 3.5, margin: 25 },
    medium: { speed: 5.0, margin: 12 },
    hard: { speed: 6.5, margin: 4 },
    impossible: { speed: 9.0, margin: 0 }
};

let currentAiDifficulty = 'medium';

const paddleWidth = 12;
const paddleHeight = 80;

const player1 = {
    x: 20,
    y: VIRTUAL_HEIGHT / 2 - paddleHeight / 2,
    score: 0,
    speed: 6.5,
    color: '#00f2fe'
};

const player2 = {
    x: VIRTUAL_WIDTH - 20 - paddleWidth,
    y: VIRTUAL_HEIGHT / 2 - paddleHeight / 2,
    score: 0,
    speed: 6.5,
    color: '#ff2a6d'
};

const ball = {
    x: VIRTUAL_WIDTH / 2,
    y: VIRTUAL_HEIGHT / 2,
    radius: 7,
    speed: 5,
    dx: 5,
    dy: 3,
    trail: []
};

const keys = {};
let isGameOver = false;
let winnerText = '';

// DOM Elements
const modeBtns = document.querySelectorAll('.mode-btn');
const hint = document.getElementById('control-hint');
const aiDiffSelect = document.getElementById('ai-diff');
const aiDiffBox = document.getElementById('ai-difficulty-box');
const scoreLimitSelect = document.getElementById('score-limit');

// --- Canvas Resize ---
function resize() {
    const wrapper = canvas.parentElement;
    const rect = wrapper.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width));
    canvas.height = Math.max(1, Math.round(rect.height));
    scaleX = canvas.width / VIRTUAL_WIDTH;
    scaleY = canvas.height / VIRTUAL_HEIGHT;
}

function resetBall(direction = 1) {
    ball.x = VIRTUAL_WIDTH / 2;
    ball.y = VIRTUAL_HEIGHT / 2;
    ball.speed = 5;
    ball.dx = direction * ball.speed;
    ball.dy = (Math.random() - 0.5) * 6;
    ball.trail = [];
}

function resetGame() {
    player1.score = 0;
    player2.score = 0;
    player1.y = VIRTUAL_HEIGHT / 2 - paddleHeight / 2;
    player2.y = VIRTUAL_HEIGHT / 2 - paddleHeight / 2;
    isGameOver = false;
    resetBall();
}

// --- Logic Update ---
function update() {
    if (isGameOver) return;

    // Player 1 Movement (W / S)
    if (keys['w'] || keys['W']) player1.y = Math.max(0, player1.y - player1.speed);
    if (keys['s'] || keys['S']) player1.y = Math.min(VIRTUAL_HEIGHT - paddleHeight, player1.y + player1.speed);

    // Player 2 Movement
    if (gameMode === 'pvp') {
        if (keys['ArrowUp']) player2.y = Math.max(0, player2.y - player2.speed);
        if (keys['ArrowDown']) player2.y = Math.min(VIRTUAL_HEIGHT - paddleHeight, player2.y + player2.speed);
    } else {
        // AI Movement Logic
        const profile = AI_PROFILES[currentAiDifficulty];
        const paddleCenter = player2.y + paddleHeight / 2;
        
        if (paddleCenter < ball.y - profile.margin) {
            player2.y = Math.min(VIRTUAL_HEIGHT - paddleHeight, player2.y + profile.speed);
        } else if (paddleCenter > ball.y + profile.margin) {
            player2.y = Math.max(0, player2.y - profile.speed);
        }
    }

    // Ball Movement & Motion Trail
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 8) ball.trail.shift();

    ball.x += ball.dx;
    ball.y += ball.dy;

    // Wall Bounce
    if (ball.y - ball.radius <= 0 || ball.y + ball.radius >= VIRTUAL_HEIGHT) {
        ball.dy *= -1;
        Sound.wallHit();
    }

    // Paddle Collisions
    let paddle = (ball.x < VIRTUAL_WIDTH / 2) ? player1 : player2;

    if (
        ball.x - ball.radius < paddle.x + paddleWidth &&
        ball.x + ball.radius > paddle.x &&
        ball.y > paddle.y &&
        ball.y < paddle.y + paddleHeight
    ) {
        let collidePoint = (ball.y - (paddle.y + paddleHeight / 2)) / (paddleHeight / 2);
        let angleRad = (Math.PI / 4) * collidePoint;

        let direction = (ball.x < VIRTUAL_WIDTH / 2) ? 1 : -1;
        ball.speed = Math.min(13, ball.speed + 0.4);
        ball.dx = direction * ball.speed * Math.cos(angleRad);
        ball.dy = ball.speed * Math.sin(angleRad);

        Sound.paddleHit();
    }

    // Scoring
    if (ball.x - ball.radius < 0) {
        player2.score++;
        Sound.score();
        checkWinner();
        resetBall(1);
    } else if (ball.x + ball.radius > VIRTUAL_WIDTH) {
        player1.score++;
        Sound.score();
        checkWinner();
        resetBall(-1);
    }
}

function checkWinner() {
    if (player1.score >= WINNING_SCORE) {
        winnerText = 'Player 1 Wins!';
        isGameOver = true;
    } else if (player2.score >= WINNING_SCORE) {
        winnerText = gameMode === 'ai' ? 'AI Wins!' : 'Player 2 Wins!';
        isGameOver = true;
    }
}

// --- Drawing ---
function drawDashedLine() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(VIRTUAL_WIDTH / 2, 0);
    ctx.lineTo(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawTrail() {
    ball.trail.forEach((point, i) => {
        ctx.fillStyle = `rgba(0, 242, 254, ${ (i + 1) / 12 })`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, ball.radius * ((i + 1) / 8), 0, Math.PI * 2);
        ctx.fill();
    });
}

function draw() {
    // Scale the virtual coordinate space to fill the canvas
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

    ctx.fillStyle = '#101426';
    ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

    drawDashedLine();
    drawTrail();

    // Player 1 Paddle
    ctx.fillStyle = player1.color;
    ctx.shadowColor = player1.color;
    ctx.shadowBlur = 10;
    ctx.fillRect(player1.x, player1.y, paddleWidth, paddleHeight);

    // Player 2 Paddle
    ctx.fillStyle = player2.color;
    ctx.shadowColor = player2.color;
    ctx.fillRect(player2.x, player2.y, paddleWidth, paddleHeight);

    // Ball
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Scores
    ctx.font = '800 36px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillText(player1.score, VIRTUAL_WIDTH / 4, 60);
    ctx.fillText(player2.score, (3 * VIRTUAL_WIDTH) / 4, 60);

    if (isGameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(0, 130, VIRTUAL_WIDTH, 140);

        ctx.fillStyle = '#00f2fe';
        ctx.font = '800 32px Outfit, sans-serif';
        ctx.fillText(winnerText, VIRTUAL_WIDTH / 2, 185);

        ctx.fillStyle = '#fff';
        ctx.font = '400 16px Outfit, sans-serif';
        ctx.fillText('Press Space or Tap to Restart', VIRTUAL_WIDTH / 2, 225);
    }
}

// --- Event Listeners (Keyboard & Touch) ---
window.addEventListener('keydown', e => {
    initAudio();
    keys[e.key] = true;

    if (isGameOver && e.code === 'Space') {
        resetGame();
    }
});

window.addEventListener('keyup', e => {
    keys[e.key] = false;
});

canvas.addEventListener('click', () => {
    initAudio();
    if (isGameOver) resetGame();
});

// Touch controls support mapping
canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    initAudio();
    if (isGameOver) {
        resetGame();
        return;
    }

    const rect = canvas.getBoundingClientRect();

    for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        // Convert client coordinates to virtual game coordinates
        const gameX = (touch.clientX - rect.left) / scaleX;
        const gameY = (touch.clientY - rect.top) / scaleY;

        // Left half controls Player 1, Right half controls Player 2 (if PvP mode)
        if (gameX < VIRTUAL_WIDTH / 2) {
            player1.y = Math.max(0, Math.min(VIRTUAL_HEIGHT - paddleHeight, gameY - paddleHeight / 2));
        } else if (gameMode === 'pvp') {
            player2.y = Math.max(0, Math.min(VIRTUAL_HEIGHT - paddleHeight, gameY - paddleHeight / 2));
        }
    }
}, { passive: false });

canvas.addEventListener('touchstart', e => {
    initAudio();
    if (isGameOver) resetGame();
}, { passive: true });

// Settings Handlers
modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        gameMode = btn.dataset.mode;

        if (gameMode === 'ai') {
            aiDiffBox.style.display = 'flex';
            hint.innerHTML = 'P1: <strong>W/S or Touch Drag</strong> &nbsp;|&nbsp; AI Controlled Right Paddle';
        } else {
            aiDiffBox.style.display = 'none';
            hint.innerHTML = 'P1: <strong>Left Touch</strong> &nbsp;|&nbsp; P2: <strong>Right Touch / Arrows</strong>';
        }

        resetGame();
    });
});

aiDiffSelect.addEventListener('change', (e) => {
    currentAiDifficulty = e.target.value;
    resetGame();
});

scoreLimitSelect.addEventListener('change', (e) => {
    WINNING_SCORE = parseInt(e.target.value);
    resetGame();
});

// --- Resize Handling ---
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => {
    // Wait for the orientation change to complete before resizing
    setTimeout(resize, 100);
});

// Initial resize
resize();

// Loop
function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

loop();