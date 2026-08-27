const canvas = document.getElementById('poolCanvas');
const ctx = canvas.getContext('2d');
const statusMsg = document.getElementById('statusMsg');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const winnerText = document.getElementById('winnerText');

// UI Elements
const p1Display = document.getElementById('p1Display');
const p2Display = document.getElementById('p2Display');
const p1Type = document.getElementById('p1Type');
const p2Type = document.getElementById('p2Type');
const p1Count = document.getElementById('p1Count');
const p2Count = document.getElementById('p2Count');

// Game Modes
let isPvE = true;
document.getElementById('btnPvE').addEventListener('click', (e) => setMode(true, e.target));
document.getElementById('btnPvP').addEventListener('click', (e) => setMode(false, e.target));
document.getElementById('btnRestart').addEventListener('click', initGame);

function setMode(botEnabled, btn) {
    isPvE = botEnabled;
    document.getElementById('btnPvE').classList.toggle('active', botEnabled);
    document.getElementById('btnPvP').classList.toggle('active', !botEnabled);
    document.getElementById('p2Display').innerHTML = `<span id="p2Count">(7)</span> <span id="p2Type" class="ball-type-badge">OPEN</span> ${botEnabled ? 'Bot' : 'Player 2'}`;
    initGame();
}

// --- Physics Constants ---
const TABLE_RATIO = 2; 
const FRICTION = 0.985;
const RESTITUTION = 0.95; 
const CUSHION_RESTITUTION = 0.8;

let BALL_RADIUS = 10;
let POCKET_RADIUS = 18;

// --- Web Audio Synthesizer ---
let audioCtx = null;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

const Sound = {
    hit(volume = 1) {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300 + Math.random() * 100, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);
        gain.gain.setValueAtTime(Math.min(0.4, 0.05 * volume), audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.05);
    },
    pocket() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.2);
    }
};

// --- Entities ---
class Ball {
    constructor(id, x, y, color, stripe = false) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.color = color;
        this.stripe = stripe;

        // Animation states
        this.active = true;
        this.scale = 1;
        this.alpha = 1;
        this.roll = Math.random() * Math.PI * 2;    // rolling phase of the surface pattern
        this.rollDir = Math.random() * Math.PI * 2; // direction the surface rolls toward
    }

    update(bounds, pockets) {
        if (!this.active) return;

        // Pocket animation shrinking state
        if (this.scale < 1) {
            this.scale -= 0.08;
            this.alpha -= 0.1;
            this.x += this.vx * 0.5;
            this.y += this.vy * 0.5;

            if (this.scale <= 0) {
                this.active = false;
                this.scale = 0;
                this.alpha = 0;
                this.vx = 0;
                this.vy = 0;
            }
            return;
        }

        this.x += this.vx;
        this.y += this.vy;

        // Visual rolling: the surface pattern rolls in the travel direction
        const speed = Math.hypot(this.vx, this.vy);
        if (speed > 0.05) {
            const target = Math.atan2(this.vy, this.vx);
            let d = target - this.rollDir;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            this.rollDir += d * 0.25;
            this.roll += speed * 0.08;
        }

        this.vx *= FRICTION;
        this.vy *= FRICTION;

        if (speed < 0.06) {
            this.vx = 0;
            this.vy = 0;
        }

        // Pocket Detection
        let inPocketRadius = false;
        for (let p of pockets) {
            const d = Math.hypot(this.x - p.x, this.y - p.y);
            if (d < POCKET_RADIUS * 0.85) {
                this.scale = 0.99; // trigger shrink animation next frame
                Sound.pocket();
                handlePocketedBall(this);
                return;
            }
            if (d < POCKET_RADIUS * 1.25) {
                inPocketRadius = true; // disable cushion bounce near the pocket mouth only
            }
        }

        // Safety containment: a ball must never escape through a pocket mouth.
        // If it slipped past the cushion line near a pocket but missed the
        // capture radius, drop it into the nearest pocket instead of letting
        // it pass through the table wall.
        if (this.x < bounds.left - BALL_RADIUS * 0.4 || this.x > bounds.right + BALL_RADIUS * 0.4 ||
            this.y < bounds.top - BALL_RADIUS * 0.4 || this.y > bounds.bottom + BALL_RADIUS * 0.4) {
            let nearest = pockets[0];
            let nd = Infinity;
            for (let p of pockets) {
                const d = Math.hypot(this.x - p.x, this.y - p.y);
                if (d < nd) { nd = d; nearest = p; }
            }
            this.x = nearest.x;
            this.y = nearest.y;
            this.scale = 0.99;
            Sound.pocket();
            handlePocketedBall(this);
            return;
        }

        // Cushion Collisions
        if (!inPocketRadius) {
            if (this.x - BALL_RADIUS < bounds.left) {
                this.x = bounds.left + BALL_RADIUS;
                this.vx = -this.vx * CUSHION_RESTITUTION;
                Sound.hit(speed);
            } else if (this.x + BALL_RADIUS > bounds.right) {
                this.x = bounds.right - BALL_RADIUS;
                this.vx = -this.vx * CUSHION_RESTITUTION;
                Sound.hit(speed);
            }

            if (this.y - BALL_RADIUS < bounds.top) {
                this.y = bounds.top + BALL_RADIUS;
                this.vy = -this.vy * CUSHION_RESTITUTION;
                Sound.hit(speed);
            } else if (this.y + BALL_RADIUS > bounds.bottom) {
                this.y = bounds.bottom - BALL_RADIUS;
                this.vy = -this.vy * CUSHION_RESTITUTION;
                Sound.hit(speed);
            }
        }
    }

    draw(ctx) {
        if (!this.active || this.alpha <= 0) return;
        const R = BALL_RADIUS;

        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);
        ctx.scale(this.scale, this.scale);

        // Soft contact shadow on the felt (fixed relative to the light source)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
        ctx.beginPath();
        ctx.arc(R * 0.1, R * 0.22, R * 0.95, 0, Math.PI * 2);
        ctx.fill();

        // Rolling surface offsets: the number/stripe travel across the sphere
        const s = Math.sin(this.roll);
        const face = Math.cos(this.roll); // 1 = number facing the camera
        const px = Math.cos(this.rollDir) * s * R * 0.36;
        const py = Math.sin(this.rollDir) * s * R * 0.36;

        // Clip everything to the sphere silhouette
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.clip();

        // Base sphere body
        if (this.stripe) {
            const g = ctx.createLinearGradient(-R, -R, R, R);
            g.addColorStop(0, '#ffffff');
            g.addColorStop(1, '#d9dde3');
            ctx.fillStyle = g;
        } else {
            const g = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R * 1.25);
            g.addColorStop(0, shade(this.color, 0.45));
            g.addColorStop(0.55, this.color);
            g.addColorStop(1, shade(this.color, -0.55));
            ctx.fillStyle = g;
        }
        ctx.fillRect(-R, -R, R * 2, R * 2);

        // Rolling colour band for striped balls
        if (this.stripe) {
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(this.rollDir + Math.PI / 2);
            ctx.fillStyle = this.color;
            ctx.fillRect(-R * 1.2, -R * 0.52, R * 2.4, R * 1.04);
            ctx.restore();
        }

        // Number circle rolls over the sphere (gently foreshortened)
        if (this.id !== 0 && face > 0.05) {
            const rNum = R * 0.44;
            const squish = 0.45 + 0.55 * face; // never flattens completely
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(this.rollDir);
            ctx.scale(squish, 1);

            const ng = ctx.createRadialGradient(-rNum * 0.3, -rNum * 0.3, rNum * 0.1, 0, 0, rNum);
            ng.addColorStop(0, '#ffffff');
            ng.addColorStop(1, '#c9ced6');
            ctx.fillStyle = ng;
            ctx.beginPath();
            ctx.arc(0, 0, rNum, 0, Math.PI * 2);
            ctx.fill();

            ctx.rotate(-this.rollDir); // keep the digit upright
            ctx.fillStyle = '#101418';
            ctx.font = `800 ${rNum * 1.15}px Outfit, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.globalAlpha = this.alpha * Math.min(1, face * 1.6);
            ctx.fillText(this.id, 0, rNum * 0.1);
            ctx.restore();
        }

        // Cue ball rolling dot (shows spin while moving)
        if (this.id === 0) {
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(this.rollDir);
            ctx.scale(Math.max(0.45, Math.abs(face)), 1);
            ctx.fillStyle = '#e23b3b';
            ctx.beginPath();
            ctx.arc(0, 0, R * 0.15, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Fixed light shading overlay (light source stays top-left)
        const shadeGrad = ctx.createRadialGradient(-R * 0.4, -R * 0.45, R * 0.1, 0, 0, R * 1.05);
        shadeGrad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
        shadeGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.05)');
        shadeGrad.addColorStop(0.75, 'rgba(0, 0, 0, 0.12)');
        shadeGrad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
        ctx.fillStyle = shadeGrad;
        ctx.fillRect(-R, -R, R * 2, R * 2);

        ctx.restore(); // remove sphere clip

        // Glossy specular highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath();
        ctx.ellipse(-R * 0.38, -R * 0.42, R * 0.26, R * 0.15, -Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.beginPath();
        ctx.arc(-R * 0.18, -R * 0.55, R * 0.08, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// Lighten (amt > 0) or darken (amt < 0) a hex colour
function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt >= 0) {
        r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt;
    } else {
        r *= (1 + amt); g *= (1 + amt); b *= (1 + amt);
    }
    return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}


// --- Game State & Rules ---
let balls = [];
let pockets = [];
let bounds = {};
let prevBounds = null;
const isOnTable = b => b.active && b.scale >= 1;
function playerName(n) { return n === 1 ? 'Player 1' : (isPvE ? 'Bot' : 'Player 2'); }
let cueBall = null;

let isAiming = false;
let aimStart = { x: 0, y: 0 };
let aimCurrent = { x: 0, y: 0 };
let cueBallInHand = true; 

let currentTurn = 1;
let players = {
    1: { type: null, pottedThisTurn: false },
    2: { type: null, pottedThisTurn: false }
};
let isTableOpen = true;
let firstHitBall = null;
let foulCommitted = false;
let turnEnding = false;

const COLOR_MAP = [
    '#ffffff', // 0: Cue
    '#facc15', '#3b82f6', '#ef4444', '#a855f7', '#f97316', '#22c55e', '#881337', // 1-7 Solid
    '#111827', // 8: Black
    '#facc15', '#3b82f6', '#ef4444', '#a855f7', '#f97316', '#22c55e', '#881337'  // 9-15 Stripes
];

function setupTableDimensions() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    // In landscape mode, reduce UI padding to let the table use more space.
    // Landscape has less vertical room but plenty of horizontal width; with
    // a fixed 2:1 ratio reducing vertical padding makes the table wider too.
    const isLandscape = w > h;
    const uiPaddingTop = isLandscape ? 50 : 60; 
    const uiPaddingBottom = isLandscape ? 50 : 75; 
    const availableH = h - uiPaddingTop - uiPaddingBottom - (isLandscape ? 10 : 30);
    const availableW = w - (isLandscape ? 10 : 30);

    let tableW = availableW;
    let tableH = tableW / TABLE_RATIO;

    if (tableH > availableH) {
        tableH = availableH;
        tableW = tableH * TABLE_RATIO;
    }

    const offsetX = (w - tableW) / 2;
    const offsetY = uiPaddingTop + 10 + (availableH - tableH) / 2;

    bounds = {
        left: offsetX,
        top: offsetY,
        right: offsetX + tableW,
        bottom: offsetY + tableH
    };

    BALL_RADIUS = tableW / 52;
    POCKET_RADIUS = BALL_RADIUS * 1.8;

    pockets = [
        { x: bounds.left, y: bounds.top },
        { x: (bounds.left + bounds.right) / 2, y: bounds.top - POCKET_RADIUS * 0.3 },
        { x: bounds.right, y: bounds.top },
        { x: bounds.left, y: bounds.bottom },
        { x: (bounds.left + bounds.right) / 2, y: bounds.bottom + POCKET_RADIUS * 0.3 },
        { x: bounds.right, y: bounds.bottom }
    ];

    // Remap ball positions proportionally when the table is resized,
    // preserving each ball's relative position on the table across orientation changes.
    if (prevBounds && balls.length > 0) {
        const oldW = prevBounds.right - prevBounds.left;
        const oldH = prevBounds.bottom - prevBounds.top;
        const newW = bounds.right - bounds.left;
        const newH = bounds.bottom - bounds.top;

        balls.forEach(b => {
            if (b.active) {
                const relX = oldW !== 0 ? (b.x - prevBounds.left) / oldW : 0.5;
                const relY = oldH !== 0 ? (b.y - prevBounds.top) / oldH : 0.5;
                b.x = bounds.left + relX * newW;
                b.y = bounds.top + relY * newH;
            }
        });
    }

    prevBounds = {
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom
    };
}

function initGame() {
    gameOverOverlay.classList.remove('active');
    
    currentTurn = 1;
    players = { 1: { type: null, pottedThisTurn: false }, 2: { type: null, pottedThisTurn: false } };
    isTableOpen = true;
    foulCommitted = false;
    turnEnding = false;
    cueBallInHand = true;
    balls = [];

    setupTableDimensions();

    cueBall = new Ball(0, bounds.left + (bounds.right - bounds.left) * 0.25, (bounds.top + bounds.bottom) / 2, '#ffffff');
    balls.push(cueBall);

    // 15-ball rack setup
    const rackStartX = bounds.left + (bounds.right - bounds.left) * 0.72;
    const centerY = (bounds.top + bounds.bottom) / 2;
    const rowSpacing = BALL_RADIUS * 1.732;

    const rackPattern = [
        [1], [9, 2], [3, 8, 10], [11, 4, 12, 5], [13, 6, 14, 7, 15]
    ];

    let rowX = rackStartX;
    rackPattern.forEach((row, r) => {
        let startY = centerY - (r * BALL_RADIUS);
        row.forEach((id, c) => {
            const isStripe = id > 8;
            balls.push(new Ball(id, rowX, startY + (c * BALL_RADIUS * 2.05), COLOR_MAP[id], isStripe));
        });
        rowX += rowSpacing;
    });

    updateUI();
    setStatus("Break Shot! Drag cue ball to position.");
}

function updateUI() {
    p1Display.classList.toggle('active-turn', currentTurn === 1);
    p2Display.classList.toggle('active-turn', currentTurn === 2);

    document.getElementById('p1Type').textContent = players[1].type ? players[1].type.toUpperCase() : "OPEN";
    document.getElementById('p2Type').textContent = players[2].type ? players[2].type.toUpperCase() : "OPEN";

    const solidsLeft = balls.filter(b => isOnTable(b) && b.id >= 1 && b.id <= 7).length;
    const stripesLeft = balls.filter(b => isOnTable(b) && b.id >= 9 && b.id <= 15).length;

    p1Count.textContent = `(${players[1].type === 'solids' ? solidsLeft : (players[1].type === 'stripes' ? stripesLeft : 7)})`;
    p2Count.textContent = `(${players[2].type === 'solids' ? solidsLeft : (players[2].type === 'stripes' ? stripesLeft : 7)})`;
}

function setStatus(msg) {
    statusMsg.textContent = msg;
}

// --- Rules & Logic ---
function handlePocketedBall(ball) {
    if (ball.id === 0) {
        foulCommitted = true;
        setStatus("Scratch! Opponent gets ball in hand.");
    } else if (ball.id === 8) {
        const myType = players[currentTurn].type;
        const myBallsLeft = balls.filter(b => isOnTable(b) && ((myType === 'solids' && b.id <= 7) || (myType === 'stripes' && b.id >= 9))).length;
        
        if (myBallsLeft === 0 && !foulCommitted) {
            endGame(`${playerName(currentTurn)} Wins!`);
        } else {
            endGame(`${playerName(currentTurn === 1 ? 2 : 1)} Wins! (Illegally pocketed 8-ball)`);
        }
    } else {
        const isStripe = ball.id > 8;
        const type = isStripe ? 'stripes' : 'solids';
        
        if (isTableOpen && !foulCommitted) {
            players[currentTurn].type = type;
            players[currentTurn === 1 ? 2 : 1].type = isStripe ? 'solids' : 'stripes';
            isTableOpen = false;
            players[currentTurn].pottedThisTurn = true;
            setStatus(`${playerName(currentTurn)} is ${type}!`);
        } else if (players[currentTurn].type === type) {
            players[currentTurn].pottedThisTurn = true;
        }
    }
}

function checkTurnEnd() {
    if (!isTableStill() || turnEnding) return;
    turnEnding = true;

    if (!firstHitBall && !foulCommitted) {
        foulCommitted = true;
        setStatus("Foul! Failed to hit a ball.");
    } else if (firstHitBall && !isTableOpen && !foulCommitted) {
        const hitType = firstHitBall.id > 8 ? 'stripes' : 'solids';
        if (firstHitBall.id === 8) {
            const myBallsLeft = balls.filter(b => isOnTable(b) && ((players[currentTurn].type === 'solids' && b.id <= 7) || (players[currentTurn].type === 'stripes' && b.id >= 9))).length;
            if (myBallsLeft > 0) foulCommitted = true;
        } else if (hitType !== players[currentTurn].type) {
            foulCommitted = true;
            setStatus("Foul! Hit opponent's ball first.");
        }
    }

    if (foulCommitted || !players[currentTurn].pottedThisTurn) {
        currentTurn = currentTurn === 1 ? 2 : 1;
        if (foulCommitted) {
            cueBallInHand = true;
            cueBall.active = true;
            cueBall.scale = 1;
            cueBall.alpha = 1;
            cueBall.vx = 0; cueBall.vy = 0;
            cueBall.x = bounds.left + (bounds.right - bounds.left) * 0.25;
            cueBall.y = (bounds.top + bounds.bottom) / 2;
            setStatus(`${playerName(currentTurn)}'s Turn. Ball in hand!`);
        } else {
            setStatus(`${playerName(currentTurn)}'s Turn.`);
        }
    } else {
        setStatus(`${playerName(currentTurn)} continues.`);
    }

    players[1].pottedThisTurn = false;
    players[2].pottedThisTurn = false;
    firstHitBall = null;
    foulCommitted = false;
    turnEnding = false;

    updateUI();

    if (isPvE && currentTurn === 2 && !gameOverOverlay.classList.contains('active')) {
        setTimeout(playBotTurn, 1000);
    }
}

function endGame(msg) {
    winnerText.textContent = msg;
    gameOverOverlay.classList.add('active');
}

// --- Physics Collision Engine ---
function resolveCollisions() {
    for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
            const b1 = balls[i];
            const b2 = balls[j];

            if (!isOnTable(b1) || !isOnTable(b2)) continue;

            const dx = b2.x - b1.x;
            const dy = b2.y - b1.y;
            const dist = Math.hypot(dx, dy);

            if (dist < BALL_RADIUS * 2) {
                if (b1.id === 0 && !firstHitBall) firstHitBall = b2;
                if (b2.id === 0 && !firstHitBall) firstHitBall = b1;

                const overlap = (BALL_RADIUS * 2 - dist) / 2;
                const nx = dx / dist;
                const ny = dy / dist;

                b1.x -= nx * overlap;
                b1.y -= ny * overlap;
                b2.x += nx * overlap;
                b2.y += ny * overlap;

                const kx = b1.vx - b2.vx;
                const ky = b1.vy - b2.vy;
                const p = 2 * (nx * kx + ny * ky) / 2;

                b1.vx -= p * nx * RESTITUTION;
                b1.vy -= p * ny * RESTITUTION;
                b2.vx += p * nx * RESTITUTION;
                b2.vy += p * ny * RESTITUTION;

                Sound.hit(Math.hypot(kx, ky));
            }
        }
    }
}

// --- Shot Prediction (Ghost Ball) ---
function getPrediction() {
    const dx = aimCurrent.x - aimStart.x;
    const dy = aimCurrent.y - aimStart.y;
    const angle = Math.atan2(-dy, -dx); 
    
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    let closestDist = Infinity;
    let hitBall = null;
    let ghostX = cueBall.x;
    let ghostY = cueBall.y;

    const tx1 = dirX !== 0 ? ((bounds.left + BALL_RADIUS) - cueBall.x) / dirX : Infinity;
    const tx2 = dirX !== 0 ? ((bounds.right - BALL_RADIUS) - cueBall.x) / dirX : Infinity;
    const ty1 = dirY !== 0 ? ((bounds.top + BALL_RADIUS) - cueBall.y) / dirY : Infinity;
    const ty2 = dirY !== 0 ? ((bounds.bottom - BALL_RADIUS) - cueBall.y) / dirY : Infinity;

    [tx1, tx2, ty1, ty2].forEach(t => {
        if (t > 0 && t < closestDist) closestDist = t;
    });

    balls.forEach(ball => {
        if (ball.id === 0 || !isOnTable(ball)) return;
        
        const ocX = cueBall.x - ball.x;
        const ocY = cueBall.y - ball.y;
        
        const b = 2.0 * (ocX * dirX + ocY * dirY);
        const c = (ocX * ocX + ocY * ocY) - (BALL_RADIUS * 2) * (BALL_RADIUS * 2);
        const discriminant = b * b - 4 * c;
        
        if (discriminant > 0) {
            const t = (-b - Math.sqrt(discriminant)) / 2.0;
            if (t > 0 && t < closestDist) {
                closestDist = t;
                hitBall = ball;
            }
        }
    });

    ghostX = cueBall.x + dirX * closestDist;
    ghostY = cueBall.y + dirY * closestDist;

    return { ghostX, ghostY, hitBall };
}

// --- Bot AI Logic ---
function playBotTurn() {
    if (!isTableStill() || gameOverOverlay.classList.contains('active')) return;
    
    const myType = players[2].type;
    let targetBalls = balls.filter(b => isOnTable(b) && b.id !== 0 && b.id !== 8);
    
    if (myType === 'solids') targetBalls = targetBalls.filter(b => b.id <= 7);
    if (myType === 'stripes') targetBalls = targetBalls.filter(b => b.id >= 9);
    
    if (targetBalls.length === 0) targetBalls = [balls.find(b => isOnTable(b) && b.id === 8)]; 

    let bestShot = null;

    for (let ball of targetBalls) {
        for (let pocket of pockets) {
            const angleToPocket = Math.atan2(pocket.y - ball.y, pocket.x - ball.x);
            const ghostX = ball.x - Math.cos(angleToPocket) * (BALL_RADIUS * 2);
            const ghostY = ball.y - Math.sin(angleToPocket) * (BALL_RADIUS * 2);

            const angleToGhost = Math.atan2(ghostY - cueBall.y, ghostX - cueBall.x);
            const dist = Math.hypot(ghostX - cueBall.x, ghostY - cueBall.y);
            let blocked = false;
            
            balls.forEach(obstacle => {
                if(obstacle === cueBall || obstacle === ball || !obstacle.active) return;
                const d = Math.abs((ghostY - cueBall.y)*obstacle.x - (ghostX - cueBall.x)*obstacle.y + ghostX*cueBall.y - ghostY*cueBall.x) / dist;
                if(d < BALL_RADIUS * 2 && isBetween(cueBall, obstacle, {x: ghostX, y: ghostY})) blocked = true;
            });

            if (!blocked) {
                bestShot = { angle: angleToGhost, power: 50 + Math.random() * 30 };
                break;
            }
        }
        if (bestShot) break;
    }

    if (!bestShot && targetBalls.length > 0) {
        const fallbackBall = targetBalls[0];
        const angle = Math.atan2(fallbackBall.y - cueBall.y, fallbackBall.x - cueBall.x);
        bestShot = { angle: angle + (Math.random() - 0.5) * 0.2, power: 30 };
    }

    if (bestShot) {
        isAiming = true;
        aimStart = { x: cueBall.x, y: cueBall.y };
        aimCurrent = { 
            x: cueBall.x - Math.cos(bestShot.angle) * bestShot.power, 
            y: cueBall.y - Math.sin(bestShot.angle) * bestShot.power 
        };
        
        setTimeout(() => {
            cueBall.vx = Math.cos(bestShot.angle) * (bestShot.power * 0.18);
            cueBall.vy = Math.sin(bestShot.angle) * (bestShot.power * 0.18);
            Sound.hit(bestShot.power * 0.1);
            isAiming = false;
            cueBallInHand = false;
        }, 800);
    }
}

function isBetween(a, b, c) {
    const dot = (c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y);
    if (dot < 0) return false;
    const sqlen = (c.x - a.x)*(c.x - a.x) + (c.y - a.y)*(c.y - a.y);
    if (dot > sqlen) return false;
    return true;
}

// --- Drawing Logic ---
// --- Table rendering (cached for performance) ---
let tableCache = document.createElement('canvas');
let tableCacheKey = '';

function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
}

function buildTableCache() {
    tableCache.width = canvas.width;
    tableCache.height = canvas.height;
    const c = tableCache.getContext('2d');
    const left = bounds.left, top = bounds.top, right = bounds.right, bottom = bounds.bottom;
    const railW = BALL_RADIUS * 1.6;
    const rx = left - railW, ry = top - railW;
    const rw = (right - left) + railW * 2;
    const rh = (bottom - top) + railW * 2;
    const rad = railW * 0.8;

    // Wooden outer rail with drop shadow
    c.save();
    c.shadowColor = 'rgba(0, 0, 0, 0.6)';
    c.shadowBlur = 24;
    c.shadowOffsetY = 6;
    const wg = c.createLinearGradient(rx, ry, rx, ry + rh);
    wg.addColorStop(0, '#8a5a2e');
    wg.addColorStop(0.5, '#6b431d');
    wg.addColorStop(1, '#4a2d12');
    c.fillStyle = wg;
    roundRectPath(c, rx, ry, rw, rh, rad);
    c.fill();
    c.restore();

    // Wood grain highlights
    c.save();
    roundRectPath(c, rx, ry, rw, rh, rad);
    c.clip();
    c.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    c.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
        const yy = ry + (i + 0.5) * (rh / 14);
        c.beginPath();
        c.moveTo(rx, yy);
        c.bezierCurveTo(rx + rw * 0.3, ry + (i + 0.2) * (rh / 14), rx + rw * 0.7, ry + (i + 0.8) * (rh / 14), rx + rw, yy);
        c.stroke();
    }
    c.restore();

    // Cushion ring around the playing field
    c.fillStyle = '#0a5c34';
    c.fillRect(left - BALL_RADIUS * 0.55, top - BALL_RADIUS * 0.55, (right - left) + BALL_RADIUS * 1.1, (bottom - top) + BALL_RADIUS * 1.1);

    // Felt playing surface with lighting falloff
    const fg = c.createRadialGradient(
        (left + right) / 2, (top + bottom) / 2, (right - left) * 0.1,
        (left + right) / 2, (top + bottom) / 2, (right - left) * 0.68
    );
    fg.addColorStop(0, '#0e8a4d');
    fg.addColorStop(1, '#065f33');
    c.fillStyle = fg;
    c.fillRect(left, top, right - left, bottom - top);

    // Subtle felt texture
    c.save();
    c.beginPath();
    c.rect(left, top, right - left, bottom - top);
    c.clip();
    for (let i = 0; i < 1500; i++) {
        c.fillStyle = Math.random() > 0.5 ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.05)';
        c.fillRect(left + Math.random() * (right - left), top + Math.random() * (bottom - top), 1.5, 1.5);
    }
    c.restore();

    // Pockets with rim highlights
    pockets.forEach(p => {
        const pg = c.createRadialGradient(p.x, p.y - POCKET_RADIUS * 0.25, POCKET_RADIUS * 0.1, p.x, p.y, POCKET_RADIUS);
        pg.addColorStop(0, '#000000');
        pg.addColorStop(0.75, '#050505');
        pg.addColorStop(1, '#1a1a1a');
        c.fillStyle = pg;
        c.beginPath();
        c.arc(p.x, p.y, POCKET_RADIUS, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        c.lineWidth = 2;
        c.stroke();
    });

    // Head string and spots
    const headX = left + (right - left) * 0.25;
    const footX = left + (right - left) * 0.72;
    const midY = (top + bottom) / 2;
    c.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(headX, top);
    c.lineTo(headX, bottom);
    c.stroke();
    c.fillStyle = 'rgba(255, 255, 255, 0.25)';
    [[headX, midY], [footX, midY]].forEach(([sx, sy]) => {
        c.beginPath();
        c.arc(sx, sy, BALL_RADIUS * 0.12, 0, Math.PI * 2);
        c.fill();
    });

    // Diamond sights on the rails
    const drawDiamond = (x, y) => {
        const s = Math.max(3, railW * 0.16);
        c.save();
        c.translate(x, y);
        c.rotate(Math.PI / 4);
        c.fillRect(-s / 2, -s / 2, s, s);
        c.restore();
    };
    c.fillStyle = 'rgba(240, 230, 200, 0.85)';
    [1 / 8, 2 / 8, 3 / 8, 5 / 8, 6 / 8, 7 / 8].forEach(f => {
        drawDiamond(left + f * (right - left), top - railW / 2);
        drawDiamond(left + f * (right - left), bottom + railW / 2);
    });
    [1 / 4, 2 / 4, 3 / 4].forEach(f => {
        drawDiamond(left - railW / 2, top + f * (bottom - top));
        drawDiamond(right + railW / 2, top + f * (bottom - top));
    });
}

function drawTable() {
    const key = canvas.width + 'x' + canvas.height + '|' + [bounds.left, bounds.top, bounds.right, bounds.bottom].join(',');
    if (key !== tableCacheKey) {
        buildTableCache();
        tableCacheKey = key;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0b0d19';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tableCache, 0, 0);
}

// --- Ball-in-hand helpers ---
function isPlacementValid(x, y) {
    if (x - BALL_RADIUS < bounds.left || x + BALL_RADIUS > bounds.right ||
        y - BALL_RADIUS < bounds.top || y + BALL_RADIUS > bounds.bottom) return false;
    return balls.every(b => b === cueBall || !b.active ||
        Math.hypot(b.x - x, b.y - y) >= BALL_RADIUS * 2.02);
}

function drawPlacementHint() {
    if (!cueBallInHand || !cueBall || !cueBall.active) return;
    const valid = isPlacementValid(cueBall.x, cueBall.y);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cueBall.x, cueBall.y, BALL_RADIUS * 1.7, 0, Math.PI * 2);
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = valid ? 'rgba(0, 242, 254, 0.55)' : 'rgba(255, 82, 82, 0.85)';
    ctx.stroke();
    ctx.restore();
}


function drawCueAndPrediction() {
    if (!isAiming || !cueBall.active) return;

    const dx = aimStart.x - aimCurrent.x;
    const dy = aimStart.y - aimCurrent.y;
    if (Math.hypot(dx, dy) < 2) return; 

    const angle = Math.atan2(dy, dx);
    const power = Math.min(Math.hypot(dx, dy), 120);

    const prediction = getPrediction();
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cueBall.x, cueBall.y);
    ctx.lineTo(prediction.ghostX, prediction.ghostY);
    ctx.stroke();
    
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(prediction.ghostX, prediction.ghostY, BALL_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    if (prediction.hitBall) {
        const tgtAngle = Math.atan2(prediction.hitBall.y - prediction.ghostY, prediction.hitBall.x - prediction.ghostX);
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.6)';
        ctx.beginPath();
        ctx.moveTo(prediction.hitBall.x, prediction.hitBall.y);
        ctx.lineTo(prediction.hitBall.x + Math.cos(tgtAngle) * 50, prediction.hitBall.y + Math.sin(tgtAngle) * 50);
        ctx.stroke();
    }

    const cueOffset = BALL_RADIUS + 10 + power * 0.2;
    const cueLength = canvas.width * 0.35;

    ctx.save();
    ctx.translate(cueBall.x, cueBall.y);
    ctx.rotate(angle + Math.PI);

    const stickGrad = ctx.createLinearGradient(cueOffset, 0, cueOffset + cueLength, 0);
    stickGrad.addColorStop(0, '#e5e7eb');
    stickGrad.addColorStop(0.3, '#d97706');
    stickGrad.addColorStop(1, '#78350f');

    ctx.fillStyle = stickGrad;
    ctx.fillRect(cueOffset, -3, cueLength, 6);
    
    ctx.fillStyle = '#00f2fe';
    ctx.fillRect(cueOffset, -3, 6, 6);

    ctx.restore();
}

function isTableStill() {
    return balls.every(b => !b.active || (b.vx === 0 && b.vy === 0));
}

// --- Controls ---
function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
}

canvas.addEventListener('pointerdown', e => {
    initAudio();
    if (!isTableStill() || !cueBall.active || gameOverOverlay.classList.contains('active')) return;
    if (isPvE && currentTurn === 2) return;

    const pos = getCanvasPos(e);
    
    if (cueBallInHand && Math.hypot(pos.x - cueBall.x, pos.y - cueBall.y) < BALL_RADIUS * 3) {
        isAiming = false;
    } else {
        isAiming = true;
        aimStart = pos;
        aimCurrent = pos;
    }
});

canvas.addEventListener('pointermove', e => {
    const pos = getCanvasPos(e);
    
    if (isAiming) {
        aimCurrent = pos;
    } else if (cueBallInHand && e.buttons > 0) {
        const headX = bounds.left + (bounds.right - bounds.left) * 0.25;
        const maxX = isTableOpen && balls.length === 16 ? headX : bounds.right - BALL_RADIUS;
        
        cueBall.x = Math.max(bounds.left + BALL_RADIUS, Math.min(pos.x, maxX));
        cueBall.y = Math.max(bounds.top + BALL_RADIUS, Math.min(pos.y, bounds.bottom - BALL_RADIUS));
    }
});

canvas.addEventListener('pointerup', () => {
    if (isAiming) {
        const dx = aimStart.x - aimCurrent.x;
        const dy = aimStart.y - aimCurrent.y;
        const power = Math.min(Math.hypot(dx, dy), 120);
        const angle = Math.atan2(dy, dx);

        if (power > 10) {
            if (cueBallInHand && !isPlacementValid(cueBall.x, cueBall.y)) {
                setStatus('Place the cue ball on a free spot first!');
                isAiming = false;
                return;
            }
            cueBallInHand = false;
            cueBall.vx = Math.cos(angle) * (power * 0.18);
            cueBall.vy = Math.sin(angle) * (power * 0.18);
            Sound.hit(power * 0.1);
        }
        isAiming = false;
    }
});

// ---------------------------------------------------------------------------
// Device Orientation & Screen Size Detector
// ---------------------------------------------------------------------------
let orientationDismissed = false;

function checkOrientation() {
    const overlay = document.getElementById('orientation-warning');

    // Detect small device in portrait mode
    const isSmallDevice = window.innerWidth <= 768;
    const isPortrait = window.innerHeight > window.innerWidth;

    if (overlay) {
        if (isSmallDevice && isPortrait && !orientationDismissed) {
            overlay.classList.remove('hidden');
            overlay.setAttribute('aria-hidden', 'false');
        } else {
            overlay.classList.add('hidden');
            overlay.setAttribute('aria-hidden', 'true');
        }
    }

    // Recalculate canvas and layout dimensions without resetting the game
    setupTableDimensions();
}


// --- Main Loop ---
function update() {
    const wasMoving = !isTableStill();
    
    balls.forEach(ball => ball.update(bounds, pockets));
    resolveCollisions();
    
    const isMovingNow = !isTableStill();
    if (wasMoving && !isMovingNow) checkTurnEnd();

    drawTable();
    balls.forEach(ball => ball.draw(ctx));
    drawPlacementHint();
    drawCueAndPrediction();

    requestAnimationFrame(update);
}


// Listen to window size and orientation shifts
window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', checkOrientation);

// Screen Orientation API fallback for modern browsers
if (screen.orientation) {
    screen.orientation.addEventListener('change', checkOrientation);
}

document.getElementById('dismiss-orientation-btn')?.addEventListener('click', () => {
    orientationDismissed = true;
    checkOrientation();
});

// Run detection on page initialization
checkOrientation();


initGame();
update();