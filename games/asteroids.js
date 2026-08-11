// Detect if primary input is touch
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('gameWrapper');

// --- Logical resolution (all game logic uses this space) ---
const LOGICAL_W = 600;
const LOGICAL_H = 600;

// --- Responsive / DPR-aware scaling ---
let dprScale = 1;
function resize() {
    const rect = wrapper.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.max(1, Math.round(rect.width * dpr));
    const targetH = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
    }
    dprScale = targetW / LOGICAL_W;
    ctx.setTransform(dprScale, 0, 0, dprScale, 0, 0);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 100));
resize();

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
    enemyLaser() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.15);
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
    },
    powerup() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.setValueAtTime(500, now + 0.08);
        osc.frequency.setValueAtTime(800, now + 0.16);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.28);
    },
    wave() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(660, now + 0.1);
        osc.frequency.setValueAtTime(880, now + 0.2);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.3);
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
let survivalTime = 0; // Elapsed Game Time in Seconds

const ship = {
    x: LOGICAL_W / 2,
    y: LOGICAL_H / 2,
    r: 12,
    angle: -Math.PI / 2,
    rotationSpeed: 0.085,
    vx: 0,
    vy: 0,
    thrust: 0.14,
    friction: 0.988,
    isThrusting: false,
    invulnerableTimer: 0,
    shieldTimer: 0,
    tripleShotTimer: 0,
    rapidFireTimer: 0
};

let bullets = [];
let enemyBullets = [];
let asteroids = [];
let powerups = [];
let particles = [];
let enemyShip = null;
let enemySpawnTimer = 0;
let lastShotTime = 0;
const keys = {};

// --- Pause state ---
let paused = false;

// --- Screen shake ---
let shake = { x: 0, y: 0, power: 0 };

// --- Wave banner ---
let waveBanner = { text: '', timer: 0 };

// --- Starfield ---
let stars = [];
function generateStars() {
    stars = [];
    for (let i = 0; i < 70; i++) {
        stars.push({
            x: Math.random() * LOGICAL_W,
            y: Math.random() * LOGICAL_H,
            speed: 0.2 + Math.random() * 0.8,
            size: Math.random() < 0.2 ? 2 : 1,
            alpha: 0.3 + Math.random() * 0.7
        });
    }
}
generateStars();

// --- Touch state (virtual joystick + fire zone) ---
const touchState = {
    joystick: { active: false, pointerId: null, baseX: 0, baseY: 0, dx: 0, dy: 0 },
    fire: { active: false, pointerId: null },
    hyperspace: { active: false, pointerId: null }
};

const POWERUP_TYPES = [
    { type: 'shield', color: '#00f2fe', label: '🛡️ SHIELD', duration: 360 },
    { type: 'triple', color: '#a855f7', label: '⚡ TRIPLE', duration: 360 },
    { type: 'rapid', color: '#eab308', label: '🔥 RAPID', duration: 360 },
    { type: 'life', color: '#ef4444', label: '❤️ LIFE', duration: 0 }
];

function wrapBounds(obj, radius = 0) {
    if (obj.x < -radius) obj.x = LOGICAL_W + radius;
    if (obj.x > LOGICAL_W + radius) obj.x = -radius;
    if (obj.y < -radius) obj.y = LOGICAL_H + radius;
    if (obj.y > LOGICAL_H + radius) obj.y = -radius;
}

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
        x: x !== undefined ? x : (Math.random() < 0.5 ? 0 : LOGICAL_W),
        y: y !== undefined ? y : Math.random() * LOGICAL_H,
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

function spawnEnemyShip() {
    const side = Math.random() < 0.5 ? 0 : LOGICAL_W;
    enemyShip = {
        x: side,
        y: Math.random() * (LOGICAL_H - 100) + 50,
        r: 16,
        vx: side === 0 ? 2 : -2,
        vy: (Math.random() - 0.5) * 1.5,
        fireTimer: 60,
        changeDirTimer: 120
    };
}

function trySpawnPowerup(x, y) {
    if (Math.random() < 0.25) {
        const pDef = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
        const angle = Math.random() * Math.PI * 2;
        powerups.push({
            x, y,
            vx: Math.cos(angle) * 0.6,
            vy: Math.sin(angle) * 0.6,
            r: 10,
            life: 450,
            type: pDef.type,
            color: pDef.color,
            label: pDef.label,
            duration: pDef.duration
        });
    }
}

function createWave() {
    asteroids = [];
    powerups = [];
    enemyShip = null;
    const count = 4 + wave;
    for (let i = 0; i < count; i++) {
        let x, y, dist;
        do {
            x = Math.random() * LOGICAL_W;
            y = Math.random() * LOGICAL_H;
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
    survivalTime = 0;
    ship.x = LOGICAL_W / 2;
    ship.y = LOGICAL_H / 2;
    ship.vx = 0;
    ship.vy = 0;
    ship.angle = -Math.PI / 2;
    ship.invulnerableTimer = 120;
    ship.shieldTimer = 0;
    ship.tripleShotTimer = 0;
    ship.rapidFireTimer = 0;
    bullets = [];
    enemyBullets = [];
    powerups = [];
    particles = [];
    enemyShip = null;
    enemySpawnTimer = 300;
    shake.power = 0;
    waveBanner.timer = 0;
    touchState.joystick.active = false;
    touchState.fire.active = false;
    touchState.hyperspace.active = false;
    createWave();
    gameState = STATE_PLAYING;
}

function hyperspaceTeleport() {
    addExplosion(ship.x, ship.y, '#00f2fe', 12);
    Sound.teleport();
    ship.x = Math.random() * LOGICAL_W;
    ship.y = Math.random() * LOGICAL_H;
    ship.vx = 0;
    ship.vy = 0;
    ship.invulnerableTimer = 60;
    addExplosion(ship.x, ship.y, '#00f2fe', 12);
}

function fireBullets() {
    Sound.laser();
    const speed = 10;

    if (ship.tripleShotTimer > 0) {
        [-0.25, 0, 0.25].forEach(offsetAngle => {
            const finalAngle = ship.angle + offsetAngle;
            bullets.push({
                x: ship.x + Math.cos(finalAngle) * ship.r * 1.4,
                y: ship.y + Math.sin(finalAngle) * ship.r * 1.4,
                vx: Math.cos(finalAngle) * speed + ship.vx,
                vy: Math.sin(finalAngle) * speed + ship.vy,
                life: 60
            });
        });
    } else {
        bullets.push({
            x: ship.x + Math.cos(ship.angle) * ship.r * 1.4,
            y: ship.y + Math.sin(ship.angle) * ship.r * 1.4,
            vx: Math.cos(ship.angle) * speed + ship.vx,
            vy: Math.sin(ship.angle) * speed + ship.vy,
            life: 60
        });
    }
}

function formatTime(seconds) {
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(Math.floor(seconds % 60)).padStart(2, '0');
    return `${mm}:${ss}`;
}

// --- Pause control ---
function setPaused(value) {
    paused = value;
    const overlay = document.getElementById('pauseOverlay');
    const pauseBtn = document.getElementById('pauseBtn');
    if (overlay) overlay.classList.toggle('show', paused);
    if (pauseBtn) pauseBtn.classList.toggle('active', paused);
}

function togglePause() {
    if (gameState !== STATE_PLAYING) return;
    setPaused(!paused);
}

// --- Logic Update ---
function update() {
    if (gameState !== STATE_PLAYING || paused) return;

    // Starfield scroll
    stars.forEach(s => {
        s.y += s.speed;
        if (s.y > LOGICAL_H) {
            s.y = -2;
            s.x = Math.random() * LOGICAL_W;
        }
    });

    // Keyboard rotation
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) ship.angle -= ship.rotationSpeed;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) ship.angle += ship.rotationSpeed;

    // Joystick rotation (touch)
if (isTouchDevice && touchState.joystick.active) {
    const j = touchState.joystick;
    const deadzone = 8;
    if (Math.abs(j.dx) > deadzone) {
        // Reduced sensitivity from (j.dx / 40) to (j.dx / 90) for smoother steering
        ship.angle += (j.dx / 70) * ship.rotationSpeed;
    }
}

    // Keyboard thrust
    ship.isThrusting = keys['ArrowUp'] || keys['w'] || keys['W'];

    // Joystick thrust (touch)
    if (touchState.joystick.active && touchState.joystick.dy < -8) {
        ship.isThrusting = true;
    }

    if (ship.isThrusting) {
        ship.vx += Math.cos(ship.angle) * ship.thrust;
        ship.vy += Math.sin(ship.angle) * ship.thrust;

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

    ship.vx *= ship.friction;
    ship.vy *= ship.friction;
    ship.x += ship.vx;
    ship.y += ship.vy;
    wrapBounds(ship, ship.r);

    if (ship.invulnerableTimer > 0) ship.invulnerableTimer--;
    if (ship.shieldTimer > 0) ship.shieldTimer--;
    if (ship.tripleShotTimer > 0) ship.tripleShotTimer--;
    if (ship.rapidFireTimer > 0) ship.rapidFireTimer--;

    // Auto-fire while holding fire zone or Space
    const fireCooldown = ship.rapidFireTimer > 0 ? 80 : 160;
    if (touchState.fire.active || keys[' '] || keys['Space']) {
        const now = Date.now();
        if (now - lastShotTime > fireCooldown) {
            fireBullets();
            lastShotTime = now;
        }
    }

    // Enemy Ship Spawning Logic (After Wave 1)
    if (wave > 1 && !enemyShip) {
        enemySpawnTimer--;
        if (enemySpawnTimer <= 0) {
            spawnEnemyShip();
            enemySpawnTimer = 600 + Math.random() * 400;
        }
    }

    // Update Enemy Ship & Shooting
    if (enemyShip) {
        enemyShip.x += enemyShip.vx;
        enemyShip.y += enemyShip.vy;

        enemyShip.changeDirTimer--;
        if (enemyShip.changeDirTimer <= 0) {
            enemyShip.vy = (Math.random() - 0.5) * 2;
            enemyShip.changeDirTimer = 120;
        }

        // Despawn Enemy Ship if it leaves bounds
        if (enemyShip.x < -30 || enemyShip.x > LOGICAL_W + 30) {
            enemyShip = null;
        } else {
            enemyShip.fireTimer--;
            if (enemyShip.fireTimer <= 0) {
                Sound.enemyLaser();
                const angle = Math.atan2(ship.y - enemyShip.y, ship.x - enemyShip.x) + (Math.random() - 0.5) * 0.3;
                enemyBullets.push({
                    x: enemyShip.x,
                    y: enemyShip.y,
                    vx: Math.cos(angle) * 6,
                    vy: Math.sin(angle) * 6,
                    life: 90
                });
                enemyShip.fireTimer = 90;
            }
        }
    }

    // Update Player Bullets
    bullets = bullets.filter(b => {
        b.x += b.vx;
        b.y += b.vy;
        b.life--;
        wrapBounds(b);
        return b.life > 0;
    });

    // Update Enemy Bullets
    enemyBullets = enemyBullets.filter(eb => {
        eb.x += eb.vx;
        eb.y += eb.vy;
        eb.life--;
        wrapBounds(eb);

        // Enemy Bullet vs Player Ship Collision
        if (ship.invulnerableTimer <= 0 && ship.shieldTimer <= 0) {
            const dist = Math.hypot(ship.x - eb.x, ship.y - eb.y);
            if (dist < ship.r) {
                lives--;
                Sound.explosion(0.6);
                addExplosion(ship.x, ship.y, '#00f2fe', 25);
                shake.power = 6;

                if (lives <= 0) gameState = STATE_GAMEOVER;
                else {
                    ship.x = LOGICAL_W / 2;
                    ship.y = LOGICAL_H / 2;
                    ship.vx = 0; ship.vy = 0;
                    ship.angle = -Math.PI / 2;
                    ship.invulnerableTimer = 120;
                }
                return false;
            }
        }
        return eb.life > 0;
    });

    // Update Asteroids
    asteroids.forEach(a => {
        a.x += a.vx;
        a.y += a.vy;
        a.rotAngle += a.rotSpeed;
        wrapBounds(a, a.r);
    });

    // Update Powerups
    powerups = powerups.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        wrapBounds(p, p.r);

        const dist = Math.hypot(ship.x - p.x, ship.y - p.y);
        if (dist < ship.r + p.r) {
            Sound.powerup();
            addExplosion(p.x, p.y, p.color, 12);

            if (p.type === 'shield') ship.shieldTimer = p.duration;
            if (p.type === 'triple') ship.tripleShotTimer = p.duration;
            if (p.type === 'rapid') ship.rapidFireTimer = p.duration;
            if (p.type === 'life') lives++;

            return false;
        }
        return p.life > 0;
    });

    if (asteroids.length === 0) {
        wave++;
        ship.invulnerableTimer = 60;
        createWave();
        waveBanner.text = `WAVE ${wave}`;
        waveBanner.timer = 90;
        Sound.wave();
    }

    // Player Bullets vs Enemy Ship & Asteroids
    bullets = bullets.filter(b => {
        let hit = false;

        // Player Bullet vs Enemy Ship
        if (enemyShip) {
            const distEnemy = Math.hypot(b.x - enemyShip.x, b.y - enemyShip.y);
            if (distEnemy < enemyShip.r) {
                hit = true;
                Sound.explosion(1.5);
                addExplosion(enemyShip.x, enemyShip.y, '#ef4444', 20);
                score += 200;
                trySpawnPowerup(enemyShip.x, enemyShip.y);
                enemyShip = null;
                return false;
            }
        }

        // Player Bullet vs Asteroids
        for (let i = asteroids.length - 1; i >= 0; i--) {
            const a = asteroids[i];
            const dist = Math.hypot(b.x - a.x, b.y - a.y);

            if (dist < a.r) {
                hit = true;
                Sound.explosion(4 - a.level);
                addExplosion(a.x, a.y, a.color, 12);
                shake.power = Math.max(shake.power, 2);

                score += (4 - a.level) * 20;
                if (score > highScore) {
                    highScore = score;
                    localStorage.setItem('asteroids_highscore', highScore);
                }

                trySpawnPowerup(a.x, a.y);

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
    if (ship.invulnerableTimer <= 0 && ship.shieldTimer <= 0) {
        for (let i = 0; i < asteroids.length; i++) {
            const a = asteroids[i];
            const dist = Math.hypot(ship.x - a.x, ship.y - a.y);

            if (dist < ship.r + a.r * 0.85) {
                lives--;
                Sound.explosion(0.6);
                addExplosion(ship.x, ship.y, '#00f2fe', 25);
                shake.power = 6;

                if (lives <= 0) {
                    gameState = STATE_GAMEOVER;
                } else {
                    ship.x = LOGICAL_W / 2;
                    ship.y = LOGICAL_H / 2;
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

    // Decay screen shake
    if (shake.power > 0) {
        shake.power *= 0.85;
        if (shake.power < 0.3) shake.power = 0;
    }

    // Decay wave banner
    if (waveBanner.timer > 0) waveBanner.timer--;
}

function drawTouchControls() {
    if (gameState !== STATE_PLAYING || !isTouchDevice) return;

    // Fire zone indicator (right half)
    ctx.strokeStyle = 'rgba(255, 0, 85, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(LOGICAL_W * 0.78, LOGICAL_H * 0.82, 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = touchState.fire.active ? 'rgba(255, 0, 85, 0.25)' : 'rgba(255, 0, 85, 0.08)';
    ctx.fill();
    ctx.fillStyle = touchState.fire.active ? '#ff0055' : 'rgba(255, 255, 255, 0.6)';
    ctx.font = '800 14px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FIRE', LOGICAL_W * 0.78, LOGICAL_H * 0.82 + 5);

    // Hyperspace button (top-right)
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(LOGICAL_W - 45, 55, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = touchState.hyperspace.active ? 'rgba(167, 139, 250, 0.3)' : 'rgba(167, 139, 250, 0.1)';
    ctx.fill();
    ctx.fillStyle = '#a78bfa';
    ctx.font = '800 11px Outfit, sans-serif';
    ctx.fillText('WARP', LOGICAL_W - 45, 59);

    // Joystick (left half)
    if (touchState.joystick.active) {
        const j = touchState.joystick;
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(j.baseX, j.baseY, 40, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(0, 242, 254, 0.25)';
        ctx.beginPath();
        ctx.arc(j.baseX + j.dx, j.baseY + j.dy, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.7)';
        ctx.stroke();
    }
}

// --- Drawing Functions ---
function drawShip() {
    if (ship.invulnerableTimer > 0 && Math.floor(ship.invulnerableTimer / 6) % 2 === 0) return;

    ctx.save();
    ctx.translate(ship.x, ship.y);

    if (ship.shieldTimer > 0) {
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#00f2fe';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(0, 0, ship.r * 1.8, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.rotate(ship.angle);

    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.moveTo(ship.r * 1.4, 0);
    ctx.lineTo(-ship.r, -ship.r * 0.85);
    ctx.lineTo(-ship.r * 0.4, 0);
    ctx.lineTo(-ship.r, ship.r * 0.85);
    ctx.closePath();
    ctx.stroke();

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

function drawEnemyShip() {
    if (!enemyShip) return;

    ctx.save();
    ctx.translate(enemyShip.x, enemyShip.y);

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 12;

    // Saucer / UFO Shape
    ctx.beginPath();
    ctx.ellipse(0, 0, enemyShip.r, enemyShip.r * 0.5, 0, 0, Math.PI * 2);
    ctx.moveTo(-enemyShip.r * 0.6, -enemyShip.r * 0.2);
    ctx.ellipse(0, -enemyShip.r * 0.2, enemyShip.r * 0.5, enemyShip.r * 0.4, 0, Math.PI, 0);
    ctx.stroke();

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

function drawPowerups() {
    powerups.forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);

        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;

        ctx.beginPath();
        ctx.arc(0, 0, p.r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.font = '10px Outfit, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(p.label.split(' ')[0], 0, 3);

        ctx.restore();
    });
}

function drawActivePowerupBars() {
    let yOffset = 50;
    const active = [];

    if (ship.shieldTimer > 0) active.push({ label: 'SHIELD', val: ship.shieldTimer / 360, color: '#00f2fe' });
    if (ship.tripleShotTimer > 0) active.push({ label: 'TRIPLE', val: ship.tripleShotTimer / 360, color: '#a855f7' });
    if (ship.rapidFireTimer > 0) active.push({ label: 'RAPID', val: ship.rapidFireTimer / 360, color: '#eab308' });

    active.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.font = '600 12px Outfit, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(p.label, 20, yOffset);

        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(75, yOffset - 9, 80, 8);

        ctx.fillStyle = p.color;
        ctx.fillRect(75, yOffset - 9, 80 * p.val, 8);

        yOffset += 16;
    });
}

// Draw virtual joystick + fire zone + hyperspace button (touch controls)
function drawTouchControls() {
    if (gameState !== STATE_PLAYING) return;

    // Fire zone indicator (right half)
    ctx.strokeStyle = 'rgba(255, 0, 85, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(LOGICAL_W * 0.78, LOGICAL_H * 0.82, 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = touchState.fire.active ? 'rgba(255, 0, 85, 0.25)' : 'rgba(255, 0, 85, 0.08)';
    ctx.fill();
    ctx.fillStyle = touchState.fire.active ? '#ff0055' : 'rgba(255, 255, 255, 0.6)';
    ctx.font = '800 14px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FIRE', LOGICAL_W * 0.78, LOGICAL_H * 0.82 + 5);

    // Hyperspace button (top-right)
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(LOGICAL_W - 45, 55, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = touchState.hyperspace.active ? 'rgba(167, 139, 250, 0.3)' : 'rgba(167, 139, 250, 0.1)';
    ctx.fill();
    ctx.fillStyle = '#a78bfa';
    ctx.font = '800 11px Outfit, sans-serif';
    ctx.fillText('WARP', LOGICAL_W - 45, 59);

    // Joystick (left half)
    if (touchState.joystick.active) {
        const j = touchState.joystick;
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(j.baseX, j.baseY, 40, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(0, 242, 254, 0.25)';
        ctx.beginPath();
        ctx.arc(j.baseX + j.dx, j.baseY + j.dy, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.7)';
        ctx.stroke();
    }
}

function draw() {
    ctx.save();
    ctx.setTransform(dprScale, 0, 0, dprScale, 0, 0);

    // Apply screen shake
    if (shake.power > 0) {
        shake.x = (Math.random() - 0.5) * shake.power;
        shake.y = (Math.random() - 0.5) * shake.power;
        ctx.translate(shake.x, shake.y);
    }

    ctx.fillStyle = '#070913';
    ctx.fillRect(-10, -10, LOGICAL_W + 20, LOGICAL_H + 20);

    // Draw Starfield
    stars.forEach(s => {
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(s.x, s.y, s.size, s.size);
    });
    ctx.globalAlpha = 1;

    drawAsteroids();
    drawPowerups();
    drawEnemyShip();
    if (gameState === STATE_PLAYING || gameState === STATE_START) drawShip();

    // Draw Player Bullets
    ctx.fillStyle = ship.tripleShotTimer > 0 ? '#a855f7' : '#00f2fe';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
    bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw Enemy Bullets
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#ef4444';
    enemyBullets.forEach(eb => {
        ctx.beginPath();
        ctx.arc(eb.x, eb.y, 3, 0, Math.PI * 2);
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

    // Draw Touch Controls (joystick, fire, hyperspace)
    drawTouchControls();

    // --- Centered Top HUD Bar ---
    ctx.fillStyle = '#fff';
    ctx.font = '800 18px Outfit, sans-serif';
    ctx.textAlign = 'center';

    // Displays Centered Score, Survival Time, Lives, Wave
    const hudText = `SCORE: ${score}   |   TIME: ${formatTime(survivalTime)}   |   LIVES: ${lives}   |   WAVE: ${wave}`;
    ctx.fillText(hudText, LOGICAL_W / 2, 32);

    if (gameState === STATE_PLAYING) {
        drawActivePowerupBars();
    }

    // Wave Banner
    if (waveBanner.timer > 0) {
        const alpha = Math.min(1, waveBanner.timer / 20);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#00f2fe';
        ctx.font = '800 34px Outfit, sans-serif';
        ctx.fillText(waveBanner.text, LOGICAL_W / 2, 200);
        ctx.globalAlpha = 1;
    }

    // Overlays
    if (gameState === STATE_START) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
        ctx.fillStyle = '#00f2fe';
        ctx.font = '800 32px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('NEON ASTEROIDS', LOGICAL_W / 2, 250);
        ctx.font = '400 16px Outfit, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText('Press Space or Tap to Engage', LOGICAL_W / 2, 300);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 14px Outfit, sans-serif';
        ctx.fillText('Left: Joystick • Right: Fire', LOGICAL_W / 2, 330);
    } else if (gameState === STATE_GAMEOVER) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
        ctx.fillStyle = '#ff0055';
        ctx.font = '800 36px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SHIP DESTROYED', LOGICAL_W / 2, 230);
        ctx.font = '600 18px Outfit, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(`Final Score: ${score}`, LOGICAL_W / 2, 275);
        ctx.fillText(`Survived Time: ${formatTime(survivalTime)}`, LOGICAL_W / 2, 305);
        ctx.fillText(`Best Score: ${highScore}`, LOGICAL_W / 2, 335);
        ctx.fillText('Press Space or Tap to Restart', LOGICAL_W / 2, 385);
    }

    ctx.restore();
}

// Controls Listener
window.addEventListener('keydown', e => {
    initAudio();
    keys[e.key] = true;

    if (e.code === 'Space') {
        e.preventDefault();
        if (gameState !== STATE_PLAYING) {
            resetGame();
            return;
        }
    }

    if ((e.key === 'Shift' || e.code === 'ShiftLeft') && gameState === STATE_PLAYING) {
        hyperspaceTeleport();
    }

    if (e.code === 'KeyP' || e.code === 'Escape') {
        togglePause();
    }
});

window.addEventListener('keyup', e => keys[e.key] = false);

const canvasElement = document.getElementById('gameCanvas');

canvasElement.style.touchAction = 'none';

// Convert client coords to logical game coords
function toLogical(clientX, clientY) {
    const rect = canvasElement.getBoundingClientRect();
    return {
        x: (clientX - rect.left) / rect.width * LOGICAL_W,
        y: (clientY - rect.top) / rect.height * LOGICAL_H
    };
}

// Hyperspace button hit area (logical coords)
const HYPERSPACE_BTN = { x: LOGICAL_W - 45, y: 55, r: 30 };

canvasElement.addEventListener('pointerdown', e => {
    initAudio();
    if (gameState !== STATE_PLAYING) {
        resetGame();
        return;
    }
    if (paused) return;

    canvasElement.setPointerCapture(e.pointerId);
    const pos = toLogical(e.clientX, e.clientY);

    // Check hyperspace button first
    const distHyper = Math.hypot(pos.x - HYPERSPACE_BTN.x, pos.y - HYPERSPACE_BTN.y);
    if (distHyper < HYPERSPACE_BTN.r) {
        touchState.hyperspace.active = true;
        touchState.hyperspace.pointerId = e.pointerId;
        hyperspaceTeleport();
        return;
    }

    // Left half = joystick, right half = fire
    if (pos.x < LOGICAL_W / 2) {
        if (!touchState.joystick.active) {
            touchState.joystick.active = true;
            touchState.joystick.pointerId = e.pointerId;
            touchState.joystick.baseX = pos.x;
            touchState.joystick.baseY = pos.y;
            touchState.joystick.dx = 0;
            touchState.joystick.dy = 0;
        }
    } else {
        if (!touchState.fire.active) {
            touchState.fire.active = true;
            touchState.fire.pointerId = e.pointerId;
        }
    }
});

canvasElement.addEventListener('pointermove', e => {
    const pos = toLogical(e.clientX, e.clientY);

    if (touchState.joystick.active && e.pointerId === touchState.joystick.pointerId) {
        e.preventDefault();
        let dx = pos.x - touchState.joystick.baseX;
        let dy = pos.y - touchState.joystick.baseY;
        const maxDist = 40;
        const dist = Math.hypot(dx, dy);
        if (dist > maxDist) {
            dx = dx / dist * maxDist;
            dy = dy / dist * maxDist;
        }
        touchState.joystick.dx = dx;
        touchState.joystick.dy = dy;
    }
});

canvasElement.addEventListener('pointerup', e => {
    if (touchState.joystick.active && e.pointerId === touchState.joystick.pointerId) {
        e.preventDefault();
        canvasElement.releasePointerCapture(e.pointerId);
        touchState.joystick.active = false;
        touchState.joystick.pointerId = null;
        touchState.joystick.dx = 0;
        touchState.joystick.dy = 0;
    }
    if (touchState.fire.active && e.pointerId === touchState.fire.pointerId) {
        e.preventDefault();
        canvasElement.releasePointerCapture(e.pointerId);
        touchState.fire.active = false;
        touchState.fire.pointerId = null;
    }
    if (touchState.hyperspace.active && e.pointerId === touchState.hyperspace.pointerId) {
        e.preventDefault();
        canvasElement.releasePointerCapture(e.pointerId);
        touchState.hyperspace.active = false;
        touchState.hyperspace.pointerId = null;
    }
});

canvasElement.addEventListener('pointercancel', e => {
    if (touchState.joystick.active && e.pointerId === touchState.joystick.pointerId) {
        touchState.joystick.active = false;
        touchState.joystick.pointerId = null;
        touchState.joystick.dx = 0;
        touchState.joystick.dy = 0;
    }
    if (touchState.fire.active && e.pointerId === touchState.fire.pointerId) {
        touchState.fire.active = false;
        touchState.fire.pointerId = null;
    }
    if (touchState.hyperspace.active && e.pointerId === touchState.hyperspace.pointerId) {
        touchState.hyperspace.active = false;
        touchState.hyperspace.pointerId = null;
    }
});

canvasElement.addEventListener('pointerdown', e => {
    initAudio();
    if (gameState !== STATE_PLAYING) {
        resetGame();
        return;
    }
    if (paused) return;

    // Ignore pointer events for touch controls if desktop/mouse user
    if (!isTouchDevice) return;

    canvasElement.setPointerCapture(e.pointerId);
    const pos = toLogical(e.clientX, e.clientY);

    // Check hyperspace button first
    const distHyper = Math.hypot(pos.x - HYPERSPACE_BTN.x, pos.y - HYPERSPACE_BTN.y);
    if (distHyper < HYPERSPACE_BTN.r) {
        touchState.hyperspace.active = true;
        touchState.hyperspace.pointerId = e.pointerId;
        hyperspaceTeleport();
        return;
    }

    // Left half = joystick, right half = fire
    if (pos.x < LOGICAL_W / 2) {
        if (!touchState.joystick.active) {
            touchState.joystick.active = true;
            touchState.joystick.pointerId = e.pointerId;
            touchState.joystick.baseX = pos.x;
            touchState.joystick.baseY = pos.y;
            touchState.joystick.dx = 0;
            touchState.joystick.dy = 0;
        }
    } else {
        if (!touchState.fire.active) {
            touchState.fire.active = true;
            touchState.fire.pointerId = e.pointerId;
        }
    }
});

// --- Pause UI ---
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const restartBtn = document.getElementById('restartBtn');

if (pauseBtn) pauseBtn.addEventListener('click', togglePause);
if (resumeBtn) resumeBtn.addEventListener('click', () => setPaused(false));
if (restartBtn) restartBtn.addEventListener('click', () => {
    setPaused(false);
    resetGame();
});

// Auto-pause when tab loses focus
document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameState === STATE_PLAYING && !paused) {
        setPaused(true);
    }
});

// Survival Timer Incrementer
setInterval(() => {
    if (gameState === STATE_PLAYING && !paused) {
        survivalTime++;
    }
}, 1000);

// Game Loop
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}
gameLoop();