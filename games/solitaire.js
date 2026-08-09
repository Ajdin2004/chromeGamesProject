const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ---- Responsive layout config ----
let CARD_WIDTH = 80;
let CARD_HEIGHT = 120;
let CARD_RADIUS = 8;
let STACK_SPACING = 30;
let HIDDEN_SPACING = 12;
let COLUMN_SPACING = 20;
let TOP_MARGIN = 40;
let LEFT_MARGIN = 40;

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const COLORS = {
    hearts: '#ff4d4d',
    diamonds: '#ff4d4d',
    clubs: '#2d3436',
    spades: '#2d3436'
};

const LERP_SPEED = 0.28;

// ---- OFFSCREEN CANVAS CACHING ----
const cardCache = new Map();

function createCardSprite(suit, rank, faceUp) {
    const dpr = window.devicePixelRatio || 1;
    const pad = 15; // Extra padding for shadow blur bounds
    
    const offscreen = document.createElement('canvas');
    offscreen.width = (CARD_WIDTH + pad * 2) * dpr;
    offscreen.height = (CARD_HEIGHT + pad * 2) * dpr;
    
    const oCtx = offscreen.getContext('2d');
    oCtx.scale(dpr, dpr);

    // Bake the heavy shadow exactly once
    oCtx.shadowColor = 'rgba(0,0,0,0.3)';
    oCtx.shadowBlur = 5;
    oCtx.shadowOffsetX = 2;
    oCtx.shadowOffsetY = 2;

    oCtx.fillStyle = faceUp ? '#ffffff' : '#1e3799';
    oCtx.beginPath();
    oCtx.roundRect(pad, pad, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
    oCtx.fill();

    // Turn off shadow for interior elements to speed up drawing
    oCtx.shadowColor = 'transparent';

    if (!faceUp) {
        oCtx.strokeStyle = 'rgba(255,255,255,0.1)';
        oCtx.lineWidth = 2;
        oCtx.stroke();
        oCtx.fillStyle = 'rgba(255,255,255,0.05)';
        oCtx.fillRect(pad + CARD_WIDTH * 0.125, pad + CARD_HEIGHT * 0.083, CARD_WIDTH * 0.75, CARD_HEIGHT * 0.834);
    } else {
        oCtx.strokeStyle = '#dfe6e9';
        oCtx.lineWidth = 1;
        oCtx.stroke();

        const rankFont = Math.max(10, CARD_WIDTH * 0.225);
        const smallSuitFont = Math.max(9, CARD_WIDTH * 0.2);
        const bigSuitFont = Math.max(18, CARD_WIDTH * 0.5);

        oCtx.fillStyle = COLORS[suit];
        oCtx.font = `bold ${rankFont}px Outfit, sans-serif`;
        oCtx.textAlign = 'left';
        oCtx.fillText(rank, pad + CARD_WIDTH * 0.1, pad + CARD_HEIGHT * 0.185);

        const suitIcon = {
            hearts: '♥',
            diamonds: '♦',
            clubs: '♣',
            spades: '♠'
        }[suit];

        oCtx.font = `${smallSuitFont}px serif`;
        oCtx.fillText(suitIcon, pad + CARD_WIDTH * 0.1, pad + CARD_HEIGHT * 0.335);

        oCtx.font = `${bigSuitFont}px serif`;
        oCtx.textAlign = 'center';
        oCtx.fillText(suitIcon, pad + CARD_WIDTH / 2, pad + CARD_HEIGHT / 2 + bigSuitFont * 0.35);
    }

    return offscreen;
}

function generateCardCache() {
    cardCache.clear();
    cardCache.set('back', createCardSprite(null, null, false));
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            cardCache.set(`${suit}_${rank}`, createCardSprite(suit, rank, true));
        }
    }
}
// ----------------------------------

class Card {
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
        this.faceUp = false;
        this.x = 0;
        this.y = 0;
        this.currentX = undefined;
        this.currentY = undefined;
    }

    get color() {
        return COLORS[this.suit];
    }

    get rankValue() {
        return RANKS.indexOf(this.rank) + 1;
    }

    draw(ctx, x, y, isSelected = false, instant = false) {
        let isMoving = false;
        
        if (this.currentX === undefined || instant) {
            this.currentX = x;
            this.currentY = y;
        } else {
            const dx = x - this.currentX;
            const dy = y - this.currentY;
            if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
                this.currentX += dx * LERP_SPEED;
                this.currentY += dy * LERP_SPEED;
                isMoving = true;
            } else {
                this.currentX = x;
                this.currentY = y;
            }
        }

        const rx = this.currentX;
        const ry = this.currentY;
        this.x = rx;
        this.y = ry;

        const key = this.faceUp ? `${this.suit}_${this.rank}` : 'back';
        const cached = cardCache.get(key);

        if (cached) {
            // Apply the -15 offset from the padding used during pre-rendering
            ctx.drawImage(cached, rx - 15, ry - 15, CARD_WIDTH + 30, CARD_HEIGHT + 30);
        }

        if (isSelected) {
            ctx.save();
            ctx.strokeStyle = '#00f2fe';
            ctx.lineWidth = 3;
            // A separate elevated glow for active selections
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.roundRect(rx, ry, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
            ctx.stroke();
            ctx.restore();
        }

        return isMoving;
    }
}

let deck = [];
let tableau = [[], [], [], [], [], [], []];
let foundations = [[], [], [], []];
let stock = [];
let waste = [];

let draggedCards = null;
let dragSource = null;
let mouseX = 0;
let mouseY = 0;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let dragMoved = false;

let history = [];
let gameWon = false;
let confetti = [];

// ---- Demand-Driven Render Engine ----
let animFrameId = null;

function requestRender() {
    if (!animFrameId) {
        animFrameId = requestAnimationFrame(drawLoop);
    }
}

function drawLoop() {
    let keepAnimating = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Foundations (Slots)
    for (let i = 0; i < 4; i++) {
        const x = LEFT_MARGIN + (i + 3) * (CARD_WIDTH + COLUMN_SPACING);
        const y = TOP_MARGIN;
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, y, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.font = `${Math.max(18, CARD_WIDTH * 0.5)}px serif`;
        ctx.textAlign = 'center';
        ctx.fillText(['♥', '♦', '♣', '♠'][i], x + CARD_WIDTH / 2, y + CARD_HEIGHT / 2 + CARD_WIDTH * 0.18);

        foundations[i].forEach(card => {
            if (card.draw(ctx, x, y)) keepAnimating = true;
        });
    }

    // Draw Stock
    const stockX = LEFT_MARGIN;
    const stockY = TOP_MARGIN;
    if (stock.length > 0) {
        if (stock[stock.length - 1].draw(ctx, stockX, stockY)) keepAnimating = true;
    } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.roundRect(stockX, stockY, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.font = `${Math.max(18, CARD_WIDTH * 0.35)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('↻', stockX + CARD_WIDTH / 2, stockY + CARD_HEIGHT / 2 + CARD_WIDTH * 0.1);
    }

    // Draw Waste 
    if (waste.length > 0) {
        const topWasteCard = waste[waste.length - 1];
        if (!isDragging || !draggedCards || !draggedCards.includes(topWasteCard)) {
            if (topWasteCard.draw(ctx, LEFT_MARGIN + CARD_WIDTH + COLUMN_SPACING, stockY)) keepAnimating = true;
        }
    }

    // Draw Tableau
    for (let i = 0; i < 7; i++) {
        const x = LEFT_MARGIN + i * (CARD_WIDTH + COLUMN_SPACING);
        const yBase = TOP_MARGIN + CARD_HEIGHT + 40;

        if (tableau[i].length === 0) {
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.beginPath();
            ctx.roundRect(x, yBase, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
            ctx.stroke();
        }

        tableau[i].forEach((card, j) => {
            if (!isDragging || !draggedCards || !draggedCards.includes(card)) {
                if (card.draw(ctx, x, tableauCardY(i, j))) keepAnimating = true;
            }
        });
    }

    // Draw Dragged Cards 
    if (isDragging && draggedCards) {
        draggedCards.forEach((card, i) => {
            card.draw(ctx, mouseX - dragOffsetX, mouseY - dragOffsetY + i * STACK_SPACING, true, true);
        });
        keepAnimating = true; // Constantly update while dragging
    }

    // Confetti overlay
    if (confetti.length > 0) {
        updateAndDrawConfetti();
        keepAnimating = true;
    }

    // Suspend loop if absolutely nothing is moving
    if (keepAnimating) {
        animFrameId = requestAnimationFrame(drawLoop);
    } else {
        animFrameId = null; 
    }
}
// ---------------------------------------------

function allCards() {
    return [
        ...tableau.flat(),
        ...foundations.flat(),
        ...stock,
        ...waste
    ];
}

function initGame() {
    deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push(new Card(suit, rank));
        }
    }

    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    tableau = [[], [], [], [], [], [], []];
    let cardIdx = 0;
    for (let i = 0; i < 7; i++) {
        for (let j = 0; j <= i; j++) {
            const card = deck[cardIdx++];
            if (j === i) card.faceUp = true;
            tableau[i].push(card);
        }
    }

    stock = deck.slice(cardIdx);
    stock.forEach(c => c.faceUp = false);
    waste = [];
    foundations = [[], [], [], []];

    allCards().forEach(c => {
        c.currentX = LEFT_MARGIN;
        c.currentY = TOP_MARGIN;
    });

    gameWon = false;
    confetti = [];
    hideWinOverlay();
    history = [];
    
    saveState();
    requestRender();
}

function saveState() {
    const state = {
        tableau: tableau.map(col => col.map(c => ({...c}))),
        foundations: foundations.map(f => f.map(c => ({...c}))),
        stock: stock.map(c => ({...c})),
        waste: waste.map(c => ({...c}))
    };
    history.push(JSON.stringify(state));
    if (history.length > 50) history.shift();
    checkWin();
}

function undo() {
    if (history.length <= 1) return;
    history.pop(); 
    const prevState = JSON.parse(history[history.length - 1]);

    tableau = prevState.tableau.map(col => col.map(data => Object.assign(new Card(), data)));
    foundations = prevState.foundations.map(f => f.map(data => Object.assign(new Card(), data)));
    stock = prevState.stock.map(data => Object.assign(new Card(), data));
    waste = prevState.waste.map(data => Object.assign(new Card(), data));

    gameWon = false;
    hideWinOverlay();
    requestRender();
}

function computeLayout() {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);

    LEFT_MARGIN = Math.max(12, w * 0.03);
    COLUMN_SPACING = Math.max(8, w * 0.02);

    let widthBased = (w - LEFT_MARGIN * 2 - COLUMN_SPACING * 6) / 7;
    CARD_WIDTH = Math.max(35, Math.min(widthBased, 160));
    CARD_HEIGHT = CARD_WIDTH * 1.45;
    CARD_RADIUS = CARD_WIDTH * 0.1;
    
    STACK_SPACING = Math.min(CARD_HEIGHT * 0.3, (h - CARD_HEIGHT - 60) / 12);
    HIDDEN_SPACING = CARD_HEIGHT * 0.12;
    TOP_MARGIN = Math.max(15, h * 0.03);
    
    generateCardCache();
}

function resize() {
    const container = document.getElementById('game-container');
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = container.clientWidth * dpr;
    canvas.height = container.clientHeight * dpr;
    
    ctx.scale(dpr, dpr);
    computeLayout();
    requestRender();
}

window.addEventListener('resize', resize);

function tableauCardY(col, index) {
    let y = TOP_MARGIN + CARD_HEIGHT + 40;
    for (let k = 0; k < index; k++) {
        y += tableau[col][k] && tableau[col][k].faceUp ? STACK_SPACING : HIDDEN_SPACING;
    }
    return y;
}

function tableauStackHeight(col) {
    const arr = tableau[col];
    if (arr.length === 0) return TOP_MARGIN + CARD_HEIGHT + 40;
    return tableauCardY(col, arr.length - 1) + CARD_HEIGHT;
}

function getCardAt(x, y) {
    for (let i = 6; i >= 0; i--) {
        const col = tableau[i];
        for (let j = col.length - 1; j >= 0; j--) {
            const card = col[j];
            const cardX = LEFT_MARGIN + i * (CARD_WIDTH + COLUMN_SPACING);
            const cardY = tableauCardY(i, j);

            if (x >= cardX && x <= cardX + CARD_WIDTH && y >= cardY && y <= cardY + CARD_HEIGHT) {
                if (!card.faceUp) return null;
                return { type: 'tableau', colIndex: i, cardIndex: j, cards: col.slice(j) };
            }
        }
    }

    if (waste.length > 0) {
        const xPos = LEFT_MARGIN + CARD_WIDTH + COLUMN_SPACING;
        const yPos = TOP_MARGIN;
        if (x >= xPos && x <= xPos + CARD_WIDTH && y >= yPos && y <= yPos + CARD_HEIGHT) {
            return { type: 'waste', cards: [waste[waste.length - 1]] };
        }
    }

    for (let i = 0; i < 4; i++) {
        const xPos = LEFT_MARGIN + (i + 3) * (CARD_WIDTH + COLUMN_SPACING);
        const yPos = TOP_MARGIN;
        if (x >= xPos && x <= xPos + CARD_WIDTH && y >= yPos && y <= yPos + CARD_HEIGHT) {
            if (foundations[i].length > 0) {
                return { type: 'foundation', fIndex: i, cards: [foundations[i][foundations[i].length - 1]] };
            }
        }
    }

    return null;
}

function canDropOnFoundation(card, fIndex) {
    const target = foundations[fIndex];
    if (target.length === 0) return card.rank === 'A';
    const lastCard = target[target.length - 1];
    return card.suit === lastCard.suit && card.rankValue === lastCard.rankValue + 1;
}

function findFoundationFor(card) {
    for (let i = 0; i < 4; i++) {
        if (canDropOnFoundation(card, i)) return i;
    }
    return -1;
}

function removeFromSource(source) {
    if (source.type === 'tableau') {
        tableau[source.colIndex].splice(source.cardIndex);
    } else if (source.type === 'waste') {
        waste.pop();
    } else if (source.type === 'foundation') {
        foundations[source.fIndex].pop();
    }
}

function flipRevealedTableauCard(colIndex) {
    const col = tableau[colIndex];
    if (col.length > 0) col[col.length - 1].faceUp = true;
}

function tryAutoFoundation(hit) {
    if (!hit || hit.cards.length !== 1) return false;
    const card = hit.cards[0];
    if (!card.faceUp) return false;
    if (hit.type === 'foundation') return false;

    const fIndex = findFoundationFor(card);
    if (fIndex === -1) return false;

    removeFromSource(hit);
    foundations[fIndex].push(card);

    if (hit.type === 'tableau') {
        flipRevealedTableauCard(hit.colIndex);
    }
    saveState();
    requestRender();
    return true;
}

function checkWin() {
    if (gameWon) return;
    const won = foundations.every(f => f.length === 13);
    if (won) {
        gameWon = true;
        launchConfetti();
        showWinOverlay();
        requestRender();
    }
}

// ---------------- Confetti ----------------
function launchConfetti() {
    confetti = [];
    const colors = ['#00f2fe', '#7928ca', '#ff0080', '#facc15', '#10b981', '#ff4d4d'];
    for (let i = 0; i < 140; i++) {
        confetti.push({
            x: Math.random() * canvas.width,
            y: -Math.random() * canvas.height * 0.5,
            vx: (Math.random() - 0.5) * 3,
            vy: Math.random() * 2 + 2,
            size: Math.random() * 6 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.2
        });
    }
}

function updateAndDrawConfetti() {
    let stillActive = false;
    confetti.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.03;
        p.rotation += p.rotSpeed;

        if (p.y < canvas.height + 20) stillActive = true;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
    });

    if (!stillActive) confetti = [];
}

function showWinOverlay() {
    const overlay = document.getElementById('win-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

function hideWinOverlay() {
    const overlay = document.getElementById('win-overlay');
    if (overlay) overlay.classList.add('hidden');
}

// ---------------- Pointer handling ----------------
function handlePointerDown(x, y) {
    mouseX = x;
    mouseY = y;
    dragMoved = false;

    const stockX = LEFT_MARGIN;
    const stockY = TOP_MARGIN;
    if (x >= stockX && x <= stockX + CARD_WIDTH && y >= stockY && y <= stockY + CARD_HEIGHT) {
        if (stock.length > 0) {
            const card = stock.pop();
            card.faceUp = true;
            waste.push(card);
        } else {
            while (waste.length > 0) {
                const card = waste.pop();
                card.faceUp = false;
                stock.push(card);
            }
        }
        saveState();
        requestRender();
        return;
    }

    const hit = getCardAt(x, y);
    if (hit) {
        isDragging = true;
        draggedCards = hit.cards;
        dragSource = hit;

        const firstCard = draggedCards[0];
        dragOffsetX = x - firstCard.x;
        dragOffsetY = y - firstCard.y;
        requestRender();
    }
}

function handlePointerMove(x, y) {
    if (isDragging) {
        const dx = x - mouseX;
        const dy = y - mouseY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
        requestRender(); // Force update while actively holding
    }
    mouseX = x;
    mouseY = y;
}

function handlePointerUp() {
    if (!isDragging) return;

    const dropX = mouseX;
    const dropY = mouseY;
    let moved = false;

    if (draggedCards.length === 1) {
        for (let i = 0; i < 4; i++) {
            const xPos = LEFT_MARGIN + (i + 3) * (CARD_WIDTH + COLUMN_SPACING);
            const yPos = TOP_MARGIN;
            if (dropX >= xPos && dropX <= xPos + CARD_WIDTH && dropY >= yPos && dropY <= yPos + CARD_HEIGHT) {
                const card = draggedCards[0];
                if (canDropOnFoundation(card, i)) {
                    removeFromSource(dragSource);
                    foundations[i].push(card);
                    moved = true;
                    break;
                }
            }
        }
    }

    if (!moved) {
        for (let i = 0; i < 7; i++) {
            const xPos = LEFT_MARGIN + i * (CARD_WIDTH + COLUMN_SPACING);
            const col = tableau[i];
            const stackTop = tableauStackHeight(i);
            const yPos = col.length === 0 ? (TOP_MARGIN + CARD_HEIGHT + 40) : (stackTop - CARD_HEIGHT);
            const dropZoneBottom = stackTop + 100;

            if (dropX >= xPos && dropX <= xPos + CARD_WIDTH && dropY >= yPos && dropY <= dropZoneBottom) {
                const card = draggedCards[0];
                let canDrop = false;

                if (col.length === 0) {
                    if (card.rank === 'K') canDrop = true;
                } else {
                    const lastCard = col[col.length - 1];
                    const isOppositeColor = (['hearts', 'diamonds'].includes(card.suit) !== ['hearts', 'diamonds'].includes(lastCard.suit));
                    if (isOppositeColor && card.rankValue === lastCard.rankValue - 1) {
                        canDrop = true;
                    }
                }

                if (canDrop) {
                    removeFromSource(dragSource);
                    draggedCards.forEach(c => tableau[i].push(c));
                    moved = true;
                    break;
                }
            }
        }
    }

    if (moved) {
        if (dragSource.type === 'tableau') {
            flipRevealedTableauCard(dragSource.colIndex);
        }
        saveState();
    }

    isDragging = false;
    draggedCards = null;
    dragSource = null;
    requestRender();
}

canvas.addEventListener('mousedown', e => {
    const rect = canvas.getBoundingClientRect();
    handlePointerDown(e.clientX - rect.left, e.clientY - rect.top);
});

window.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    handlePointerMove(e.clientX - rect.left, e.clientY - rect.top);
});

window.addEventListener('mouseup', () => handlePointerUp());

canvas.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    handlePointerDown(touch.clientX - rect.left, touch.clientY - rect.top);
    checkDoubleTap(touch.clientX - rect.left, touch.clientY - rect.top);
    e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchmove', e => {
    if (e.touches.length !== 1) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    handlePointerMove(touch.clientX - rect.left, touch.clientY - rect.top);
    if (isDragging) e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', e => {
    handlePointerUp();
    e.preventDefault();
}, { passive: false });

canvas.addEventListener('dblclick', e => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = getCardAt(x, y);
    if (hit) tryAutoFoundation(hit);
});

let lastTapTime = 0;
let lastTapX = 0;
let lastTapY = 0;
function checkDoubleTap(x, y) {
    const now = Date.now();
    const dx = x - lastTapX;
    const dy = y - lastTapY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (now - lastTapTime < 320 && dist < 30) {
        const hit = getCardAt(x, y);
        if (hit) tryAutoFoundation(hit);
        lastTapTime = 0;
    } else {
        lastTapTime = now;
        lastTapX = x;
        lastTapY = y;
    }
}

document.getElementById('new-game').addEventListener('click', initGame);
document.getElementById('undo-btn').addEventListener('click', undo);

const winNewGameBtn = document.getElementById('win-new-game');
if (winNewGameBtn) winNewGameBtn.addEventListener('click', initGame);

// Allow standard DOM fonts to load before first render caching
document.fonts.ready.then(() => {
    resize();
    initGame();
});