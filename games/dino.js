const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const highSpan = document.getElementById('highDisplay');

// ----- LOGICAL RESOLUTION -----
const LOGICAL_W = 1000;
const LOGICAL_H = 400;

// ----- CONSTANTS -----
const GROUND_HEIGHT = 50;      
const DINO_X = 60;             
const GRAVITY = 0.65;          
const FAST_FALL_GRAVITY = 1.8; 
const JUMP_VELOCITY = -12.0;   
const CUT_JUMP_FACTOR = 0.45;  
const DUCK_HEIGHT = 32;        
const RUN_HEIGHT = 64;         
const DINO_WIDTH = 64;         
const BASE_SPEED = 6;
const MAX_SPEED = 13;
const MIN_OBSTACLE_GAP = 200;  
const PTERODACTYL_MIN_DISTANCE = 500; 
const FIXED_DT = 1000 / 60;    
const NIGHT_CYCLE_DISTANCE = 2000;   
const NIGHT_TRANSITION_FRAMES = 90;  
let GROUND_Y = 340;            

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
    const lerpF = (a, b) => a + (b - a) * t;
    return {
        skyTop: `rgb(${lerp(135, 20)}, ${lerp(206, 20)}, ${lerp(235, 40)})`,
        skyBottom: `rgb(${lerp(247, 247)}, ${lerp(247, 26)}, ${lerp(247, 46)})`,
        ground: `rgb(${lerp(232, 52)}, ${lerp(232, 52)}, ${lerp(232, 77)})`,
        groundLine: `rgb(${lerp(83, 205)}, ${lerp(83, 205)}, ${lerp(83, 214)})`,
        texture: `rgb(${lerp(214, 130)}, ${lerp(214, 130)}, ${lerp(214, 158)})`,
        sprite: `rgb(${lerp(83, 205)}, ${lerp(83, 205)}, ${lerp(83, 214)})`,
        cloud: `rgba(${lerp(224, 180)}, ${lerp(224, 180)}, ${lerp(224, 190)}, ${lerpF(1, 0.25)})`,
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
            spawnDust(3);
        }
    },

    endJump() {
        this.jumpHeld = false;
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
        const activeGravity = (!this.isGrounded && this.downHeld) ? FAST_FALL_GRAVITY : GRAVITY;
        this.velocity += activeGravity;
        this.y += this.velocity;

        const groundLevel = this.ducking ? GROUND_Y - DUCK_HEIGHT : GROUND_Y - RUN_HEIGHT;

        if (this.y >= groundLevel) {
            // Landing from a jump — kick up dust
            if (!this.isGrounded && this.velocity > 4) {
                spawnDust(4);
            }
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
            return { x: DINO_X - 20, y: this.y, w: 56, h: DUCK_HEIGHT };
        }
        return { x: DINO_X - 20, y: this.y, w: 56, h: RUN_HEIGHT };
    },

    draw(palette) {
        ctx.save();
        if (this.dead) ctx.globalAlpha = 0.5;

        // Shadow under the dino
        const shadowW = this.ducking ? 60 : 48;
        const shadowY = GROUND_Y + 2;
        ctx.fillStyle = `rgba(0,0,0,${0.12 + nightT * 0.08})`;
        ctx.beginPath();
        ctx.ellipse(DINO_X + 2, shadowY, shadowW / 2, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = palette.sprite;

        // CHECK FOR CUSTOM 32x32 DINO
        if (window.customDinoFrames && (window.customDinoFrames[0].some(p => p) || window.customDinoFrames[1].some(p => p))) {
            const pSizeX = 2; 
            const pSizeY = this.ducking ? 1 : 2; 
            
            const startX = DINO_X - 16; 
            const currentHitboxHeight = this.ducking ? DUCK_HEIGHT : RUN_HEIGHT;
            
            // 1. Find the lowest drawn pixel (highest row index) across both frames
            let bottomMostRow = 0;
            for (let f = 0; f < 2; f++) {
                if (window.customDinoFrames[f]) {
                    for (let i = 0; i < 1024; i++) {
                        if (window.customDinoFrames[f][i]) {
                            const row = Math.floor(i / 32);
                            if (row > bottomMostRow) bottomMostRow = row;
                        }
                    }
                }
            }

            // 2. Anchor the sprite firmly so the bottom-most pixel touches the exact bottom of the hitbox
            const startY = (this.y + currentHitboxHeight) - ((bottomMostRow + 1) * pSizeY); 
            
            let frameIndex = 0;
            if (this.isGrounded && !this.ducking && gameState === STATE_PLAYING) {
                frameIndex = Math.floor(this.legFrame / 5) % 2; 
            }
            
            // Fallback to frame 0 if frame 1 is completely empty to prevent flickering
            const activeFrame = window.customDinoFrames[frameIndex].some(p => p) 
                ? window.customDinoFrames[frameIndex] 
                : window.customDinoFrames[0];

            for (let i = 0; i < 1024; i++) {
                if (activeFrame[i]) {
                    const col = i % 32;
                    const row = Math.floor(i / 32);
                    ctx.fillRect(startX + (col * pSizeX), startY + (row * pSizeY), pSizeX, pSizeY);
                }
            }
            ctx.restore();
            return; 
        }

        // ===== DEFAULT DINO (Fallback) =====
        const x = DINO_X - 18; 
        // Anchor the sprite's feet to the bottom of the hitbox so it doesn't float.
        // Running sprite feet are at y+46, ducking feet at y+28.
        // this.y is the top of the hitbox, so offset to align feet with hitbox bottom.
        const y = this.ducking ? this.y + DUCK_HEIGHT - 28 : this.y + RUN_HEIGHT - 46;

        if (this.ducking) {
            // Tail
            ctx.fillRect(x - 14, y + 10, 14, 4);
            ctx.fillRect(x - 8, y + 14, 10, 4);
            // Body
            ctx.fillRect(x - 2, y + 6, 36, 14);
            // Head
            ctx.fillRect(x + 30, y + 2, 22, 12);
            ctx.fillRect(x + 42, y + 10, 10, 3);
            // Eye
            ctx.fillStyle = palette.skyTop;
            ctx.fillRect(x + 38, y + 4, 3, 3);
            ctx.fillStyle = palette.sprite;
            // Legs
            const legStep = Math.floor(this.legFrame / 4) % 2 === 0;
            ctx.fillRect(x + 8, y + 20, 6, 8);
            ctx.fillRect(x + 24, y + 20, 6, 8);
            if (legStep) ctx.fillRect(x + 4, y + 26, 8, 2);
            else ctx.fillRect(x + 20, y + 26, 8, 2);
        } else {
            // Head
            ctx.fillRect(x + 28, y + 0, 28, 12);
            ctx.fillRect(x + 26, y + 15, 18, 4);
            ctx.fillRect(x + 42, y + 4, 4, 3);
            // Eye
            ctx.fillStyle = palette.skyTop;
            ctx.fillRect(x + 38, y + 3, 4, 4);
            ctx.fillStyle = palette.sprite;
            // Body
            ctx.fillRect(x + 10, y + 10, 28, 22);
            // Arm
            ctx.fillRect(x - 2, y + 14, 12, 10);
            // Tail
            ctx.fillRect(x - 10, y + 18, 8, 8);
            ctx.fillRect(x - 16, y + 22, 6, 5);
            // Front arm
            ctx.fillRect(x + 38, y + 18, 8, 5);
            ctx.fillRect(x + 36, y + 20, 2, 6);
            // Legs
            if (!this.isGrounded) {
                ctx.fillRect(x + 12, y + 32, 7, 8);
                ctx.fillRect(x + 22, y + 32, 7, 6);
                ctx.fillRect(x + 22, y + 32, 7, 2);
            } else {
                const legStep = Math.floor(this.legFrame / 4) % 2 === 0;
                if (legStep) {
                    ctx.fillRect(x + 12, y + 32, 7, 10);
                    ctx.fillRect(x + 10, y + 42, 12, 4);
                    ctx.fillRect(x + 24, y + 32, 7, 5);
                    ctx.fillRect(x + 28, y + 37, 5, 5);
                } else {
                    ctx.fillRect(x + 12, y + 32, 7, 5);
                    ctx.fillRect(x + 10, y + 37, 5, 5);
                    ctx.fillRect(x + 24, y + 32, 7, 10);
                    ctx.fillRect(x + 22, y + 42, 12, 4);
                }
            }
        }
        ctx.restore();
    }
};

// ----- DUST PARTICLES -----
let dustParticles = [];
function spawnDust(count) {
    for (let i = 0; i < count; i++) {
        dustParticles.push({
            x: DINO_X + (Math.random() - 0.5) * 20,
            y: GROUND_Y - 4 - Math.random() * 6,
            vx: -speed * 0.3 - Math.random() * 1.5,
            vy: -Math.random() * 1.2 - 0.3,
            size: 2 + Math.random() * 3,
            life: 1,
            decay: 0.03 + Math.random() * 0.03
        });
    }
}

function updateDust() {
    for (let i = dustParticles.length - 1; i >= 0; i--) {
        const p = dustParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.life -= p.decay;
        if (p.life <= 0) dustParticles.splice(i, 1);
    }
}

function drawDust(palette) {
    dustParticles.forEach(p => {
        ctx.fillStyle = `rgba(200, 200, 200, ${p.life * 0.4})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
    });
}

// ----- OBSTACLES -----
let obstacles = [];
let spawnTimer = 0;

function spawnObstacle() {
    const r = Math.random();
    let type, w, h, y;
    const pterodactylUnlocked = distance > PTERODACTYL_MIN_DISTANCE;

    if (!pterodactylUnlocked) {
        // Only cacti before pterodactyls unlock
        if (r < 0.55) {
            type = 'small-cactus';
            w = 16; h = 32;
            y = GROUND_Y - h;
        } else {
            type = 'large-cactus';
            w = 24; h = 48;
            y = GROUND_Y - h;
        }
    } else {
        if (r < 0.45) {
            type = 'small-cactus';
            w = 16; h = 32;
            y = GROUND_Y - h;
        } else if (r < 0.75) {
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
    }
    // Spawn outside logical bounds
    obstacles.push({ type, x: LOGICAL_W + 20, w, h, y, passed: false });
}

function updateObstacles() {
    spawnTimer--;
    if (spawnTimer <= 0) {
        const lastX = obstacles.length > 0 ? obstacles[obstacles.length - 1].x : -Infinity;
        if (LOGICAL_W + 20 - lastX >= MIN_OBSTACLE_GAP) {
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
            // Main trunk
            ctx.fillRect(o.x + 4, o.y, 8, o.h);
            // Left arm
            ctx.fillRect(o.x, o.y + 8, 4, 12);
            ctx.fillRect(o.x - 2, o.y + 6, 4, 4);
            // Right arm
            ctx.fillRect(o.x + 12, o.y + 12, 4, 10);
            ctx.fillRect(o.x + 14, o.y + 10, 4, 4);
        } else if (o.type === 'large-cactus') {
            // Main trunk
            ctx.fillRect(o.x + 6, o.y, 12, o.h);
            // Left arm
            ctx.fillRect(o.x, o.y + 10, 6, 16);
            ctx.fillRect(o.x - 2, o.y + 6, 4, 6);
            // Right arm
            ctx.fillRect(o.x + 18, o.y + 14, 6, 14);
            ctx.fillRect(o.x + 20, o.y + 10, 4, 6);
            // Top spike
            ctx.fillRect(o.x + 2, o.y + 4, 4, 8);
            ctx.fillRect(o.x + 4, o.y, 4, 6);
        } else if (o.type === 'pterodactyl') {
            // Body
            ctx.fillRect(o.x + 8, o.y + 8, 20, 10);
            // Head
            ctx.fillRect(o.x + 26, o.y + 4, 10, 8);
            ctx.fillRect(o.x + 34, o.y + 6, 6, 3);
            // Eye
            ctx.fillStyle = palette.skyTop;
            ctx.fillRect(o.x + 30, o.y + 5, 3, 3);
            ctx.fillStyle = palette.sprite;
            // Wings
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
    // Ground line
    ctx.fillStyle = palette.groundLine;
    ctx.fillRect(0, GROUND_Y, LOGICAL_W, 3);
    // Dash pattern
    ctx.fillStyle = palette.texture;
    const dashW = 24;
    const gap = 18;
    const total = dashW + gap;
    const offset = -(groundOffset % total);
    for (let x = offset; x < LOGICAL_W; x += total) {
        ctx.fillRect(x, GROUND_Y + 10, dashW, 3);
    }
    // Ground fill with subtle gradient
    const grad = ctx.createLinearGradient(0, GROUND_Y + 3, 0, GROUND_Y + GROUND_HEIGHT);
    grad.addColorStop(0, palette.ground);
    grad.addColorStop(1, nightT > 0.5 ? 'rgb(30, 30, 50)' : 'rgb(200, 200, 200)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, GROUND_Y + 3, LOGICAL_W, GROUND_HEIGHT - 3);
}

// ----- CLOUDS -----
let clouds = [];
for (let i = 0; i < 4; i++) {
    clouds.push({
        x: Math.random() * LOGICAL_W,
        y: 30 + Math.random() * 80,
        w: 40 + Math.random() * 30,
        speed: Math.random() * 0.4 + 0.2
    });
}
function drawClouds(palette) {
    clouds.forEach(c => {
        c.x -= c.speed * (speed / BASE_SPEED);
        if (c.x + c.w * 1.5 < 0) {
            c.x = LOGICAL_W + c.w;
            c.y = 30 + Math.random() * 80;
        }
        ctx.fillStyle = palette.cloud;
        // Puffy multi-ellipse cloud
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.w * 0.4, 10, 0, 0, Math.PI * 2);
        ctx.ellipse(c.x - c.w * 0.25, c.y + 4, c.w * 0.3, 8, 0, 0, Math.PI * 2);
        ctx.ellipse(c.x + c.w * 0.25, c.y + 3, c.w * 0.3, 9, 0, 0, Math.PI * 2);
        ctx.fill();
    });
}

// ----- STARS -----
let stars = [];
for (let i = 0; i < 30; i++) {
    stars.push({
        x: Math.random() * LOGICAL_W,
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

// ----- MOON -----
function drawMoon() {
    if (nightT <= 0) return;
    const moonX = 850;
    const moonY = 60;
    const moonR = 22;
    ctx.save();
    ctx.globalAlpha = nightT;
    ctx.fillStyle = '#f0f0f0';
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();
    // Crescent cutout
    ctx.fillStyle = getColors().skyTop;
    ctx.beginPath();
    ctx.arc(moonX + 8, moonY - 4, moonR - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// ----- UI -----
function drawUI(palette) {
    ctx.textAlign = 'center';
    if (gameState === STATE_PLAYING) {
        // Score with HI label
        ctx.font = '800 22px Outfit, sans-serif';
        ctx.fillStyle = palette.textDark;
        ctx.fillText(score, LOGICAL_W / 2, 40);
        if (highScore > 0) {
            ctx.font = '600 12px Outfit, sans-serif';
            ctx.fillStyle = palette.textMuted;
            ctx.fillText('HI ' + highScore, LOGICAL_W / 2 + 60, 40);
        }
    } else if (gameState === STATE_START) {
        ctx.font = '800 26px Outfit, sans-serif';
        ctx.fillStyle = palette.textDark;
        ctx.fillText('CHROME DINO', LOGICAL_W / 2, 90);
        ctx.font = '500 15px Outfit, sans-serif';
        ctx.fillStyle = palette.textMuted;
        ctx.fillText('Press Space / Tap to start', LOGICAL_W / 2, 120);
    } else if (gameState === STATE_GAMEOVER) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.roundRect(LOGICAL_W / 2 - 130, 70, 260, 130, 14);
        ctx.fill();
        ctx.fillStyle = '#ef4444';
        ctx.font = '800 26px Outfit, sans-serif';
        ctx.fillText('GAME OVER', LOGICAL_W / 2, 110);
        ctx.fillStyle = '#fff';
        ctx.font = '600 18px Outfit, sans-serif';
        ctx.fillText(`Score: ${score}`, LOGICAL_W / 2, 145);
        ctx.fillText(`Best: ${highScore}`, LOGICAL_W / 2, 172);
        ctx.font = '400 13px Outfit, sans-serif';
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText('Space / Tap to restart', LOGICAL_W / 2, 195);
    }
}

// ----- DPR-AWARE SCALING ENGINE -----
function resizeCanvas() {
    const wrapper = document.querySelector('.game-wrapper');
    const rect = wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // Scale to fit wrapper while maintaining the aspect ratio
    const scale = Math.min(rect.width / LOGICAL_W, rect.height / LOGICAL_H);
    
    const targetW = LOGICAL_W * scale;
    const targetH = LOGICAL_H * scale;

    canvas.width = targetW * dpr;
    canvas.height = targetH * dpr;
    
    canvas.style.width = `${targetW}px`;
    canvas.style.height = `${targetH}px`;
    
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
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
    updateDust();
    if (checkCollision()) gameOver();
}

// ----- RENDER -----
function render() {
    const palette = getColors();
    
    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    skyGrad.addColorStop(0, palette.skyTop);
    skyGrad.addColorStop(1, palette.skyBottom);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    drawStars();
    drawMoon();
    drawClouds(palette);
    drawGround(palette);
    drawObstacles(palette);
    drawDust(palette);
    dino.draw(palette);
    drawUI(palette);
}

// ----- EVENT LISTENERS -----
window.addEventListener('resize', resizeCanvas);

window.addEventListener('keydown', (e) => {
    // Block gameplay input when drawing editor is open
    if (document.getElementById('editorOverlay').classList.contains('show')) return;
    
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

// ----- TOUCH & MOUSE CONTROLS -----
let touchStartY = 0;

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    initAudio();
    
    // If editor is open, ignore game touches
    if (document.getElementById('editorOverlay').classList.contains('show')) return;

    if (gameState === STATE_START || gameState === STATE_PLAYING) {
        dino.startJump();
    } else if (gameState === STATE_GAMEOVER) {
        resetGame();
    }

    if (e.touches.length > 0) {
        touchStartY = e.touches[0].clientY;
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 0) return;

    const currentY = e.touches[0].clientY;
    const diffY = currentY - touchStartY;

    // Swipe down threshold for ducking
    if (diffY > 30) {
        dino.duck(true);
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    dino.endJump();
    dino.duck(false); // Release duck when finger lifts
}, { passive: false });

canvas.addEventListener('mousedown', () => {
    if (document.getElementById('editorOverlay').classList.contains('show')) return;
    handleInputStart();
});

canvas.addEventListener('mouseup', () => {
    dino.endJump();
    dino.duck(false);
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

// ----- 32x32 PIXEL EDITOR LOGIC -----
window.customDinoFrames = JSON.parse(localStorage.getItem('dino_custom_frames')) || [new Array(1024).fill(false), new Array(1024).fill(false)];

const editorOverlay = document.getElementById('editorOverlay');
const pixelGrid = document.getElementById('pixelGrid');
let isDrawing = false;
let currentFrame = 0;
let currentTool = 'brush'; // 'brush' or 'eraser'

function buildGrid() {
    pixelGrid.innerHTML = '';
    const frameData = window.customDinoFrames[currentFrame];
    
    for (let i = 0; i < 1024; i++) {
        const div = document.createElement('div');
        div.className = 'pixel';
        if (frameData[i]) div.classList.add('active');
        
        // Use pointer events to seamlessly support both mouse dragging and touch sliding
        div.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            isDrawing = true;
            div.setPointerCapture(e.pointerId);
            togglePixel(div, i, currentTool === 'brush');
        });
        
        div.addEventListener('pointerenter', (e) => {
            if (isDrawing) {
                togglePixel(div, i, currentTool === 'brush');
            }
        });
        
        pixelGrid.appendChild(div);
    }
}

function togglePixel(div, index, forceState) {
    window.customDinoFrames[currentFrame][index] = forceState;
    if (forceState) div.classList.add('active');
    else div.classList.remove('active');
}

// Global release to stop drawing when pointer leaves the grid or lifts
document.addEventListener('pointerup', () => isDrawing = false);
pixelGrid.addEventListener('pointerleave', () => isDrawing = false);

// Toolbar Buttons
document.getElementById('btnFrame0').addEventListener('click', (e) => {
    currentFrame = 0;
    document.getElementById('btnFrame0').classList.add('active');
    document.getElementById('btnFrame1').classList.remove('active');
    buildGrid();
});

document.getElementById('btnFrame1').addEventListener('click', (e) => {
    currentFrame = 1;
    document.getElementById('btnFrame1').classList.add('active');
    document.getElementById('btnFrame0').classList.remove('active');
    buildGrid();
});

document.getElementById('btnCopy').addEventListener('click', () => {
    const targetFrame = currentFrame === 0 ? 1 : 0;
    window.customDinoFrames[targetFrame] = [...window.customDinoFrames[currentFrame]];
    alert(`Copied Frame ${currentFrame + 1} to Frame ${targetFrame + 1}!`);
});

document.getElementById('btnBrush').addEventListener('click', () => {
    currentTool = 'brush';
    document.getElementById('btnBrush').classList.add('active');
    document.getElementById('btnEraser').classList.remove('active');
});

document.getElementById('btnEraser').addEventListener('click', () => {
    currentTool = 'eraser';
    document.getElementById('btnEraser').classList.add('active');
    document.getElementById('btnBrush').classList.remove('active');
});

document.getElementById('clearDinoBtn').addEventListener('click', () => {
    window.customDinoFrames[currentFrame] = new Array(1024).fill(false);
    buildGrid();
});

// Force Editor Open Flow
function openEditor() {
    buildGrid();
    editorOverlay.classList.add('show');
    paused = true;
}

document.getElementById('openEditorBtn').addEventListener('click', openEditor);

document.getElementById('saveDinoBtn').addEventListener('click', () => {
    localStorage.setItem('dino_custom_frames', JSON.stringify(window.customDinoFrames));
    editorOverlay.classList.remove('show');
    
    gameState = STATE_PLAYING;
    lastTime = performance.now();
    paused = false;
    dino.startJump();
});

editorOverlay.addEventListener('mousedown', (e) => e.stopPropagation());
editorOverlay.addEventListener('touchstart', (e) => e.stopPropagation());

function resetGame() {
    dino.reset();
    obstacles = [];
    dustParticles = [];
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
    gameState = STATE_START;
}

resizeCanvas();
gameLoop(performance.now());