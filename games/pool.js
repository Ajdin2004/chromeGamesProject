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
        this.rotation = 0;
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

        // Visual rolling rotation
        const speed = Math.hypot(this.vx, this.vy);
        if (speed > 0.1) {
            this.rotation += speed * 0.05;
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
            if (Math.hypot(this.x - p.x, this.y - p.y) < POCKET_RADIUS * 0.8) {
                this.scale = 0.99; // trigger shrink animation next frame
                Sound.pocket();
                handlePocketedBall(this);
                return; 
            }
            if (Math.hypot(this.x - p.x, this.y - p.y) < POCKET_RADIUS * 1.5) {
                inPocketRadius = true; // Disable cushion bounce near pockets to allow clean dropping
            }
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

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.scale, this.scale);
        ctx.globalAlpha = this.alpha;
        ctx.rotate(this.rotation);

        // Drop shadow
        ctx.shadowColor = "rgba(0,0,0,0.4)";
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;

        // Base color with radial gradient for 3D sphere effect
        const grad = ctx.createRadialGradient(-BALL_RADIUS*0.3, -BALL_RADIUS*0.3, BALL_RADIUS*0.1, 0, 0, BALL_RADIUS);
        grad.addColorStop(0, this.stripe ? '#ffffff' : this.color);
        grad.addColorStop(1, this.stripe ? '#dddddd' : darken(this.color));
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowColor = "transparent";

        // Stripe Fill
        if (this.stripe) {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(0, 0, BALL_RADIUS, -Math.PI / 3, Math.PI / 3);
            ctx.arc(0, 0, BALL_RADIUS, (2 * Math.PI) / 3, (4 * Math.PI) / 3);
            ctx.fill();
        }

        // Number Circle
        if (this.id !== 0) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, BALL_RADIUS * 0.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.rotate(-this.rotation);
            ctx.fillStyle = '#000000';
            ctx.font = `800 ${BALL_RADIUS * 0.6}px Outfit, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.id, 0, 1);
        } else {
            // Cue ball spin dot
            ctx.fillStyle = '#ff4444';
            ctx.beginPath();
            ctx.arc(BALL_RADIUS * 0.5, 0, BALL_RADIUS * 0.15, 0, Math.PI * 2);
            ctx.fill();
        }

        // Glossy Specular Highlight
        ctx.rotate(-this.rotation);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.ellipse(-BALL_RADIUS * 0.35, -BALL_RADIUS * 0.35, BALL_RADIUS * 0.3, BALL_RADIUS * 0.15, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

function darken(hex) {
    if(hex === '#ffffff') return '#cccccc';
    if(hex === '#111827') return '#000000';
    return hex; 
}

// --- Game State & Rules ---
let balls = [];
let pockets = [];
let bounds = {};
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

    const uiPaddingTop = 60; 
    const uiPaddingBottom = 75; 
    const availableH = h - uiPaddingTop - uiPaddingBottom - 30;
    const availableW = w - 30;

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

    balls.forEach(b => {
        if (b.active) {
            b.x = Math.max(bounds.left + BALL_RADIUS, Math.min(b.x, bounds.right - BALL_RADIUS));
            b.y = Math.max(bounds.top + BALL_RADIUS, Math.min(b.y, bounds.bottom - BALL_RADIUS));
        }
    });
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

    const solidsLeft = balls.filter(b => b.active && b.id >= 1 && b.id <= 7).length;
    const stripesLeft = balls.filter(b => b.active && b.id >= 9 && b.id <= 15).length;

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
        const myBallsLeft = balls.filter(b => b.active && b.scale === 1 && ((myType === 'solids' && b.id <= 7) || (myType === 'stripes' && b.id >= 9))).length;
        
        if (myBallsLeft === 0 && !foulCommitted) {
            endGame(`Player ${currentTurn} Wins!`);
        } else {
            endGame(`Player ${currentTurn === 1 ? 2 : 1} Wins! (Illegally pocketed 8-ball)`);
        }
    } else {
        const isStripe = ball.id > 8;
        const type = isStripe ? 'stripes' : 'solids';
        
        if (isTableOpen && !foulCommitted) {
            players[currentTurn].type = type;
            players[currentTurn === 1 ? 2 : 1].type = isStripe ? 'solids' : 'stripes';
            isTableOpen = false;
            players[currentTurn].pottedThisTurn = true;
            setStatus(`Player ${currentTurn} is ${type}!`);
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
            const myBallsLeft = balls.filter(b => b.active && ((players[currentTurn].type === 'solids' && b.id <= 7) || (players[currentTurn].type === 'stripes' && b.id >= 9))).length;
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
            setStatus(`Player ${currentTurn}'s Turn. Ball in hand!`);
        } else {
            setStatus(`Player ${currentTurn}'s Turn.`);
        }
    } else {
        setStatus(`Player ${currentTurn} continues.`);
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

            if (!b1.active || !b2.active || b1.scale < 1 || b2.scale < 1) continue;

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
        if (ball.id === 0 || !ball.active || ball.scale < 1) return;
        
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
    let targetBalls = balls.filter(b => b.active && b.id !== 0 && b.id !== 8);
    
    if (myType === 'solids') targetBalls = targetBalls.filter(b => b.id <= 7);
    if (myType === 'stripes') targetBalls = targetBalls.filter(b => b.id >= 9);
    
    if (targetBalls.length === 0) targetBalls = [balls.find(b => b.id === 8)]; 

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
function drawTable() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#065f33';
    ctx.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);

    ctx.fillStyle = '#050505';
    pockets.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, POCKET_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const headX = bounds.left + (bounds.right - bounds.left) * 0.25;
    ctx.moveTo(headX, bounds.top);
    ctx.lineTo(headX, bounds.bottom);
    ctx.stroke();
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
            cueBallInHand = false;
            cueBall.vx = Math.cos(angle) * (power * 0.18);
            cueBall.vy = Math.sin(angle) * (power * 0.18);
            Sound.hit(power * 0.1);
        }
        isAiming = false;
    }
});

window.addEventListener('resize', setupTableDimensions);

// --- Main Loop ---
function update() {
    const wasMoving = !isTableStill();
    
    balls.forEach(ball => ball.update(bounds, pockets));
    resolveCollisions();
    
    const isMovingNow = !isTableStill();
    if (wasMoving && !isMovingNow) checkTurnEnd();

    drawTable();
    balls.forEach(ball => ball.draw(ctx));
    drawCueAndPrediction();

    requestAnimationFrame(update);
}

initGame();
update();