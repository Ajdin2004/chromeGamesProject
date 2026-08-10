// =============================================================================
// TEXAS HOLD'EM POKER — Production build
// =============================================================================
'use strict';

const canvas = (typeof document !== 'undefined') ? document.getElementById('gameCanvas') : null;
const ctx = canvas ? canvas.getContext('2d') : null;

// ---------------------------------------------------------------------------
// Cards & Deck
// ---------------------------------------------------------------------------
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const COLORS = { hearts: '#ff4d4d', diamonds: '#ff4d4d', clubs: '#2d3436', spades: '#2d3436' };
const SUIT_ICONS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };

class Card {
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
        this.faceUp = false;
        this.x = 0; this.y = 0;       // current position
        this.tx = 0; this.ty = 0;     // target position
        this.flipStart = -1;          // flip animation start timestamp
        this.flipDur = 400;
    }
    get color() { return COLORS[this.suit]; }
    get rankValue() { return RANKS.indexOf(this.rank) + 2; }
    key() { return this.suit + ':' + this.rank; }

    draw(x, y, opts = {}) {
        if (!ctx) return;
        const scale = opts.scale || 1;
        const w = CARD_WIDTH * scale;
        const h = CARD_HEIGHT * scale;
        const r = CARD_RADIUS * scale;
        const glow = opts.glow || false;
        const dim = opts.dim || false;

        // Face orientation for flip animation
        let faceUp = this.faceUp;
        let sx = 1;
        if (opts.flipT !== undefined && opts.flipT >= 0) {
            faceUp = opts.flipT < 0.5 ? !this.faceUp : this.faceUp;
            sx = Math.max(0.05, Math.abs(Math.cos(opts.flipT * Math.PI)));
        }

        ctx.save();
        // x/y are always the card CENTER. This keeps all seats and animations
        // in the same coordinate system and prevents top-left drift.
        ctx.translate(x, y);
        ctx.scale(sx, 1);
        ctx.translate(-w / 2, -h / 2);

        // Shadow
        ctx.shadowColor = glow ? 'rgba(250,204,21,0.8)' : 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = glow ? 16 : 5;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        // Card base
        ctx.fillStyle = faceUp ? '#ffffff' : '#1e3799';
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, r);
        ctx.fill();

        if (glow) {
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        if (!faceUp) {
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            ctx.fillRect(w * 0.125, h * 0.083, w * 0.75, h * 0.834);
            // small diamond motif
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.beginPath();
            ctx.moveTo(w * 0.5, h * 0.3);
            ctx.lineTo(w * 0.62, h * 0.5);
            ctx.lineTo(w * 0.5, h * 0.7);
            ctx.lineTo(w * 0.38, h * 0.5);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#dfe6e9';
            ctx.lineWidth = 1;
            ctx.stroke();

            const rankFont = Math.max(9, w * 0.22);
            const smallSuitFont = Math.max(8, w * 0.19);
            const bigSuitFont = Math.max(16, w * 0.46);

            ctx.fillStyle = this.color;
            ctx.globalAlpha = dim ? 0.45 : 1;
            ctx.font = `bold ${rankFont}px Outfit`;
            ctx.textAlign = 'left';
            ctx.fillText(this.rank, w * 0.1, h * 0.185);

            ctx.font = `${smallSuitFont}px serif`;
            ctx.fillText(SUIT_ICONS[this.suit], w * 0.1, h * 0.335);

            ctx.font = `${bigSuitFont}px serif`;
            ctx.textAlign = 'center';
            ctx.fillText(SUIT_ICONS[this.suit], w / 2, h / 2 + bigSuitFont * 0.35);
            ctx.globalAlpha = 1;
        }
        ctx.restore();
    }
}

// ---------------------------------------------------------------------------
// Web Audio Synthesizer
// ---------------------------------------------------------------------------
let audioCtx = null;
let soundMuted = false;

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

const Sound = {
    _play(freq, dur, type = 'sine', vol = 0.2, slideTo = null) {
        if (!audioCtx || soundMuted) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, audioCtx.currentTime + dur);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + dur);
    },
    _noise(dur, vol = 0.12, filterFreq = 700, filterType = 'bandpass') {
        if (!audioCtx || soundMuted) return;
        const bufferSize = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const src = audioCtx.createBufferSource();
        src.buffer = buffer;
        const filter = audioCtx.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.value = filterFreq;
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        src.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
        src.start();
    },
    card() {
        // Low "shuffle" whoosh — filtered noise + soft low thump like cards sliding
        this._noise(0.10, 0.12, 650, 'lowpass');
        this._play(300, 0.05, 'triangle', 0.05, 180);
    },
    chip() {
        // Mellow "clink" for chips going into the pot
        this._play(900, 0.08, 'triangle', 0.10, 600);
    },
    raise() {
        // Soft rising "swoosh" for a raise
        this._play(200, 0.18, 'sawtooth', 0.08, 500);
    },
    win() {
        // Ascending arpeggio (lower octave) for a win
        [262, 330, 392, 523].forEach((f, i) => {
            setTimeout(() => this._play(f, 0.18, 'triangle', 0.14), i * 90);
        });
    },
    lose() {
        // Descending tone for a loss
        this._play(300, 0.4, 'sawtooth', 0.10, 100);
    },
    showdown() {
        // Dramatic reveal
        this._play(150, 0.5, 'sine', 0.13, 500);
    }
};

// ---------------------------------------------------------------------------
// Hand evaluation — best 5 of 7
// ---------------------------------------------------------------------------
function compareEval(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    for (let i = 0; i < Math.min(a.tiebreakers.length, b.tiebreakers.length); i++) {
        if (a.tiebreakers[i] !== b.tiebreakers[i]) return a.tiebreakers[i] - b.tiebreakers[i];
    }
    return 0;
}

function straightHigh5(uniqDesc) {
    if (uniqDesc.length < 5) return 0;
    // Wheel: A-2-3-4-5
    if (uniqDesc.includes(14) && uniqDesc.includes(2) && uniqDesc.includes(3) && uniqDesc.includes(4) && uniqDesc.includes(5)) return 5;
    for (let i = 0; i <= uniqDesc.length - 5; i++) {
        if (uniqDesc[i] - uniqDesc[i + 4] === 4) return uniqDesc[i];
    }
    return 0;
}

function evaluate5(cards) {
    const vals = cards.map(c => c.rankValue).sort((a, b) => b - a);
    const cnt = {};
    vals.forEach(v => cnt[v] = (cnt[v] || 0) + 1);
    const uniq = Object.keys(cnt).map(Number).sort((a, b) => b - a);
    const flush = cards.every(c => c.suit === cards[0].suit);
    const sh = flush ? straightHigh5(uniq) : 0;

    if (sh) {
        return { rank: sh === 14 ? 9 : 8, tiebreakers: [sh], cards };
    }
    const four = uniq.find(v => cnt[v] === 4);
    if (four !== undefined) {
        return { rank: 7, tiebreakers: [four, ...uniq.filter(v => v !== four)], cards };
    }
    const three = uniq.find(v => cnt[v] === 3);
    const pair1 = uniq.find(v => cnt[v] === 2);
    if (three !== undefined && pair1 !== undefined) {
        return { rank: 6, tiebreakers: [three, pair1], cards };
    }
    if (flush) {
        return { rank: 5, tiebreakers: vals, cards };
    }
    const sh2 = straightHigh5(uniq);
    if (sh2) {
        return { rank: 4, tiebreakers: [sh2], cards };
    }
    if (three !== undefined) {
        return { rank: 3, tiebreakers: [three, ...uniq.filter(v => v !== three)], cards };
    }
    const pairs = uniq.filter(v => cnt[v] === 2);
    if (pairs.length === 2) {
        const kick = uniq.find(v => cnt[v] === 1);
        return { rank: 2, tiebreakers: [pairs[0], pairs[1], kick], cards };
    }
    if (pairs.length === 1) {
        return { rank: 1, tiebreakers: [pairs[0], ...uniq.filter(v => v !== pairs[0])], cards };
    }
    return { rank: 0, tiebreakers: vals, cards };
}

function evaluateCards(cards) {
    if (cards.length !== 7) return evaluate5(cards);
    // Best 5 of 7 — all 21 combinations
    let best = null;
    for (let a = 0; a < 3; a++)
        for (let b = a + 1; b < 4; b++)
            for (let c = b + 1; c < 5; c++)
                for (let d = c + 1; d < 6; d++)
                    for (let e = d + 1; e < 7; e++) {
                        const combo = [cards[a], cards[b], cards[c], cards[d], cards[e]];
                        const ev = evaluate5(combo);
                        if (!best || compareEval(ev, best) > 0) best = ev;
                    }
    return best;
}

const RANK_LABEL = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10', 9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2' };
const RANK_PLURAL = { 14: 'Aces', 13: 'Kings', 12: 'Queens', 11: 'Jacks', 10: 'Tens', 9: 'Nines', 8: 'Eights', 7: 'Sevens', 6: 'Sixes', 5: 'Fives', 4: 'Fours', 3: 'Threes', 2: 'Twos' };

function handLabel(ev) {
    switch (ev.rank) {
        case 9: return 'Royal Flush';
        case 8: return `Straight Flush, ${RANK_LABEL[ev.tiebreakers[0]]} high`;
        case 7: return `Four of a Kind, ${RANK_PLURAL[ev.tiebreakers[0]]}`;
        case 6: return `Full House, ${RANK_PLURAL[ev.tiebreakers[0]]} full of ${RANK_PLURAL[ev.tiebreakers[1]]}`;
        case 5: return `Flush, ${RANK_LABEL[ev.tiebreakers[0]]} high`;
        case 4: return `Straight, ${RANK_LABEL[ev.tiebreakers[0]]} high`;
        case 3: return `Three of a Kind, ${RANK_PLURAL[ev.tiebreakers[0]]}`;
        case 2: return `Two Pair, ${RANK_PLURAL[ev.tiebreakers[0]]} and ${RANK_PLURAL[ev.tiebreakers[1]]}`;
        case 1: return `Pair of ${RANK_PLURAL[ev.tiebreakers[0]]}`;
        default: return `High Card, ${RANK_LABEL[ev.tiebreakers[0]]} high`;
    }
}

// ---------------------------------------------------------------------------
// Responsive layout
// ---------------------------------------------------------------------------
let CARD_WIDTH = 70;
let CARD_HEIGHT = 100;
let CARD_RADIUS = 8;

function viewportSize() {
    const rect = canvas.getBoundingClientRect();
    return {
        w: Math.max(1, rect.width),
        h: Math.max(1, rect.height)
    };
}

function computeLayout() {
    if (!canvas) return;

    const { w, h } = viewportSize();
    const portrait = h > w * 1.08;
    const veryShort = h < 480;

    // Five community cards are the hardest horizontal constraint.
    const communityCap = (w - 28 - 4 * 7) / 5;
    const widthCap = portrait ? w * 0.115 : w * 0.075;
    const heightCap = portrait ? h * 0.135 : h * 0.18;

    CARD_WIDTH = Math.max(
        30,
        Math.min(communityCap, widthCap, heightCap / 1.45, portrait ? 58 : 86)
    );
    CARD_HEIGHT = CARD_WIDTH * 1.45;
    CARD_RADIUS = Math.max(5, CARD_WIDTH * 0.095);

    // Store the values on the canvas for debugging/inspection.
    canvas.__pokerViewport = { w, h, portrait, veryShort };
}

function resize() {
    if (!canvas) return;
    const container = document.getElementById('game-container');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    computeLayout();
    updateHeaderVisibility();
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function seatCardScale(seatIdx) {
    const v = canvas.__pokerViewport || viewportSize();
    if (seatIdx === 0) return v.portrait ? 1.05 : 1.08;
    return v.portrait ? 0.86 : 0.92;
}

function cardSizeForSeat(seatIdx) {
    const scale = seatCardScale(seatIdx);
    return { w: CARD_WIDTH * scale, h: CARD_HEIGHT * scale };
}

function layout() {
    const { w, h } = viewportSize();
    const v = canvas.__pokerViewport || { portrait: h > w * 1.08, veryShort: h < 480 };
    const portrait = v.portrait;
    const veryShort = v.veryShort;

    const playerCard = cardSizeForSeat(0);
    const aiCard = cardSizeForSeat(1);

    // Dynamic top safe boundary depending on whether header is currently hidden
    const headerEl = document.querySelector('.header');
    const isHeaderHidden = headerEl && headerEl.classList.contains('hidden-landscape');
    
    // In landscape with hidden header, start content below screen notches (safe-area)
    const topOffset = (!portrait && isHeaderHidden) ? 20 : 12;

    const left = Math.max(12, w * 0.035);
    const right = w - left;

    // Worst-case AI info panel (name + chips + bet badge) is drawn ABOVE the
    // AI cards. Compute a minimum AI card Y so that panel stays fully on-screen.
    const aiPanelHeight = 62;
    const aiPanelGap = 16;

    // Adjust Opponent Band Y position to stay fully visible on screen
    const aiNameY = portrait 
        ? Math.max(28, h * 0.075) 
        : Math.max(topOffset + 14, h * 0.12);

    const aiCardY = portrait
        ? clamp(h * 0.255, aiNameY + aiCard.h * 0.72, h * 0.31)
        : clamp(
            Math.max(h * 0.30, topOffset + aiPanelHeight + aiPanelGap + aiCard.h * 0.5),
            aiNameY + aiCard.h * 0.70,
            h * 0.42
        );

    const playerCardY = clamp(
        h * (portrait ? 0.80 : 0.84),
        h * 0.68,
        h - playerCard.h * 0.55 - 8
    );

    const boardY = clamp(
        (aiCardY + playerCardY) * 0.52,
        aiCardY + CARD_HEIGHT * 0.95,
        playerCardY - CARD_HEIGHT * 1.15
    );

    const potY = clamp(boardY - CARD_HEIGHT * 0.95, aiNameY + 20, h * 0.54);

    const sideX = clamp(w * (portrait ? 0.20 : 0.18), aiCard.w * 0.72 + 8, w * 0.30);
    const centerX = w * 0.5;
    const sideRightX = w - sideX;

    return {
        w, h, portrait, veryShort,
        left, right,
        AI_NAME_Y: aiNameY,
        AI_CHIPS_Y: aiNameY + (portrait ? 16 : 18),
        AI_CARDS_Y: aiCardY,
        COMMUNITY_Y: boardY,
        POT_Y: potY,
        PLAYER_CARDS_Y: playerCardY,
        PLAYER_LABEL_Y: playerCardY - playerCard.h * 0.5 - 16,
        FEED_Y: aiCardY + aiCard.h * 0.5 + 12,

        deck: { x: left + 10, y: potY },
        // In landscape the pot is docked to the bottom-right corner, just
        // above the player's chip panel, so it is never hidden behind the
        // AI cards. Portrait stays centered.
        pot: portrait
            ? { x: centerX, y: potY }
            : { x: w - 100, y: h - 62 - 10 - 21 - 8 },
        community: { x: centerX, y: boardY },

        seats: [
            { x: centerX, y: playerCardY },
            { x: sideX, y: aiCardY },
            { x: centerX, y: aiCardY },
            { x: sideRightX, y: aiCardY }
        ]
    };
}

// ---------------------------------------------------------------------------
// Header Auto-Hide & Gesture Controls
// ---------------------------------------------------------------------------
let headerManuallyRevealed = false;
let headerTouchStartY = 0;
let headerHideTimeout = null;

function updateHeaderVisibility() {
    const header = document.querySelector('.header');
    if (!header) return;

    const isLandscape = window.innerWidth > window.innerHeight;
    const isGameActive = mode === 'dealing' || mode === 'betting' || mode === 'street' || mode === 'showdown';

    const shouldHide = isLandscape && isGameActive && !headerManuallyRevealed;

    if (shouldHide !== header.classList.contains('hidden-landscape')) {
        header.classList.toggle('hidden-landscape', shouldHide);
        
        // Trigger resize and re-layout immediately after header state changes
        setTimeout(() => {
            resize();
            repositionActiveCards();
        }, 50);
    }
}

// Touch gesture listener to swipe header down
window.addEventListener('touchstart', (e) => {
    headerTouchStartY = e.touches[0].clientY;
}, { passive: true });

window.addEventListener('touchmove', (e) => {
    const touchY = e.touches[0].clientY;
    const deltaY = touchY - headerTouchStartY;

    // Detect pull-down from top edge (< 40px)
    if (headerTouchStartY < 40 && deltaY > 30) {
        headerManuallyRevealed = true;
        updateHeaderVisibility();

        // Auto-hide header again after 4 seconds of inactivity
        clearTimeout(headerHideTimeout);
        headerHideTimeout = setTimeout(() => {
            headerManuallyRevealed = false;
            updateHeaderVisibility();
        }, 4000);
    }
}, { passive: true });

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const AI_PERSONALITIES = {
    Neon: { raiseAgg: 0.35, bluffFreq: 0.15, foldTight: 0.6 },
    Viper: { raiseAgg: 0.75, bluffFreq: 0.4, foldTight: 0.15 },
    Ace: { raiseAgg: 0.5, bluffFreq: 0.22, foldTight: 0.4 }
};

let seats = [];           // seat 0 = player
let community = [];
let deck = [];
let pot = 0;
let displayPot = 0;
let currentBet = 0;
let actionQueue = [];
let dealerPos = 0;
let smallBlind = 10;
let bigBlind = 20;
let handNumber = 0;
let mode = 'idle';        // idle | dealing | betting | street | showdown | payout | gameover
let phaseLabel = '';
let playerTurn = false;
let pendingAIPlayer = -1;
let aiThinkUntil = 0;
let streetUntil = 0;
let afterStreet = null;
let showdownUntil = 0;
let payoutUntil = 0;
let afterPayout = null;
let dealingT = 0;
let dealingCards = [];
let dealDurTotal = 0;
let winningKeys = [];
let winningEval = null;
let bestSeatIdx = -1;
let actionFeed = [];
let confetti = [];
let floatingChips = [];
let lastNow = performance.now();
let resultShown = false;
let gameOverMsg = '';
let handHistory = [];


function makeSeat(name, isPlayer, personality) {
    return { name, isPlayer, personality, chips: 1000, bet: 0, totalBet: 0, folded: false, hand: [] };
}
function seat(i) { return seats[i]; }
function playerSeat() { return seats[0]; }
function activeActors() { return seats.map((s, i) => i).filter(i => !seats[i].folded && seats[i].chips > 0); }
function activeContenders() { return seats.map((s, i) => i).filter(i => !seats[i].folded); }
function allInSeats() { return seats.map((s, i) => i).filter(i => !seats[i].folded && seats[i].chips <= 0); }

function createDeck() {
    deck = [];
    for (const suit of SUITS) for (const rank of RANKS) deck.push(new Card(suit, rank));
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function loadChips() {
    try { const v = parseInt(localStorage.getItem('poker_chips'), 10); if (v && v > 0) return v; } catch (e) { /* ignore */ }
    return 1000;
}
function saveChips() {
    try { localStorage.setItem('poker_chips', String(playerSeat().chips)); } catch (e) { /* ignore */ }
}
function saveBestChips() {
    try {
        const best = parseInt(localStorage.getItem('poker_best_chips'), 10) || 0;
        if (playerSeat().chips > best) localStorage.setItem('poker_best_chips', String(playerSeat().chips));
    } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Game flow
// ---------------------------------------------------------------------------
function newHand() {
    if (mode === 'dealing' || mode === 'betting' || mode === 'street') return;
    hideOverlay();
    createDeck();
    community = [];
    pot = 0; displayPot = 0; currentBet = 0;
    winningKeys = []; winningEval = null; bestSeatIdx = -1;
    actionFeed = []; floatingChips = []; confetti = [];
    seats.forEach(s => { s.hand = []; s.bet = 0; s.totalBet = 0; s.folded = false; });
    handNumber++;
    dealHoleCards();
    mode = 'dealing';
    dealingT = 0;
    updateOverlay();
    updateHeaderVisibility();
}

function dealHoleCards() {
    const L = layout();
    dealingCards = [];
    let delay = 0;
    for (let r = 0; r < 2; r++) {
        for (let i = 0; i < 4; i++) {
            const card = deck.pop();
            card.faceUp = (i === 0);
            card.x = L.deck.x; card.y = L.deck.y;
            const tgt = seatCardPos(i, r);
            card.tx = tgt.x; card.ty = tgt.y;
            card.flipStart = -1;
            card.arrived = false;
            card.dealDelay = delay;
            card.dealDur = 650;
            seats[i].hand.push(card);
            dealingCards.push(card);
            Sound.card();
            delay += 140;
        }
    }
    dealDurTotal = delay;
    logAction(`Hand #${handNumber} — dealing…`);
}

function seatCardPos(seatIdx, cardIdx) {
    const L = layout();
    const s = L.seats[seatIdx];
    const n = seats[seatIdx].hand.length || 2;
    const scale = seatCardScale(seatIdx);
    const spacing = seatIdx === 0
        ? CARD_WIDTH * scale + Math.max(6, CARD_WIDTH * 0.10)
        : CARD_WIDTH * scale * 0.62;
    return {
        x: s.x - ((n - 1) * spacing) / 2 + cardIdx * spacing,
        y: s.y
    };
}

function startBettingRound(firstToAct) {
    mode = 'betting';
    buildActionQueue(firstToAct);
    runTurn();
    updateHeaderVisibility();
}

function buildActionQueue(firstToAct) {
    actionQueue = [];
    const active = activeActors();
    if (!active.length) return;
    let idx = active.indexOf(firstToAct);
    if (idx === -1) {
        // first-to-act isn't active; find next active going around
        idx = -1;
        for (let k = 1; k <= 4; k++) {
            const cand = (firstToAct + k) % 4;
            if (active.includes(cand)) { idx = active.indexOf(cand); break; }
        }
        if (idx === -1) idx = 0;
    }
    for (let i = 0; i < active.length; i++) actionQueue.push(active[(idx + i) % active.length]);
}

function runTurn() {
    if (mode !== 'betting') return;
    while (actionQueue.length > 0) {
        const idx = actionQueue[0];
        if (seats[idx].folded || seats[idx].chips <= 0) { actionQueue.shift(); continue; }
        if (seats[idx].isPlayer) {
            playerTurn = true;
            updateButtons();
            return;
        }
        playerTurn = false;
        updateButtons();
        pendingAIPlayer = idx;
        aiThinkUntil = performance.now() + 500 + Math.random() * 700;
        return;
    }
    endBettingRound();
}

function advanceAfterAction() {
    if (mode !== 'betting') return;
    // If only one non-folded player remains, they win immediately
    const contenders = activeContenders();
    if (contenders.length === 1) {
        awardPot(contenders[0], 'everyone folded');
        return;
    }
    if (contenders.length === 0) return; // should not happen
    actionQueue.shift();
    runTurn();
}

function endBettingRound() {
    if (mode !== 'betting') return;
    const contenders = activeContenders();
    if (contenders.length === 1) {
        awardPot(contenders[0], 'everyone folded');
        return;
    }
    // Reset round bets, keep totalBet
    seats.forEach(s => { s.bet = 0; });
    currentBet = 0;
    if (community.length === 0) {
        burnAndStreet(3, 'Flop');
    } else if (community.length === 3) {
        burnAndStreet(1, 'Turn');
    } else if (community.length === 4) {
        burnAndStreet(1, 'River');
    } else {
        startShowdown();
    }
}

function burnAndStreet(count, label) {
    mode = 'street';
    phaseLabel = label;
    deck.pop(); // burn
    Sound.card();
    const L = layout();
    const spacing = CARD_WIDTH + Math.max(5, CARD_WIDTH * 0.10);
    const startX = L.community.x - ((community.length + count - 1) * spacing) / 2;
    community.forEach((c, i) => {
        c.tx = startX + i * spacing;
        c.ty = L.community.y;
    });
    for (let i = 0; i < count; i++) {
        const card = deck.pop();
        card.faceUp = true;
        card.x = L.deck.x; card.y = L.deck.y;
        const idx = community.length;
        card.tx = startX + idx * spacing;
        card.ty = L.community.y;
        card.flipStart = performance.now() + i * 250;
        card.flipDur = 420;
        card.arrived = true;
        community.push(card);
    }
    streetUntil = performance.now() + count * 250 + 500;
    afterStreet = () => {
        mode = 'betting';
        logAction(`${label} dealt`);
        startBettingRound((dealerPos + 1) % 4);
    };
}

function startShowdown() {
    mode = 'showdown';
    phaseLabel = 'Showdown';
    Sound.showdown();
    let base = performance.now() + 400;
    seats.forEach((s, i) => {
        if (i > 0 && !s.folded) {
            s.hand.forEach(c => { c.flipStart = base + (i - 1) * 300; c.flipDur = 420; });
        }
    });
    showdownUntil = base + 3 * 300 + 500;
    logAction('Showdown!');
}

function computeWinnerAndAward() {
    // Evaluate best hand for every non-folded seat
    const evals = activeContenders().map(i => ({
        i,
        ev: evaluateCards([...seats[i].hand, ...community])
    }));

    // Overall strongest hand (for highlight & message)
    let bestE = evals[0].ev;
    let bestList = [evals[0]];
    for (const e2 of evals.slice(1)) {
        const cmp = compareEval(e2.ev, bestE);
        if (cmp > 0) { bestE = e2.ev; bestList = [e2]; }
        else if (cmp === 0) bestList.push(e2);
    }
    winningEval = bestE;
    winningKeys = (bestE.cards || []).map(c => c.key());
    bestSeatIdx = bestList[0].i;

    // Payout via side pots
    const before = playerSeat().chips;
    payoutSidePots();
    const won = playerSeat().chips - before;

    // Floating chip animation pot -> winner(s bestSeat)
    spawnPayoutChips(bestSeatIdx);

    // Determine outcome message
    const playerIsBest = bestList.some(b => b.i === 0);
    const aiChipsLeft = seats.slice(1).filter(s => s.chips > 0).length;

    if (playerSeat().chips <= 0) {
        gameOverMsg = 'busted';
    } else if (aiChipsLeft === 0) {
        gameOverMsg = 'cleared';
    } else if (playerIsBest) {
        gameOverMsg = 'win';
    } else {
        gameOverMsg = 'lose';
    }

    mode = 'payout';
    payoutUntil = performance.now() + 1500;
    afterPayout = () => finishHand(won);
    saveChips();
    saveBestChips();
}

function payoutSidePots() {
    const contributors = [0, 1, 2, 3].map(i => ({ i, totalBet: seats[i].totalBet, folded: seats[i].folded }));
    const levels = [...new Set(contributors.filter(c => c.totalBet > 0).map(c => c.totalBet))].sort((a, b) => a - b);
    let prev = 0;
    for (const level of levels) {
        const elig = contributors.filter(c => c.totalBet >= level);
        const segment = (level - prev) * elig.length;
        const contenders = elig.filter(c => !c.folded);
        if (segment > 0 && contenders.length > 0) {
            const evals = contenders.map(c => ({ i: c.i, ev: evaluateCards([...seats[c.i].hand, ...community]) }));
            let best = evals[0].ev;
            let winners = [evals[0]];
            for (const e2 of evals.slice(1)) {
                const cmp = compareEval(e2.ev, best);
                if (cmp > 0) { best = e2.ev; winners = [e2]; }
                else if (cmp === 0) winners.push(e2);
            }
            const share = Math.floor(segment / winners.length);
            winners.forEach(w => { seats[w.i].chips += share; });
        }
        prev = level;
    }
    pot = 0;
}

function awardPot(seatIdx, reason) {
    const name = seatIdx === 0 ? 'You' : seats[seatIdx].name;
    const amount = pot;
    const playerBefore = playerSeat().chips;
    pot = 0;
    seats[seatIdx].chips += amount;
    winningKeys = [];
    winningEval = null;
    bestSeatIdx = seatIdx;
    logAction(`${name} wins the pot! (${reason})`);
    spawnPayoutChips(seatIdx);

    const won = playerSeat().chips - playerBefore;

    const aiChipsLeft = seats.slice(1).filter(s => s.chips > 0).length;
    if (playerSeat().chips <= 0) gameOverMsg = 'busted';
    else if (aiChipsLeft === 0) gameOverMsg = 'cleared';
    else gameOverMsg = seatIdx === 0 ? 'win' : 'lose';

    mode = 'payout';
    payoutUntil = performance.now() + 1400;
    afterPayout = () => finishHand(won);
    saveChips();
    saveBestChips();
}

function finishHand(wonAmount) {
    dealerPos = (dealerPos + 1) % 4;
    showResultOverlay(wonAmount);
    updateButtons();
    updateHeaderVisibility();
}

function showResultOverlay(wonAmount) {
    const overlay = document.getElementById('result-overlay');
    const titleEl = document.getElementById('result-title');
    const descEl = document.getElementById('result-desc');
    const btn = document.getElementById('result-new-game');
    if (!overlay || !titleEl || !descEl || !btn) return;

    resultShown = true;

    if (gameOverMsg === 'win' || gameOverMsg === 'cleared') {
        Sound.win();
    } else if (gameOverMsg === 'lose' || gameOverMsg === 'busted') {
        Sound.lose();
    }

    if (gameOverMsg === 'win') {
        launchConfetti();
        titleEl.innerHTML = `<i class="fa-solid fa-trophy" style="color:#facc15;"></i> You Win!`;
        descEl.textContent = `You take ${wonAmount} chips with ${handLabel(winningEval)}!`;
    } else if (gameOverMsg === 'lose') {
        titleEl.innerHTML = `<i class="fa-solid fa-robot" style="color:#ff0080;"></i> ${seats[bestSeatIdx].name} Wins!`;
        descEl.textContent = `${seats[bestSeatIdx].name} takes the pot with ${handLabel(winningEval)}.`;
    } else if (gameOverMsg === 'busted') {
        titleEl.innerHTML = `<i class="fa-solid fa-skull" style="color:#ff4d4d;"></i> You Busted!`;
        descEl.textContent = `You're out of chips. Your bankroll has been reset.`;
        btn.textContent = 'Restart Game';
    } else if (gameOverMsg === 'cleared') {
        launchConfetti();
        titleEl.innerHTML = `<i class="fa-solid fa-crown" style="color:#facc15;"></i> You Cleared the Table!`;
        descEl.textContent = `All opponents are out. You are the champion!`;
        btn.textContent = 'New Tournament';
    } else {
        titleEl.innerHTML = `<i class="fa-solid fa-handshake" style="color:#00f2fe;"></i> Hand Complete`;
        descEl.textContent = `Bankroll: ${playerSeat().chips} chips.`;
        btn.textContent = 'Next Hand';
    }
    overlay.classList.remove('hidden');
}

function hideOverlay() {
    resultShown = false;
    const overlay = document.getElementById('result-overlay');
    if (overlay) overlay.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------
function playerFoldAct() {
    initAudio();
    if (!playerTurn || mode !== 'betting') return;
    seats[0].folded = true;
    logAction(`You fold.`);
    playerTurn = false;
    advanceAfterAction();
}

function playerCheckAct() {
    initAudio();
    if (!playerTurn || mode !== 'betting') return;
    if (seats[0].bet < currentBet) return;
    logAction(`You check.`);
    playerTurn = false;
    advanceAfterAction();
}

function playerCallAct() {
    initAudio();
    if (!playerTurn || mode !== 'betting') return;
    const toCall = Math.min(currentBet - seats[0].bet, seats[0].chips);
    const p = seats[0];
    p.chips -= toCall;
    p.bet += toCall;
    p.totalBet += toCall;
    pot += toCall;
    Sound.chip();
    logAction(`You call ${toCall}.`);
    playerTurn = false;
    advanceAfterAction();
}

function playerRaiseTo(raiseTo) {
    initAudio();
    if (!playerTurn || mode !== 'betting') return;
    const p = seats[0];
    const capped = Math.min(raiseTo, p.chips + p.bet);
    if (capped <= currentBet) {
        // Can't raise above current bet — fall back to call
        playerCallAct();
        return;
    }
    const amount = capped - p.bet;
    p.chips -= amount;
    p.bet = capped;
    p.totalBet += amount;
    pot += amount;
    currentBet = capped;
    Sound.raise();
    logAction(`You raise to ${capped}.`);
    playerTurn = false;
    // Everyone after raiser must re-act
    rebuildAfterRaise(0);
    advanceAfterAction();
}

function rebuildAfterRaise(raiserIdx) {
    const active = activeActors();
    actionQueue = [];
    if (!active.includes(raiserIdx)) return;
    const idx = active.indexOf(raiserIdx);
    for (let i = 1; i < active.length; i++) {
        actionQueue.push(active[(idx + i) % active.length]);
    }
}

// ---------------------------------------------------------------------------
// AI logic
// ---------------------------------------------------------------------------
function aiAct(idx) {
    const ai = seats[idx];
    if (ai.folded || ai.chips <= 0 || mode !== 'betting') {
        pendingAIPlayer = -1;
        return;
    }
    const pers = AI_PERSONALITIES[ai.name] || AI_PERSONALITIES.Ace;
    const ev = evaluateCards([...ai.hand, ...community]);
    const strength = ev.rank;
    const toCall = Math.min(currentBet - ai.bet, ai.chips);
    const rand = Math.random();

    // Preflop: strength from 2-card eval is weak; use hole "hand rank" heuristic
    if (community.length === 0) {
        const h1 = ai.hand[0].rankValue, h2 = ai.hand[1].rankValue;
        const paired = h1 === h2;
        const high = Math.max(h1, h2);
        const suited = ai.hand[0].suit === ai.hand[1].suit;
        let score = paired ? 6 : 0;
        score += high >= 14 ? 4 : high >= 12 ? 3 : high >= 10 ? 2 : 0;
        score += Math.abs(h1 - h2) <= 2 ? 2 : 0;
        score += suited ? 1 : 0;
        decideAI(idx, score / 12, toCall, pers, rand);
        return;
    }

    decideAI(idx, strength / 9, toCall, pers, rand);
}

function decideAI(idx, strength01, toCall, pers, rand) {
    const ai = seats[idx];
    const potOdds = pot + toCall > 0 ? toCall / (pot + toCall) : 0;

    if (toCall === 0) {
        // Option: check or bet
        if (strength01 >= 0.55 || rand < pers.raiseAgg) {
            const bet = betSizeAI(ai);
            applyAIBet(idx, bet);
        } else {
            logAction(`${ai.name} checks.`);
            pendingAIPlayer = -1;
            advanceAfterAction();
        }
        return;
    }

    if (strength01 >= 0.6 || (strength01 >= 0.4 && rand < 0.5)) {
        // Strong: call or raise
        if (rand < pers.raiseAgg * 0.6) {
            const bet = betSizeAI(ai);
            applyAIBet(idx, bet);
        } else {
            const callAmount = Math.min(toCall, ai.chips);
            ai.chips -= callAmount;
            ai.bet += callAmount;
            ai.totalBet += callAmount;
            pot += callAmount;
            logAction(`${ai.name} calls ${callAmount}.`);
            pendingAIPlayer = -1;
            advanceAfterAction();
        }
    } else if (rand < pers.bluffFreq && strength01 >= 0.15) {
        // Bluff raise
        const bet = betSizeAI(ai, true);
        applyAIBet(idx, bet);
    } else if (potOdds > 0.18 && rand < 0.5) {
        // Cheap to call
        const callAmount = Math.min(toCall, ai.chips);
        ai.chips -= callAmount;
        ai.bet += callAmount;
        ai.totalBet += callAmount;
        pot += callAmount;
        logAction(`${ai.name} calls ${callAmount}.`);
        pendingAIPlayer = -1;
        advanceAfterAction();
    } else if (rand < pers.foldTight) {
        ai.folded = true;
        logAction(`${ai.name} folds.`);
        pendingAIPlayer = -1;
        advanceAfterAction();
    } else {
        const callAmount = Math.min(toCall, ai.chips);
        ai.chips -= callAmount;
        ai.bet += callAmount;
        ai.totalBet += callAmount;
        pot += callAmount;
        logAction(`${ai.name} calls ${callAmount}.`);
        pendingAIPlayer = -1;
        advanceAfterAction();
    }
}

function betSizeAI(ai, bluff = false) {
    let target;
    if (bluff) {
        target = Math.floor(pot * (0.4 + Math.random() * 0.4));
    } else if (pot === 0) {
        target = bigBlind * (1 + Math.floor(Math.random() * 3));
    } else {
        target = Math.floor(pot * (0.5 + Math.random() * 0.8));
    }
    const minBet = currentBet > 0 ? currentBet + bigBlind : bigBlind;
    const raiseTo = Math.max(minBet, currentBet + target);
    return Math.min(raiseTo, ai.chips + ai.bet);
}

function applyAIBet(idx, raiseTo) {
    const ai = seats[idx];
    const capped = Math.min(raiseTo, ai.chips + ai.bet);
    if (capped <= currentBet) {
        // can't raise; call instead
        const toCall = Math.min(currentBet - ai.bet, ai.chips);
        ai.chips -= toCall;
        ai.bet += toCall;
        ai.totalBet += toCall;
        pot += toCall;
        logAction(`${ai.name} calls ${toCall}.`);
        pendingAIPlayer = -1;
        advanceAfterAction();
        return;
    }
    const amount = capped - ai.bet;
    ai.chips -= amount;
    ai.bet = capped;
    ai.totalBet += amount;
    pot += amount;
    currentBet = capped;
    logAction(`${ai.name} raises to ${capped}.`);
    pendingAIPlayer = -1;
    rebuildAfterRaise(idx);
    advanceAfterAction();
}

// ---------------------------------------------------------------------------
// Animation / update loop (frame-rate independent)
// ---------------------------------------------------------------------------
function logAction(text) {
    actionFeed.push({ text, t: lastNow });
    if (actionFeed.length > 4) actionFeed.shift();
}

function update(now) {
    const dt = Math.min(now - lastNow, 50);
    lastNow = now;

    // 1. Dealing animation
    if (mode === 'dealing') {
        dealingT += dt;
        let allArrived = true;
        for (const card of dealingCards) {
            if (!card.arrived) {
                if (dealingT >= card.dealDelay) {
                    const t = Math.min(1, (dealingT - card.dealDelay) / card.dealDur);
                    const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
                    const from = layout().deck;
                    card.x = from.x + (card.tx - from.x) * e;
                    card.y = from.y + (card.ty - from.y) * e;
                    if (t >= 1) { card.arrived = true; card.x = card.tx; card.y = card.ty; }
                    else allArrived = false;
                } else {
                    allArrived = false;
                }
            }
        }
        if (allArrived) {
            mode = 'betting';
            // Post blinds after deal (blinds accumulate into pot)
            const sb = (dealerPos + 1) % 4;
            const bb = (dealerPos + 2) % 4;
            postBlind(sb, smallBlind);
            postBlind(bb, bigBlind);
            currentBet = bigBlind;
            logAction(`Blinds: ${seats[sb].name} ${smallBlind} / ${seats[bb].name} ${bigBlind}`);
            startBettingRound((bb + 1) % 4);
        }
    }

    // 2. Street dealing (community cards flip)
    if (mode === 'street' && now >= streetUntil) {
        const cb = afterStreet;
        afterStreet = null;
        if (cb) cb();
    }

    // 3. AI thinking
    if (mode === 'betting' && pendingAIPlayer >= 0) {
        if (now >= aiThinkUntil) {
            const idx = pendingAIPlayer;
            pendingAIPlayer = -1;
            aiAct(idx);
        }
    }

    // 4. Showdown reveal -> evaluate
    if (mode === 'showdown' && now >= showdownUntil) {
        computeWinnerAndAward();
    }

    // 5. Payout -> finish
    if (mode === 'payout' && now >= payoutUntil) {
        const cb = afterPayout;
        afterPayout = null;
        if (cb) cb();
    }

    // 6. Smooth position lerp for all active cards to their targets
    const k = 1 - Math.exp(-dt * 0.014);
    if (mode !== 'dealing') {
        const allCards = [...seats.flatMap(s => s.hand), ...community];
        for (const c of allCards) {
            const dx = c.tx - c.x, dy = c.ty - c.y;
            if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
                c.x += dx * k;
                c.y += dy * k;
                if (Math.abs(c.tx - c.x) < 0.5) c.x = c.tx;
                if (Math.abs(c.ty - c.y) < 0.5) c.y = c.ty;
            }
        }
    }

    // 7. Floating chips
    floatingChips = floatingChips.filter(ch => now < ch.end);
    // 8. Confetti
    if (confetti.length > 0) updateConfetti(now);
    // 9. Pot display tween
    displayPot += (pot - displayPot) * Math.min(1, dt * 0.008);
    if (Math.abs(pot - displayPot) < 0.5) displayPot = pot;
    // 10. Feed decay handled in draw
}

function postBlind(idx, amt) {
    const s = seats[idx];
    const paid = Math.min(amt, s.chips);
    s.chips -= paid;
    s.bet += paid;
    s.totalBet += paid;
    pot += paid;
    Sound.chip();
}

function spawnPayoutChips(seatIdx) {
    const L = layout();
    const fromX = L.pot.x, fromY = L.pot.y;
    const to = L.seats[seatIdx];
    const colors = ['#facc15', '#00f2fe', '#ff0080', '#ffffff', '#10b981'];
    const n = Math.min(10, 4 + Math.floor(Math.random() * 4));
    for (let i = 0; i < n; i++) {
        floatingChips.push({
            x: fromX + (Math.random() - 0.5) * 40,
            y: fromY + (Math.random() - 0.5) * 30,
            tx: to.x + (Math.random() - 0.5) * 80,
            ty: to.y + CARD_HEIGHT * 0.5 + 14 + Math.random() * 10,
            start: performance.now() + i * 60,
            dur: 700,
            color: colors[i % colors.length],
            end: performance.now() + i * 60 + 700
        });
    }
}

function cardFlipT(card, now) {
    if (card.flipStart < 0) return -1;
    const t = (now - card.flipStart) / card.flipDur;
    if (t >= 1) { card.flipStart = -1; card.flipDur = 400; return -1; }
    return Math.max(0, t);
}

// ---------------------------------------------------------------------------
// Confetti
// ---------------------------------------------------------------------------
function launchConfetti() {
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
            rotSpeed: (Math.random() - 0.5) * 0.2,
            born: performance.now()
        });
    }
}
function updateConfetti(now) {
    confetti = confetti.filter(p => p.y < canvas.height + 40 && now - p.born < 8000);
    confetti.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.rotation += p.rotSpeed;
    });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function roundedPanel(x, y, w, h, r, fill, stroke = null, lineWidth = 1) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }
}

function fitText(text, maxWidth, startSize, minSize = 9, weight = 700) {
    let size = startSize;
    while (size > minSize) {
        ctx.font = `${weight} ${size}px Outfit`;
        if (ctx.measureText(text).width <= maxWidth) return size;
        size -= 1;
    }
    return minSize;
}

function drawTable(L) {
    const { w, h, portrait } = L;

    // Full-viewport background.
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#070d19');
    bg.addColorStop(0.48, '#0d1627');
    bg.addColorStop(1, '#070b14');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Main table is sized from BOTH dimensions so it never touches the edges.
    const tableRx = Math.min(w * 0.46, portrait ? w * 0.46 : w * 0.44);
    const tableRy = Math.min(h * 0.44, portrait ? h * 0.39 : h * 0.40);
    // In landscape the table sits lower to balance the AI band at the top
    // and the player cards at the bottom.
    const tableCy = portrait ? h * 0.51 : h * 0.55;

    // Outer glow.
    ctx.save();
    ctx.shadowColor = 'rgba(0,242,254,.16)';
    ctx.shadowBlur = 28;
    ctx.fillStyle = '#10243a';
    ctx.beginPath();
    ctx.ellipse(w / 2, tableCy, tableRx, tableRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Felt.
    const felt = ctx.createRadialGradient(w / 2, tableCy, 20, w / 2, tableCy, Math.max(tableRx, tableRy));
    felt.addColorStop(0, '#183a48');
    felt.addColorStop(0.58, '#102c39');
    felt.addColorStop(1, '#0b1a29');

    ctx.fillStyle = felt;
    ctx.beginPath();
    ctx.ellipse(w / 2, tableCy, tableRx, tableRy, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,242,254,.24)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(w / 2, tableCy, tableRx * .90, tableRy * .88, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Phase pill. In short landscape it's placed at the bottom-left so it never
    // overlaps the top AI info panel (which sits directly above the AI cards).
    const phase = phaseLabel ? phaseLabel.toUpperCase() : 'TEXAS HOLD’EM';
    const phaseW = Math.min(190, w * (portrait ? 0.42 : 0.30));
    let phaseX = w / 2 - phaseW / 2;
    let phaseY = 10;
    if (!portrait && h < 400) {
        phaseX = 10;
        phaseY = h - 40;
    }
    roundedPanel(
        phaseX, phaseY, phaseW, 26, 13,
        'rgba(5,10,18,.72)', 'rgba(255,255,255,.10)'
    );
    ctx.fillStyle = '#dbeafe';
    ctx.textAlign = 'center';
    ctx.font = `800 ${Math.max(10, Math.min(12, w * .016))}px Outfit`;
    ctx.fillText(phase, phaseX + phaseW / 2, phaseY + 18);

    // Subtle suit decoration, safely inside the viewport.
    ctx.globalAlpha = .055;
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.max(34, Math.min(72, w * .08))}px serif`;
    ctx.fillText('♠', w * .07, h * .88);
    ctx.fillText('♥', w * .93, h * .88);
    ctx.fillText('♣', w * .07, h * .15);
    ctx.fillText('♦', w * .93, h * .15);
    ctx.globalAlpha = 1;
}

function drawPot(L, now) {
    const w = Math.min(180, L.w * .34);
    const h = 42;
    const x = L.pot.x - w / 2;
    const y = L.pot.y - h / 2;

    roundedPanel(x, y, w, h, 21, 'rgba(5,10,18,.78)', 'rgba(250,204,21,.20)');
    ctx.fillStyle = '#facc15';
    ctx.textAlign = 'center';
    ctx.font = `800 ${Math.max(12, Math.min(17, L.w * .022))}px Outfit`;
    ctx.fillText(`POT  ${Math.round(displayPot)}`, L.pot.x, y + 27);
}

function drawCommunity(L, now) {
    const spacing = CARD_WIDTH + Math.max(5, CARD_WIDTH * .10);
    const total = 5;
    const startX = L.community.x - ((total - 1) * spacing) / 2;

    for (let i = 0; i < total; i++) {
        const x = startX + i * spacing;
        ctx.fillStyle = 'rgba(255,255,255,.025)';
        ctx.strokeStyle = 'rgba(255,255,255,.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(
            x - CARD_WIDTH / 2,
            L.community.y - CARD_HEIGHT / 2,
            CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS
        );
        ctx.fill();
        ctx.stroke();
    }

    community.forEach(card => {
        card.draw(card.x, card.y, { flipT: cardFlipT(card, now) });
    });
}

function drawSeat(idx, L, now) {
    const s = seats[idx];
    const pos = L.seats[idx];
    const isPlayer = idx === 0;
    const scale = seatCardScale(idx);
    const dims = cardSizeForSeat(idx);
    const acting = (
        mode === 'betting' &&
        ((playerTurn && isPlayer) || pendingAIPlayer === idx)
    ) && !s.folded;
    const winner = bestSeatIdx === idx &&
        (mode === 'payout' || mode === 'gameover' || resultShown);
    const pulse = 0.5 + 0.5 * Math.sin(now * .005);

    // Player information — floating ABOVE the cards
    // -----------------------------------------------------------------------
// Floating player information panel — ABOVE the cards
// -----------------------------------------------------------------------
const panelGap = isPlayer ? 20 : 16;

// Card dimensions
const cardTop = pos.y - dims.h / 2;

// Panel dimensions
const infoWidth = isPlayer
    ? Math.min(250, L.w * 0.68)
    : Math.min(155, L.w * 0.32);

const infoHeight = s.bet > 0 && !s.folded ? 62 : 46;

// On mobile landscape, the player's chip window sits in the bottom-right
// corner so it doesn't cover the table. On portrait/desktop it stays
// centered above the player's cards.
const panelX = isPlayer && !L.portrait
    ? L.w - infoWidth - 12
    : pos.x - infoWidth / 2;
const panelY = isPlayer && !L.portrait
    ? L.h - infoHeight - 10
    : cardTop - panelGap - infoHeight;

// Text is centered within the panel (which may differ from the card center
// when the panel is docked to the bottom-right corner in landscape).
const panelCenterX = panelX + infoWidth / 2;

// Panel background
roundedPanel(
    panelX,
    panelY,
    infoWidth,
    infoHeight,
    14,
    isPlayer
        ? 'rgba(0,242,254,.065)'
        : 'rgba(255,255,255,.045)',
    isPlayer
        ? 'rgba(0,242,254,.28)'
        : 'rgba(255,255,255,.14)',
    1
);

// Subtle inner highlight
ctx.strokeStyle = isPlayer
    ? 'rgba(0,242,254,.08)'
    : 'rgba(255,255,255,.05)';
ctx.lineWidth = 1;

ctx.beginPath();
ctx.roundRect(
    panelX + 1,
    panelY + 1,
    infoWidth - 2,
    infoHeight - 2,
    13
);
ctx.stroke();

ctx.textAlign = 'center';

// -----------------------------------------------------------------------
// Turn indicator
// -----------------------------------------------------------------------
if (acting) {
    ctx.fillStyle = isPlayer
        ? '#67e8f9'
        : '#f472b6';

    ctx.font = `800 ${Math.max(
        9,
        Math.min(11, L.w * .014)
    )}px Outfit`;

    ctx.fillText(
        isPlayer ? 'YOUR TURN' : 'THINKING…',
        panelCenterX,
        panelY - 7
    );
}

// -----------------------------------------------------------------------
// Player name
// -----------------------------------------------------------------------
const nameMax = infoWidth - 18;

const nameSize = fitText(
    s.name,
    nameMax,
    isPlayer ? 16 : 13,
    9,
    800
);

ctx.fillStyle = s.folded
    ? '#64748b'
    : (isPlayer ? '#67e8f9' : '#f8fafc');

ctx.font = `800 ${nameSize}px Outfit`;

ctx.fillText(
    s.name,
    panelCenterX,
    panelY + 20
);

// -----------------------------------------------------------------------
// Chip count
// -----------------------------------------------------------------------
ctx.fillStyle = '#facc15';

ctx.font = `700 ${Math.max(
    10,
    Math.min(12, infoWidth * .07)
)}px Outfit`;

ctx.fillText(
    `${s.chips} chips`,
    panelCenterX,
    panelY + 37
);

// -----------------------------------------------------------------------
// Current bet
// -----------------------------------------------------------------------
if (s.bet > 0 && !s.folded) {
    const badgeW = Math.min(
        82,
        infoWidth * .48
    );

    roundedPanel(
        panelCenterX - badgeW / 2,
        panelY + 42,
        badgeW,
        18,
        9,
        'rgba(250,204,21,.10)',
        'rgba(250,204,21,.20)',
        1
    );

    ctx.fillStyle = '#fde68a';

    ctx.font = `800 ${Math.max(
        9,
        Math.min(10, badgeW * .13)
    )}px Outfit`;

    ctx.fillText(
            `Bet ${s.bet}`,
            panelCenterX,
            panelY + 55
        );
    }

    // FIX: Render the hole cards for this seat
    s.hand.forEach(card => {
        const glow = winningKeys.includes(card.key());
        const dim = s.folded;
        card.draw(card.x, card.y, {
            scale: scale,
            glow: glow,
            dim: dim,
            flipT: cardFlipT(card, now)
        });
    });
}


function drawDealerButton(L, now) {
    const pos = L.seats[dealerPos];
    const scale = seatCardScale(dealerPos);
    const dims = cardSizeForSeat(dealerPos);
    const r = Math.max(9, Math.min(14, CARD_WIDTH * .18));

    const x = clamp(
        pos.x - dims.w * .62,
        r + 4,
        L.w - r - 4
    );
    const y = clamp(
        pos.y - dims.h * .60,
        r + 4,
        L.h - r - 4
    );

    const pulse = 0.5 + 0.5 * Math.sin(now * .004);
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(0,242,254,${.45 + pulse * .5})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#111827';
    ctx.font = `800 ${Math.max(9, r * .9)}px Outfit`;
    ctx.textAlign = 'center';
    ctx.fillText('D', x, y + r * .32);
}

function drawActionFeed(L, now) {
    if (L.portrait) return; // Mobile has too little spare space; history owns this.
    const shown = actionFeed.slice(-3);
    const feedX = Math.max(12, L.w * .035);
    const feedY = L.h * .48;
    const maxWidth = Math.min(250, L.w * .27);

    shown.forEach((item, i) => {
        const age = now - item.t;
        let alpha = age > 2600 ? Math.max(0, 1 - (age - 2600) / 900) : 1;
        ctx.globalAlpha = alpha;
        const size = fitText(item.text, maxWidth, 11, 8, 600);
        ctx.font = `600 ${size}px Outfit`;
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(226,232,240,.82)';
        ctx.fillText(item.text, feedX, feedY + i * 18);
    });
    ctx.globalAlpha = 1;
}

function drawFloatingChips(now) {
    floatingChips.forEach(ch => {
        if (now < ch.start) return;
        const t = Math.min(1, (now - ch.start) / ch.dur);
        const e = 1 - Math.pow(1 - t, 3);
        const x = ch.x + (ch.tx - ch.x) * e;
        const y = ch.y + (ch.ty - ch.y) * e - Math.sin(t * Math.PI) * 40;
        ctx.save();
        ctx.translate(x, y);
        for (let k = 0; k < 3; k++) {
            ctx.fillStyle = ch.color;
            ctx.beginPath();
            ctx.ellipse(0, -k * 3, 8, 11, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,.3)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,.35)';
            ctx.beginPath();
            ctx.ellipse(0, -k * 3, 8, 3.5, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    });
}

function drawConfetti() {
    confetti.forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * .6);
        ctx.restore();
    });
}

function draw(now) {
    if (!ctx || !canvas) return;

    const L = layout();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    // All game drawing is in CSS-pixel coordinates.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawTable(L);
    drawCommunity(L, now);
    for (let i = 0; i < 4; i++) drawSeat(i, L, now);
    drawPot(L, now);
    drawDealerButton(L, now);
    drawActionFeed(L, now);
    drawFloatingChips(now);
    if (confetti.length > 0) drawConfetti();

    ctx.restore();
}

// ---------------------------------------------------------------------------
// Raise slider + hand history UI
// ---------------------------------------------------------------------------
function getRaiseBounds() {
    const p = seats[0];
    const maxRaiseTo = p.chips + p.bet;
    const minRaiseTo = currentBet + bigBlind;
    return {
        min: Math.min(minRaiseTo, maxRaiseTo),
        max: maxRaiseTo
    };
}

function updateRaiseSlider() {
    const slider = document.getElementById('raise-slider');
    const value = document.getElementById('raise-value');
    const raiseBtn = document.getElementById('raise-slider-btn');
    if (!slider || !value || !raiseBtn || !seats[0]) return;

    const canAct = playerTurn && mode === 'betting' && !seats[0].folded;
    const bounds = getRaiseBounds();
    const canRaise = canAct && bounds.max > currentBet && bounds.max >= bounds.min;

    slider.disabled = !canRaise;
    raiseBtn.disabled = !canRaise;

    if (!canRaise) {
        value.textContent = '—';
        return;
    }

    slider.min = String(bounds.min);
    slider.max = String(bounds.max);

    let current = Number(slider.value);
    if (!Number.isFinite(current) || current < bounds.min || current > bounds.max) {
        current = Math.min(bounds.max, Math.max(bounds.min, currentBet + bigBlind));
        slider.value = String(current);
    }

    value.textContent = `to ${current}`;
    raiseBtn.textContent = current >= bounds.max ? 'All-In' : 'Raise';
}

function commitSliderRaise() {
    const slider = document.getElementById('raise-slider');
    if (!slider) return;
    const amount = Number(slider.value);
    if (Number.isFinite(amount)) playerRaiseTo(amount);
}

function recordCompletedHand(result, wonAmount) {
    handHistory.unshift({
        number: handNumber,
        result,
        amount: wonAmount,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        hand: seats[0].hand.map(c => `${c.rank}${SUIT_ICONS[c.suit]}`),
        board: community.map(c => `${c.rank}${SUIT_ICONS[c.suit]}`),
        actions: actionFeed.map(x => x.text).slice(-5)
    });
    handHistory = handHistory.slice(0, 30);
    renderHandHistory();
}

function renderHandHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;

    if (!handHistory.length) {
        list.innerHTML = '<div class="history-item"><small>No completed hands yet.</small></div>';
        return;
    }

    list.innerHTML = handHistory.map(h => {
        const cls = h.result === 'Win' ? 'win' : h.result === 'Loss' ? 'loss' : 'push';
        const signed = h.amount > 0 ? `+${h.amount}` : `${h.amount}`;
        return `
            <div class="history-item">
                <div class="history-line">
                    <strong>Hand #${h.number}</strong>
                    <strong class="history-result ${cls}">${h.result} ${signed}</strong>
                </div>
                <small>${h.time} · ${h.hand.join(' ')}</small>
                <small>Board: ${h.board.join(' ') || '—'}</small>
                <div class="history-actions">${h.actions.join(' · ')}</div>
            </div>
        `;
    }).join('');
}

function finishHand(wonAmount) {
    dealerPos = (dealerPos + 1) % 4;

    let result = 'Push';
    if (gameOverMsg === 'win') result = 'Win';
    else if (gameOverMsg === 'lose') result = 'Loss';

    recordCompletedHand(result, wonAmount);
    showResultOverlay(wonAmount);
    updateButtons();
    updateHeaderVisibility();
}

// ---------------------------------------------------------------------------
// UI buttons
// ---------------------------------------------------------------------------
function updateButtons() {
    const fold = document.getElementById('fold-btn');
    const check = document.getElementById('check-btn');
    const call = document.getElementById('call-btn');
    const newGame = document.getElementById('new-game');
    if (!fold) return;

    const canAct = playerTurn && mode === 'betting' && !seats[0].folded;

    fold.disabled = !canAct;
    check.disabled = !canAct || seats[0].bet < currentBet;
    call.disabled = !canAct || seats[0].bet >= currentBet;
    call.textContent = seats[0].bet >= currentBet
        ? 'Call'
        : `Call ${Math.min(currentBet - seats[0].bet, seats[0].chips)}`;

    newGame.disabled = (mode === 'dealing' || mode === 'betting' || mode === 'street');
    updateRaiseSlider();
}

function updateOverlay() {
    const btn = document.getElementById('result-new-game');
    if (btn) btn.textContent = 'Next Hand';
}

// ---------------------------------------------------------------------------
// Bootstrapping (browser only)
// ---------------------------------------------------------------------------
if (typeof document !== 'undefined' && document.getElementById('gameCanvas')) {
    (function boot() {
        window.addEventListener('resize', resize);
        resize();

        document.getElementById('new-game').addEventListener('click', newHand);
        document.getElementById('fold-btn').addEventListener('click', playerFoldAct);
        document.getElementById('check-btn').addEventListener('click', playerCheckAct);
        document.getElementById('call-btn').addEventListener('click', playerCallAct);

        const raiseSlider = document.getElementById('raise-slider');
        const raiseSliderBtn = document.getElementById('raise-slider-btn');
        if (raiseSlider) raiseSlider.addEventListener('input', updateRaiseSlider);
        if (raiseSliderBtn) raiseSliderBtn.addEventListener('click', commitSliderRaise);

        document.getElementById('raise-all-btn').addEventListener('click', () => {
            playerRaiseTo(seats[0].chips + seats[0].bet);
        });

        const historyPanel = document.getElementById('history-panel');
        const historyBtn = document.getElementById('hand-history-btn');
        const historyClose = document.getElementById('history-close');

        if (historyBtn) {
            historyBtn.addEventListener('click', () => {
                historyPanel.classList.add('open');
                historyPanel.setAttribute('aria-hidden', 'false');
                renderHandHistory();
            });
        }

        if (historyClose) {
            historyClose.addEventListener('click', () => {
                historyPanel.classList.remove('open');
                historyPanel.setAttribute('aria-hidden', 'true');
            });
        }

        // Volume toggle (mute/unmute)
        const volumeBtn = document.getElementById('volume-btn');
        const volumeIcon = document.getElementById('volume-icon');
        if (volumeBtn && volumeIcon) {
            volumeBtn.addEventListener('click', () => {
                initAudio();
                soundMuted = !soundMuted;
                volumeIcon.className = soundMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
                if (!soundMuted) Sound.chip();
            });
        }
        const resultBtn = document.getElementById('result-new-game');
        if (resultBtn) {
            resultBtn.addEventListener('click', () => {
                if (gameOverMsg === 'busted' || gameOverMsg === 'cleared') {
                    // Reset tournament: everyone back to 1000
                    seats.forEach(s => s.chips = 1000);
                    try { localStorage.setItem('poker_chips', '1000'); } catch (e) { /* ignore */ }
                }
                newHand();
            });
        }

        // Fresh session: load player bankroll
        seats = [
            makeSeat('You', true, null),
            makeSeat('Neon', false, AI_PERSONALITIES.Neon),
            makeSeat('Viper', false, AI_PERSONALITIES.Viper),
            makeSeat('Ace', false, AI_PERSONALITIES.Ace)
        ];
        playerSeat().chips = loadChips();

        lastNow = performance.now();
        newHand();
        function frame(now) {
            update(now);
            draw(now);
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    })();
}

// ---------------------------------------------------------------------------
// Device Orientation & Screen Size Detector
// ---------------------------------------------------------------------------
let orientationDismissed = false;

function checkOrientation() {
    const overlay = document.getElementById('orientation-overlay');

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

    // 1. Recalculate canvas and layout dimensions
    resize();
    updateHeaderVisibility();
    // 2. Reposition dealt cards to match updated table coordinates
    repositionActiveCards();
}

function repositionActiveCards() {
    const L = layout();

    // Recalculate player and AI hole card targets
    seats.forEach((seat, seatIdx) => {
        seat.hand.forEach((card, cardIdx) => {
            const tgt = seatCardPos(seatIdx, cardIdx);
            card.tx = tgt.x;
            card.ty = tgt.y;
            
            // Instantly snap cards if dealing animation isn't in progress
            if (mode !== 'dealing') {
                card.x = tgt.x;
                card.y = tgt.y;
            }
        });
    });

    // Recalculate community cards
    if (community.length > 0) {
        const spacing = CARD_WIDTH + Math.max(5, CARD_WIDTH * 0.10);
        const startX = L.community.x - ((community.length - 1) * spacing) / 2;
        
        community.forEach((card, i) => {
            card.tx = startX + i * spacing;
            card.ty = L.community.y;
            
            if (mode !== 'dealing') {
                card.x = card.tx;
                card.y = card.ty;
            }
        });
    }
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

// ---------------------------------------------------------------------------
// Node testability
// ---------------------------------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Card, evaluateCards, evaluate5, compareEval, handLabel, SUITS, RANKS };
}