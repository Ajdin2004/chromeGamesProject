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
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    },
    explosion() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.25);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.25);
    },
    powerup() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.2);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.2);
    }
};

// --- Game Engine Variables ---
const STATE_START = 0;
const STATE_PLAYING = 1;
const STATE_GAMEOVER = 2;
let gameState = STATE_START;

let score = 0;
let highScore = parseInt(localStorage.getItem('invaders_highscore')) || 0;
let lives = 3;
let wave = 1;

const player = {
    x: canvas.width / 2 - 22,
    y: 530,
    w: 44,
    h: 30,
    speed: 6,
    color: '#00f2fe',
    tripleShotTimer: 0,
    shieldActive: false
};

let bullets = [];
let enemyBullets = [];
let invaders = [];
let particles = [];
let powerups = [];
let bunkers = [];

let invaderDirection = 1;
let invaderSpeed = 1;
let lastShotTime = 0;
let animationFrame = 0;
const keys = {};

const touchState = {
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    moved: false,
    downTime: 0
};

function resetInvadersTouchControls() {
    keys['ArrowLeft'] = false;
    keys['ArrowRight'] = false;
}

// --- Vector Graphics Rendering Helpers ---

// Render Player Spaceship
function drawPlayerShip(x, y, w, h, color) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;

    // Wing cannons & hull
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);                 // Cockpit Tip
    ctx.lineTo(w / 2 + 6, 12);
    ctx.lineTo(w - 4, 18);
    ctx.lineTo(w, 24);                    // Right Wing Cannon Tip
    ctx.lineTo(w - 8, 28);
    ctx.lineTo(w / 2 + 8, 22);
    ctx.lineTo(w / 2, 28);                // Engine Core Center
    ctx.lineTo(w / 2 - 8, 22);
    ctx.lineTo(8, 28);
    ctx.lineTo(0, 24);                    // Left Wing Cannon Tip
    ctx.lineTo(4, 18);
    ctx.lineTo(w / 2 - 6, 12);
    ctx.closePath();
    ctx.fill();

    // Glowing Cockpit Canopy
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(w / 2, 10, 3, 0, Math.PI * 2);
    ctx.fill();

    // Thruster Flame Effect
    if (gameState === STATE_PLAYING) {
        ctx.fillStyle = '#ff0080';
        ctx.beginPath();
        ctx.moveTo(w / 2 - 5, 26);
        ctx.lineTo(w / 2, 26 + (Math.random() * 8 + 4));
        ctx.lineTo(w / 2 + 5, 26);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
}

// Render Alien Invader Ship Types
function drawInvaderShip(x, y, w, h, type, color, frame) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;

    ctx.beginPath();
    if (type === 0) { // Top Row: Squiddly Scout
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w - 4, 6);
        ctx.lineTo(w - 2, 14);
        ctx.lineTo(w - 8, 16);
        ctx.lineTo(w, 22 + (frame ? 2 : 0));
        ctx.lineTo(w - 10, 18);
        ctx.lineTo(w / 2, 22);
        ctx.lineTo(10, 18);
        ctx.lineTo(0, 22 + (frame ? 2 : 0));
        ctx.lineTo(8, 16);
        ctx.lineTo(2, 14);
        ctx.lineTo(4, 6);
    } else if (type === 1) { // Middle Rows: Crab Fighter
        ctx.moveTo(8, 0);
        ctx.lineTo(w - 8, 0);
        ctx.lineTo(w, 8);
        ctx.lineTo(w - 4, 16);
        ctx.lineTo(w, 22 - (frame ? 2 : 0));
        ctx.lineTo(w - 10, 16);
        ctx.lineTo(w / 2, 20);
        ctx.lineTo(10, 16);
        ctx.lineTo(0, 22 - (frame ? 2 : 0));
        ctx.lineTo(4, 16);
        ctx.lineTo(0, 8);
    } else { // Bottom Row: Heavy Dreadnought
        ctx.moveTo(4, 0);
        ctx.lineTo(w - 4, 0);
        ctx.lineTo(w, 8);
        ctx.lineTo(w - 6, 12);
        ctx.lineTo(w - 2, 20);
        ctx.lineTo(w - 12, 18);
        ctx.lineTo(w / 2, 22);
        ctx.lineTo(12, 18);
        ctx.lineTo(2, 20);
        ctx.lineTo(6, 12);
        ctx.lineTo(0, 8);
    }
    ctx.closePath();
    ctx.fill();

    // Alien Eyes
    ctx.fillStyle = '#000000';
    ctx.fillRect(w / 2 - 8, 7, 4, 4);
    ctx.fillRect(w / 2 + 4, 7, 4, 4);

    ctx.restore();
}

// --- Initialization ---
function createInvaders() {
    invaders = [];
    const rows = 4;
    const cols = 8;
    const colors = ['#ff0080', '#a855f7', '#00f2fe', '#22c55e'];

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            invaders.push({
                x: 45 + c * 50,
                y: 50 + r * 40,
                w: 32,
                h: 22,
                type: r,
                color: colors[r % colors.length],
                points: (rows - r) * 10,
                alive: true
            });
        }
    }
}

function createBunkers() {
    bunkers = [];
    const bunkerCount = 3;
    const spacing = canvas.width / (bunkerCount + 1);

    for (let i = 1; i <= bunkerCount; i++) {
        bunkers.push({
            x: spacing * i - 30,
            y: 450,
            w: 60,
            h: 30,
            hp: 15
        });
    }
}

function resetGame() {
    score = 0;
    lives = 3;
    wave = 1;
    player.x = canvas.width / 2 - 22;
    player.tripleShotTimer = 0;
    player.shieldActive = false;
    bullets = [];
    enemyBullets = [];
    particles = [];
    powerups = [];
    invaderSpeed = 1;
    createInvaders();
    createBunkers();
    gameState = STATE_PLAYING;
}

// --- FX Spawners ---
function addExplosion(x, y, color) {
    for (let i = 0; i < 14; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            life: 25,
            color
        });
    }
}

function spawnPowerup(x, y) {
    const types = ['TRIPLE', 'SHIELD', 'EMP'];
    const type = types[Math.floor(Math.random() * types.length)];
    powerups.push({ x, y, type, vy: 2, id: Math.random() });
}

// --- Logic Update ---
function update() {
    if (gameState !== STATE_PLAYING) return;

    animationFrame++;

    // Player Movement
    if ((keys['ArrowLeft'] || keys['a'] || keys['A']) && player.x > 10) {
        player.x -= player.speed;
    }
    if ((keys['ArrowRight'] || keys['d'] || keys['D']) && player.x < canvas.width - player.w - 10) {
        player.x += player.speed;
    }

    if (player.tripleShotTimer > 0) player.tripleShotTimer--;

    // Update Player Bullets
    bullets = bullets.filter(b => {
        b.y -= 9;
        return b.y > -20;
    });

    // Update Enemy Bullets
    enemyBullets = enemyBullets.filter(eb => {
        eb.y += 4.5;

        // Player Hit Check
        if (
            eb.x > player.x && eb.x < player.x + player.w &&
            eb.y > player.y && eb.y < player.y + player.h
        ) {
            if (player.shieldActive) {
                player.shieldActive = false;
                Sound.powerup();
            } else {
                lives--;
                Sound.explosion();
                addExplosion(player.x + player.w / 2, player.y + player.h / 2, player.color);
                if (lives <= 0) gameState = STATE_GAMEOVER;
            }
            return false; // Remove projectile safely
        }
        return eb.y < canvas.height + 20;
    });

    // Update Invaders Movement
    let edgeHit = false;
    let activeInvaders = invaders.filter(inv => inv.alive);

    if (activeInvaders.length === 0) {
        wave++;
        invaderSpeed += 0.5;
        createInvaders();
        return;
    }

    activeInvaders.forEach(inv => {
        inv.x += invaderSpeed * invaderDirection;
        if (inv.x <= 15 || inv.x + inv.w >= canvas.width - 15) edgeHit = true;

        // Enemy Fire
        if (Math.random() < 0.001 + wave * 0.0005) {
            enemyBullets.push({ x: inv.x + inv.w / 2, y: inv.y + inv.h, id: Math.random() });
        }

        // Floor Collision
        if (inv.y + inv.h >= player.y) gameState = STATE_GAMEOVER;
    });

    if (edgeHit) {
        invaderDirection *= -1;
        invaders.forEach(inv => inv.y += 12);
    }

    // Bullet vs Invader Collisions (ROBUST ARRAY MUTATION PREVENTION)
    bullets = bullets.filter(b => {
        let hit = false;
        for (let j = 0; j < invaders.length; j++) {
            const inv = invaders[j];
            if (inv.alive && b.x > inv.x && b.x < inv.x + inv.w && b.y > inv.y && b.y < inv.y + inv.h) {
                inv.alive = false;
                hit = true;
                score += inv.points;
                Sound.explosion();
                addExplosion(inv.x + inv.w / 2, inv.y + inv.h / 2, inv.color);

                if (score > highScore) {
                    highScore = score;
                    localStorage.setItem('invaders_highscore', highScore);
                }

                if (Math.random() < 0.12) spawnPowerup(inv.x + inv.w / 2, inv.y);
                break;
            }
        }
        return !hit;
    });

    // Bullet vs Bunker Collisions
    bunkers.forEach(b => {
        if (b.hp <= 0) return;
        
        bullets = bullets.filter(proj => {
            if (proj.x > b.x && proj.x < b.x + b.w && proj.y > b.y && proj.y < b.y + b.h) {
                b.hp--; return false;
            }
            return true;
        });

        enemyBullets = enemyBullets.filter(proj => {
            if (proj.x > b.x && proj.x < b.x + b.w && proj.y > b.y && proj.y < b.y + b.h) {
                b.hp--; return false;
            }
            return true;
        });
    });

    // Update Powerups
    powerups = powerups.filter(p => {
        p.y += p.vy;
        if (p.x > player.x && p.x < player.x + player.w && p.y > player.y && p.y < player.y + player.h) {
            Sound.powerup();
            if (p.type === 'TRIPLE') player.tripleShotTimer = 300;
            if (p.type === 'SHIELD') player.shieldActive = true;
            if (p.type === 'EMP') {
                invaders.forEach(inv => {
                    if (inv.alive && Math.random() < 0.4) {
                        inv.alive = false;
                        score += inv.points;
                        addExplosion(inv.x, inv.y, inv.color);
                    }
                });
            }
            return false;
        }
        return p.y <= canvas.height;
    });

    // Update Particles
    particles = particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        return p.life > 0;
    });
}

// --- Drawing ---
function draw() {
    ctx.fillStyle = '#0d0614';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Player Ship
    drawPlayerShip(player.x, player.y, player.w, player.h, player.color);

    if (player.shieldActive) {
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#00f2fe';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(player.x + player.w / 2, player.y + player.h / 2, 32, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // Draw Invaders
    const frameToggle = Math.floor(animationFrame / 20) % 2 === 0;
    invaders.forEach(inv => {
        if (!inv.alive) return;
        drawInvaderShip(inv.x, inv.y, inv.w, inv.h, inv.type, inv.color, frameToggle);
    });

    // Draw Bunkers
    bunkers.forEach(b => {
        if (b.hp <= 0) return;
        ctx.fillStyle = `rgba(0, 242, 254, ${b.hp / 15})`;
        ctx.shadowColor = '#00f2fe';
        ctx.shadowBlur = 4;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.shadowBlur = 0;
    });

    // Draw Player Bullets
    ctx.fillStyle = '#00f2fe';
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 8;
    bullets.forEach(b => ctx.fillRect(b.x - 2, b.y, 4, 12));

    // Draw Enemy Bullets
    ctx.fillStyle = '#ff0055';
    ctx.shadowColor = '#ff0055';
    enemyBullets.forEach(eb => ctx.fillRect(eb.x - 2, eb.y, 4, 12));
    ctx.shadowBlur = 0;

    // Draw Powerups
    powerups.forEach(p => {
        ctx.fillStyle = '#facc15';
        ctx.font = '800 12px Outfit, sans-serif';
        ctx.fillText(p.type, p.x - 18, p.y);
    });

    // Draw Particles
    particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 3, 3);
    });

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = '800 18px Outfit, sans-serif';
    ctx.fillText(`SCORE: ${score}`, 20, 30);
    ctx.fillText(`LIVES: ${lives}`, canvas.width - 100, 30);
    ctx.fillText(`WAVE: ${wave}`, canvas.width / 2 - 30, 30);

    // Overlays
    if (gameState === STATE_START) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#00f2fe';
        ctx.font = '800 30px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('NEON SPACE INVADERS', canvas.width / 2, 260);
        ctx.font = '400 16px Outfit, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText('Press Space or Arrow Keys to Play', canvas.width / 2, 310);
    } else if (gameState === STATE_GAMEOVER) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ff0055';
        ctx.font = '800 36px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, 250);
        ctx.font = '600 18px Outfit, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(`Final Score: ${score}`, canvas.width / 2, 295);
        ctx.fillText(`Best Score: ${highScore}`, canvas.width / 2, 325);
        ctx.fillText('Press Space to Restart', canvas.width / 2, 370);
    }
}

// --- Controls ---
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
        if (now - lastShotTime > 200) {
            Sound.laser();
            if (player.tripleShotTimer > 0) {
                bullets.push({ x: player.x + player.w / 2 - 12, y: player.y, id: Math.random() });
                bullets.push({ x: player.x + player.w / 2, y: player.y, id: Math.random() });
                bullets.push({ x: player.x + player.w / 2 + 12, y: player.y, id: Math.random() });
            } else {
                bullets.push({ x: player.x + player.w / 2, y: player.y, id: Math.random() });
            }
            lastShotTime = now;
        }
    }
});

window.addEventListener('keyup', e => keys[e.key] = false);

const canvasElement = document.getElementById('gameCanvas');

canvasElement.style.touchAction = 'none';

canvasElement.addEventListener('pointerdown', e => {
    initAudio();
    if (gameState !== STATE_PLAYING) {
        resetGame();
        return;
    }

    canvasElement.setPointerCapture(e.pointerId);
    touchState.active = true;
    touchState.pointerId = e.pointerId;
    touchState.startX = e.clientX;
    touchState.startY = e.clientY;
    touchState.moved = false;
    touchState.downTime = Date.now();

    const rect = canvasElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    keys['ArrowLeft'] = x < rect.width / 2;
    keys['ArrowRight'] = x > rect.width / 2;
});

canvasElement.addEventListener('pointermove', e => {
    if (!touchState.active || e.pointerId !== touchState.pointerId) return;
    e.preventDefault();

    const rect = canvasElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    touchState.moved = Math.abs(e.clientX - touchState.startX) > 12 || Math.abs(e.clientY - touchState.startY) > 12;

    keys['ArrowLeft'] = x < rect.width / 2;
    keys['ArrowRight'] = x > rect.width / 2;
});

canvasElement.addEventListener('pointerup', e => {
    if (!touchState.active || e.pointerId !== touchState.pointerId) return;
    e.preventDefault();
    canvasElement.releasePointerCapture(e.pointerId);

    const duration = Date.now() - touchState.downTime;
    if (!touchState.moved && duration < 300 && gameState === STATE_PLAYING) {
        const now = Date.now();
        if (now - lastShotTime > 200) {
            Sound.laser();
            if (player.tripleShotTimer > 0) {
                bullets.push({ x: player.x + player.w / 2 - 12, y: player.y, id: Math.random() });
                bullets.push({ x: player.x + player.w / 2, y: player.y, id: Math.random() });
                bullets.push({ x: player.x + player.w / 2 + 12, y: player.y, id: Math.random() });
            } else {
                bullets.push({ x: player.x + player.w / 2, y: player.y, id: Math.random() });
            }
            lastShotTime = now;
        }
    }

    touchState.active = false;
    touchState.pointerId = null;
    resetInvadersTouchControls();
});

canvasElement.addEventListener('pointercancel', e => {
    if (touchState.active && e.pointerId === touchState.pointerId) {
        touchState.active = false;
        touchState.pointerId = null;
        resetInvadersTouchControls();
    }
});

// --- Loop ---
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}
gameLoop();