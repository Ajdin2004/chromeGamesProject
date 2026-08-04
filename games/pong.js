const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

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

// --- Game Settings & Objects ---
let gameMode = 'ai'; // 'ai' or 'pvp'
const WINNING_SCORE = 5;

const paddleWidth = 12;
const paddleHeight = 80;

const player1 = {
    x: 20,
    y: canvas.height / 2 - paddleHeight / 2,
    score: 0,
    dy: 0,
    speed: 6,
    color: '#00f2fe'
};

const player2 = {
    x: canvas.width - 20 - paddleWidth,
    y: canvas.height / 2 - paddleHeight / 2,
    score: 0,
    dy: 0,
    speed: 6,
    color: '#ff2a6d'
};

const ball = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: 7,
    speed: 5,
    dx: 5,
    dy: 3
};

const keys = {};
let isGameOver = false;
let winnerText = '';

function resetBall(direction = 1) {
    ball.x = canvas.width / 2;
    ball.y = canvas.height / 2;
    ball.speed = 5;
    ball.dx = direction * ball.speed;
    ball.dy = (Math.random() - 0.5) * 6;
}

function resetGame() {
    player1.score = 0;
    player2.score = 0;
    player1.y = canvas.height / 2 - paddleHeight / 2;
    player2.y = canvas.height / 2 - paddleHeight / 2;
    isGameOver = false;
    resetBall();
}

// --- Logic ---
function update() {
    if (isGameOver) return;

    // Player 1 Movement (W / S)
    if (keys['w'] || keys['W']) player1.y = Math.max(0, player1.y - player1.speed);
    if (keys['s'] || keys['S']) player1.y = Math.min(canvas.height - paddleHeight, player1.y + player1.speed);

    // Player 2 Movement (AI or Up/Down Arrows)
    if (gameMode === 'pvp') {
        if (keys['ArrowUp']) player2.y = Math.max(0, player2.y - player2.speed);
        if (keys['ArrowDown']) player2.y = Math.min(canvas.height - paddleHeight, player2.y + paddleHeight);
    } else {
        // Simple AI Tracking
        const paddleCenter = player2.y + paddleHeight / 2;
        if (paddleCenter < ball.y - 12) {
            player2.y = Math.min(canvas.height - paddleHeight, player2.y + 4.5);
        } else if (paddleCenter > ball.y + 12) {
            player2.y = Math.max(0, player2.y - 4.5);
        }
    }

    // Ball Movement
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Top & Bottom Wall Bounce
    if (ball.y - ball.radius <= 0 || ball.y + ball.radius >= canvas.height) {
        ball.dy *= -1;
        Sound.wallHit();
    }

    // Paddle Collisions
    let paddle = (ball.x < canvas.width / 2) ? player1 : player2;

    if (
        ball.x - ball.radius < paddle.x + paddleWidth &&
        ball.x + ball.radius > paddle.x &&
        ball.y > paddle.y &&
        ball.y < paddle.y + paddleHeight
    ) {
        // Calculate angle based on hit location
        let collidePoint = (ball.y - (paddle.y + paddleHeight / 2)) / (paddleHeight / 2);
        let angleRad = (Math.PI / 4) * collidePoint;

        let direction = (ball.x < canvas.width / 2) ? 1 : -1;
        ball.speed = Math.min(12, ball.speed + 0.4); // Accelerate ball
        ball.dx = direction * ball.speed * Math.cos(angleRad);
        ball.dy = ball.speed * Math.sin(angleRad);

        Sound.paddleHit();
    }

    // Score Tracking
    if (ball.x - ball.radius < 0) {
        player2.score++;
        Sound.score();
        checkWinner();
        resetBall(1);
    } else if (ball.x + ball.radius > canvas.width) {
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
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);
}

function draw() {
    ctx.fillStyle = '#101426';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawDashedLine();

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
    ctx.shadowBlur = 0; // Reset

    // Scores
    ctx.font = '800 36px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillText(player1.score, canvas.width / 4, 60);
    ctx.fillText(player2.score, (3 * canvas.width) / 4, 60);

    if (isGameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(0, 130, canvas.width, 140);

        ctx.fillStyle = '#00f2fe';
        ctx.font = '800 32px Outfit, sans-serif';
        ctx.fillText(winnerText, canvas.width / 2, 185);

        ctx.fillStyle = '#fff';
        ctx.font = '400 16px Outfit, sans-serif';
        ctx.fillText('Press Space or Click to Restart', canvas.width / 2, 225);
    }
}

// --- Event Listeners ---
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

// Mode Switching
const modeBtns = document.querySelectorAll('.mode-btn');
const hint = document.getElementById('control-hint');

modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        gameMode = btn.dataset.mode;

        hint.innerHTML = gameMode === 'ai'
            ? 'P1: <strong>W/S</strong> &nbsp;|&nbsp; AI Controlled Right Paddle'
            : 'P1: <strong>W/S</strong> &nbsp;|&nbsp; P2: <strong>Up/Down Arrows</strong>';

        resetGame();
    });
});

// Loop
function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

loop();