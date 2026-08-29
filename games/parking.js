const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const currencySpan = document.getElementById('currencyDisplay');
const garageCurrencySpan = document.getElementById('garageCurrency');
const garageOverlay = document.getElementById('garageOverlay');
const garageList = document.getElementById('garageList');
const achToast = document.getElementById('achievementToast');
const achText = document.getElementById('achText');

// ----- AUDIO SYNTHESIZER (same approach as Highway Racer) -----
let audioCtx = null;
let engineOsc1 = null;
let engineOsc2 = null;
let engineGain = null;
let engineFilter = null;
let masterGain = null;
let gameVolume = parseFloat(localStorage.getItem('parking_volume')) || 0.8;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(gameVolume, audioCtx.currentTime);
        masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    startEngineSound();
}

function startEngineSound() {
    if (engineOsc1 || !audioCtx) return;

    engineGain = audioCtx.createGain();
    engineGain.gain.setValueAtTime(0.05, audioCtx.currentTime);

    engineFilter = audioCtx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.setValueAtTime(500, audioCtx.currentTime);

    engineOsc1 = audioCtx.createOscillator();
    engineOsc1.type = 'sawtooth';
    engineOsc1.frequency.setValueAtTime(45, audioCtx.currentTime);

    engineOsc2 = audioCtx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.setValueAtTime(90, audioCtx.currentTime);

    engineOsc1.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(masterGain);

    engineOsc1.start();
    engineOsc2.start();
}

function updateEngineAudio(speed) {
    if (!audioCtx || !engineOsc1 || !engineGain) return;
    const now = audioCtx.currentTime;

    const s = Math.min(Math.abs(speed), 4);
    const pitch = 42 + s * 26;
    engineOsc1.frequency.setTargetAtTime(pitch, now, 0.06);
    engineOsc2.frequency.setTargetAtTime(pitch * 1.5, now, 0.06);

    const cutoff = 380 + s * 260;
    engineFilter.frequency.setTargetAtTime(cutoff, now, 0.08);
}

function stopEngineSound() {
    if (engineGain && audioCtx) {
        engineGain.gain.setTargetAtTime(0.001, audioCtx.currentTime, 0.12);
        setTimeout(() => {
            if (engineOsc1) { engineOsc1.stop(); engineOsc1 = null; }
            if (engineOsc2) { engineOsc2.stop(); engineOsc2 = null; }
            engineGain = null;
        }, 130);
    }
}
const Sound = {
    bump() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain); gain.connect(masterGain);
        osc.start(now); osc.stop(now + 0.15);
    },
    crash() {
        if (!audioCtx) return;
        stopEngineSound();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(130, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.45);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain); gain.connect(masterGain);
        osc.start(now); osc.stop(now + 0.45);
    },
    coin() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.06);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.connect(gain); gain.connect(masterGain);
        osc.start(); osc.stop(now + 0.06);
    },
    success() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        [523, 659, 784].forEach((freq, i) => {
            const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.12);
            gain.gain.setValueAtTime(0.14, now + i * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.22);
            osc.connect(gain); gain.connect(masterGain);
            osc.start(now + i * 0.12); osc.stop(now + i * 0.12 + 0.22);
        });
    },
    fail() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.5);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain); gain.connect(masterGain);
        osc.start(now); osc.stop(now + 0.5);
    }
};

// ----- GARAGE: VEHICLE MODELS & PAINT COLORS (separate) -----
// Each vehicle model belongs to a type that defines size & handling.
const VEHICLE_TYPES = {
    hatch:  { w: 30, h: 52, maxSpeed: 3.0, accel: 0.085, steer: 0.050, drift: 0.05  }, // nimble, tight fits
    sedan:  { w: 34, h: 60, maxSpeed: 3.2, accel: 0.090, steer: 0.045, drift: 0.06  }, // the all-rounder
    muscle: { w: 36, h: 64, maxSpeed: 3.5, accel: 0.110, steer: 0.044, drift: 0.042 }, // powerful, slidey
    sport:  { w: 34, h: 62, maxSpeed: 3.8, accel: 0.120, steer: 0.047, drift: 0.032 }, // fastest, big drifts
    van:    { w: 38, h: 70, maxSpeed: 2.8, accel: 0.075, steer: 0.040, drift: 0.085 }, // bulky
    truck:  { w: 40, h: 78, maxSpeed: 2.6, accel: 0.065, steer: 0.037, drift: 0.095 }  // biggest, slowest
};

const VEHICLES = [
    { id: 'sedan',  name: 'Street Sedan', type: 'sedan',  price: 0    },
    { id: 'hatch',  name: 'Zippy Hatch',  type: 'hatch',  price: 250  },
    { id: 'muscle', name: 'Muscle GT',    type: 'muscle', price: 500  },
    { id: 'sport',  name: 'Sport RS',     type: 'sport',  price: 800  },
    { id: 'van',    name: 'City Cargo',   type: 'van',    price: 1100 },
    { id: 'truck',  name: 'Hauler',       type: 'truck',  price: 1500 },
];

// Paint colors are bought/equipped independently of the vehicle model
const CAR_COLORS = [
    { id: 'cyan',   name: 'Cyber Blue',   color: '#00f2fe', price: 0   },
    { id: 'lava',   name: 'Lava Red',     color: '#ff2a6d', price: 100 },
    { id: 'gold',   name: 'Gold Crown',   color: '#facc15', price: 200 },
    { id: 'purple', name: 'Neon Purple',  color: '#a855f7', price: 300 },
    { id: 'green',  name: 'Emerald',      color: '#22c55e', price: 400 },
    { id: 'pearl',  name: 'Pearl White',  color: '#e2e8f0', price: 500 },
    { id: 'blaze',  name: 'Blaze Orange', color: '#f97316', price: 600 },
    { id: 'sky',    name: 'Sky Blue',     color: '#38bdf8', price: 700 },
];

let currency = parseInt(localStorage.getItem('parking_currency')) || 0;
let ownedVehicles = JSON.parse(localStorage.getItem('parking_owned')) || ['sedan'];
if (!ownedVehicles.includes('sedan')) ownedVehicles.push('sedan');
let equippedVehicle = ownedVehicles.includes(localStorage.getItem('parking_equipped'))
    ? localStorage.getItem('parking_equipped') : 'sedan';
let ownedColors = JSON.parse(localStorage.getItem('parking_colors')) || ['cyan'];
if (!ownedColors.includes('cyan')) ownedColors.push('cyan');
let equippedColor = ownedColors.includes(localStorage.getItem('parking_paint'))
    ? localStorage.getItem('parking_paint') : 'cyan';
let maxUnlocked = parseInt(localStorage.getItem('parking_level')) || 1;
let highScore = parseInt(localStorage.getItem('parking_highscore')) || 0;

function playerPaint() {
    return (CAR_COLORS.find(c => c.id === equippedColor) || CAR_COLORS[0]).color;
}

// Player vehicle dimensions & handling (synced from the equipped vehicle)
let VW = VEHICLE_TYPES.sedan.w, VH = VEHICLE_TYPES.sedan.h;   // live player size
let VS = { ...VEHICLE_TYPES.sedan };                          // live player stats

function syncVehicle() {
    const v = VEHICLES.find(v => v.id === equippedVehicle);
    VS = { ...(VEHICLE_TYPES[v?.type] || VEHICLE_TYPES.sedan) };
    VW = VS.w; VH = VS.h;
}
syncVehicle();   // apply the saved equipped vehicle's stats on load

function saveData() {
    localStorage.setItem('parking_currency', currency);
    localStorage.setItem('parking_owned', JSON.stringify(ownedVehicles));
    localStorage.setItem('parking_equipped', equippedVehicle);
    localStorage.setItem('parking_colors', JSON.stringify(ownedColors));
    localStorage.setItem('parking_paint', equippedColor);
    localStorage.setItem('parking_level', maxUnlocked);
    localStorage.setItem('parking_highscore', highScore);
    currencySpan.textContent = currency;
    garageCurrencySpan.textContent = currency;
}
// ----- ACHIEVEMENTS -----
const ACHIEVEMENTS = {
    firstPark: { name: 'First Park', desc: 'Complete Level 1', unlocked: false, check: () => maxUnlocked >= 2 },
    proParker: { name: 'Pro Parker', desc: 'Complete Level 5', unlocked: false, check: () => maxUnlocked >= 6 },
    parkLord: { name: 'Parking Lord', desc: 'Complete Level 10', unlocked: false, check: () => maxUnlocked >= 11 },
    flawless: { name: 'Flawless', desc: 'Park with zero damage', unlocked: false, check: () => lastParkFlawless },
    rich: { name: 'Rich', desc: 'Earn 1000 coins', unlocked: false, check: () => currency >= 1000 },
};
let unlockedAchievements = JSON.parse(localStorage.getItem('parking_achievements')) || [];
unlockedAchievements.forEach(key => { if (ACHIEVEMENTS[key]) ACHIEVEMENTS[key].unlocked = true; });

function checkAchievements() {
    let newUnlock = false;
    for (const [key, ach] of Object.entries(ACHIEVEMENTS)) {
        if (!ach.unlocked && ach.check()) {
            ach.unlocked = true;
            unlockedAchievements.push(key);
            newUnlock = true;
            showAchievementToast(`🏆 ${ach.name}: ${ach.desc}`);
        }
    }
    if (newUnlock) {
        localStorage.setItem('parking_achievements', JSON.stringify(unlockedAchievements));
    }
}

function showAchievementToast(msg) {
    achText.textContent = msg;
    achToast.classList.add('show');
    clearTimeout(window.achTimeout);
    window.achTimeout = setTimeout(() => achToast.classList.remove('show'), 3500);
}

// ----- GAME STATE & CAR PHYSICS CONSTANTS -----
const STATE_START = 0, STATE_PLAYING = 1, STATE_COMPLETE = 2, STATE_FAILED = 3;
let gameState = STATE_START;

const CAR_W = 34, CAR_H = 60;         // default parked car dimensions
const SPOT_W = 46, SPOT_H = 76;       // default parking spot dimensions
const ANGLE_TOL = 0.21;               // ~12 degrees alignment tolerance

let car = { x: 200, y: 480, angle: 0, speed: 0, vx: 0, vy: 0 };
let obstacles = [];                    // {kind:'car'|'wall'|'cone', x, y, w, h, angle, color}
let spot = { x: 270, y: 50, angle: 0 };
let levelIndex = 0;                    // 0-based
let levelName = '';
let parTime = 30;
let totalScore = 0;
let levelScore = 0;
let damage = 0;
let elapsed = 0;
let holdTimer = 0;
let aligned = false;
let lastParkFlawless = false;
let lastResult = null;
let particles = [];
let tyreMarks = [];                    // persistent skid marks: {x1,y1,x2,y2,a}
let frameCount = 0;
let selectLevel = 1;
let bumpCooldown = 0;
let damageCooldown = 0;
const input = { up: false, down: false, left: false, right: false, hand: false };

// ----- LEVEL BUILD HELPERS -----
const PARKED_COLORS = ['#ef4444', '#f59e0b', '#a855f7', '#22c55e', '#e2e8f0', '#f97316', '#38bdf8'];
const rndColor = () => PARKED_COLORS[Math.floor(Math.random() * PARKED_COLORS.length)];
// Parked vehicles: mkCar (sedan) plus type-specific variants
const mkCar   = (x, y, angle = 0, color = rndColor()) => ({ kind: 'car', x, y, w: VEHICLE_TYPES.sedan.w,  h: VEHICLE_TYPES.sedan.h,  angle, color });
const mkHatch = (x, y, angle = 0, color = rndColor()) => ({ kind: 'car', x, y, w: VEHICLE_TYPES.hatch.w,  h: VEHICLE_TYPES.hatch.h,  angle, color });
const mkVan   = (x, y, angle = 0, color = rndColor()) => ({ kind: 'car', x, y, w: VEHICLE_TYPES.van.w,    h: VEHICLE_TYPES.van.h,    angle, color });
const mkTruck = (x, y, angle = 0, color = rndColor()) => ({ kind: 'car', x, y, w: VEHICLE_TYPES.truck.w,  h: VEHICLE_TYPES.truck.h,  angle, color });
// Walls store x,y as their CENTER (like cars/cones) so the SAT collision math
// in cornersOf() matches what is drawn. x/y passed in are the top-left corner.
const mkWall  = (x, y, w, h) => ({ kind: 'wall', x: x + w / 2, y: y + h / 2, w, h, angle: 0 });
const mkCone  = (x, y) => ({ kind: 'cone', x, y, r: 7 });
const borders = () => [
    mkWall(0, 0, 400, 14), mkWall(0, 586, 400, 14),
    mkWall(0, 0, 14, 600), mkWall(386, 0, 14, 600)
];
// ----- HANDCRAFTED LEVELS (1-10) -----
const LEVELS = [
    { // 1 — learn the controls
        name: 'First Day', par: 25,
        start: { x: 270, y: 480, angle: 0 }, spot: { x: 270, y: 50, angle: 0 },
        obstacles: [mkCar(130, 50), mkCar(200, 50)]
    },
    { // 2 — squeeze between two cars
        name: 'Rush Hour', par: 35,
        start: { x: 200, y: 490, angle: 0 }, spot: { x: 200, y: 50, angle: 0 },
        obstacles: [mkCar(60, 50), mkCar(130, 50), mkCar(270, 50), mkCar(340, 50)]
    },
    { // 3 — angled bay, reverse in if you like
        name: 'Angled Lot', par: 40,
        start: { x: 90, y: 90, angle: Math.PI }, spot: { x: 230, y: 505, angle: 0.6 },
        obstacles: [mkCar(90, 505, 0.6), mkCar(160, 505, 0.6), mkCar(310, 505, 0.6)]
    },
    { // 4 — cone slalom
        name: 'The Gauntlet', par: 45,
        start: { x: 200, y: 500, angle: 0 }, spot: { x: 270, y: 50, angle: 0 },
        obstacles: [
            mkCar(60, 50), mkCar(130, 50), mkCar(200, 50), mkCar(340, 50),
            mkCone(120, 220), mkCone(280, 280), mkCone(120, 340), mkCone(280, 400)
        ]
    },
    { // 5 — parallel parking along the left wall
        name: 'Parallel Dreams', par: 60,
        start: { x: 130, y: 500, angle: 0 }, spot: { x: 60, y: 230, angle: Math.PI / 2 },
        obstacles: [mkCar(60, 150, Math.PI / 2), mkCar(60, 310, Math.PI / 2), mkCone(150, 230)]
    },
    { // 6 — divider wall blocks the direct route
        name: 'Tight Squeeze', par: 50,
        start: { x: 340, y: 480, angle: 0 }, spot: { x: 340, y: 50, angle: 0 },
        obstacles: [
            mkWall(14, 300, 240, 12),
            mkCar(60, 50), mkCar(130, 50), mkCar(200, 50), mkCar(270, 50),
            mkCone(310, 420)
        ]
    },
    { // 7 — mirrored angle bays
        name: 'Reverse Psychology', par: 50,
        start: { x: 340, y: 490, angle: 0 }, spot: { x: 200, y: 50, angle: -0.6 },
        obstacles: [
            mkCar(60, 50, -0.6), mkCar(130, 50, -0.6), mkCar(270, 50, -0.6), mkCar(340, 50, -0.6),
            mkCone(160, 300), mkCone(240, 360), mkCone(120, 420)
        ]
    },
    { // 8 — two rows, mid-row slot
        name: 'Downtown Garage', par: 50,
        start: { x: 90, y: 490, angle: 0 }, spot: { x: 340, y: 160, angle: 0 },
        obstacles: [
            mkCar(60, 50), mkCar(130, 50), mkCar(200, 50), mkCar(270, 50), mkCar(340, 50),
            mkCar(130, 160), mkCar(200, 160),
            mkCone(200, 320), mkCone(280, 380)
        ]
    },
    { // 9 — coned corner approach
        name: 'Coned Corner', par: 55,
        start: { x: 340, y: 500, angle: 0 }, spot: { x: 60, y: 50, angle: 0 },
        obstacles: [
            mkCar(130, 50), mkCar(200, 50), mkCar(270, 50), mkCar(340, 50),
            mkCone(60, 160), mkCone(110, 200), mkCone(60, 260), mkCone(110, 300)
        ]
    },
    { // 10 — everything at once
        name: 'Mania', par: 70,
        start: { x: 60, y: 490, angle: 0 }, spot: { x: 340, y: 50, angle: 0.5 },
        obstacles: [
            mkCar(60, 50, 0.5), mkCar(130, 50, 0.5), mkCar(250, 50, 0.5),
            mkCar(60, 160), mkCar(130, 160), mkCar(200, 160), mkCar(340, 160),
            mkCone(200, 300), mkCone(280, 360), mkCone(140, 330), mkCone(240, 420)
        ]
    },
    { // 11 — van alley: big parked vans, narrow gaps
        name: 'Van Life', par: 60,
        start: { x: 200, y: 490, angle: 0 }, spot: { x: 200, y: 50, angle: 0 },
        obstacles: [
            mkVan(60, 50), mkVan(130, 50), mkVan(270, 50), mkVan(340, 50),
            mkCar(130, 160), mkCar(270, 160),
            mkCone(130, 300), mkCone(270, 360)
        ]
    },
    { // 12 — truck depot: wide aisles, huge spot for big rigs
        name: 'Big Rig', par: 65,
        start: { x: 200, y: 500, angle: 0 }, spot: { x: 130, y: 50, angle: 0, w: 58, h: 96 },
        obstacles: [
            mkTruck(270, 50), mkTruck(340, 50),
            mkVan(340, 160), mkVan(60, 160),
            mkCone(270, 300), mkCone(200, 360), mkCone(270, 420)
        ]
    },
    { // 13 — drift gym: open lot, cone slalom for slide practice
        name: 'Muscle Memory', par: 55,
        start: { x: 60, y: 500, angle: 0 }, spot: { x: 340, y: 490, angle: Math.PI },
        obstacles: [
            mkCar(60, 50), mkCar(200, 50), mkVan(340, 50),
            mkCone(130, 220), mkCone(240, 220),
            mkCone(90, 320), mkCone(200, 320), mkCone(310, 320),
            mkCone(150, 410), mkCone(260, 410)
        ]
    },
    { // 14 — downtown mix: cars, hatches and vans, parallel spot
        name: 'Rush Hour City', par: 65,
        start: { x: 340, y: 500, angle: 0 }, spot: { x: 60, y: 230, angle: Math.PI / 2 },
        obstacles: [
            mkCar(60, 50), mkHatch(130, 50), mkVan(200, 50), mkCar(340, 50),
            mkVan(60, 150, Math.PI / 2), mkCar(60, 310, Math.PI / 2),
            mkCone(150, 230), mkCone(130, 400)
        ]
    },
    { // 15 — truck yard: double truck rows + divider wall with a gap
        name: 'Truck Yard', par: 75,
        start: { x: 340, y: 490, angle: 0 }, spot: { x: 60, y: 50, angle: 0, w: 58, h: 96 },
        obstacles: [
            mkTruck(200, 50), mkTruck(270, 50), mkTruck(340, 50),
            mkTruck(60, 160), mkVan(130, 160), mkVan(270, 160),
            mkWall(150, 300, 130, 12),
            mkCone(200, 420), mkCone(120, 240)
        ]
    },
    { // 16 — tight fit: narrow corridor walls, precision only
        name: 'Tight Fit', par: 80,
        start: { x: 200, y: 500, angle: 0 }, spot: { x: 200, y: 50, angle: 0 },
        obstacles: [
            mkWall(14, 250, 155, 12), mkWall(231, 250, 155, 12),
            mkWall(120, 130, 12, 60), mkWall(268, 130, 12, 60),
            mkCar(60, 50), mkCar(340, 50),
            mkCone(60, 380), mkCone(340, 380)
        ]
    },
    { // 17 — sports clinic: angled 45° bays, fast handling
        name: 'Sports Clinic', par: 70,
        start: { x: 200, y: 490, angle: 0 }, spot: { x: 200, y: 50, angle: 0.6 },
        obstacles: [
            mkCar(60, 50, 0.6), mkCar(130, 50, 0.6), mkCar(270, 50, 0.6), mkCar(340, 50, 0.6),
            mkVan(130, 160), mkVan(270, 160),
            mkCone(60, 300), mkCone(200, 340), mkCone(340, 300)
        ]
    },
    { // 18 — grand finale: walls, vans, trucks, cones and an angled spot
        name: 'Grand Finale', par: 90,
        start: { x: 60, y: 500, angle: 0 }, spot: { x: 340, y: 50, angle: -0.5 },
        obstacles: [
            mkCar(60, 50, -0.5), mkCar(130, 50, -0.5), mkVan(200, 50, -0.5),
            mkTruck(60, 160), mkCar(130, 160), mkVan(270, 160),
            mkWall(120, 330, 160, 12),
            mkCone(320, 180), mkCone(220, 400), mkCone(140, 440), mkCone(340, 470)
        ]
    }
];

// ----- PROCEDURAL LEVELS (19+) -----
// Seeded RNG so every level number always generates the same lot
function mulberry32(seed) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function genLevel(n) {
    const diff = n - LEVELS.length;        // 1-based difficulty past the handcrafted set
    const rng = mulberry32(n * 7919 + 13);
    const pick = arr => arr[Math.floor(rng() * arr.length)];

    // Grid grows with difficulty: more columns, more rows
    const cols = diff < 3 ? [60, 130, 200, 270, 340]
              : diff < 7 ? [55, 120, 185, 250, 315, 370].slice(0, 6)
                         : [50, 110, 170, 230, 290, 350];
    const rows = diff < 4 ? [50, 160]
              : diff < 9 ? [50, 160, 270]
                         : [50, 160, 270, 380];

    const obstacles = [];
    const spotCol = Math.floor(rng() * cols.length);
    const spotRow = Math.floor(rng() * 2);
    const tilt = diff >= 3 && rng() < 0.5 ? pick([0.5, -0.5, 0.6, -0.6]) : 0;
    const fillProb = Math.min(0.6, 0.3 + diff * 0.03);

    // Vehicle mix unlocks with difficulty
    const makers = [mkCar, mkCar, mkHatch];
    if (diff >= 2) makers.push(mkVan);
    if (diff >= 4) makers.push(mkVan, mkTruck);
    if (diff >= 6) makers.push(mkTruck, mkHatch);
    const mkParked = (x, y, a) => pick(makers)(x, y, a);

    rows.forEach((rowY, r) => {
        cols.forEach((colX, c) => {
            if (r === spotRow && c === spotCol) return;                 // keep the spot free
            if (r === 1 && (c === 0 || c === cols.length - 1)) return;  // keep aisle ends passable
            if (rng() < fillProb) obstacles.push(mkParked(colX, rowY, tilt));
        });
    });

    // Divider walls with a passable gap unlock at diff 5.
    // One wall per row (never two pairs at the same y, which could seal gaps)
    const gaps = [];   // openings in walls — must stay clear of cones
    if (diff >= 5) {
        const wallCount = Math.min(3, 1 + Math.floor((diff - 5) / 3));
        const wallYs = [250, 320, 390].sort(() => rng() - 0.5).slice(0, wallCount);
        for (const wy of wallYs) {
            const gapX = 90 + Math.floor(rng() * 3) * 80;   // gap center
            const gapW = Math.max(56, 90 - diff * 2);
            const leftW = gapX - gapW / 2 - 14;
            const rightX = gapX + gapW / 2;
            if (leftW > 20) obstacles.push(mkWall(14, wy, leftW, 12));
            if (rightX < 370) obstacles.push(mkWall(rightX, wy, 386 - rightX, 12));
            gaps.push({ x1: gapX - gapW / 2, x2: gapX + gapW / 2, y: wy });
        }
    }

    // Parked cars must never sit inside a wall opening's corridor — the player
    // needs a clear line through the gap
    for (const g of gaps) {
        for (let i = obstacles.length - 1; i >= 0; i--) {
            const ob = obstacles[i];
            if (ob.kind !== 'car') continue;
            if (ob.x > g.x1 - 30 && ob.x < g.x2 + 30 && ob.y > g.y - 100 && ob.y < g.y + 100) {
                obstacles.splice(i, 1);
            }
        }
    }

    // Cones scattered in the middle aisle, clear of the start, the spot and
    // — critically — the wall openings and their approach corridors
    const coneCount = 3 + Math.min(9, diff);
    const sx = cols[Math.floor(rng() * cols.length)];
    const inGapCorridor = (cx, cy) => gaps.some(g =>
        cx > g.x1 - 16 && cx < g.x2 + 16 && cy > g.y - 100 && cy < g.y + 100);
    const nearWallSeg = (cx, cy) => obstacles.some(o =>
        o.kind === 'wall' && cx > o.x - o.w / 2 - 26 && cx < o.x + o.w / 2 + 26 && cy > o.y - o.h / 2 - 28 && cy < o.y + o.h / 2 + 28);
    for (let i = 0; i < coneCount; i++) {
        for (let tries = 0; tries < 30; tries++) {
            const cx = 40 + rng() * 320;
            const cy = 230 + rng() * 210;
            const nearSpot = Math.hypot(cx - cols[spotCol], cy - rows[spotRow]) < 110;
            const nearStart = Math.hypot(cx - sx, cy - 500) < 110;
            if (!nearSpot && !nearStart && !inGapCorridor(cx, cy) && !nearWallSeg(cx, cy)) {
                obstacles.push(mkCone(cx, cy)); break;
            }
        }
    }

    // Spot: standard bay, occasionally a wide bay for bigger vehicles
    const wideBay = diff >= 4 && rng() < 0.35;
    const spot = wideBay
        ? { x: cols[spotCol], y: rows[spotRow], angle: tilt, w: 58, h: 96 }
        : { x: cols[spotCol], y: rows[spotRow], angle: tilt };

    return {
        name: `Lot ${n}`, par: 45 + diff * 4,
        start: { x: sx, y: 500, angle: 0 },
        spot,
        obstacles
    };
}

// ----- LEVEL LOADING -----
function buildLevel(idx) {
    levelIndex = idx;
    syncVehicle();          // apply the equipped vehicle's size & handling
    const def = idx < LEVELS.length ? LEVELS[idx] : genLevel(idx + 1);
    levelName = def.name;
    parTime = def.par;
    obstacles = borders().concat(def.obstacles);
    removeOverlappingObstacles();   // drop cars on walls, cones on cars, etc.
    spot = def.spot;
    car.x = def.start.x; car.y = def.start.y; car.angle = def.start.angle; car.speed = 0;
    car.vx = 0; car.vy = 0;
    damage = 0; elapsed = 0; holdTimer = 0; aligned = false;
    particles = []; tyreMarks = []; levelScore = 0; bumpCooldown = 0; damageCooldown = 0;
    // reset cone physics state (level defs reuse cone objects)
    for (const o of obstacles) {
        if (o.kind === 'cone') { delete o.knocked; delete o.vx; delete o.vy; delete o.rot; delete o.spin; delete o.life; }
    }
    input.up = input.down = input.left = input.right = input.hand = false;
}

function startLevel(idx) {
    buildLevel(idx);
    gameState = STATE_PLAYING;
    startEngineSound();
}
// ----- COLLISION MATH (OBB SAT + circle vs OBB) -----
function cornersOf(o) {
    const a = o.angle || 0, c = Math.cos(a), s = Math.sin(a);
    const hw = o.w / 2, hh = o.h / 2;
    return [
        { x: o.x + c * hw - s * -hh, y: o.y + s * hw + c * -hh },
        { x: o.x + c * hw - s * hh,  y: o.y + s * hw + c * hh },
        { x: o.x + c * -hw - s * hh, y: o.y + s * -hw + c * hh },
        { x: o.x + c * -hw - s * -hh, y: o.y + s * -hw + c * -hh }
    ];
}

function projectCorners(corners, ax, ay) {
    let min = Infinity, max = -Infinity;
    for (const p of corners) {
        const d = p.x * ax + p.y * ay;
        if (d < min) min = d;
        if (d > max) max = d;
    }
    return { min, max };
}

function rectsOverlap(a, b) {
    const axes = [];
    for (const o of [a, b]) {
        const ang = o.angle || 0;
        axes.push([Math.cos(ang), Math.sin(ang)], [-Math.sin(ang), Math.cos(ang)]);
    }
    const ca = cornersOf(a), cb = cornersOf(b);
    for (const [ax, ay] of axes) {
        const pa = projectCorners(ca, ax, ay);
        const pb = projectCorners(cb, ax, ay);
        if (pa.max < pb.min || pb.max < pa.min) return false;
    }
    return true;
}

function circleHitsRect(cx, cy, r, o) {
    const ang = o.angle || 0, c = Math.cos(ang), s = Math.sin(ang);
    const dx = cx - o.x, dy = cy - o.y;
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    const qx = Math.max(-o.w / 2, Math.min(o.w / 2, lx));
    const qy = Math.max(-o.h / 2, Math.min(o.h / 2, ly));
    return (lx - qx) * (lx - qx) + (ly - qy) * (ly - qy) <= r * r;
}

// The drawn body has rounded corners + the physics stop up to 1px short of
// contact, so the hitbox is slightly smaller than the visual car (forgiving)
const CAR_HITBOX_SCALE = 0.85;

function carCollides(ob) {
    if (ob.kind === 'cone' && ob.knocked) return false;   // knocked cones are inert
    const carBox = { x: car.x, y: car.y, w: VW * CAR_HITBOX_SCALE, h: VH * CAR_HITBOX_SCALE, angle: car.angle };
    if (ob.kind === 'cone') return circleHitsRect(ob.x, ob.y, ob.r, carBox);
    return rectsOverlap(carBox, ob);
}

// Car plows into a cone: it takes 1 damage and the cone gets sent flying
function knockCone(ob) {
    if (ob.knocked) return;
    ob.knocked = true;
    const d = Math.hypot(car.vx, car.vy) || 1;
    ob.vx = car.vx / d * (2.5 + Math.random() * 2);
    ob.vy = car.vy / d * (2.5 + Math.random() * 2);
    ob.spin = (Math.random() - 0.5) * 0.45;
    ob.rot = 0;
    ob.life = 55 + Math.random() * 20;
    // Scrub a little speed off the car
    car.speed *= 0.88; car.vx *= 0.88; car.vy *= 0.88;
    if (damageCooldown <= 0) {
        damage = Math.min(100, damage + 1);
        damageCooldown = 16;
        Sound.bump();
    }
    addSparks(ob.x, ob.y, 5);
}

// Remove obstacles that visually overlap each other (cars on walls, cones on
// cars, cones on walls) so no level ever starts in an impossible/broken state
function removeOverlappingObstacles() {
    const aabbOf = (o, pad = 0) => {
        const c = Math.abs(Math.cos(o.angle || 0)), s = Math.abs(Math.sin(o.angle || 0));
        const ex = c * o.w / 2 + s * o.h / 2, ey = s * o.w / 2 + c * o.h / 2;
        return { x1: o.x - ex - pad, y1: o.y - ey - pad, x2: o.x + ex + pad, y2: o.y + ey + pad };
    };
    const overlap = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const ob = obstacles[i];
        if (ob.kind === 'wall') continue;
        const pad = ob.kind === 'cone' ? ob.r + 2 : 6;
        const bad = obstacles.some(o =>
            o !== ob && o.kind !== 'cone' &&
            (o.kind === 'wall' || ob.kind === 'cone') &&
            overlap(aabbOf(o, 2), aabbOf(ob, pad)));
        if (bad) obstacles.splice(i, 1);
    }
}

// ----- DAMAGE EFFECTS (oil drips → debris → smoke → fire → explosion) -----
function updateDamageEffects() {
    if (damage < 40) return;
    const s = Math.sin(car.angle), c = Math.cos(car.angle);

    // Oil drips — start at 40% damage, get worse the more damaged the car is
    if (frameCount % Math.max(4, 22 - Math.floor(damage / 5)) === 0) {
        particles.push({
            x: car.x - s * VH * 0.35 + (Math.random() - 0.5) * VW * 0.4,
            y: car.y + c * VH * 0.35 + (Math.random() - 0.5) * VW * 0.4,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            life: 70 + Math.random() * 40,
            color: '#060a12'
        });
    }

    // Debris pieces start falling off at 65%
    if (damage >= 65 && frameCount % 18 === 0) {
        for (let i = 0; i < 2; i++) {
            particles.push({
                x: car.x + (Math.random() - 0.5) * VW,
                y: car.y + (Math.random() - 0.5) * VH,
                vx: -car.vx * 0.4 + (Math.random() - 0.5) * 1.5,
                vy: -car.vy * 0.4 + (Math.random() - 0.5) * 1.5,
                life: 40 + Math.random() * 30,
                color: Math.random() < 0.5 ? playerPaint() : '#475569'
            });
        }
    }

    // Engine smoke at 75%
    if (damage >= 75 && frameCount % 6 === 0) {
        particles.push({
            x: car.x - s * VH * 0.45 + (Math.random() - 0.5) * VW * 0.5,
            y: car.y + c * VH * 0.45 + (Math.random() - 0.5) * VW * 0.5,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            life: 35,
            color: 'rgba(120, 124, 134, 0.4)'
        });
    }

    // On fire at 90%
    if (damage >= 90 && frameCount % 3 === 0) {
        particles.push({
            x: car.x - s * VH * (0.3 + Math.random() * 0.25) + (Math.random() - 0.5) * VW * 0.5,
            y: car.y + c * VH * (0.3 + Math.random() * 0.25) + (Math.random() - 0.5) * VW * 0.5,
            vx: (Math.random() - 0.5) * 0.6,
            vy: (Math.random() - 0.5) * 0.6 - 0.3,
            life: 14 + Math.random() * 10,
            color: Math.random() < 0.4 ? '#facc15' : (Math.random() < 0.7 ? '#f97316' : '#ef4444')
        });
    }
}

// Final explosion when the car reaches 100% damage
function explodeCar() {
    const colors = ['#ef4444', '#f97316', '#facc15', '#e2e8f0', '#475569'];
    for (let i = 0; i < 70; i++) {
        const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 5;
        particles.push({
            x: car.x + (Math.random() - 0.5) * VW,
            y: car.y + (Math.random() - 0.5) * VH,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: 30 + Math.random() * 35,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
}

// ----- PARTICLES -----
function addSparks(x, y, count = 8) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 1;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 15 + Math.random() * 10,
            color: Math.random() < 0.5 ? '#facc15' : '#ff2a6d'
        });
    }
}

// ----- CAR PHYSICS -----
function updateCar() {
    if (input.up) {
        car.speed = Math.min(VS.maxSpeed, car.speed + VS.accel);
    } else if (input.down) {
        if (car.speed > 0.05) car.speed = Math.max(0, car.speed - 0.2);      // brake
        else car.speed = Math.max(-VS.maxSpeed * 0.5, car.speed - 0.05);     // reverse
    } else {
        car.speed *= 0.985;
        if (Math.abs(car.speed) < 0.012) car.speed = 0;
    }
    if (input.hand) {
        if (input.up) {
            car.speed *= 0.988;   // keep momentum while power-drifting
        } else {
            car.speed *= 0.9;
            if (Math.abs(car.speed) < 0.012) car.speed = 0;
        }
    }

    // ----- DRIFT / GRIP -----
    const drifting = input.hand && Math.abs(car.speed) > 0.4;
    const forwardX = Math.sin(car.angle), forwardY = -Math.cos(car.angle);

    // Grip: how quickly the velocity vector snaps to the car's heading.
    // Low grip while the handbrake is held = the car keeps sliding sideways.
    const grip = drifting ? VS.drift : 0.5;
    car.vx += (forwardX * car.speed - car.vx) * grip;
    car.vy += (forwardY * car.speed - car.vy) * grip;

    // Speed-scaled steering (reversed when backing up) — extra bite while drifting
    const steerFactor = Math.min(1, Math.abs(car.speed) / 1.4);
    const steer = VS.steer * steerFactor * (car.speed < 0 ? -1 : 1) * (drifting ? 1.7 : 1);
    if (input.left) car.angle -= steer;
    if (input.right) car.angle += steer;

    const prevAngle = car.angle;

    // ----- TYRE MARKS (rear wheels, sampled before the move) -----
    const perpX = Math.cos(car.angle), perpY = Math.sin(car.angle);
    const rearX = car.x - forwardX * VH * 0.3, rearY = car.y - forwardY * VH * 0.3;
    const wlPrev = { x: rearX - perpX * VW * 0.38, y: rearY - perpY * VW * 0.38 };
    const wrPrev = { x: rearX + perpX * VW * 0.38, y: rearY + perpY * VW * 0.38 };

    // ----- SUB-STEPPED MOVEMENT -----
    // Advance in slices of at most 1px, checking collisions after each slice,
    // so the car can never tunnel through thin walls (some are only 12px wide)
    // and stops as close to walls as possible when bumping into them
    const stepLen = Math.hypot(car.vx, car.vy);
    const steps = Math.max(1, Math.ceil(stepLen / 1));
    const sx = car.vx / steps, sy = car.vy / steps;
    let goodX = car.x, goodY = car.y;   // last collision-free position
    let hitOb = null;
    for (let i = 0; i < steps; i++) {
        car.x += sx; car.y += sy;
        let hitHere = null;
        for (const ob of obstacles) {
            if (!carCollides(ob)) continue;
            if (ob.kind === 'cone') { knockCone(ob); continue; }   // cones don't block
            hitHere = ob; break;
        }
        if (hitHere) { hitOb = hitHere; car.x = goodX; car.y = goodY; break; }
        goodX = car.x; goodY = car.y;
    }

    // ----- HARD WORLD BOUNDARY (failsafe — the car can never leave the lot) -----
    const minX = 7 + VW / 2, maxX = 400 - 7 - VW / 2;
    const minY = 7 + VH / 2, maxY = 600 - 7 - VH / 2;
    if (car.x < minX || car.x > maxX || car.y < minY || car.y > maxY) {
        car.x = Math.max(minX, Math.min(maxX, car.x));
        car.y = Math.max(minY, Math.min(maxY, car.y));
        car.vx *= -0.3; car.vy *= -0.3;        // bounce off the invisible rim
        car.speed *= 0.5;
    }

    // Record skid-mark segments from the rear wheels while drifting
    if (drifting && stepLen > 0.3) {
        const rear2X = car.x - forwardX * VH * 0.3, rear2Y = car.y - forwardY * VH * 0.3;
        const wl = { x: rear2X - perpX * VW * 0.38, y: rear2Y - perpY * VW * 0.38 };
        const wr = { x: rear2X + perpX * VW * 0.38, y: rear2Y + perpY * VW * 0.38 };
        const a = Math.min(1, stepLen / 2.4) * 0.6;
        tyreMarks.push({ x1: wlPrev.x, y1: wlPrev.y, x2: wl.x, y2: wl.y, a });
        tyreMarks.push({ x1: wrPrev.x, y1: wrPrev.y, x2: wr.x, y2: wr.y, a });
        if (tyreMarks.length > 600) tyreMarks.splice(0, tyreMarks.length - 600);
    }

    // Tire smoke while drifting
    if (drifting && frameCount % 2 === 0) {
        particles.push({
            x: car.x - forwardX * VH * 0.4 + (Math.random() - 0.5) * VW,
            y: car.y - forwardY * VH * 0.4 + (Math.random() - 0.5) * VW,
            vx: (Math.random() - 0.5) * 0.6,
            vy: (Math.random() - 0.5) * 0.6,
            life: 18 + Math.random() * 10,
            color: 'rgba(156, 163, 175, 0.35)'
        });
    }

    if (hitOb) {
        const ob = hitOb;
        car.angle = prevAngle;
        const impact = Math.abs(car.speed);
        car.speed = -car.speed * 0.25;
        // Re-sync the velocity vector with the bounced speed so the car
        // doesn't keep sliding through the obstacle after a collision
        car.vx = Math.sin(car.angle) * car.speed;
        car.vy = -Math.cos(car.angle) * car.speed;

        // Push the car away from the obstacle so it can't grind/stick to it
        const dx = car.x - ob.x, dy = car.y - ob.y;
        const d = Math.hypot(dx, dy) || 1;
        const oldX = car.x, oldY = car.y;
        car.x = oldX + (dx / d) * 5;
        car.y = oldY + (dy / d) * 5;
        if (obstacles.some(o => carCollides(o))) { car.x = oldX; car.y = oldY; }
        else { goodX = car.x; goodY = car.y; }

        const mx = (car.x + ob.x) / 2;
        const my = (car.y + ob.y) / 2;
        addSparks(mx, my, impact > 0.3 ? 14 : 6);

        // Damage only ticks on a cooldown, so grinding against a wall
        // can't continuously drain the car
        if (damageCooldown <= 0) {
            if (impact > 0.25) {
                damage = Math.min(100, damage + 5 + impact * 9);
                Sound.bump();
            } else {
                damage = Math.min(100, damage + 1.5);
            }
            damageCooldown = 24;
            bumpCooldown = 12;
        }
        if (damage >= 100) failLevel();
    }
}

// ----- PARKING DETECTION -----
function normalizeAngle(a) {
    return ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}

function parkingState() {
    const ang = spot.angle, c = Math.cos(ang), s = Math.sin(ang);
    const SW = spot.w || SPOT_W, SH = spot.h || SPOT_H;
    const dx = car.x - spot.x, dy = car.y - spot.y;
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    const posOK = Math.abs(lx) <= (SW - VW) / 2 + 8 && Math.abs(ly) <= (SH - VH) / 2 + 8;
    // Accept both nose-in and reverse-in orientation (angle match modulo 180°)
    const aAbs = Math.abs(normalizeAngle(car.angle - ang));
    const dAng = Math.min(aAbs, Math.PI - aAbs);
    const angleOK = dAng < ANGLE_TOL;
    const stopped = Math.abs(car.speed) < 0.06;
    return { lx, ly, dAng, ok: posOK && angleOK && stopped };
}

function checkParking() {
    const st = parkingState();
    aligned = st.ok;
    if (st.ok) {
        holdTimer += 1 / 60;
        if (holdTimer >= 1) completeLevel(st);
    } else {
        holdTimer = Math.max(0, holdTimer - 1 / 30);
    }
}

function completeLevel(st) {
    if (gameState !== STATE_PLAYING) return;   // guard against double-award
    const timeBonus = Math.max(0, Math.round((parTime - elapsed) * 4));
    const centering = Math.round((1 - Math.min(1, Math.hypot(st.lx, st.ly) / 18)) * 50);
    const precision = centering + Math.round((1 - Math.min(1, Math.abs(st.dAng) / ANGLE_TOL)) * 50);
    const noDmg = damage === 0 ? 50 : 0;
    levelScore = 100 + timeBonus + precision + noDmg;
    totalScore += levelScore;
    lastResult = { timeBonus, precision, noDmg, reward: 10 + Math.floor(levelScore / 20) };

    currency += lastResult.reward;
    lastParkFlawless = damage === 0;
    maxUnlocked = Math.max(maxUnlocked, levelIndex + 2);
    highScore = Math.max(highScore, levelScore);
    saveData();
    checkAchievements();
    Sound.success();
    stopEngineSound();
    gameState = STATE_COMPLETE;
}

function failLevel() {
    if (gameState !== STATE_PLAYING) return;   // guard against double-fail
    if (damage >= 100) explodeCar();
    Sound.crash();
    stopEngineSound();
    gameState = STATE_FAILED;
    saveData();
}
// ----- DRAWING -----
function drawLot() {
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, '#0a0e1a');
    sky.addColorStop(0.6, '#111833');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Asphalt floor
    ctx.fillStyle = '#1a2138';
    ctx.fillRect(14, 14, 372, 572);

    // Cyan glow strips along the walls (highway-style edges)
    ctx.fillStyle = 'rgba(0,242,254,0.04)';
    ctx.fillRect(11, 0, 6, canvas.height);
    ctx.fillRect(383, 0, 6, canvas.height);
    ctx.fillRect(0, 11, canvas.width, 6);
    ctx.fillRect(0, 583, canvas.width, 6);

    // Faint bay guide lines for the parking rows
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    [50, 160, 538].forEach(rowY => {
        [25, 95, 165, 235, 305, 375].forEach(bx => {
            ctx.beginPath();
            ctx.moveTo(bx, rowY - 38);
            ctx.lineTo(bx, rowY + 38);
            ctx.stroke();
        });
    });
    ctx.setLineDash([]);
}

function drawSpot() {
    ctx.save();
    ctx.translate(spot.x, spot.y);
    ctx.rotate(spot.angle);
    const SW = spot.w || SPOT_W, SH = spot.h || SPOT_H;

    const pulse = 0.6 + Math.sin(frameCount * 0.08) * 0.4;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([9, 7]);
    ctx.strokeStyle = aligned ? '#22c55e' : `rgba(0,242,254,${0.45 + pulse * 0.55})`;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = aligned ? 18 : 12;
    ctx.strokeRect(-SW / 2, -SH / 2, SW, SH);
    ctx.setLineDash([]);

    if (aligned) {
        ctx.fillStyle = 'rgba(34,197,94,0.15)';
        ctx.fillRect(-SW / 2, -SH / 2, SW, SH);
    }

    // Faint "P" marker
    ctx.shadowBlur = 0;
    ctx.fillStyle = aligned ? 'rgba(34,197,94,0.3)' : 'rgba(0,242,254,0.18)';
    ctx.font = '800 26px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('P', 0, 9);

    // Hold-progress ring while parking
    if (holdTimer > 0) {
        ctx.strokeStyle = '#22c55e';
        ctx.shadowColor = '#22c55e';
        ctx.shadowBlur = 10;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(0, 0, 27, -Math.PI / 2, -Math.PI / 2 + (holdTimer / 1) * Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
}

function drawWall(w) {
    ctx.fillStyle = '#334155';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.roundRect(w.x - w.w / 2, w.y - w.h / 2, w.w, w.h, 3);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(w.x + 2, w.y + 2, Math.max(0, w.w - 4), 2);
}

function drawCone(c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    if (c.knocked) {
        ctx.rotate(c.rot || 0);
        ctx.globalAlpha = Math.max(0, Math.min(1, (c.life || 0) / 40));
    }
    ctx.fillStyle = '#7c2d12';
    ctx.beginPath();
    ctx.arc(0, 0, c.r + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f97316';
    ctx.shadowColor = '#f97316';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(0, 0, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, c.r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

// Top-down vehicle drawn with the Highway Racer visual language
function drawVehicle(x, y, angle, w, h, color, isPlayer = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Wheels (kept inside the hitbox width so the visual matches collisions)
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(-w / 2 - 1, -h / 2 + 6, 6, 14);
    ctx.fillRect(w / 2 - 5, -h / 2 + 6, 6, 14);
    ctx.fillRect(-w / 2 - 1, h / 2 - 20, 6, 14);
    ctx.fillRect(w / 2 - 5, h / 2 - 20, 6, 14);

    // Body
    ctx.shadowColor = isPlayer ? color : 'transparent';
    ctx.shadowBlur = isPlayer ? 18 : 0;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 8);
    ctx.fill();

    // Windshield + rear window
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(16,20,38,0.7)';
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 5, -h / 2 + 14, w - 10, 14, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 5, h / 2 - 16, w - 10, 8, 3);
    ctx.fill();

    if (isPlayer) {
        // Headlights + subtle beam
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 8;
        ctx.fillRect(-w / 2 + 4, -h / 2 + 2, 7, 4);
        ctx.fillRect(w / 2 - 11, -h / 2 + 2, 7, 4);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0, 242, 254, 0.06)';
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 4, -h / 2);
        ctx.lineTo(-w / 2 - 16, -h / 2 - 90);
        ctx.lineTo(w / 2 + 16, -h / 2 - 90);
        ctx.lineTo(w / 2 - 4, -h / 2);
        ctx.closePath();
        ctx.fill();
        // Brake lights
        ctx.fillStyle = 'rgba(239,68,68,0.9)';
        if (input.down || input.hand) { ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 10; }
        ctx.fillRect(-w / 2 + 4, h / 2 - 6, 7, 4);
        ctx.fillRect(w / 2 - 11, h / 2 - 6, 7, 4);
        ctx.shadowBlur = 0;
    } else {
        // Taillights
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-w / 2 + 4, h / 2 - 6, 7, 4);
        ctx.fillRect(w / 2 - 11, h / 2 - 6, 7, 4);
    }
    ctx.restore();
}

function drawGuideArrow() {
    const dx = spot.x - car.x, dy = spot.y - car.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 150) return;
    const ang = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(car.x + Math.cos(ang) * 48, car.y + Math.sin(ang) * 48);
    ctx.rotate(ang);
    ctx.fillStyle = '#00f2fe';
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 12;
    ctx.globalAlpha = 0.5 + Math.sin(frameCount * 0.1) * 0.3;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-6, -7);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}
// ----- HUD & OVERLAY PANELS -----
function drawDamageBar(x, y) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(x, y, 100, 8, 4);
    ctx.fill();
    const dmg = Math.min(100, damage) / 100;
    ctx.fillStyle = dmg < 0.4 ? '#22c55e' : dmg < 0.75 ? '#facc15' : '#ef4444';
    if (dmg > 0) {
        ctx.beginPath();
        ctx.roundRect(x, y, Math.max(4, 100 * dmg), 8, 4);
        ctx.fill();
    }
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 9px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('DAMAGE', x, y - 4);
}

function drawUI() {
    ctx.textAlign = 'left';
    ctx.shadowBlur = 0;

    if (gameState === STATE_PLAYING) {
        ctx.font = '800 18px Outfit, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 8;
        ctx.fillText(`LVL ${levelIndex + 1}`, 16, 32);
        ctx.font = '600 11px Outfit, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(levelName.toUpperCase(), 16, 46);
        ctx.font = '800 14px Outfit, sans-serif';
        ctx.fillStyle = '#facc15';
        ctx.fillText(`🪙 ${currency}`, 16, 68);
        ctx.shadowBlur = 0;

        drawDamageBar(16, 84);

        ctx.textAlign = 'right';
        ctx.font = '800 14px Outfit, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(`🏆 ${totalScore}`, canvas.width - 16, 30);
        ctx.font = '600 11px Outfit, sans-serif';
        ctx.fillStyle = elapsed > parTime ? '#ef4444' : '#94a3b8';
        ctx.fillText(`${elapsed.toFixed(1)}s / par ${parTime}s`, canvas.width - 16, 48);
        ctx.textAlign = 'left';

        // Parking hold indicator
        if (holdTimer > 0) {
            ctx.textAlign = 'center';
            ctx.font = '800 14px Outfit, sans-serif';
            ctx.fillStyle = '#22c55e';
            ctx.shadowColor = '#22c55e';
            ctx.shadowBlur = 10;
            ctx.fillText('PARKING...', canvas.width / 2, canvas.height - 74);
            ctx.shadowBlur = 0;
        }
    } else if (gameState === STATE_START) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.roundRect(40, 150, 320, 230, 16);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.font = '800 34px Outfit, sans-serif';
        ctx.fillStyle = '#00f2fe';
        ctx.shadowColor = '#00f2fe40';
        ctx.shadowBlur = 20;
        ctx.fillText('PARKING', canvas.width / 2, 205);
        ctx.fillStyle = '#fff';
        ctx.font = '700 20px Outfit, sans-serif';
        ctx.fillText('MANIA', canvas.width / 2, 240);
        ctx.shadowBlur = 0;

        ctx.font = '700 15px Outfit, sans-serif';
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(`◀  LEVEL ${selectLevel}  ▶`, canvas.width / 2, 292);
        ctx.font = '500 12px Outfit, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Arrow keys to choose level', canvas.width / 2, 312);
        ctx.fillText('Drive into the glowing P and stop straight', canvas.width / 2, 330);
        ctx.font = '500 14px Outfit, sans-serif';
        ctx.fillStyle = '#00f2fe';
        ctx.fillText('Press any key to start', canvas.width / 2, 360);
    } else if (gameState === STATE_COMPLETE) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.beginPath();
        ctx.roundRect(30, 160, 340, 240, 16);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.font = '800 34px Outfit, sans-serif';
        ctx.fillStyle = '#22c55e';
        ctx.shadowColor = '#22c55e40';
        ctx.shadowBlur = 20;
        ctx.fillText('PARKED!', canvas.width / 2, 215);
        ctx.shadowBlur = 0;

        ctx.font = '600 15px Outfit, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(`Level Score: ${levelScore}`, canvas.width / 2, 255);
        ctx.font = '500 12px Outfit, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`Time Bonus +${lastResult.timeBonus} · Precision +${lastResult.precision}${lastResult.noDmg ? ' · No Damage +50' : ''}`, canvas.width / 2, 278);
        ctx.font = '700 15px Outfit, sans-serif';
        ctx.fillStyle = '#facc15';
        ctx.fillText(`🪙 +${lastResult.reward} coins`, canvas.width / 2, 305);
        ctx.font = '500 12px Outfit, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText(`Best Level Score: ${highScore}`, canvas.width / 2, 330);
        ctx.font = '400 13px Outfit, sans-serif';
        ctx.fillStyle = '#00f2fe';
        ctx.fillText('Press any key for the next level', canvas.width / 2, 365);
    } else if (gameState === STATE_FAILED) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.beginPath();
        ctx.roundRect(30, 180, 340, 190, 16);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.font = '800 34px Outfit, sans-serif';
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#ef444440';
        ctx.shadowBlur = 20;
        ctx.fillText('WRECKED', canvas.width / 2, 235);
        ctx.shadowBlur = 0;
        ctx.font = '600 16px Outfit, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText('Damage: 100%', canvas.width / 2, 275);
        ctx.font = '400 13px Outfit, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('Press R or tap to retry the level', canvas.width / 2, 325);
    }
}
// ----- MAIN LOOP -----
function update() {
    frameCount++;
    if (bumpCooldown > 0) bumpCooldown--;
    if (damageCooldown > 0) damageCooldown--;

    if (gameState === STATE_PLAYING) {
        elapsed += 1 / 60;
        updateCar();
        if (gameState === STATE_PLAYING) {   // may have failed mid-update
            updateDamageEffects();
            updateEngineAudio(car.speed);
            checkParking();
        }
    }

    particles = particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        return p.life > 0;
    });

    // Knocked cones fly away, spin and fade out
    for (const ob of obstacles) {
        if (ob.kind !== 'cone' || !ob.knocked) continue;
        ob.x += ob.vx; ob.y += ob.vy;
        ob.vx *= 0.96; ob.vy *= 0.96;
        ob.rot += ob.spin;
        ob.life--;
    }
    obstacles = obstacles.filter(ob => !(ob.kind === 'cone' && ob.knocked && ob.life <= 0));

    if (frameCount % 30 === 0 && gameState === STATE_PLAYING) checkAchievements();
}

function draw() {
    drawLot();
    drawSpot();

    // Tyre marks left by drifting (drawn under cars and walls)
    if (tyreMarks.length > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(17, 24, 39, 0.8)';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        for (const m of tyreMarks) {
            ctx.globalAlpha = m.a;
            ctx.beginPath();
            ctx.moveTo(m.x1, m.y1);
            ctx.lineTo(m.x2, m.y2);
            ctx.stroke();
        }
        ctx.restore();
    }

    obstacles.forEach(ob => {
        if (ob.kind === 'wall') drawWall(ob);
        else if (ob.kind === 'cone') drawCone(ob);
        else drawVehicle(ob.x, ob.y, ob.angle, ob.w, ob.h, ob.color, false);
    });

    const playerColor = playerPaint();
    drawVehicle(car.x, car.y, car.angle, VW, VH, playerColor, true);

    if (gameState === STATE_PLAYING) drawGuideArrow();

    particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 2.5, 2.5);
    });

    drawUI();
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// ----- GARAGE RENDERER: two sections — Vehicles (handling) & Paint (color) -----
function renderGarage() {
    garageList.innerHTML = '';

    const mkCard = (item, kind, ownedList, equippedId, swatch) => {
        const owned = ownedList.includes(item.id);
        const equipped = equippedId === item.id;
        const div = document.createElement('div');
        div.className = 'vehicle-card';
        const swatchStyle = swatch ? item.color : '#475569';
        div.innerHTML = `
            <div class="info">
                <div class="color-dot" style="background:${swatchStyle}"></div>
                <div>
                    <div class="name">${item.name}${kind === 'veh' ? ` <span style="font-size:0.65em; opacity:0.7; text-transform:capitalize;">${item.type}</span>` : ''}</div>
                    <div class="price">${item.price === 0 ? 'Free' : `<i class="fa-solid fa-coins"></i> ${item.price}`}</div>
                </div>
            </div>
            <div>
                ${equipped ? '<button class="buy-btn equipped">✓ Equipped</button>' :
                 owned ? `<button class="buy-btn owned" data-kind="${kind}" data-id="${item.id}">Owned</button>` :
                 `<button class="buy-btn" data-kind="${kind}" data-id="${item.id}" data-price="${item.price}">Buy</button>`}
            </div>
        `;
        garageList.appendChild(div);
    };

    const mkHeader = (title, subtitle) => {
        const h = document.createElement('div');
        h.style.cssText = 'grid-column:1/-1; margin:6px 0 2px; font-weight:800; font-size:0.85rem; letter-spacing:0.05em; text-transform:uppercase; color:#00f2fe;';
        h.innerHTML = `${title} <span style="font-weight:500; text-transform:none; letter-spacing:0; color:#94a3b8;">— ${subtitle}</span>`;
        garageList.appendChild(h);
    };

    mkHeader('Vehicles', 'changes size & handling');
    VEHICLES.forEach(v => mkCard(v, 'veh', ownedVehicles, equippedVehicle, false));

    mkHeader('Paint', 'just the looks');
    CAR_COLORS.forEach(c => mkCard(c, 'col', ownedColors, equippedColor, true));

    garageList.querySelectorAll('.buy-btn[data-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const kind = btn.dataset.kind;
            const id = btn.dataset.id;
            const isVeh = kind === 'veh';
            const item = isVeh ? VEHICLES.find(v => v.id === id) : CAR_COLORS.find(c => c.id === id);
            if (!item) return;
            const ownedList = isVeh ? ownedVehicles : ownedColors;
            if (ownedList.includes(id)) {
                if (isVeh) { equippedVehicle = id; localStorage.setItem('parking_equipped', id); syncVehicle(); }
                else { equippedColor = id; localStorage.setItem('parking_paint', id); }
                renderGarage();
                saveData();
                return;
            }
            const price = parseInt(btn.dataset.price);
            if (currency >= price) {
                currency -= price;
                ownedList.push(id);
                if (isVeh) { equippedVehicle = id; syncVehicle(); }
                else { equippedColor = id; }
                saveData();
                renderGarage();
                Sound.coin();
                checkAchievements();
            } else {
                showAchievementToast('Not enough coins!');
            }
        });
    });

    currencySpan.textContent = currency;
    garageCurrencySpan.textContent = currency;
}

document.getElementById('shopToggle').addEventListener('click', () => {
    garageOverlay.classList.toggle('open');
    renderGarage();
});
document.getElementById('closeShop').addEventListener('click', () => {
    garageOverlay.classList.remove('open');
});
garageOverlay.addEventListener('click', (e) => {
    if (e.target === garageOverlay) garageOverlay.classList.remove('open');
});
// ----- VOLUME SLIDER CONTROL -----
const volumeSlider = document.getElementById('volumeSlider');
const volumeIcon = document.getElementById('volumeIcon');

function updateVolumeIcon() {
    if (!volumeIcon) return;
    if (gameVolume <= 0) {
        volumeIcon.className = 'fa-solid fa-volume-xmark';
    } else if (gameVolume < 0.5) {
        volumeIcon.className = 'fa-solid fa-volume-low';
    } else {
        volumeIcon.className = 'fa-solid fa-volume-high';
    }
}

if (volumeSlider) {
    volumeSlider.value = Math.round(gameVolume * 100);
    volumeSlider.addEventListener('input', () => {
        gameVolume = parseFloat(volumeSlider.value) / 100;
        localStorage.setItem('parking_volume', gameVolume);
        if (masterGain && audioCtx) {
            masterGain.gain.setTargetAtTime(gameVolume, audioCtx.currentTime, 0.02);
        }
        updateVolumeIcon();
    });
}
updateVolumeIcon();

// ----- KEYBOARD CONTROLS -----
const DRIVE_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'A', 'd', 'D', 'w', 'W', 's', 'S', ' '];

window.addEventListener('keydown', e => {
    initAudio();
    const key = e.key;

    if (gameState === STATE_START) {
        if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
            selectLevel = Math.max(1, selectLevel - 1);
            buildLevel(selectLevel - 1);
        } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
            selectLevel = Math.min(maxUnlocked, selectLevel + 1);
            buildLevel(selectLevel - 1);
        } else {
            startLevel(selectLevel - 1);
        }
        e.preventDefault();
        return;
    }

    if (gameState === STATE_COMPLETE) {
        startLevel(levelIndex + 1);
        selectLevel = levelIndex + 1;
        e.preventDefault();
        return;
    }

    if (gameState === STATE_FAILED) {
        startLevel(levelIndex);
        e.preventDefault();
        return;
    }

    if (DRIVE_KEYS.includes(key)) e.preventDefault();

    if (key === 'ArrowUp' || key === 'w' || key === 'W') {
        input.up = true;
    } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
        input.down = true;
    } else if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
        input.left = true;
    } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
        input.right = true;
    } else if (key === ' ') {
        input.hand = true;
    } else if (key === 'r' || key === 'R') {
        startLevel(levelIndex);
    }
});

window.addEventListener('keyup', e => {
    const key = e.key;
    if (key === 'ArrowUp' || key === 'w' || key === 'W') input.up = false;
    if (key === 'ArrowDown' || key === 's' || key === 'S') input.down = false;
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') input.left = false;
    if (key === 'ArrowRight' || key === 'd' || key === 'D') input.right = false;
    if (key === ' ') input.hand = false;
});

canvas.addEventListener('click', () => {
    initAudio();
    if (gameState === STATE_START) startLevel(selectLevel - 1);
    else if (gameState === STATE_COMPLETE) { selectLevel = levelIndex + 2; startLevel(levelIndex + 1); }
    else if (gameState === STATE_FAILED) startLevel(levelIndex);
});

// ----- TOUCH CONTROLS -----
const touchLayer = document.getElementById('touchLayer');

function bindTouchBtn(id, prop) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const press = (e) => {
        e.preventDefault();
        e.stopPropagation();
        initAudio();
        if (gameState === STATE_START) { startLevel(selectLevel - 1); return; }
        if (gameState === STATE_COMPLETE) { selectLevel = levelIndex + 2; startLevel(levelIndex + 1); return; }
        if (gameState === STATE_FAILED) { startLevel(levelIndex); return; }
        input[prop] = true;
        btn.classList.add('pressed');
    };
    const release = (e) => {
        e.preventDefault();
        input[prop] = false;
        btn.classList.remove('pressed');
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
}

bindTouchBtn('tGas', 'up');
bindTouchBtn('tBrake', 'down');
bindTouchBtn('tLeft', 'left');
bindTouchBtn('tRight', 'right');

// Tapping the canvas (not the buttons) advances overlays on touch devices
if (touchLayer) {
    touchLayer.addEventListener('pointerdown', (e) => {
        if (e.target === touchLayer) {
            initAudio();
            if (gameState === STATE_START) startLevel(selectLevel - 1);
            else if (gameState === STATE_COMPLETE) { selectLevel = levelIndex + 2; startLevel(levelIndex + 1); }
            else if (gameState === STATE_FAILED) startLevel(levelIndex);
        }
    }, { passive: true });
}

// ----- POLYFILL -----
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (r > w / 2) r = w / 2; if (r > h / 2) r = h / 2;
        this.moveTo(x + r, y); this.lineTo(x + w - r, y);
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

// ----- INIT -----
selectLevel = Math.max(1, maxUnlocked);
buildLevel(selectLevel - 1);   // preview the current level behind the start screen
gameState = STATE_START;
saveData();
requestAnimationFrame(gameLoop);