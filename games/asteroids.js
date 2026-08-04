const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Web Audio Synthesizer ---
let audioCtx = null;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

const Sound = {
    laser() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.12);
    },
    thrust() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(80, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(40, audioCtx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.08);
    },
    explosion(pitch = 1) {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(150 * pitch, now);
        osc.frequency.exponentialRampToValueAtTime(20 * pitch, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.3);
    },
    teleport() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.25);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.25);
    }
};

// --- Game Engine Variables ---
const STATE_START = 0;
const STATE_PLAYING = 1;
const STATE_GAMEOVER = 2;
let gameState = STATE_START;

let score = 0;
let highScore = parseInt(localStorage.getItem('asteroids_highscore')) || 0;
let lives = 3;
let wave = 1;

const ship = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    r: 12,
    angle: -Math.PI / 2,
    rotationSpeed: 0.085,
    vx: 0,
    vy: 0,
    thrust: 0.14,
    friction: 0.988,
    isThrusting: false,
    invulnerableTimer: 0
};

let bullets = [];
let asteroids = [];
let particles = [];
let lastShotTime = 0;
const keys = {};

// --- Screen Wrapping Helper ---
function wrapBounds(obj, radius = 0) {
    if (obj.x < -radius) obj.x = canvas.width + radius;
    if (obj.x > canvas.width + radius) obj.x = -radius;
    if (obj.y < -radius) obj.y = canvas.height + radius;
    if (obj.y > canvas.height + radius) obj.y = -radius;
}

// --- Generator Functions ---
function spawnAsteroid(x, y, radius, level = 3) {
    const vertexCount = Math.floor(Math.random() * 4) + 8;
    const offsets = [];
    for (let i = 0; i < vertexCount; i++) {
        offsets.push(Math.random() * 0.4 + 0.8);
    }

    const angle = Math.random() * Math.PI * 2;
    const speed = (4 - level) * 0.9 + Math.random() * 0.5 + wave * 0.1;

    const colors = ['#00f2fe', '#ff0080', '#a855f7', '#22c55e'];

    asteroids.push({
        x: x !== undefined ? x : (Math.random() < 0.5 ? 0 : canvas.width),
        y: y !== undefined ? y : Math.random() * canvas.height,
        r: radius,
        level: level,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotAngle: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.04,
        vertexCount,
        offsets,
        color: colors[level % colors.length]
    });
}

function createWave() {
    asteroids = [];
    const count = 4 + wave;
    for (let i = 0; i < count; i++) {
        // Ensure asteroids don't spawn right on top of ship
        let x, y, dist;
        do {
            x = Math.random() * canvas.width;
            y = Math.random() * canvas.height;
            dist = Math.hypot(x - ship.x, y - ship.y);
        } while (dist < 130);

        spawnAsteroid(x, y, 36, 3);
    }
}

function addExplosion(x, y, color, count = 16) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 1;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: Math.random() * 20 + 20,
            maxLife: 40,
            color
        });
    }
}

function resetGame() {
    score = 0;
    lives = 3;
    wave = 1;
    ship.x = canvas.width / 2;
    ship.y = canvas.height / 2;
    ship.vx = 0;
    ship.vy = 0;
    ship.angle = -Math.PI / 2;
    ship.invulnerableTimer = 120;
    bullets = [];
    particles = [];
    createWave();
    gameState = STATE_PLAYING;
}

function hyperspaceTeleport() {
    addExplosion(ship.x, ship.y, '#00f2fe', 12);
    Sound.teleport();
    ship.x = Math.random() * canvas.width;
    ship.y = Math.random() * canvas.height;
    ship.vx = 0;
    ship.vy = 0;
    ship.invulnerableTimer = 60;
    addExplosion(ship.x, ship.y, '#00f2fe', 12);
}

// --- Logic Update ---
function update() {
    if (gameState !== STATE_PLAYING) return;

    // Controls Handling
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) ship.angle -= ship.rotationSpeed;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) ship.angle += ship.rotationSpeed;

    ship.isThrusting = keys['ArrowUp'] || keys['w'] || keys['W'];

    if (ship.isThrusting) {
        ship.vx += Math.cos(ship.angle) * ship.thrust;
        ship.vy += Math.sin(ship.angle) * ship.thrust;

        // Exhaust Particles
        if (Math.random() < 0.6) {
            const rearAngle = ship.angle + Math.PI + (Math.random() - 0.5) * 0.5;
            particles.push({
                x: ship.x - Math.cos(ship.angle) * ship.r,
                y: ship.y - Math.sin(ship.angle) * ship.r,
                vx: Math.cos(rearAngle) * (Math.random() * 3 + 2),
                vy: Math.sin(rearAngle) * (Math.random() * 3 + 2),
                life: 15,
                maxLife: 15,
                color: '#ff0080'
            });
            Sound.thrust();
        }
    }

    // Apply Inertia Physics
    ship.vx *= ship.friction;
    ship.vy *= ship.friction;
    ship.x += ship.vx;
    ship.y += ship.vy;
    wrapBounds(ship, ship.r);

    if (ship.invulnerableTimer > 0) ship.invulnerableTimer--;

    // Update Bullets
    bullets = bullets.filter(b => {
        b.x += b.vx;
        b.y += b.vy;
        b.life--;
        wrapBounds(b);
        return b.life > 0;
    });

    // Update Asteroids
    asteroids.forEach(a => {
        a.x += a.vx;
        a.y += a.vy;
        a.rotAngle += a.rotSpeed;
        wrapBounds(a, a.r);
    });

    // Next Wave Check
    if (asteroids.length === 0) {
        wave++;
        ship.invulnerableTimer = 60;
        createWave();
    }

    // Bullet vs Asteroid Collisions
    bullets = bullets.filter(b => {
        let hit = false;

        for (let i = asteroids.length - 1; i >= 0; i--) {
            const a = asteroids[i];
            const dist = Math.hypot(b.x - a.x, b.y - a.y);

            if (dist < a.r) {
                hit = true;
                Sound.explosion(4 - a.level);
                addExplosion(a.x, a.y, a.color, 12);

                score += (4 - a.level) * 20;
                if (score > highScore) {
                    highScore = score;
                    localStorage.setItem('asteroids_highscore', highScore);
                }

                // Fragment Asteroid into smaller pieces
                if (a.level > 1) {
                    spawnAsteroid(a.x, a.y, a.r * 0.55, a.level - 1);
                    spawnAsteroid(a.x, a.y, a.r * 0.55, a.level - 1);
                }

                asteroids.splice(i, 1);
                break;
            }
        }
        return !hit;
    });

    // Ship vs Asteroid Collision
    if (ship.invulnerableTimer <= 0) {
        for (let i = 0; i < asteroids.length; i++) {
            const a = asteroids[i];
            const dist = Math.hypot(ship.x - a.x, ship.y - a.y);

            if (dist < ship.r + a.r * 0.85) {
                lives--;
                Sound.explosion(0.6);
                addExplosion(ship.x, ship.y, '#00f2fe', 25);

                if (lives <= 0) {
                    gameState = STATE_GAMEOVER;
                } else {
                    ship.x = canvas.width / 2;
                    ship.y = canvas.height / 2;
                    ship.vx = 0;
                    ship.vy = 0;
                    ship.angle = -Math.PI / 2;
                    ship.invulnerableTimer = 120;
                }
                break;
            }
        }
    }

    // Update Particles
    particles = particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        return p.life > 0;
    });
}

// --- Drawing ---
function drawShip() {
    if (ship.invulnerableTimer > 0 && Math.floor(ship.invulnerableTimer / 6) % 2 === 0) return;

    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);

    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 12;

    // Triangular Vector Ship Path
    ctx.beginPath();
    ctx.moveTo(ship.r * 1.4, 0);
    ctx.lineTo(-ship.r, -ship.r * 0.85);
    ctx.lineTo(-ship.r * 0.4, 0);
    ctx.lineTo(-ship.r, ship.r * 0.85);
    ctx.closePath();
    ctx.stroke();

    // Thrust Flame Visual
    if (ship.isThrusting) {
        ctx.strokeStyle = '#ff0080';
        ctx.shadowColor = '#ff0080';
        ctx.beginPath();
        ctx.moveTo(-ship.r * 0.5, -ship.r * 0.4);
        ctx.lineTo(-ship.r * 1.5 - Math.random() * 5, 0);
        ctx.lineTo(-ship.r * 0.5, ship.r * 0.4);
        ctx.stroke();
    }

    ctx.restore();
}

function drawAsteroids() {
    asteroids.forEach(a => {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.rotAngle);

        ctx.strokeStyle = a.color;
        ctx.lineWidth = 2;
        ctx.shadowColor = a.color;
        ctx.shadowBlur = 10;

        ctx.beginPath();
        for (let i = 0; i < a.vertexCount; i++) {
            const angle = (i / a.vertexCount) * Math.PI * 2;
            const r = a.r * a.offsets[i];
            const vx = Math.cos(angle) * r;
            const vy = Math.sin(angle) * r;

            if (i === 0) ctx.moveTo(vx, vy);
            else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    });
}

function draw() {
    ctx.fillStyle = '#070913';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawAsteroids();
    if (gameState === STATE_PLAYING || gameState === STATE_START) drawShip();

    // Draw Bullets
    ctx.fillStyle = '#00f2fe';
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 8;
    bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.shadowBlur = 0;

    // Draw Particles
    particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillRect(p.x, p.y, 2.5, 2.5);
    });
    ctx.globalAlpha = 1.0;

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = '800 18px Outfit, sans-serif';
    ctx.fillText(`SCORE: ${score}`, 20, 30);
    ctx.fillText(`LIVES: ${lives}`, canvas.width - 100, 30);
    ctx.fillText(`WAVE: ${wave}`, canvas.width / 2 - 30, 30);

    // Overlays
    if (gameState === STATE_START) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#00f2fe';
        ctx.font = '800 32px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('NEON ASTEROIDS', canvas.width / 2, 260);
        ctx.font = '400 16px Outfit, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText('Press Space or Arrow Keys to Engage', canvas.width / 2, 310);
    } else if (gameState === STATE_GAMEOVER) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ff0055';
        ctx.font = '800 36px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SHIP DESTROYED', canvas.width / 2, 250);
        ctx.font = '600 18px Outfit, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(`Final Score: ${score}`, canvas.width / 2, 295);
        ctx.fillText(`Best Score: ${highScore}`, canvas.width / 2, 325);
        ctx.fillText('Press Space to Restart', canvas.width / 2, 370);
    }
}

// --- Controls Listener ---
window.addEventListener('keydown', e => {
    initAudio();
    keys[e.key] = true;

    if (e.code === 'Space') {
        e.preventDefault();
        if (gameState !== STATE_PLAYING) {
            resetGame();
            return;
        }

        const now = Date.now();
        if (now - lastShotTime > 160) {
            Sound.laser();
            bullets.push({
                x: ship.x + Math.cos(ship.angle) * ship.r * 1.4,
                y: ship.y + Math.sin(ship.angle) * ship.r * 1.4,
                vx: Math.cos(ship.angle) * 10 + ship.vx,
                vy: Math.sin(ship.angle) * 10 + ship.vy,
                life: 60
            });
            lastShotTime = now;
        }
    }

    // Emergency Hyperspace Teleport
    if ((e.key === 'Shift' || e.code === 'ShiftLeft') && gameState === STATE_PLAYING) {
        hyperspaceTeleport();
    }
});

window.addEventListener('keyup', e => keys[e.key] = false);

// --- Game Loop ---
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}
gameLoop();