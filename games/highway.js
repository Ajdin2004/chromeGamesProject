const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const currencySpan = document.getElementById('currencyDisplay');
const shopCurrencySpan = document.getElementById('shopCurrency');
const shopOverlay = document.getElementById('shopOverlay');
const shopList = document.getElementById('shopList');
const upgradeList = document.getElementById('upgradeList');
const achToast = document.getElementById('achievementToast');
const achText = document.getElementById('achText');

// ----- AUDIO SYNTHESIZER -----
let audioCtx = null;
let engineOsc1 = null;
let engineOsc2 = null;
let engineGain = null;
let engineFilter = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    startEngineSound();
}

function startEngineSound() {
    if (engineOsc1 || !audioCtx) return;

    engineGain = audioCtx.createGain();
    engineGain.gain.setValueAtTime(0.06, audioCtx.currentTime);

    engineFilter = audioCtx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.setValueAtTime(600, audioCtx.currentTime);

    engineOsc1 = audioCtx.createOscillator();
    engineOsc1.type = 'sawtooth';
    engineOsc1.frequency.setValueAtTime(50, audioCtx.currentTime);

    engineOsc2 = audioCtx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.setValueAtTime(100, audioCtx.currentTime);

    engineOsc1.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(audioCtx.destination);

    engineOsc1.start();
    engineOsc2.start();
}

function updateEngineAudio(rpm, gear, isShift) {
    if (!audioCtx || !engineOsc1 || !engineGain) return;
    const now = audioCtx.currentTime;

    const pitch = 35 + (rpm / 8000) * (90 + gear * 25);
    engineOsc1.frequency.setTargetAtTime(pitch, now, 0.04);
    engineOsc2.frequency.setTargetAtTime(pitch * 1.5, now, 0.04);

    const cutoff = 400 + (rpm / 8000) * 1800;
    engineFilter.frequency.setTargetAtTime(cutoff, now, 0.05);

    if (isShift) {
        engineGain.gain.setValueAtTime(0.02, now);
        engineGain.gain.exponentialRampToValueAtTime(0.06, now + 0.12);
    }
}

function stopEngineSound() {
    if (engineGain && audioCtx) {
        engineGain.gain.setTargetAtTime(0.001, audioCtx.currentTime, 0.12);
        setTimeout(() => {
            if (engineOsc1) { engineOsc1.stop(); engineOsc1 = null; }
            if (engineOsc2) { engineOsc2.stop(); engineOsc2 = null; }
        }, 130);
    }
}

const Sound = {
    shift() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(280, audioCtx.currentTime + 0.09);
        gain.gain.setValueAtTime(0.14, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.09);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.09);
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
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.45);
    },
    bump() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.15);
    },
    honk() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc1 = audioCtx.createOscillator(), osc2 = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc1.type = 'sawtooth'; osc2.type = 'sawtooth';
        osc1.frequency.setValueAtTime(400, now);
        osc2.frequency.setValueAtTime(490, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc1.connect(gain); osc2.connect(gain); gain.connect(audioCtx.destination);
        osc1.start(now); osc2.start(now);
        osc1.stop(now + 0.25); osc2.stop(now + 0.25);
    },
    powerup() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(850, now + 0.2);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.2);
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
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(now + 0.06);
    }
};

// ----- SHOP VEHICLES & UPGRADES -----
const VEHICLES = [
    { id: 'default', name: 'Cyber Blue', color: '#00f2fe', price: 0, owned: true, equipped: true },
    { id: 'lava', name: 'Lava Racer', color: '#ff2a6d', price: 150, owned: false, equipped: false },
    { id: 'gold', name: 'Gold Crown', color: '#facc15', price: 300, owned: false, equipped: false },
    { id: 'neon', name: 'Neon Purple', color: '#a855f7', price: 450, owned: false, equipped: false },
    { id: 'emerald', name: 'Emerald', color: '#22c55e', price: 600, owned: false, equipped: false },
    { id: 'ice', name: 'Iceberg', color: '#e2e8f0', price: 800, owned: false, equipped: false },
];

let currency = parseInt(localStorage.getItem('highway_currency')) || 0;
let ownedVehicles = JSON.parse(localStorage.getItem('highway_owned')) || ['default'];
let equippedVehicle = localStorage.getItem('highway_equipped') || 'default';
let engineLevel = parseInt(localStorage.getItem('highway_engine_level')) || 1; 
let gearboxLevel = parseInt(localStorage.getItem('highway_gearbox_level')) || 1; // 1: 4 Speeds, 2: 5 Speeds, 3: 6 Speeds, 4: 7 Speeds
let revLimitLevel = parseInt(localStorage.getItem('highway_rev_level')) || 1;   // Raises max redline
let nitroUpgradeLevel = parseInt(localStorage.getItem('highway_nitro_level')) || 1; // Boosts Nitro duration/speed

const GEAR_RATIOS = [
    { gear: 1, minSpeed: 1.5, maxSpeed: 3.8, accel: 0.12 },
    { gear: 2, minSpeed: 3.0, maxSpeed: 6.0, accel: 0.08 },
    { gear: 3, minSpeed: 5.0, maxSpeed: 8.0, accel: 0.05 },
    { gear: 4, minSpeed: 7.0, maxSpeed: 10.2, accel: 0.035 },
    { gear: 5, minSpeed: 9.0, maxSpeed: 12.5, accel: 0.025 },
    { gear: 6, minSpeed: 11.0, maxSpeed: 14.8, accel: 0.018 },
    { gear: 7, minSpeed: 13.0, maxSpeed: 17.5, accel: 0.012 }
];

const GEARBOX_UPGRADES = [
    { level: 1, name: '4-Speed Standard Transmission', maxGears: 4, price: 0 },
    { level: 2, name: '5-Speed Sport Gearbox', maxGears: 5, price: 300 },
    { level: 3, name: '6-Speed Race Transmission', maxGears: 6, price: 600 },
    { level: 4, name: '7-Speed Sequential Dual-Clutch', maxGears: 7, price: 1000 }
];

const REV_UPGRADES = [
    { level: 1, name: 'Factory ECU Redline', maxRpm: 7000, price: 0 },
    { level: 2, name: 'Stage 1 ECU Tune (7,800 RPM)', maxRpm: 7800, price: 250 },
    { level: 3, name: 'High-Rev Valvetrain (8,500 RPM)', maxRpm: 8500, price: 550 },
    { level: 4, name: 'Race Spec ECU (9,500 RPM)', maxRpm: 9500, price: 950 }
];

const NITRO_UPGRADES = [
    { level: 1, name: 'Stock Nitro Injection', duration: 300, price: 0 },
    { level: 2, name: 'Dual Stage NOS Tanks', duration: 450, price: 350 },
    { level: 3, name: 'High-Flow N2O Supercharge', duration: 600, price: 700 }
];

const ENGINE_UPGRADES = [
    { level: 1, name: 'Stock V4 Engine', price: 0, mult: 1.0 },
    { level: 2, name: 'Turbocharger Stage 1', price: 200, mult: 1.25 },
    { level: 3, name: 'V6 Performance Core', price: 450, mult: 1.55 },
    { level: 4, name: 'Twin Turbo V8', price: 750, mult: 1.90 },
    { level: 5, name: 'Hyper-Car V12 Engine', price: 1200, mult: 2.30 }
];

function saveData() {
    localStorage.setItem('highway_currency', currency);
    localStorage.setItem('highway_owned', JSON.stringify(ownedVehicles));
    localStorage.setItem('highway_equipped', equippedVehicle);
    localStorage.setItem('highway_engine_level', engineLevel);
    localStorage.setItem('highway_gearbox_level', gearboxLevel);
    localStorage.setItem('highway_rev_level', revLimitLevel);
    localStorage.setItem('highway_nitro_level', nitroUpgradeLevel);
    currencySpan.textContent = currency;
    shopCurrencySpan.textContent = currency;
}

// ----- ACHIEVEMENTS -----
const ACHIEVEMENTS = {
    firstDrive: { name: 'First Drive', desc: 'Score 50', unlocked: false, check: () => score >= 50 },
    speedster: { name: 'Speedster', desc: 'Score 200', unlocked: false, check: () => score >= 200 },
    proRacer: { name: 'Pro Racer', desc: 'Score 500', unlocked: false, check: () => score >= 500 },
    collector: { name: 'Collector', desc: 'Own 3 vehicles', unlocked: false, check: () => ownedVehicles.length >= 3 },
    rich: { name: 'Rich', desc: 'Earn 1000 coins', unlocked: false, check: () => currency >= 1000 },
};
let unlockedAchievements = JSON.parse(localStorage.getItem('highway_achievements')) || [];

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
        localStorage.setItem('highway_achievements', JSON.stringify(unlockedAchievements));
    }
}

function showAchievementToast(msg) {
    achText.textContent = msg;
    achToast.classList.add('show');
    clearTimeout(window.achTimeout);
    window.achTimeout = setTimeout(() => achToast.classList.remove('show'), 3500);
}

// ----- GAME STATE & TRANSMISSION SIMULATION -----
const STATE_START = 0, STATE_PLAYING = 1, STATE_GAMEOVER = 2;
let gameState = STATE_START;
const LANES = [85, 160, 235, 310];
const CAR_WIDTH = 40, CAR_HEIGHT = 70;
let player = { lane: 1, x: LANES[1], targetX: LANES[1], y: 480 };


let currentGear = 1;
let currentRpm = 1000;
let vehicleSpeed = 2.0;
let shiftAnimationTimer = 0;

let traffic = [];
let particles = [];
let powerups = [];
let roadCoins = [];

let activeShield = false;
let nitroTimer = 0;
let doubleCoinsTimer = 0;
let magnetTimer = 0;

let roadOffset = 0;
let score = 0;
let highScore = parseInt(localStorage.getItem('highway_highscore')) || 0;
let isBoosting = false;
let isBraking = false;
let honkFlashTimer = 0;
let frameCount = 0;

const POWERUP_TYPES = [
    { type: 'shield', color: '#00f2fe', label: '🛡️', duration: 0 },
    { type: 'nitro', color: '#facc15', label: '⚡', duration: 300 },
    { type: 'double', color: '#22c55e', label: '2x', duration: 360 },
    { type: 'magnet', color: '#a855f7', label: '🧲', duration: 360 }
];

function resetGame() {
    player.lane = 1; player.x = LANES[1]; player.targetX = LANES[1]; player.y = 480;
    currentGear = 1; currentRpm = 1200; vehicleSpeed = 2.0; shiftAnimationTimer = 0;
    traffic = []; particles = []; powerups = []; roadCoins = []; score = 0; roadOffset = 0; frameCount = 0;
    isBoosting = false; isBraking = false; honkFlashTimer = 0;
    activeShield = false; nitroTimer = 0; doubleCoinsTimer = 0; magnetTimer = 0;
    startEngineSound();
    gameState = STATE_PLAYING;
}

// ----- HEAVY TRUCK & TRAFFIC SPAWNER -----
function spawnTraffic() {
    const laneIndex = Math.floor(Math.random() * LANES.length);
    const inLane = traffic.some(car => car.lane === laneIndex && car.y < 160);
    if (!inLane) {
        const isTruck = score > 150 && Math.random() < 0.28;
        const colors = ['#ff2a6d', '#facc15', '#a855f7', '#22c55e', '#e2e8f0', '#f97316'];

        traffic.push({
            id: Math.random(),
            isTruck: isTruck,
            width: isTruck ? 46 : CAR_WIDTH,
            height: isTruck ? 115 : CAR_HEIGHT,
            lane: laneIndex,
            x: LANES[laneIndex],
            targetX: LANES[laneIndex],
            y: isTruck ? -120 : -CAR_HEIGHT,
            speed: isTruck ? Math.random() * 1.2 + 1.2 : Math.random() * 2 + 1.8,
            baseSpeed: isTruck ? 1.5 : Math.random() * 2 + 1.8,
            color: isTruck ? '#64748b' : colors[Math.floor(Math.random() * colors.length)],
            isCrashed: false,
            rotation: 0,
            spinSpeed: 0,
            isBraking: false,
            brakeTimer: 0
        });
    }
}

function spawnCoinSequence() {
    const laneIndex = Math.floor(Math.random() * LANES.length);
    const coinCount = Math.floor(Math.random() * 4) + 3;
    for (let i = 0; i < coinCount; i++) {
        roadCoins.push({
            x: LANES[laneIndex],
            y: -40 - (i * 38),
            r: 8
        });
    }
}

function spawnPowerup() {
    if (Math.random() < 0.3) {
        const laneIndex = Math.floor(Math.random() * LANES.length);
        const pDef = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
        powerups.push({
            x: LANES[laneIndex],
            y: -30,
            r: 14,
            type: pDef.type,
            color: pDef.color,
            label: pDef.label,
            duration: pDef.duration
        });
    }
}

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

function triggerHonk() {
    if (gameState !== STATE_PLAYING) return;
    Sound.honk();
    honkFlashTimer = 18;

    traffic.forEach(car => {
        if (!car.isCrashed && car.y < player.y && car.y > player.y - 320) {
            if (Math.abs(car.x - player.x) < 60) {
                let swerveLeft = car.lane > 0;
                let swerveRight = car.lane < LANES.length - 1;

                if (swerveLeft && traffic.some(other => other.lane === car.lane - 1 && Math.abs(other.y - car.y) < car.height * 1.5)) swerveLeft = false;
                if (swerveRight && traffic.some(other => other.lane === car.lane + 1 && Math.abs(other.y - car.y) < car.height * 1.5)) swerveRight = false;

                if (swerveLeft) { car.lane--; car.targetX = LANES[car.lane]; }
                else if (swerveRight) { car.lane++; car.targetX = LANES[car.lane]; }
                else { car.speed += 2.5; }
            }
        }
    });
}

function shiftGear(up = true) {
    const maxGear = GEARBOX_UPGRADES.find(g => g.level === gearboxLevel)?.maxGears || 4;
    const maxRpmCap = REV_UPGRADES.find(r => r.level === revLimitLevel)?.maxRpm || 7000;
    let shifted = false;

    if (up && currentGear < maxGear) {
        currentGear++;
        currentRpm = Math.max(1800, currentRpm * 0.62);
        shifted = true;
    } else if (!up && currentGear > 1) {
        currentGear--;
        currentRpm = Math.min(maxRpmCap, currentRpm * 1.38);
        shifted = true;
    }

    if (shifted) {
        shiftAnimationTimer = 15;
        Sound.shift();
        updateEngineAudio(currentRpm, currentGear, true);
    }
}

// ----- UPDATE ENGINE & TRANSMISSION PHYSICS -----
function update() {
    if (gameState !== STATE_PLAYING) return;
    frameCount++;

    
    if (honkFlashTimer > 0) honkFlashTimer--;
    if (nitroTimer > 0) nitroTimer--;
    
    if (doubleCoinsTimer > 0) doubleCoinsTimer--;
    if (magnetTimer > 0) magnetTimer--;
    if (shiftAnimationTimer > 0) shiftAnimationTimer--;

    // AUTOMATIC GEARBOX SYSTEM (For Smooth Mobile Driving)
    const maxGearCap = GEARBOX_UPGRADES.find(g => g.level === gearboxLevel)?.maxGears || 4;
    const maxRpmCap = REV_UPGRADES.find(r => r.level === revLimitLevel)?.maxRpm || 7000;

    if (currentRpm >= maxRpmCap - 400 && currentGear < maxGearCap && shiftAnimationTimer === 0) {
        shiftGear(true);  // Auto Shift Up
    } else if (currentRpm <= 2200 && currentGear > 1 && shiftAnimationTimer === 0 && !isBoosting) {
        shiftGear(false); // Auto Shift Down
    }

    const gData = GEAR_RATIOS[currentGear - 1];
    const engineMult = ENGINE_UPGRADES.find(e => e.level === engineLevel)?.mult || 1.0;

    // Modified Engine Acceleration with Engine Upgrades Multiplier
    const effectiveAccel = gData.accel * engineMult;

    if (isBoosting || nitroTimer > 0) {
        vehicleSpeed = Math.min(gData.maxSpeed * (1 + (engineLevel - 1) * 0.05), vehicleSpeed + effectiveAccel);
        currentRpm = Math.min(maxRpmCap, currentRpm + (effectiveAccel * 110));
    } else if (isBraking) {
        vehicleSpeed = Math.max(1.2, vehicleSpeed - 0.16);
        currentRpm = Math.max(1000, currentRpm - 140);
    } else {
        if (vehicleSpeed > gData.minSpeed) vehicleSpeed -= 0.02;
        currentRpm = Math.max(1200, currentRpm - 30);
    }

    updateEngineAudio(currentRpm, currentGear, false);

    player.x += (player.targetX - player.x) * 0.25;
    roadOffset = (roadOffset + vehicleSpeed) % 40;

    score += Math.floor(vehicleSpeed / 2.5);
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('highway_highscore', highScore);
    }

    const spawnRate = vehicleSpeed > 7.0 ? 0.05 : 0.035;
    if (Math.random() < spawnRate) spawnTraffic();
    if (frameCount % 160 === 0) spawnCoinSequence();
    if (frameCount % 260 === 0) spawnPowerup();

    // 1. UPDATE COINS
    roadCoins = roadCoins.filter(c => {
        c.y += vehicleSpeed * 0.9;

        if (magnetTimer > 0) {
            c.x += (player.x - c.x) * 0.15;
            c.y += (player.y - c.y) * 0.15;
        }

        const dist = Math.hypot(player.x - c.x, player.y - c.y);
        if (dist < c.r + CAR_WIDTH / 2) {
            const coinVal = doubleCoinsTimer > 0 ? 2 : 1;
            currency += coinVal;
            Sound.coin();
            saveData();
            addSparks(c.x, c.y, 4);
            return false;
        }

        return c.y < canvas.height + 30;
    });

    // 2. UPDATE POWERUPS
    powerups = powerups.filter(p => {
        p.y += vehicleSpeed * 0.8;

        if (magnetTimer > 0) {
            p.x += (player.x - p.x) * 0.1;
            p.y += (player.y - p.y) * 0.1;
        }

        const dist = Math.hypot(player.x - p.x, player.y - p.y);
        if (dist < p.r + CAR_WIDTH / 2) {
            Sound.powerup();
            addSparks(p.x, p.y, 12);

            if (p.type === 'shield') activeShield = true;
            if (p.type === 'nitro') {
                // Applied the upgraded Nitro duration cap here safely
                const nCap = NITRO_UPGRADES.find(n => n.level === nitroUpgradeLevel)?.duration || 300;
                nitroTimer = nCap;
            }
            if (p.type === 'double') doubleCoinsTimer = p.duration;
            if (p.type === 'magnet') magnetTimer = p.duration;

            return false;
        }
        return p.y < canvas.height + 40;
    });

    // 3. UPDATE TRAFFIC POSITIONS & ANTI-CLIPPING
    traffic.forEach((car, i) => {
        if (!car.isCrashed && Math.random() < 0.003 && car.brakeTimer <= 0) {
            car.isBraking = true;
            car.brakeTimer = 60 + Math.floor(Math.random() * 60);
        }

        if (car.brakeTimer > 0) {
            car.brakeTimer--;
            if (car.brakeTimer === 0) car.isBraking = false;
        }

        let currentCarSpeed = car.isBraking ? car.baseSpeed * 0.4 : car.speed;
        if (car.isCrashed) currentCarSpeed = 0.5;

        car.y += vehicleSpeed - currentCarSpeed + 1.2;
        car.x += (car.targetX - car.x) * 0.15;

        if (car.isCrashed) car.rotation += car.spinSpeed;

        if (!car.isCrashed) {
            traffic.forEach((otherCar, j) => {
                if (i !== j && car.lane === otherCar.lane) {
                    if (otherCar.y > car.y - car.height * 1.5 && otherCar.y < car.y) {
                        if (otherCar.isCrashed) {
                            car.isCrashed = true;
                            car.spinSpeed = (Math.random() - 0.5) * 0.3;
                            addSparks((car.x + otherCar.x)/2, (car.y + otherCar.y)/2, 12);
                            Sound.bump();
                        } else {
                            car.speed = Math.min(car.speed, otherCar.speed);
                        }
                    }
                }
            });
        }
    });

    // 4. PLAYER COLLISION CHECK
    for (let i = traffic.length - 1; i >= 0; i--) {
        const car = traffic[i];
        if (car.isCrashed) continue;

        const dx = player.x - car.x;
        const dy = player.y - car.y;

        if (Math.abs(dx) < (CAR_WIDTH/2 + car.width/2) * 0.82 &&
            Math.abs(dy) < (CAR_HEIGHT/2 + car.height/2) * 0.82) {

            // SHIELD PROTECTION: Works on ALL vehicles including Semi-Trucks!
            if (activeShield) {
                activeShield = false;
                Sound.bump();
                car.isCrashed = true;
                car.spinSpeed = dx >= 0 ? -0.45 : 0.45;
                car.speed = 0.5;
                
                // Reward Bonus Coins for spinning out a vehicle via shield
                const coinBonus = doubleCoinsTimer > 0 ? 10 : 5;
                currency += coinBonus;
                Sound.coin();
                saveData();
                addSparks(player.x, player.y, 30);
                
                if (dx > 0 && car.lane > 0) car.lane--;
                else if (dx <= 0 && car.lane < LANES.length - 1) car.lane++;
                car.targetX = LANES[car.lane];
                continue;
            }

            // HEAVY TRUCK COLLISION (without shield) -> Game Over
            if (car.isTruck) {
                Sound.crash();
                addSparks(player.x, player.y, 35);
                gameState = STATE_GAMEOVER;
                checkAchievements();
                saveData();
                break;
            }

            // PIT MANEUVER / REAR BUMP LOGIC
            const isRearPitBump = (player.y > car.y + 12);
            const isTrafficHittingPlayerBack = (car.y > player.y + 10);

            if (isRearPitBump) {
                // Player pit-maneuvers a car ahead -> Spin it out and grant Bonus Coins!
                Sound.bump();
                car.isCrashed = true;
                car.spinSpeed = dx >= 0 ? -0.35 : 0.35;
                car.speed = 0.5;

                // Award +5 coins (or +10 with 2x multiplier active)
                const coinBonus = doubleCoinsTimer > 0 ? 10 : 5;
                currency += coinBonus;
                Sound.coin();
                saveData();
                addSparks(car.x, car.y + car.height / 2, 20);

                if (dx > 0 && car.lane > 0) car.lane--;
                else if (dx <= 0 && car.lane < LANES.length - 1) car.lane++;
                car.targetX = LANES[car.lane];

            } else if (isTrafficHittingPlayerBack) {
                // Traffic hits the rear of the player's car -> No Game Over! Spin traffic car out instead
                Sound.bump();
                car.isCrashed = true;
                car.spinSpeed = (Math.random() - 0.5) * 0.4;
                car.speed = 0.5;
                addSparks(car.x, car.y - car.height / 2, 12);

            } else {
                // Frontal or Side T-Bone Impact -> Game Over
                Sound.bump();
                car.isCrashed = true;
                car.spinSpeed = (Math.random() - 0.5) * 0.4;
                car.speed = 0.5;
                addSparks(car.x, car.y - car.height / 2, 12);

            }
        }

        if (car.y > canvas.height + car.height * 2) traffic.splice(i, 1);
    }

    particles = particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        return p.life > 0;
    });

    if (frameCount % 30 === 0) checkAchievements();
}

// ----- DRAWING & TACHOMETER -----
function drawCar(x, y, color, isPlayer = false, carObj = null) {
    ctx.save();
    ctx.translate(x, y);

    if (carObj && carObj.isCrashed) {
        ctx.rotate(carObj.rotation);
    }

    if (carObj && carObj.isTruck) {
        const w = carObj.width;
        const h = carObj.height;

        ctx.fillStyle = '#334155';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.roundRect(-w/2, -h/2, w, h - 30, 4);
        ctx.fill();

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.roundRect(-w/2 + 2, h/2 - 30, w - 4, 28, 6);
        ctx.fill();

        ctx.fillStyle = 'rgba(16,20,38,0.85)';
        ctx.fillRect(-w/2 + 6, h/2 - 12, w - 12, 6);

        ctx.fillStyle = '#ff0000';
        ctx.fillRect(-w/2 + 4, -h/2 + 2, 8, 4);
        ctx.fillRect(w/2 - 12, -h/2 + 2, 8, 4);

        ctx.restore();
        return;
    }

    if (isPlayer && activeShield) {
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#00f2fe';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(0, CAR_HEIGHT / 2, CAR_HEIGHT * 0.65, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.shadowColor = isPlayer ? color : 'rgba(0,0,0,0)';
    ctx.shadowBlur = isPlayer ? 22 : 0;

    // Wheels
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(-CAR_WIDTH/2 - 4, 8, 6, 16);
    ctx.fillRect(CAR_WIDTH/2 - 2, 8, 6, 16);
    ctx.fillRect(-CAR_WIDTH/2 - 4, CAR_HEIGHT - 24, 6, 16);
    ctx.fillRect(CAR_WIDTH/2 - 2, CAR_HEIGHT - 24, 6, 16);

    // Body
    ctx.shadowColor = isPlayer ? color : 'transparent';
    ctx.shadowBlur = isPlayer ? 18 : 0;
    ctx.fillStyle = carObj && carObj.isCrashed ? '#475569' : color;
    ctx.beginPath();
    ctx.roundRect(-CAR_WIDTH/2, 0, CAR_WIDTH, CAR_HEIGHT, 8);
    ctx.fill();

    // Windshield
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(16,20,38,0.7)';
    ctx.beginPath();
    ctx.roundRect(-CAR_WIDTH/2 + 6, 16, CAR_WIDTH - 12, 16, 4);
    ctx.fill();

    if (isPlayer) {
        ctx.fillStyle = honkFlashTimer > 0 ? '#ffffff' : '#00f2fe';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = honkFlashTimer > 0 ? 30 : 10;
        ctx.fillRect(-CAR_WIDTH/2 + 4, 2, 8, 5);
        ctx.fillRect(CAR_WIDTH/2 - 12, 2, 8, 5);

        ctx.fillStyle = honkFlashTimer > 0 ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 242, 254, 0.08)';
        ctx.beginPath();
        ctx.moveTo(-CAR_WIDTH/2 + 4, 0);
        ctx.lineTo(-CAR_WIDTH/2 - 50, -220);
        ctx.lineTo(CAR_WIDTH/2 + 50, -220);
        ctx.lineTo(CAR_WIDTH/2 - 4, 0);
        ctx.closePath();
        ctx.fill();

        if (isBoosting || nitroTimer > 0) {
            ctx.fillStyle = 'rgba(255,100,0,0.6)';
            ctx.shadowColor = '#ff6600';
            ctx.shadowBlur = 30;
            ctx.beginPath();
            ctx.moveTo(-10, CAR_HEIGHT);
            ctx.lineTo(0, CAR_HEIGHT + 22 + Math.random()*10);
            ctx.lineTo(10, CAR_HEIGHT);
            ctx.fill();
        }
    } else {
        ctx.shadowBlur = 0;
        ctx.fillStyle = (carObj && carObj.isBraking) ? '#ff0000' : '#ef4444';
        if (carObj && carObj.isBraking) {
            ctx.shadowColor = '#ff0000';
            ctx.shadowBlur = 12;
        }
        ctx.fillRect(-CAR_WIDTH/2 + 4, CAR_HEIGHT - 7, 8, 4);
        ctx.fillRect(CAR_WIDTH/2 - 12, CAR_HEIGHT - 7, 8, 4);
    }
    ctx.shadowBlur = 0;
    ctx.restore();
}

// DRAW TINY ANALOG TACHOMETER GAUGE
function drawAnalogTachometer(centerX, centerY, radius) {
    ctx.save();
    ctx.translate(centerX, centerY);

    // Gauge Outer Ring & Face
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Redline Zone Arc (6000 to 8000 RPM)
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const redlineAngle = startAngle + (endAngle - startAngle) * (6000 / 8000);

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, radius - 4, redlineAngle, endAngle);
    ctx.stroke();

    // RPM Tick Marks
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 7px Outfit, sans-serif';
    ctx.textAlign = 'center';

    for (let i = 0; i <= 8; i++) {
        const angle = startAngle + (endAngle - startAngle) * (i / 8);
        const tx = Math.cos(angle) * (radius - 8);
        const ty = Math.sin(angle) * (radius - 8);
        const lx = Math.cos(angle) * (radius - 4);
        const ly = Math.sin(angle) * (radius - 4);

        ctx.strokeStyle = i >= 6 ? '#ef4444' : '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(tx, ty);
        ctx.stroke();
    }

    // Dynamic Needle
    const clampedRpm = Math.min(8000, Math.max(0, currentRpm));
    const needleAngle = startAngle + (endAngle - startAngle) * (clampedRpm / 8000);

    ctx.strokeStyle = clampedRpm >= 6500 ? '#ef4444' : '#00f2fe';
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(needleAngle) * (radius - 6), Math.sin(needleAngle) * (radius - 6));
    ctx.stroke();

    // Center Cap
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawRoadCoins() {
    roadCoins.forEach(c => {
        ctx.save();
        ctx.translate(c.x, c.y);

        ctx.fillStyle = '#facc15';
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, c.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#000';
        ctx.font = '800 10px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('$', 0, 3.5);

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

        ctx.font = '12px Outfit, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(p.label, 0, 4);
        ctx.restore();
    });
}

function drawRoad() {
    const sky = ctx.createLinearGradient(0,0,0,canvas.height);
    sky.addColorStop(0, '#0a0e1a');
    sky.addColorStop(0.6, '#111833');
    ctx.fillStyle = sky;
    ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.fillStyle = '#1a2138';
    ctx.fillRect(45, 0, 310, canvas.height);

    ctx.fillStyle = 'rgba(0,242,254,0.04)';
    ctx.fillRect(42, 0, 6, canvas.height);
    ctx.fillRect(352, 0, 6, canvas.height);

    ctx.fillStyle = '#334155';
    ctx.fillRect(38, 0, 4, canvas.height);
    ctx.fillRect(358, 0, 4, canvas.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([20, 18]);
    ctx.lineDashOffset = -roadOffset;
    for (let i = 1; i < LANES.length; i++) {
        const dx = (LANES[i-1] + LANES[i]) / 2;
        ctx.beginPath();
        ctx.moveTo(dx, 0);
        ctx.lineTo(dx, canvas.height);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(48, 0, 3, canvas.height);
    ctx.fillRect(349, 0, 3, canvas.height);
}

function drawUI() {
    ctx.textAlign = 'left';
    ctx.shadowBlur = 0;

    if (gameState === STATE_PLAYING) {
        ctx.font = '800 18px Outfit, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 8;
        ctx.fillText(`🏁 ${Math.floor(score)}`, 16, 32);
        ctx.fillStyle = '#facc15';
        ctx.fillText(`🪙 ${currency}`, 16, 56);
        ctx.shadowBlur = 0;

        let pBadges = [];
        if (activeShield) pBadges.push('🛡️');
        if (nitroTimer > 0) pBadges.push('⚡');
        if (doubleCoinsTimer > 0) pBadges.push('2x');
        if (magnetTimer > 0) pBadges.push('🧲');

        ctx.font = '14px Outfit, sans-serif';
        ctx.fillText(pBadges.join(' '), 16, 80);

        // DASHBOARD HUD
        drawAnalogTachometer(42, canvas.height - 42, 28);
        const maxGearCap = GEARBOX_UPGRADES.find(g => g.level === gearboxLevel)?.maxGears || 4;
        const maxRpmCap = REV_UPGRADES.find(r => r.level === revLimitLevel)?.maxRpm || 7000;

        ctx.fillStyle = shiftAnimationTimer > 0 ? '#facc15' : '#00f2fe';
        ctx.font = '800 20px Outfit, sans-serif';
        ctx.fillText(`GEAR ${currentGear}/${maxGearCap}`, 82, canvas.height - 34);

        if (currentRpm > (maxRpmCap - 800) && currentGear < maxGearCap && Math.floor(frameCount / 10) % 2 === 0) {
            ctx.fillStyle = '#ef4444';
            ctx.font = '800 12px Outfit, sans-serif';
            ctx.fillText('SHIFT UP! [SHIFT]', 82, canvas.height - 16);
        }   

    } else if (gameState === STATE_START) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.roundRect(40, 180, 320, 160, 16);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.font = '800 32px Outfit, sans-serif';
        ctx.fillStyle = '#00f2fe';
        ctx.shadowColor = '#00f2fe40';
        ctx.shadowBlur = 20;
        ctx.fillText('HIGHWAY', canvas.width/2, 235);
        ctx.fillStyle = '#fff';
        ctx.font = '700 20px Outfit, sans-serif';
        ctx.fillText('RACER', canvas.width/2, 275);
        ctx.shadowBlur = 0;
        ctx.font = '500 14px Outfit, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Press any key to start', canvas.width/2, 320);
    } else if (gameState === STATE_GAMEOVER) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.beginPath();
        ctx.roundRect(30, 170, 340, 210, 16);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.font = '800 34px Outfit, sans-serif';
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#ef444440';
        ctx.shadowBlur = 20;
        ctx.fillText('CRASHED', canvas.width/2, 225);
        ctx.shadowBlur = 0;
        ctx.font = '600 18px Outfit, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(`Score: ${Math.floor(score)}`, canvas.width/2, 270);
        ctx.fillStyle = '#facc15';
        ctx.fillText(`🪙 ${currency}`, canvas.width/2, 300);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '500 14px Outfit, sans-serif';
        ctx.fillText(`Best: ${highScore}`, canvas.width/2, 330);
        ctx.font = '400 13px Outfit, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('Press any key to restart', canvas.width/2, 365);
    }
}

// ----- MAIN LOOP -----
function gameLoop(timestamp) {
    update();
    drawRoad();
    drawRoadCoins();
    drawPowerups();
    traffic.forEach(car => drawCar(car.x, car.y, car.color, false, car));
    drawCar(player.x, player.y, VEHICLES.find(v => v.id === equippedVehicle)?.color || '#00f2fe', true);

    particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 2.5, 2.5);
    });

    drawUI();
    requestAnimationFrame(gameLoop);
}

// ----- CONTROLS & GEAR SHIFTING LISTENERS -----
// ----- MOBILE TOUCH CONTROL BINDINGS -----
// ----- MOBILE GESTURE & TOUCH ENGINE -----
const touchLayer = document.getElementById('touchLayer');
const honkBtn = document.getElementById('tHonk');

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
const SWIPE_THRESHOLD = 30; // Minimum pixel drag to detect a lane shift

if (touchLayer) {
    // 1. TOUCH START: Begin Acceleration & Track Swipe Coordinates
    touchLayer.addEventListener('touchstart', (e) => {
        if (e.target === honkBtn || honkBtn.contains(e.target)) return;
        e.preventDefault();
        initAudio();

        if (gameState === STATE_START || gameState === STATE_GAMEOVER) {
            resetGame();
            return;
        }

        const touch = e.changedTouches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartTime = Date.now();

        // Holding screen accelerates the car
        isBoosting = true;
        isBraking = false;
    }, { passive: false });

    // 2. TOUCH MOVE: Dynamic Swipe Lane Changing
    touchLayer.addEventListener('touchmove', (e) => {
        if (gameState !== STATE_PLAYING) return;
        e.preventDefault();

        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;

        // Check if horizontal swipe distance exceeds threshold
        if (Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX > 0 && player.lane < LANES.length - 1) {
                // Swipe Right
                player.lane++;
                player.targetX = LANES[player.lane];
                Sound.shift();
            } else if (deltaX < 0 && player.lane > 0) {
                // Swipe Left
                player.lane--;
                player.targetX = LANES[player.lane];
                Sound.shift();
            }
            // Reset start coordinates to allow chaining consecutive lane shifts
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
        }
    }, { passive: false });

    // 3. TOUCH END: Release Throttle or Quick Tap Brake
    touchLayer.addEventListener('touchend', (e) => {
        if (e.target === honkBtn || honkBtn.contains(e.target)) return;
        e.preventDefault();

        const touchDuration = Date.now() - touchStartTime;

        // Releasing hold stops acceleration
        isBoosting = false;

        // A quick tap (under 120ms without swiping) acts as a quick tap brake
        if (touchDuration < 120) {
            isBraking = true;
            setTimeout(() => { isBraking = false; }, 250);
        }
    }, { passive: false });
}

// Dedicated Honk Button Binding
if (honkBtn) {
    honkBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        initAudio();
        triggerHonk();
    }, { passive: false });
}
window.addEventListener('keydown', e => {
    initAudio();
    const key = e.key;

    if (gameState === STATE_START || gameState === STATE_GAMEOVER) {
        resetGame();
        e.preventDefault();
        return;
    }

    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','a','A','d','D','w','W','s','S','h','H',' ','Shift','Control'].includes(key)) e.preventDefault();

    if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
        if (player.lane > 0) { player.lane--; player.targetX = LANES[player.lane]; Sound.shift(); }
    } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
        if (player.lane < LANES.length - 1) { player.lane++; player.targetX = LANES[player.lane]; Sound.shift(); }
    } else if (key === 'ArrowUp' || key === 'w' || key === 'W') {
        isBoosting = true;
    } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
        isBraking = true;
    } else if (key === 'Shift') {
        shiftGear(true);
    } else if (key === 'Control') {
        shiftGear(false);
    } else if (key === 'h' || key === 'H' || key === ' ') {
        triggerHonk();
    }
});

window.addEventListener('keyup', e => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') isBoosting = false;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') isBraking = false;
});

canvas.addEventListener('click', () => {
    if (gameState === STATE_PLAYING) triggerHonk();
});

// ----- SHOP & ENGINE UPGRADES RENDERER -----
function renderShop() {
    upgradeList.innerHTML = '';

    const createUpgradeCard = (title, icon, currentLevel, upgradeArray, onBuy) => {
        const next = upgradeArray.find(u => u.level === currentLevel + 1);
        const curr = upgradeArray.find(u => u.level === currentLevel);

        const card = document.createElement('div');
        card.className = 'upgrade-card';
        card.innerHTML = `
            <div class="info">
                <div class="icon-box"><i class="${icon}"></i></div>
                <div>
                    <div class="name">${curr.name}</div>
                    <div class="price">Level ${currentLevel} / ${upgradeArray.length}</div>
                </div>
            </div>
            <div>
                ${next ? `<button class="buy-btn buy-upg-btn"><i class="fa-solid fa-coins"></i> ${next.price}</button>` :
                         `<button class="buy-btn maxed">MAX LEVEL</button>`}
            </div>
        `;
        const btn = card.querySelector('.buy-upg-btn');
        if (btn) btn.addEventListener('click', () => onBuy(next));
        return card;
    };

    // Engine Power
    upgradeList.appendChild(createUpgradeCard('Engine', 'fa-solid fa-gauge-high', engineLevel, ENGINE_UPGRADES, (next) => {
        if (currency >= next.price) {
            currency -= next.price; engineLevel++; saveData(); renderShop(); Sound.coin();
        } else showAchievementToast('Not enough coins!');
    }));

    // Gearbox Transmission
    upgradeList.appendChild(createUpgradeCard('Gearbox', 'fa-solid fa-gear', gearboxLevel, GEARBOX_UPGRADES, (next) => {
        if (currency >= next.price) {
            currency -= next.price; gearboxLevel++; saveData(); renderShop(); Sound.coin();
        } else showAchievementToast('Not enough coins!');
    }));

    // Rev Limiter
    upgradeList.appendChild(createUpgradeCard('Rev Redline', 'fa-solid fa-fire-flame-curved', revLimitLevel, REV_UPGRADES, (next) => {
        if (currency >= next.price) {
            currency -= next.price; revLimitLevel++; saveData(); renderShop(); Sound.coin();
        } else showAchievementToast('Not enough coins!');
    }));

    // Nitro Injection
    upgradeList.appendChild(createUpgradeCard('Nitro NOS', 'fa-solid fa-bolt', nitroUpgradeLevel, NITRO_UPGRADES, (next) => {
        if (currency >= next.price) {
            currency -= next.price; nitroUpgradeLevel++; saveData(); renderShop(); Sound.coin();
        } else showAchievementToast('Not enough coins!');
    }));

    // Render Vehicle Skins
    shopList.innerHTML = '';
    VEHICLES.forEach(v => {
        const owned = ownedVehicles.includes(v.id);
        const equipped = equippedVehicle === v.id;
        const div = document.createElement('div');
        div.className = 'vehicle-card';
        div.innerHTML = `
            <div class="info">
                <div class="color-dot" style="background:${v.color}"></div>
                <div>
                    <div class="name">${v.name}</div>
                    <div class="price">${v.price === 0 ? 'Free' : `<i class="fa-solid fa-coins"></i> ${v.price}`}</div>
                </div>
            </div>
            <div>
                ${equipped ? '<button class="buy-btn equipped">✓ Equipped</button>' :
                 owned ? `<button class="buy-btn owned" data-id="${v.id}">Owned</button>` :
                 `<button class="buy-btn" data-id="${v.id}" data-price="${v.price}">Buy</button>`}
            </div>
        `;
        shopList.appendChild(div);
    });

    shopList.querySelectorAll('.buy-btn[data-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const vehicle = VEHICLES.find(v => v.id === id);
            if (!vehicle) return;
            if (ownedVehicles.includes(id)) {
                equippedVehicle = id;
                localStorage.setItem('highway_equipped', equippedVehicle);
                renderShop();
                saveData();
                return;
            }
            const price = parseInt(btn.dataset.price);
            if (currency >= price) {
                currency -= price;
                ownedVehicles.push(id);
                equippedVehicle = id;
                saveData(); renderShop(); Sound.coin(); checkAchievements();
            } else {
                showAchievementToast('Not enough coins!');
            }
        });
    });

    currencySpan.textContent = currency;
    shopCurrencySpan.textContent = currency;
}
document.getElementById('shopToggle').addEventListener('click', () => {
    shopOverlay.classList.toggle('open');
    renderShop();
});
document.getElementById('closeShop').addEventListener('click', () => {
    shopOverlay.classList.remove('open');
});
shopOverlay.addEventListener('click', (e) => {
    if (e.target === shopOverlay) shopOverlay.classList.remove('open');
});

// ----- POLYFILL -----
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r) {
        if (r > w/2) r = w/2; if (r > h/2) r = h/2;
        this.moveTo(x+r,y); this.lineTo(x+w-r,y);
        this.quadraticCurveTo(x+w,y,x+w,y+r);
        this.lineTo(x+w,y+h-r);
        this.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
        this.lineTo(x+r,y+h);
        this.quadraticCurveTo(x,y+h,x,y+h-r);
        this.lineTo(x,y+r);
        this.quadraticCurveTo(x,y,x+r,y);
        return this;
    };
}

// ----- INIT -----
gameState = STATE_START;
saveData();
unlockedAchievements.forEach(key => { if (ACHIEVEMENTS[key]) ACHIEVEMENTS[key].unlocked = true; });
requestAnimationFrame(gameLoop);