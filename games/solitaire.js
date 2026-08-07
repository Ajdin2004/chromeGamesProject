const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ---- Responsive layout config (recalculated on resize) ----
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
        if (this.currentX === undefined || instant) {
            this.currentX = x;
            this.currentY = y;
        } else {
            this.currentX += (x - this.currentX) * LERP_SPEED;
            this.currentY += (y - this.currentY) * LERP_SPEED;
            // Snap when close enough to avoid endless tiny jitter
            if (Math.abs(x - this.currentX) < 0.5) this.currentX = x;
            if (Math.abs(y - this.currentY) < 0.5) this.currentY = y;
        }

        const rx = this.currentX;
        const ry = this.currentY;
        this.x = rx;
        this.y = ry;

        ctx.save();
        ctx.translate(rx, ry);

        // Shadow
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = isSelected ? 15 : 5;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        // Card Base
        ctx.fillStyle = this.faceUp ? '#ffffff' : '#2d3436';
        if (!this.faceUp) {
            ctx.fillStyle = '#1e3799';
        }

        ctx.beginPath();
        ctx.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
        ctx.fill();

        if (!this.faceUp) {
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            ctx.fillRect(CARD_WIDTH * 0.125, CARD_HEIGHT * 0.083, CARD_WIDTH * 0.75, CARD_HEIGHT * 0.834);
        } else {
            ctx.strokeStyle = isSelected ? '#00f2fe' : '#dfe6e9';
            ctx.lineWidth = isSelected ? 3 : 1;
            ctx.stroke();

            const rankFont = Math.max(10, CARD_WIDTH * 0.225);
            const smallSuitFont = Math.max(9, CARD_WIDTH * 0.2);
            const bigSuitFont = Math.max(18, CARD_WIDTH * 0.5);

            // Draw Rank and Suit
            ctx.fillStyle = this.color;
            ctx.font = `bold ${rankFont}px Outfit`;
            ctx.textAlign = 'left';
            ctx.fillText(this.rank, CARD_WIDTH * 0.1, CARD_HEIGHT * 0.185);

            const suitIcon = {
                hearts: '♥',
                diamonds: '♦',
                clubs: '♣',
                spades: '♠'
            }[this.suit];

            ctx.font = `${smallSuitFont}px serif`;
            ctx.fillText(suitIcon, CARD_WIDTH * 0.1, CARD_HEIGHT * 0.335);

            // Large center icon
            ctx.font = `${bigSuitFont}px serif`;
            ctx.textAlign = 'center';
            ctx.fillText(suitIcon, CARD_WIDTH / 2, CARD_HEIGHT / 2 + bigSuitFont * 0.35);
        }

        ctx.restore();
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

// Confetti particles for the win celebration
let confetti = [];

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

    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    // Deal Tableau
    tableau = [[], [], [], [], [], [], []];
    let cardIdx = 0;
    for (let i = 0; i < 7; i++) {
        for (let j = 0; j <= i; j++) {
            const card = deck[cardIdx++];
            if (j === i) card.faceUp = true;
            tableau[i].push(card);
        }
    }

    // Stock
    stock = deck.slice(cardIdx);
    stock.forEach(c => c.faceUp = false);
    waste = [];
    foundations = [[], [], [], []];

    // Give every card a starting animation position at the stock pile
    // so the initial deal glides into place.
    allCards().forEach(c => {
        c.currentX = LEFT_MARGIN;
        c.currentY = TOP_MARGIN;
    });

    gameWon = false;
    confetti = [];
    hideWinOverlay();

    history = [];
    saveState();
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
    history.pop(); // Remove current state
    const prevState = JSON.parse(history[history.length - 1]);

    tableau = prevState.tableau.map(col => col.map(data => Object.assign(new Card(), data)));
    foundations = prevState.foundations.map(f => f.map(data => Object.assign(new Card(), data)));
    stock = prevState.stock.map(data => Object.assign(new Card(), data));
    waste = prevState.waste.map(data => Object.assign(new Card(), data));

    gameWon = false;
    hideWinOverlay();
}

function computeLayout() {
    const w = canvas.width;
    const h = canvas.height;

    LEFT_MARGIN = Math.max(10, w * 0.02);
    COLUMN_SPACING = Math.max(6, w * 0.015);

    let widthBased = (w - LEFT_MARGIN * 2 - COLUMN_SPACING * 6) / 7;
    widthBased = Math.max(35, Math.min(widthBased, 100));

    CARD_WIDTH = widthBased;
    CARD_HEIGHT = CARD_WIDTH * 1.45;
    CARD_RADIUS = CARD_WIDTH * 0.1;
    STACK_SPACING = CARD_HEIGHT * 0.26;
    HIDDEN_SPACING = CARD_HEIGHT * 0.12;
    TOP_MARGIN = Math.max(15, h * 0.03);
}

function resize() {
    const container = document.getElementById('game-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    computeLayout();
    resizeConfettiCanvas();
}

window.addEventListener('resize', resize);
resize();

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

function draw() {
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

        foundations[i].forEach(card => card.draw(ctx, x, y));
    }

    // Draw Stock
    const stockX = LEFT_MARGIN;
    const stockY = TOP_MARGIN;
    if (stock.length > 0) {
        stock[stock.length - 1].draw(ctx, stockX, stockY);
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
        waste[waste.length - 1].draw(ctx, LEFT_MARGIN + CARD_WIDTH + COLUMN_SPACING, stockY);
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
                card.draw(ctx, x, tableauCardY(i, j));
            }
        });
    }

    // Draw Dragged Cards (instant, follows pointer directly)
    if (isDragging && draggedCards) {
        draggedCards.forEach((card, i) => {
            card.draw(ctx, mouseX - dragOffsetX, mouseY - dragOffsetY + i * STACK_SPACING, true, true);
        });
    }

    // Confetti overlay
    if (confetti.length > 0) {
        updateAndDrawConfetti();
    }

    requestAnimationFrame(draw);
}

function getCardAt(x, y) {
    // Check Tableau (bottom to top)
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

    // Check Waste
    if (waste.length > 0) {
        const xPos = LEFT_MARGIN + CARD_WIDTH + COLUMN_SPACING;
        const yPos = TOP_MARGIN;
        if (x >= xPos && x <= xPos + CARD_WIDTH && y >= yPos && y <= yPos + CARD_HEIGHT) {
            return { type: 'waste', cards: [waste[waste.length - 1]] };
        }
    }

    // Check Foundations
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

// Attempts to auto-send a single top card (from tableau or waste) to a valid foundation.
// Used for double-click / double-tap interactions.
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
    return true;
}

function checkWin() {
    if (gameWon) return;
    const won = foundations.every(f => f.length === 13);
    if (won) {
        gameWon = true;
        launchConfetti();
        showWinOverlay();
    }
}

// ---------------- Confetti ----------------
function resizeConfettiCanvas() {
    // Confetti is drawn directly onto the main canvas, nothing extra to size.
}

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

// ---------------- Pointer (mouse + touch) handling ----------------
function handlePointerDown(x, y) {
    mouseX = x;
    mouseY = y;
    dragMoved = false;

    // Check Stock Click
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
    }
}

function handlePointerMove(x, y) {
    if (isDragging) {
        const dx = x - mouseX;
        const dy = y - mouseY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
    }
    mouseX = x;
    mouseY = y;
}

function handlePointerUp() {
    if (!isDragging) return;

    const dropX = mouseX;
    const dropY = mouseY;
    let moved = false;

    // Try Foundations (only if dragging 1 card)
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

    // Try Tableau
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
}

// Mouse events
canvas.addEventListener('mousedown', e => {
    const rect = canvas.getBoundingClientRect();
    handlePointerDown(e.clientX - rect.left, e.clientY - rect.top);
});

window.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    handlePointerMove(e.clientX - rect.left, e.clientY - rect.top);
});

window.addEventListener('mouseup', () => {
    handlePointerUp();
});

// Touch events
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

// Double-click (desktop) -> auto move to foundation
canvas.addEventListener('dblclick', e => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = getCardAt(x, y);
    if (hit) tryAutoFoundation(hit);
});

// Double-tap (mobile) -> auto move to foundation
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

initGame();
draw();
