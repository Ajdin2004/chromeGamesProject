const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const highSpan = document.getElementById('highDisplay');

// ----- CONSTANTS -----
const GROUND_Y = 250;          // top of ground line
const GROUND_HEIGHT = 50;      // ground strip height
const DINO_X = 60;             // fixed dino x position
const GRAVITY = 0.65;          // standard gravity
const FAST_FALL_GRAVITY = 1.8; // stronger gravity applied when ducking mid-air
const JUMP_VELOCITY = -12.0;   // initial jump impulse
const CUT_JUMP_FACTOR = 0.45;  // velocity cut multiplier on early key release
const DUCK_HEIGHT = 28;        // dino height when ducking
const RUN_HEIGHT = 46;         // dino height when running
const DINO_WIDTH = 40;
const BASE_SPEED = 6;
const MAX_SPEED = 13;
const MIN_OBSTACLE_GAP = 200;  // minimum pixel gap between obstacles
const PTERODACTYL_MIN_DISTANCE = 500; // no pterodactyls before this distance
const FIXED_DT = 1000 / 60;    // 60Hz physics timestep
const NIGHT_CYCLE_DISTANCE = 2000;   
const NIGHT_TRANSITION_FRAMES = 90;  

// ----- STATES -----
const STATE_START = 0;
const STATE_PLAYING = 1;
const STATE_GAMEOVER = 2;
let gameState = STATE_START;
let score = 0;
let highScore = parseInt(localStorage.getItem('dino_highscore')) || 0;
highSpan.textContent = highScore;
let frameCount = 0;            
let speed = BASE_SPEED;
let distance = 0;

// ----- FIXED TIMESTEP ENGINE -----
let lastTime = 0;
let accumulator = 0;
let paused = false;
const MAX_FRAME_DELTA = 250;   

// ----- DAY/NIGHT -----
let nightT = 0;                
let nightTarget = 0;
function updateDayNight() {
    nightTarget = Math.floor(distance / NIGHT_CYCLE_DISTANCE) % 2 === 1 ? 1 : 0;
    const step = 1 / NIGHT_TRANSITION_FRAMES;
    if (nightT < nightTarget) nightT = Math.min(1, nightT + step);
    else if (nightT > nightTarget) nightT = Math.max(0, nightT - step);
}
function isNight() { return nightTarget === 1; }

// ----- PALETTE -----
function getColors() {
    const t = nightT;
    const lerp = (a, b) => Math.round(a + (b - a) * t);
    return {
        skyTop: `rgb(${lerp(247, 26)}, ${lerp(247, 26)}, ${lerp(247, 46)})`,
        skyBottom: `rgb(${lerp(247, 26)}, ${lerp(247, 26)}, ${lerp(247, 46)})`,
        ground: `rgb(${lerp(232, 52)}, ${lerp(232, 52)}, ${lerp(232, 77)})`,
        groundLine: `rgb(${lerp(83, 205)}, ${lerp(83, 205)}, ${lerp(83, 214)})`,
        texture: `rgb(${lerp(214, 130)}, ${lerp(214, 130)}, ${lerp(214, 158)})`,
        sprite: `rgb(${lerp(83, 205)}, ${lerp(83, 205)}, ${lerp(83, 214)})`,
        cloud: `rgba(${lerp(224, 180)}, ${lerp(224, 180)}, ${lerp(224, 190)}, ${lerp(1, 0.25)})`,
        textDark: `rgb(${lerp(83, 220)}, ${lerp(83, 220)}, ${lerp(83, 220)})`,
        textMuted: `rgb(${lerp(138, 200)}, ${lerp(138, 200)}, ${lerp(138, 220)})`
    };
}

// ----- AUDIO -----
let audioCtx = null;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}
const Sound = {
    jump() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(500, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    },
    score(milestone) {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const base = 880 + (milestone / 100 - 1) * 110;
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(base, now);
        osc.frequency.setValueAtTime(base * 1.25, now + 0.08);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.1);
    },
    hit() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.3);
    }
};

// ----- DINO -----
const dino = {
    y: GROUND_Y - RUN_HEIGHT,
    velocity: 0,
    ducking: false,
    downHeld: false,       
    jumpHeld: false,       
    isGrounded: true,
    dead: false,
    legFrame: 0,

    reset() {
        this.y = GROUND_Y - RUN_HEIGHT;
        this.velocity = 0;
        this.ducking = false;
        this.downHeld = false;
        this.jumpHeld = false;
        this.isGrounded = true;
        this.legFrame = 0;
        this.dead = false;
    },

    startJump() {
        if (this.isGrounded) {
            this.velocity = JUMP_VELOCITY;
            this.isGrounded = false;
            this.ducking = false;
            this.jumpHeld = true;
            Sound.jump();
        }
    },

    endJump() {
        this.jumpHeld = false;
        // If releasing jump mid-ascent, cut upward velocity short for short jumps
        if (this.velocity < 0) {
            this.velocity *= CUT_JUMP_FACTOR;
        }
    },

    duck(on) {
        this.downHeld = on;
        if (on && this.isGrounded) {
            this.ducking = true;
            this.y = GROUND_Y - DUCK_HEIGHT;
        } else if (!on) {
            this.ducking = false;
            if (this.isGrounded) {
                this.y = GROUND_Y - RUN_HEIGHT;
            }
        }
    },

    update() {
        // Fast-fall mechanic if ArrowDown is held while airborne
        const activeGravity = (!this.isGrounded && this.downHeld) ? FAST_FALL_GRAVITY : GRAVITY;
        this.velocity += activeGravity;
        this.y += this.velocity;

        const groundLevel = this.ducking ? GROUND_Y - DUCK_HEIGHT : GROUND_Y - RUN_HEIGHT;

        // Ground landing check
        if (this.y >= groundLevel) {
            this.y = groundLevel;
            this.velocity = 0;
            this.isGrounded = true;

            if (this.downHeld) {
                this.ducking = true;
                this.y = GROUND_Y - DUCK_HEIGHT;
            }
        } else {
            this.isGrounded = false;
        }

        if (this.y < 0) { 
            this.y = 0; 
            this.velocity = 0; 
        }

        if (gameState === STATE_PLAYING) this.legFrame++;
    },

    getBounds() {
        if (this.ducking) {
            return { x: DINO_X - 10, y: this.y, w: 50, h: DUCK_HEIGHT };
        }
        return { x: DINO_X - 12, y: this.y, w: 44, h: RUN_HEIGHT };
    },

    draw(palette) {
    ctx.save();
    if (this.dead) ctx.globalAlpha = 0.5;
    ctx.fillStyle = palette.sprite;

    const x = DINO_X - 18; // Offset slightly left to center the wider frame
    const y = this.y;

    if (this.ducking) {
        // ===== DUCKED T-REX =====
        // Tail
        ctx.fillRect(x - 14, y + 10, 14, 4);
        ctx.fillRect(x - 8, y + 14, 10, 4);

        // Extended Low Body
        ctx.fillRect(x - 2, y + 6, 36, 14);

        // Low Head & Snout
        ctx.fillRect(x + 30, y + 2, 22, 12);
        ctx.fillRect(x + 42, y + 10, 10, 3); // Open mouth

        // Eye
        ctx.fillStyle = palette.skyTop;
        ctx.fillRect(x + 38, y + 4, 3, 3);
        ctx.fillStyle = palette.sprite;

        // Legs
        const legStep = Math.floor(this.legFrame / 4) % 2 === 0;
        ctx.fillRect(x + 8, y + 20, 6, 8);
        ctx.fillRect(x + 24, y + 20, 6, 8);
        if (legStep) {
            ctx.fillRect(x + 4, y + 26, 8, 2);
        } else {
            ctx.fillRect(x + 20, y + 26, 8, 2);
        }
    } else {
        // ===== STANDING T-REX (Wider & Sturdier Build) =====
        
        // 1. WIDE HEAD & JAW (y: 0 to 16)
        ctx.fillRect(x + 28, y + 0, 28, 12);  // Main skull (widened to 28px)
        ctx.fillRect(x + 26, y + 15, 18, 4);  // Lower jaw (widened to 18px)
        ctx.fillRect(x + 42, y + 4, 4, 3);    // Snout tip

        // Eye
        ctx.fillStyle = palette.skyTop;
        ctx.fillRect(x + 38, y + 3, 4, 4);
        ctx.fillStyle = palette.sprite;

        // 2. THICK NECK & WIDE TORSO (y: 10 to 32)
        ctx.fillRect(x + 10, y + 10, 28, 22); // Main body (widened from 18px to 26px)

        // 3. THICK TAIL
        ctx.fillRect(x - 2, y + 14, 12, 10);  // Base tail attachment
        ctx.fillRect(x - 10, y + 18, 8, 8);
        ctx.fillRect(x - 16, y + 22, 6, 5);

        // 4. ARM
        ctx.fillRect(x + 38, y + 18, 8, 5);   // Arm extended slightly
        ctx.fillRect(x + 36, y + 20, 2, 6);

        // 5. STURDY LEGS & FEET (y: 32 to 46)
        if (!this.isGrounded) {
            // Jump Pose
            ctx.fillRect(x + 12, y + 32, 7, 8);
            ctx.fillRect(x + 22, y + 32, 7, 6);
            ctx.fillRect(x + 22, y + 32, 7, 2);
        } else {
            // Running Legs
            const legStep = Math.floor(this.legFrame / 4) % 2 === 0;
            if (legStep) {
                ctx.fillRect(x + 12, y + 32, 7, 10);
                ctx.fillRect(x + 10, y + 42, 12, 4); // Wider foot base

                ctx.fillRect(x + 24, y + 32, 7, 5);
                ctx.fillRect(x + 28, y + 37, 5, 5);
            } else {
                ctx.fillRect(x + 12, y + 32, 7, 5);
                ctx.fillRect(x + 10, y + 37, 5, 5);

                ctx.fillRect(x + 24, y + 32, 7, 10);
                ctx.fillRect(x + 22, y + 42, 12, 4); // Wider foot base
            }
        }
    }
    ctx.restore();
}
};

// ----- OBSTACLES -----
let obstacles = [];
let spawnTimer = 0;

function spawnObstacle() {
    const r = Math.random();
    let type, w, h, y;
    const pterodactylUnlocked = distance > PTERODACTYL_MIN_DISTANCE;
    const roll = pterodactylUnlocked ? r : r * 0.85;

    if (roll < 0.55) {
        type = 'small-cactus';
        w = 16; h = 32;
        y = GROUND_Y - h;
    } else if (roll < 0.85) {
        type = 'large-cactus';
        w = 24; h = 48;
        y = GROUND_Y - h;
    } else {
        type = 'pterodactyl';
        w = 40; h = 26;
        const alt = Math.random();
        if (alt < 0.4) y = GROUND_Y - 55;
        else if (alt < 0.7) y = GROUND_Y - 90;
        else y = GROUND_Y - 130;
    }
    obstacles.push({ type, x: canvas.width + 20, w, h, y, passed: false });
}

function updateObstacles() {
    spawnTimer--;
    if (spawnTimer <= 0) {
        const lastX = obstacles.length > 0 ? obstacles[obstacles.length - 1].x : -Infinity;
        if (canvas.width + 20 - lastX >= MIN_OBSTACLE_GAP) {
            spawnObstacle();
        }
        const gapFrames = Math.floor((55 + Math.random() * 55) * (BASE_SPEED / speed));
        spawnTimer = Math.max(35, Math.min(110, gapFrames));
    }
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        o.x -= speed;
        if (o.x + o.w < 0) obstacles.splice(i, 1);
    }
}

function checkCollision() {
    const db = dino.getBounds();
    for (const o of obstacles) {
        const d = { x: db.x + 4, y: db.y + 4, w: db.w - 8, h: db.h - 8 };
        const ob = { x: o.x + 4, y: o.y + 4, w: o.w - 8, h: o.h - 8 };
        if (d.x < ob.x + ob.w && d.x + d.w > ob.x && d.y < ob.y + ob.h && d.y + d.h > ob.y) {
            return true;
        }
    }
    return false;
}

function drawObstacles(palette) {
    obstacles.forEach(o => {
        ctx.fillStyle = palette.sprite;
        if (o.type === 'small-cactus') {
            ctx.fillRect(o.x + 4, o.y, 8, o.h);
            ctx.fillRect(o.x, o.y + 8, 4, 12);
            ctx.fillRect(o.x + 12, o.y + 12, 4, 10);
        } else if (o.type === 'large-cactus') {
            ctx.fillRect(o.x + 6, o.y, 12, o.h);
            ctx.fillRect(o.x, o.y + 10, 6, 16);
            ctx.fillRect(o.x + 18, o.y + 14, 6, 14);
            ctx.fillRect(o.x + 2, o.y + 4, 4, 8);
        } else if (o.type === 'pterodactyl') {
            ctx.fillRect(o.x + 8, o.y + 8, 20, 10);
            ctx.fillRect(o.x + 26, o.y + 4, 10, 8);
            ctx.fillRect(o.x + 34, o.y + 6, 6, 3);
            ctx.fillStyle = palette.skyTop;
            ctx.fillRect(o.x + 30, o.y + 5, 3, 3);
            ctx.fillStyle = palette.sprite;
            const flap = Math.floor(frameCount / 8) % 2 === 0;
            if (flap) {
                ctx.fillRect(o.x + 4, o.y, 14, 6);
                ctx.fillRect(o.x + 2, o.y - 4, 8, 6);
            } else {
                ctx.fillRect(o.x + 4, o.y + 14, 14, 6);
                ctx.fillRect(o.x + 2, o.y + 18, 8, 6);
            }
        }
    });
}

// ----- GROUND -----
let groundOffset = 0;
function drawGround(palette) {
    ctx.fillStyle = palette.groundLine;
    ctx.fillRect(0, GROUND_Y, canvas.width, 3);
    ctx.fillStyle = palette.texture;
    const dashW = 24;
    const gap = 18;
    const total = dashW + gap;
    const offset = -(groundOffset % total);
    for (let x = offset; x < canvas.width; x += total) {
        ctx.fillRect(x, GROUND_Y + 10, dashW, 3);
    }
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, GROUND_Y + 3, canvas.width, GROUND_HEIGHT - 3);
}

// ----- CLOUDS -----
let clouds = [];
for (let i = 0; i < 4; i++) {
    clouds.push({
        x: Math.random() * canvas.width,
        y: 30 + Math.random() * 80,
        w: 40 + Math.random() * 30,
        speed: Math.random() * 0.4 + 0.2
    });
}
function drawClouds(palette) {
    clouds.forEach(c => {
        c.x -= c.speed * (speed / BASE_SPEED);
        if (c.x + c.w < 0) {
            c.x = canvas.width + c.w;
            c.y = 30 + Math.random() * 80;
        }
        ctx.fillStyle = palette.cloud;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.w * 0.5, 10, 0, 0, Math.PI * 2);
        ctx.fill();
    });
}

// ----- STARS -----
let stars = [];
for (let i = 0; i < 30; i++) {
    stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * 120,
        size: Math.random() * 2 + 1,
        twinkle: Math.random() * Math.PI * 2
    });
}
function drawStars() {
    stars.forEach(s => {
        const alpha = (0.5 + 0.5 * Math.sin(frameCount * 0.05 + s.twinkle)) * nightT;
        if (alpha <= 0) return;
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.8})`;
        ctx.fillRect(s.x, s.y, s.size, s.size);
    });
}

// ----- UI -----
function drawUI(palette) {
    ctx.textAlign = 'center';
    if (gameState === STATE_PLAYING) {
        ctx.font = '800 22px Outfit, sans-serif';
        ctx.fillStyle = palette.textDark;
        ctx.fillText(score, canvas.width / 2, 40);
    } else if (gameState === STATE_START) {
        ctx.font = '800 26px Outfit, sans-serif';
        ctx.fillStyle = palette.textDark;
        ctx.fillText('CHROME DINO', canvas.width / 2, 90);
        ctx.font = '500 15px Outfit, sans-serif';
        ctx.fillStyle = palette.textMuted;
        ctx.fillText('Press Space / Tap to start', canvas.width / 2, 120);
    } else if (gameState === STATE_GAMEOVER) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.roundRect(canvas.width / 2 - 130, 70, 260, 130, 14);
        ctx.fill();
        ctx.fillStyle = '#ef4444';
        ctx.font = '800 26px Outfit, sans-serif';
        ctx.fillText('GAME OVER', canvas.width / 2, 110);
        ctx.fillStyle = '#fff';
        ctx.font = '600 18px Outfit, sans-serif';
        ctx.fillText(`Score: ${score}`, canvas.width / 2, 145);
        ctx.fillText(`Best: ${highScore}`, canvas.width / 2, 172);
        ctx.font = '400 13px Outfit, sans-serif';
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText('Space / Tap to restart', canvas.width / 2, 195);
    }
}

// ----- GAME CONTROL -----
function handleInputStart() {
    initAudio();
    if (gameState === STATE_START) {
        gameState = STATE_PLAYING;
        dino.startJump();
    } else if (gameState === STATE_PLAYING) {
        dino.startJump();
    } else if (gameState === STATE_GAMEOVER) {
        resetGame();
    }
}

function gameOver() {
    if (gameState === STATE_PLAYING) {
        gameState = STATE_GAMEOVER;
        dino.dead = true;
        Sound.hit();
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('dino_highscore', highScore);
            highSpan.textContent = highScore;
        }
    }
}

function resetGame() {
    dino.reset();
    obstacles = [];
    spawnTimer = 30;
    score = 0;
    speed = BASE_SPEED;
    distance = 0;
    frameCount = 0;
    groundOffset = 0;
    nightT = 0;
    nightTarget = 0;
    accumulator = 0;
    lastTime = 0;
    gameState = STATE_PLAYING;
    dino.startJump();
}

// ----- PHYSICS STEP -----
function physicsStep() {
    frameCount++;
    distance += speed;
    speed = Math.min(MAX_SPEED, BASE_SPEED + Math.floor(distance / 1000) * 0.25);
    
    const newScore = Math.floor(distance / 10);
    if (newScore > score) {
        score = newScore;
        if (score > 0 && score % 100 === 0) Sound.score(score);
    }
    
    groundOffset += speed;
    updateDayNight();
    dino.update();
    updateObstacles();
    if (checkCollision()) gameOver();
}

// ----- RENDER -----
function render() {
    const palette = getColors();
    ctx.fillStyle = palette.skyTop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawStars();
    drawClouds(palette);
    drawGround(palette);
    drawObstacles(palette);
    dino.draw(palette);
    drawUI(palette);
}

// ----- EVENT LISTENERS -----
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (!e.repeat) handleInputStart();
    }
    if (e.code === 'ArrowDown') {
        e.preventDefault();
        dino.duck(true);
    }
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        dino.endJump();
    }
    if (e.code === 'ArrowDown') {
        dino.duck(false);
    }
});

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handleInputStart();
});

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    dino.endJump();
});

canvas.addEventListener('mousedown', () => {
    handleInputStart();
});

canvas.addEventListener('mouseup', () => {
    dino.endJump();
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        paused = true;
    } else {
        lastTime = performance.now();
        accumulator = 0;
        paused = false;
    }
});

// ----- MAIN LOOP -----
function gameLoop(now) {
    requestAnimationFrame(gameLoop);

    if (paused) {
        lastTime = now;
        return;
    }
    if (!lastTime) lastTime = now;

    let delta = now - lastTime;
    lastTime = now;
    if (delta > MAX_FRAME_DELTA) delta = MAX_FRAME_DELTA;

    accumulator += delta;
    while (accumulator >= FIXED_DT) {
        if (gameState === STATE_PLAYING) {
            physicsStep();
        } else {
            frameCount++;
        }
        accumulator -= FIXED_DT;
    }

    render();
}

// Polyfill roundRect
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (r > w / 2) r = w / 2;
        if (r > h / 2) r = h / 2;
        this.moveTo(x + r, y);
        this.lineTo(x + w - r, y);
        this.quadraticCurveTo(x + w, y, x + w, y + r);
        this.lineTo(x + w, y + h - r);
        this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        this.lineTo(x + r, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r);
        this.lineTo(x, y + r);
        this.quadraticCurveTo(x, y, x + r, y);
        return this;
    };
}

gameLoop(performance.now());