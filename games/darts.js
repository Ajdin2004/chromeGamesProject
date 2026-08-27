/* ============================================================
   NEON DARTS — classic pub darts: checkout from 501
   Aiming: two-stage sweeping crosshair (tap/click/space).
   Faster sweeps = wider scatter. Doubles & triples count.
   ============================================================ */
'use strict';

// ----- Canvas setup -----
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const SIZE = 520;
const CX = SIZE / 2, CY = SIZE / 2;
const R = 196;                      // double-ring outer radius (px)

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ----- Board geometry (proportions of a real 170mm-radius board) -----
const SEG_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const RING = {
    bull:      0.075,
    outerBull: 0.1875,
    tripleIn:  0.582,
    tripleOut: 0.629,
    doubleIn:  0.953,
    doubleOut: 1.0
};
const COL_DARK   = '#141824';
const COL_LIGHT  = '#e8e3d3';
const COL_RED    = '#dc2626';
const COL_GREEN  = '#15803d';
const COL_WIRE   = 'rgba(148,163,184,0.55)';
const COL_ACCENT = '#fb7185';

// ----- Pre-render the static board to an offscreen canvas -----
const boardLayer = document.createElement('canvas');
(function paintBoard() {
    const dpr = window.devicePixelRatio || 1;
    boardLayer.width = SIZE * dpr;
    boardLayer.height = SIZE * dpr;
    const b = boardLayer.getContext('2d');
    b.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Surround ring (the black number band)
    b.beginPath();
    b.arc(CX, CY, R * 1.18, 0, Math.PI * 2);
    const bandGrad = b.createRadialGradient(CX, CY, R, CX, CY, R * 1.18);
    bandGrad.addColorStop(0, '#0d1020');
    bandGrad.addColorStop(1, '#05070f');
    b.fillStyle = bandGrad;
    b.fill();

    // Twenty wedge segments
    for (let i = 0; i < 20; i++) {
        const aMid = (-90 + i * 18) * Math.PI / 180;
        const a0 = aMid - Math.PI / 20;
        const a1 = aMid + Math.PI / 20;
        const even = i % 2 === 0;

        const wedge = (rIn, rOut, fill) => {
            b.beginPath();
            b.arc(CX, CY, rOut, a0, a1);
            b.arc(CX, CY, rIn, a1, a0, true);
            b.closePath();
            b.fillStyle = fill;
            b.fill();
            b.strokeStyle = COL_WIRE;
            b.lineWidth = 1.2;
            b.stroke();
        };
        wedge(R * RING.doubleIn, R * RING.doubleOut, even ? COL_RED : COL_GREEN);
        wedge(R * RING.tripleIn, R * RING.tripleOut, even ? COL_RED : COL_GREEN);
        wedge(R * RING.outerBull, R * RING.tripleIn, even ? COL_DARK : COL_LIGHT);
        wedge(R * RING.bull, R * RING.doubleIn, even ? COL_DARK : COL_LIGHT);
    }

    // Bullseye
    b.beginPath();
    b.arc(CX, CY, R * RING.bull, 0, Math.PI * 2);
    b.fillStyle = COL_RED;
    b.fill();
    b.strokeStyle = COL_WIRE;
    b.lineWidth = 1.2;
    b.stroke();

    // Numbers around the band
    b.font = "800 17px Outfit, sans-serif";
    b.textAlign = 'center';
    b.textBaseline = 'middle';
    for (let i = 0; i < 20; i++) {
        const aMid = (-90 + i * 18) * Math.PI / 180;
        const nx = CX + Math.cos(aMid) * R * 1.095;
        const ny = CY + Math.sin(aMid) * R * 1.095;
        b.fillStyle = '#cbd5e1';
        b.fillText(SEG_ORDER[i], nx, ny);
    }
})();

// ----- Scoring -----
function scoreAt(px, py) {
    const dx = px - CX, dy = py - CY;
    const dist = Math.hypot(dx, dy);
    const rNorm = dist / R;

    let segVal = 0;
    if (rNorm <= RING.doubleOut) {
        let deg = Math.atan2(dy, dx) * 180 / Math.PI + 90; // 0° = top
        if (deg < 0) deg += 360;
        segVal = SEG_ORDER[Math.floor(((deg + 9) % 360) / 18)];
    }

    if (rNorm > RING.doubleOut) return { points: 0, label: 'Miss', mult: 0 };
    if (rNorm <= RING.bull)      return { points: 50, label: 'BULLSEYE', mult: 1 };
    if (rNorm <= RING.outerBull) return { points: 25, label: 'Outer Bull', mult: 1 };
    if (rNorm >= RING.tripleIn && rNorm <= RING.tripleOut)
        return { points: segVal * 3, label: `T${segVal}`, mult: 3 };
    if (rNorm >= RING.doubleIn)
        return { points: segVal * 2, label: `D${segVal}`, mult: 2 };
    return { points: segVal, label: `${segVal}`, mult: 1 };
}

// ----- DOM refs -----
const remainingEl  = document.getElementById('remaining');
const lastThrowEl  = document.getElementById('last-throw');
const dartsUsedEl  = document.getElementById('darts-used');
const bestEl       = document.getElementById('best');
const pipsEl       = document.getElementById('pips');
const visitLogEl   = document.getElementById('visit-log');
const toastEl      = document.getElementById('toast');
const startOverlay = document.getElementById('start-overlay');
const winOverlay   = document.getElementById('win-overlay');

// ----- Game state -----
const START_SCORE = 501;
let mode = 'start';            // start | aim-h | aim-v | fly | over
let remaining = START_SCORE;
let visitStartScore = START_SCORE;
let dartsInVisit = 0;
let dartsUsed = 0;
let visitThrows = [];
let stuckDarts = [];           // { x, y } landed positions
let flyDart = null;            // { from:{x,y}, to:{x,y}, t }
let aimPos = -1;               // sweep position in [-1, 1]
let aimDir = 1;
let lockedX = CX, lockedY = CY;
let lastTs = 0;

// Sweep speed ramps up with every completed visit (difficulty curve)
function sweepSpeed() {
    const visitsDone = Math.floor(dartsUsed / 3);
    return Math.min(1.0 + visitsDone * 0.18, 2.4); // units per second
}
// Scatter grows with the current sweep speed — throwing blind is risky
function scatterRadius() {
    return 4 + sweepSpeed() * 14;
}

function resetGame() {
    mode = 'start';
    remaining = START_SCORE;
    visitStartScore = START_SCORE;
    dartsInVisit = 0;
    dartsUsed = 0;
    visitThrows = [];
    stuckDarts = [];
    flyDart = null;
    aimPos = -1;
    aimDir = 1;
    remainingEl.textContent = remaining;
    lastThrowEl.textContent = '—';
    dartsUsedEl.textContent = '0';
    renderPips();
    renderVisitLog();
    winOverlay.classList.remove('visible');
    startOverlay.classList.add('visible');
}

function beginAiming() {
    startOverlay.classList.remove('visible');
    winOverlay.classList.remove('visible');
    if (mode === 'start' || mode === 'over' || mode === 'aim-h') {
        remaining = START_SCORE;
        visitStartScore = START_SCORE;
        dartsUsed = 0;
        dartsInVisit = 0;
        visitThrows = [];
        stuckDarts = [];
        remainingEl.textContent = remaining;
        dartsUsedEl.textContent = '0';
        lastThrowEl.textContent = '—';
        renderPips();
        renderVisitLog();
        mode = 'aim-h';
        aimPos = Math.random() < 0.5 ? -1 : 1;
    } else if (mode === 'aim-h-next') {
        mode = 'aim-h';
    }
}

function primaryAction() {
    if (mode === 'start' || mode === 'over') { beginAiming(); return; }

    if (mode === 'aim-h') {
        // Lock the horizontal coordinate
        lockedX = CX + aimPos * R * 1.02;
        aimPos = 0;                       // vertical sweep starts centered
        aimDir = 1;
        mode = 'aim-v';
        return;
    }
    if (mode === 'aim-v') {
        // Lock the vertical coordinate and throw
        lockedY = CY + aimPos * R * 1.02;
        throwDart();
    }
}

// ----- Throw & visit resolution -----
function throwDart() {
    const scatter = scatterRadius();
    const jitterX = (Math.random() * 2 - 1) * scatter;
    const jitterY = (Math.random() * 2 - 1) * scatter;
    const target = { x: lockedX + jitterX, y: lockedY + jitterY };

    flyDart = { from: { x: CX, y: SIZE }, to: target, t: 0 };
    mode = 'fly';
}

function landDart() {
    const hit = scoreAt(flyDart.to.x, flyDart.to.y);
    stuckDarts.push({ x: flyDart.to.x, y: flyDart.to.y });
    flyDart = null;
    dartsUsed++;
    dartsInVisit++;
    visitThrows.push(hit);
    lastThrowEl.textContent = hit.label;
    dartsUsedEl.textContent = dartsUsed;
    renderPips();

    if (hit.points === 0) {
        showToast('Miss! Nothing scored');
    } else {
        showToast(`${hit.label} — ${hit.points}`);
    }

    const nextRemaining = remaining - hit.points;

    // Bust: below zero, or left on 1
    if (nextRemaining < 0 || nextRemaining === 1) {
        remaining = visitStartScore;
        remainingEl.textContent = remaining;
        renderVisitLog('BUST!');
        endVisit(true);
        return;
    }

    // Checkout!
    if (nextRemaining === 0) {
        remaining = 0;
        remainingEl.textContent = '0';
        winGame();
        return;
    }

    remaining = nextRemaining;
    remainingEl.textContent = remaining;

    if (dartsInVisit >= 3) {
        renderVisitLog();
        endVisit(false);
    } else {
        setTimeout(() => {
            if (mode !== 'over') { aimPos = Math.random() < 0.5 ? -1 : 1; mode = 'aim-h'; }
        }, 550);
    }
}

function endVisit(busted) {
    visitStartScore = remaining;
    stuckDarts = [];
    dartsInVisit = 0;
    visitThrows = [];
    setTimeout(() => {
        if (mode === 'over') return;
        renderPips();
        aimPos = Math.random() < 0.5 ? -1 : 1;
        aimDir = 1;
        mode = 'aim-h';
    }, 900);
}

function winGame() {
    mode = 'over';
    document.getElementById('win-darts').textContent = dartsUsed;
    const best = parseInt(localStorage.getItem('darts_highscore') || '0', 10);
    let detail = `Checkout: ${stuckDarts.slice(-3).map(d => scoreAt(d.x, d.y).label).join(' → ')}`;
    if (!best || dartsUsed < best) {
        localStorage.setItem('darts_highscore', String(dartsUsed));
        detail += ' — New personal best!';
    }
    document.getElementById('win-detail').textContent = detail;
    updateBestChip();
    winOverlay.classList.add('visible');
}

// ----- HUD helpers -----
function renderPips() {
    pipsEl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const pip = document.createElement('div');
        pip.className = 'pip' + (i < dartsInVisit ? ' thrown' : '');
        pipsEl.appendChild(pip);
    }
}

function renderVisitLog(prefix) {
    const parts = prefix ? [prefix] : [];
    if (visitThrows.length) parts.push(visitThrows.map(t => t.label).join(' + '));
    if (!parts.length && !prefix) parts.push('Visit 1 — good luck!');
    visitLogEl.textContent = parts.join(' · ');
}

function updateBestChip() {
    const best = parseInt(localStorage.getItem('darts_highscore') || '0', 10);
    bestEl.textContent = best > 0 ? `${best} darts` : '—';
}

let toastTimer = null;
function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1400);
}

// ----- Rendering -----
const AIM_RANGE = R * 1.02;

function updateSweep(dt) {
    if (mode !== 'aim-h' && mode !== 'aim-v') return;
    aimPos += aimDir * sweepSpeed() * dt;
    if (aimPos > 1) { aimPos = 1; aimDir = -1; }
    if (aimPos < -1) { aimPos = -1; aimDir = 1; }
}

function drawCrosshair() {
    if (mode !== 'aim-h' && mode !== 'aim-v') return;
    const curX = mode === 'aim-h' ? CX + aimPos * AIM_RANGE : lockedX;
    const curY = mode === 'aim-h' ? CY : CY + aimPos * AIM_RANGE;
    const scatter = scatterRadius();

    ctx.save();
    // Full guide line along the axis being swept
    ctx.strokeStyle = COL_ACCENT;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([7, 9]);
    ctx.beginPath();
    if (mode === 'aim-h') {
        ctx.moveTo(curX, CY - AIM_RANGE); ctx.lineTo(curX, CY + AIM_RANGE);
    } else {
        ctx.moveTo(CX - AIM_RANGE, curY); ctx.lineTo(CX + AIM_RANGE, curY);
        // Show the already-locked axis as solid
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.45;
        ctx.moveTo(lockedX, CY - AIM_RANGE); ctx.lineTo(lockedX, CY + AIM_RANGE);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Reticle + risk preview circle
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COL_ACCENT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(curX, curY, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.28;
    ctx.setLineDash([3, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(curX, curY, scatter, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

function drawStuckDart(x, y, i) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.35 + i * 0.12);
    // Flight
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(0, -2); ctx.lineTo(11, -8); ctx.lineTo(13, 0); ctx.lineTo(11, 8); ctx.lineTo(0, 2);
    ctx.closePath(); ctx.fill();
    // Barrel
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(0, 0); ctx.stroke();
    // Point glint
    ctx.fillStyle = COL_ACCENT;
    ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(10,12,24,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
}

function drawFlyingDart() {
    if (!flyDart) return;
    flyDart.t = Math.min(flyDart.t + 16 / 260, 1);
    const e = 1 - (1 - flyDart.t) * (1 - flyDart.t); // ease-out
    const x = flyDart.from.x + (flyDart.to.x - flyDart.from.x) * e;
    const y = flyDart.from.y + (flyDart.to.y - flyDart.from.y) * e;
    const scale = 1.6 - 0.6 * e;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.rotate(Math.atan2(flyDart.to.y - flyDart.from.y, flyDart.to.x - flyDart.from.x) + Math.PI / 2);
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(0, -3); ctx.lineTo(10, -9); ctx.lineTo(12, 0); ctx.lineTo(10, 9); ctx.lineTo(0, 3);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(0, 0); ctx.stroke();
    ctx.fillStyle = COL_ACCENT;
    ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    if (flyDart.t >= 1) landDart();
}

function frame(ts) {
    const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0;
    lastTs = ts;
    updateSweep(dt);

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(boardLayer, 0, 0, SIZE, SIZE);

    stuckDarts.forEach((d, i) => drawStuckDart(d.x, d.y, i));
    drawCrosshair();
    drawFlyingDart();

    requestAnimationFrame(frame);
}

// ----- Input -----
canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    primaryAction();
});
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        primaryAction();
    }
});
document.getElementById('btn-start').addEventListener('click', beginAiming);
document.getElementById('btn-again').addEventListener('click', resetGame);
document.getElementById('btn-new').addEventListener('click', () => {
    startOverlay.classList.remove('visible');
    winOverlay.classList.remove('visible');
    mode = 'start';            // force fresh stats, then start aiming
    beginAiming();
});

// ----- Init -----
updateBestChip();
renderPips();
renderVisitLog();
requestAnimationFrame(frame);
