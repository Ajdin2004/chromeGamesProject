'use strict';

// Jet Fighter — self-contained Canvas 2D / Web Audio combat game.
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('gameWrapper');
const TAU = Math.PI * 2;
const WORLD = 7200;
const touchDevice = matchMedia('(pointer: coarse)').matches;
let W = 1280, H = 720, dpr = 1;

function resize() {
    W = Math.max(320, wrapper.clientWidth);
    H = Math.max(320, wrapper.clientHeight);
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 100));
resize();

// Reduced airframe speeds by ~18% to slow down gameplay pace
const AIRFRAMES = {
    f16: { name: 'F-16 FALCON', speed: 8.9, turn: .092, hp: 85, missiles: 6, flares: 7, color: '#60a5fa' },
    mig29: { name: 'MIG-29 FULCRUM', speed: 8.2, turn: .076, hp: 110, missiles: 7, flares: 8, color: '#a3e635' },
    su27: { name: 'SU-27 FLANKER', speed: 7.6, turn: .068, hp: 145, missiles: 8, flares: 10, color: '#fbbf24' }
};

// Math Helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const rnd = (a, b) => a + Math.random() * (b - a);
function turnToward(current, target, rate) {
    return current + clamp(angleDiff(target, current), -rate, rate);
}

// Audio System
let audio;
function initAudio() {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
}

function tone(freq = .1, dur = .1, type = 'sine', vol = .08, end = freq) {
    if (!audio) return;
    const t = audio.currentTime;
    const o = audio.createOscillator();
    const g = audio.createGain();
    
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, freq), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + dur);
    
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(.001, t + dur);
    
    o.connect(g);
    g.connect(audio.destination);
    o.start(t);
    o.stop(t + dur);
}

const Sound = {
    cannon: () => tone(180, .055, 'sawtooth', .055, 55),
    missile: () => tone(90, .32, 'sawtooth', .12, 28),
    lock: () => tone(880, .12, 'sine', .07, 1100),
    broken: () => tone(500, .18, 'square', .045, 180),
    warning: () => tone(720, .09, 'square', .065, 720),
    flare: () => tone(280, .08, 'triangle', .08, 80),
    boom: (p = 1) => tone(90 * p, .42, 'sawtooth', .16, 22),
    pickup: () => tone(500, .22, 'sine', .08, 1200),
    wave: () => [440, 554, 659, 880].forEach((n, i) => setTimeout(() => tone(n, .2, 'triangle', .07, n * 1.05), i * 100))
};

// Game State
let state = 'select', paused = false, selected = 'f16', player = null;
let wave = 1, score = 0, kills = 0;
let highScore = parseInt(localStorage.getItem('jetfighter_highscore') || '0', 10);
let enemies = [], bases = [], bullets = [], missiles = [], flares = [], particles = [], crates = [], terrain = [];
let keys = {}, frame = 0, spawnTimer = 0, waveTimer = 0, banner = '', bannerTimer = 0, shake = 0, lastLock = null, warningTick = 0, radarTick = 0, radarSpike = false;
const cam = { x: 0, y: 0, zoom: 1 };
let friendlyAirfield = { x: WORLD / 2, y: WORLD - 650, angle: -Math.PI / 2 };
const touch = { stick: null, dx: 0, dy: 0, cannon: false };

// --- Entity Generation ---

function makeTerrain() {
    terrain = [];
    const colors = ['#6f8c45', '#8d9b52', '#b09a58', '#527847'];
    
    for (let i = 0; i < 34; i++) {
        terrain.push({ type: 'field', x: rnd(0, WORLD), y: rnd(0, WORLD), w: rnd(350, 1000), h: rnd(250, 800), rot: rnd(0, TAU), c: colors[i % 4] });
    }
    for (let i = 0; i < 13; i++) {
        terrain.push({ type: 'lake', x: rnd(300, WORLD - 300), y: rnd(300, WORLD - 300), w: rnd(180, 520), h: rnd(120, 330), rot: rnd(0, TAU) });
    }
    for (let i = 0; i < 18; i++) {
        terrain.push({ type: 'mountain', x: rnd(0, WORLD), y: rnd(0, WORLD), w: rnd(250, 650), h: rnd(200, 500), rot: rnd(0, TAU) });
    }
    for (let i = 0; i < 15; i++) {
        terrain.push({ type: i % 3 ? 'town' : 'city', x: rnd(300, WORLD - 300), y: rnd(300, WORLD - 300), w: rnd(170, 430), h: rnd(140, 340), rot: rnd(0, TAU) });
    }
}

function newAircraft(type, x, y, enemy = false) {
    const s = AIRFRAMES[type];
    return {
        type, x, y,
        angle: enemy ? rnd(0, TAU) : -Math.PI / 2,
        speed: enemy ? s.speed * .55 : 2.5,
        throttle: .55,
        hp: s.hp, maxHp: s.hp,
        r: 18, enemy,
        fire: 0, missile: 0, flare: 0,
        missiles: s.missiles, flares: s.flares,
        flareRegen: 0,
        dead: false, contrail: 0,
        // AI specific attributes
        tracking: false,
        wanderAngle: 0
    };
}

function safeLocation(min = 1000) {
    let p, tries = 0;
    do {
        p = { x: rnd(500, WORLD - 500), y: rnd(500, WORLD - 500) };
        tries++;
    } while (tries < 40 && ((player && dist(p, player) < min) || dist(p, friendlyAirfield) < min + 300));
    return p;
}

function spawnBase() {
    const p = safeLocation(1100);
    bases.push({ x: p.x, y: p.y, angle: rnd(0, TAU), hp: 320 + wave * 70, maxHp: 320 + wave * 70, spawn: rnd(220, 380), dead: false, r: 72 });
}

function spawnEnemy(source) {
    const cap = 5 + wave * 2;
    if (enemies.length >= cap) return;
    
    const types = ['f16', 'mig29', 'su27'];
    const p = source ? { x: source.x + rnd(-90, 90), y: source.y + rnd(-90, 90) } : safeLocation(700);
    const e = newAircraft(types[Math.floor(Math.random() * 3)], p.x, p.y, true);
    const boost = 1 + (wave - 1) * .075;
    
    e.hp *= boost;
    e.maxHp = e.hp;
    e.speed *= Math.min(1.18, boost);
    e.angle = Math.atan2(player.y - e.y, player.x - e.x);
    e.wanderAngle = e.angle;
    e.missile = rnd(200, 450);
    
    enemies.push(e);
}

function startGame() {
    initAudio();
    wave = 1; score = 0; kills = 0; frame = 0;
    enemies = []; bases = []; bullets = []; missiles = []; flares = []; particles = []; crates = [];
    // Randomize friendly airfield location each mission, kept clear of the map edges
    friendlyAirfield.x = rnd(1100, WORLD - 1100);
    friendlyAirfield.y = rnd(1100, WORLD - 1100);

    makeTerrain();

    player = newAircraft(selected, friendlyAirfield.x, friendlyAirfield.y);
    player.angle = friendlyAirfield.angle;
    cam.zoom = 1;
    
    state = 'playing';
    paused = false;
    beginWave(true);
}

function beginWave(first = false) {
    bases = [];
    enemies = [];
    missiles = missiles.filter(m => !m.enemy);
    
    const count = Math.min(7, 2 + wave);
    for (let i = 0; i < count; i++) spawnBase();
    for (let i = 0; i < Math.min(2 + wave, 7); i++) spawnEnemy();
    
    if (!first) {
        const s = AIRFRAMES[player.type];
        player.missiles = Math.min(s.missiles, player.missiles + Math.ceil(s.missiles * .5));
        player.flares = Math.min(s.flares, player.flares + 3);
        player.hp = Math.min(player.maxHp, player.hp + player.maxHp * .2);
    }
    
    spawnTimer = Math.max(100, 360 - wave * 20);
    banner = `WAVE ${wave} — DESTROY ${count} BASES`;
    bannerTimer = 180;
    waveTimer = 0;
}

// --- Combat Systems ---

function damage(o, n, weapon = 'cannon') {
    if (o.dead) return;
    o.hp -= n;
    burst(o.x, o.y, n > 30 ? '#ff9f43' : '#fff2a8', n > 30 ? 14 : 4);
    
    if (o.hp > 0) return;
    
    o.dead = true;
    Sound.boom(rnd(.75, 1.15));
    shake = Math.max(shake, 10);
    burst(o.x, o.y, '#ff5d2e', 35);
    
    if (o.enemy) {
        score += weapon === 'missile' ? 250 : 100;
        kills++;
    }
    
    if (bases.includes(o)) {
        score += 500;
        crates.push({ x: o.x, y: o.y, r: 16, life: 1800 });
    }
    saveBest();
}

function saveBest() {
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('jetfighter_highscore', String(highScore));
    }
}

function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        const a = rnd(0, TAU), s = rnd(.5, 5);
        particles.push({ x, y, px: x, py: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(15, 45), max: 45, color, size: rnd(2, 6) });
    }
}

function shoot(a) {
    if (a.fire > 0) return;
    a.fire = a.enemy ? Math.max(7, 18 - wave) : 5;
    Sound.cannon();
    
    const spread = a.enemy ? rnd(-.045, .045) : rnd(-.018, .018);
    const ang = a.angle + spread;
    const bulletSpeed = 10.5; // Reduced bullet speed
    
    bullets.push({ 
        x: a.x + Math.cos(ang) * 25, y: a.y + Math.sin(ang) * 25, 
        vx: Math.cos(ang) * bulletSpeed, vy: Math.sin(ang) * bulletSpeed, 
        life: 64, enemy: a.enemy, owner: a 
    });
    burst(a.x + Math.cos(ang) * 24, a.y + Math.sin(ang) * 24, '#fff7ae', 2);
}

function acquireTarget(a, enemyTarget) {
    const pool = enemyTarget ? [player] : [...enemies.filter(e => !e.dead), ...bases.filter(b => !b.dead)];
    let best = null, bestD = 900;
    
    pool.forEach(t => {
        const d = dist(a, t);
        const ad = Math.abs(angleDiff(Math.atan2(t.y - a.y, t.x - a.x), a.angle));
        if (d < bestD && ad < .32) {
            best = t;
            bestD = d;
        }
    });
    return best;
}

function launch(a, target) {
    if (a.missiles <= 0 || !target) return false;
    a.missiles--;
    a.missile = 90;
    Sound.missile();
    // Adjusted initial missile speed (dodgeable)
    missiles.push({ x: a.x, y: a.y, px: a.x, py: a.y, angle: a.angle, speed: 5.5, target, enemy: a.enemy, life: 300, owner: a });
    shake = 3;
    return true;
}

function deployFlares(a) {
    if (a.flares <= 0 || a.flare > 0) return;
    a.flares--;
    a.flare = 45;
    Sound.flare();
    
    for (let i = 0; i < 5; i++) {
        flares.push({ 
            x: a.x + rnd(-10, 10), y: a.y + rnd(-10, 10), 
            vx: -Math.cos(a.angle) * rnd(1, 3) + rnd(-1, 1), vy: -Math.sin(a.angle) * rnd(1, 3) + rnd(-1, 1), 
            life: 110, owner: a 
        });
    }
}

// --- Update Logic ---

function updatePlayer() {
    const s = AIRFRAMES[player.type];
    let steer = (keys.ArrowLeft || keys.a ? -1 : 0) + (keys.ArrowRight || keys.d ? 1 : 0);
    if (touch.stick) steer = clamp(touch.dx / 45, -1, 1);
    
    if (keys.ArrowUp || keys.w) player.throttle = clamp(player.throttle + .008, 0, 1);
    if (keys.ArrowDown || keys.s) player.throttle = clamp(player.throttle - .008, .18, 1);
    
    const turn = s.turn * (1.05 - player.speed / s.speed * .25);
    player.angle += steer * turn;
    player.speed += (s.speed * (.32 + .68 * player.throttle) - player.speed) * .025;
    
    player.x = clamp(player.x + Math.cos(player.angle) * player.speed, 40, WORLD - 40);
    player.y = clamp(player.y + Math.sin(player.angle) * player.speed, 40, WORLD - 40);
    
    if (Math.abs(steer) > .75 && player.speed > s.speed * .65 && frame % 3 === 0) {
        player.contrail = 12;
        particles.push({ 
            x: player.x - Math.cos(player.angle) * 20, y: player.y - Math.sin(player.angle) * 20, 
            px: player.x, py: player.y, vx: 0, vy: 0, life: 50, max: 50, color: '#e8f7ff', size: 2 
        });
    }
    
    if (keys[' '] || touch.cannon) shoot(player);
    
    // Flares regenerate slowly over time (1 every 5 seconds up to airframe max)
    player.flareRegen++;
    if (player.flareRegen >= 300) {
        player.flareRegen = 0;
        if (player.flares < s.flares) {
            player.flares++;
            Sound.pickup();
        }
    }
    
    [player, ...enemies].forEach(a => {
        a.fire = Math.max(0, a.fire - 1);
        a.missile = Math.max(0, a.missile - 1);
        a.flare = Math.max(0, a.flare - 1);
    });
}

function updateEnemies() {
    enemies.forEach(e => {
        if (e.dead) return;
        
        const s = AIRFRAMES[e.type];
        const d = dist(e, player);
        const angleToPlayer = Math.atan2(player.y - e.y, player.x - e.x);
        const alignedToPlayer = Math.abs(angleDiff(angleToPlayer, e.angle));
        
        // --- Invisible Cone of Vision AI ---
        // Cone is ~90 degrees (1.57 radians/2 = 0.78 rads offset)
        if (!e.tracking && d < 1500 && alignedToPlayer < 0.78) {
            e.tracking = true; // Player entered vision cone
        } else if (e.tracking && (d > 2000 || alignedToPlayer > 1.57)) {
            e.tracking = false; // Player out of range or flanked behind
            e.wanderAngle = e.angle + rnd(-0.6, 0.6); // Pick a new wandering direction
        }
        
        let desiredAngle;
        if (e.tracking) {
            // Track player using predictive lead
            const lead = clamp(d / (e.speed + 8), 8, 45);
            const tx = player.x + Math.cos(player.angle) * player.speed * lead;
            const ty = player.y + Math.sin(player.angle) * player.speed * lead;
            desiredAngle = Math.atan2(ty - e.y, tx - e.x);
        } else {
            // Wander or turn back toward center if hitting borders
            if (e.x < 500 || e.x > WORLD - 500 || e.y < 500 || e.y > WORLD - 500) {
                desiredAngle = Math.atan2(WORLD / 2 - e.y, WORLD / 2 - e.x);
            } else {
                desiredAngle = e.wanderAngle;
            }
        }
        
        // Apply steering
        e.angle = turnToward(e.angle, desiredAngle, s.turn * (.65 + wave * .025));
        e.speed += (s.speed * (.5 + Math.min(.22, wave * .02)) - e.speed) * .02;
        e.x += Math.cos(e.angle) * e.speed;
        e.y += Math.sin(e.angle) * e.speed;
        
        // Attack logic (only fire if tracking and aligned)
        if (e.tracking) {
            if (d < 700 && alignedToPlayer < .13 && frame % 2 === 0) shoot(e);
            if (e.missile <= 0 && d < 1000 && alignedToPlayer < .28 && Math.random() < .007 + wave * .0008) launch(e, player);
        }
        
        // Defensive flares
        const incoming = missiles.find(m => !m.enemy && m.target === e && dist(m, e) < 280);
        if (incoming && wave >= 3 && e.flares > 0 && Math.random() < .05) deployFlares(e);
        
        // Collision with player
        if (dist(e, player) < e.r + player.r) {
            damage(e, 20 + player.speed * 2, 'cannon');
            damage(player, 18 + e.speed * 2);
            e.angle += Math.PI * .7;
        }
    });
    
    enemies = enemies.filter(e => !e.dead);
}

function updateWeapons() {
    // Bullets
    bullets.forEach(b => {
        b.x += b.vx;
        b.y += b.vy;
        b.life--;
        
        const targets = b.enemy ? [player] : [...enemies, ...bases];
        for (const t of targets) {
            if (!t.dead && dist(b, t) < t.r + (bases.includes(t) ? 20 : 4)) {
                damage(t, b.enemy ? 5 + wave * .35 : 8, 'cannon');
                b.life = 0;
                break;
            }
        }
    });
    bullets = bullets.filter(b => b.life > 0 && b.x > 0 && b.x < WORLD && b.y > 0 && b.y < WORLD);
    
    // Missiles
    missiles.forEach(m => {
        m.px = m.x;
        m.py = m.y;
        m.life--;
        
        if (m.target && (m.target.dead || (m.target.owner && m.target.life <= 0))) m.target = null;
        
        // Flare decoy logic (generous so missiles can be shaken off)
        if (m.target) {
            const decoy = flares.filter(f => f.owner === m.target && dist(f, m) < 280);
            if (decoy.length && Math.random() < .22) m.target = decoy[Math.floor(Math.random() * decoy.length)];
        }
        
        // Cross-path acquisition: a missile can lock onto any aircraft it crosses paths with
        const pool = m.enemy ? [player, ...enemies.filter(e => e !== m.owner && !e.dead)] : enemies.filter(e => !e.dead);
        const crossed = pool.find(t => !t.dead && t !== m.target && dist(m, t) < 46);
        if (crossed) m.target = crossed;
        // Homeless missiles acquire the nearest aircraft in range
        if (!m.target) {
            let best = null, bd = 420;
            pool.forEach(t => {
                if (!t.dead) {
                    const d = dist(m, t);
                    if (d < bd) { best = t; bd = d; }
                }
            });
            m.target = best;
        }
        
        // Missile steering — limited turn rate so a fast-turning pilot can outmaneuver it
        if (m.target) {
            const desired = Math.atan2(m.target.y - m.y, m.target.x - m.x);
            m.angle = turnToward(m.angle, desired, .042);
        }
        
        m.speed = Math.min(9.2, m.speed + .04); // Dodgeable missile speed
        m.x += Math.cos(m.angle) * m.speed;
        m.y += Math.sin(m.angle) * m.speed;
        
        particles.push({
            x: m.x, y: m.y, px: m.px, py: m.py, vx: 0, vy: 0,
            life: m.enemy ? 30 : 22, max: m.enemy ? 30 : 22,
            color: m.enemy ? '#ff8c2e' : '#d9e8e8', size: m.enemy ? 5 : 3
        });
        // Extra smoke puffs behind enemy missiles so they stand out
        if (m.enemy && frame % 3 === 0) {
            particles.push({
                x: m.x - Math.cos(m.angle) * 10, y: m.y - Math.sin(m.angle) * 10,
                px: m.x, py: m.y, vx: rnd(-.4, .4), vy: rnd(-.4, .4),
                life: 40, max: 40, color: 'rgba(255,120,40,.7)', size: rnd(3, 6)
            });
        }
        
        // Missile impact
        if (m.target && dist(m, m.target) < (m.target.r || 5) + 8) {
            if (m.target.owner !== undefined) {
                m.life = 0;
                burst(m.x, m.y, '#ffb347', 8); // Hit a flare
            } else {
                damage(m.target, m.enemy ? 34 + wave * 2 : 85, 'missile');
                m.life = 0;
                shake = 8;
            }
        }
    });
    missiles = missiles.filter(m => m.life > 0 && m.x > 0 && m.x < WORLD && m.y > 0 && m.y < WORLD);
    
    // Flares
    flares.forEach(f => {
        f.x += f.vx; f.y += f.vy;
        f.vx *= .98; f.vy *= .98;
        f.life--;
        if (f.life <= 0) f.dead = true;
    });
    flares = flares.filter(f => f.life > 0);
}

function updateWorld() {
    bases.forEach(b => {
        if (b.dead) return;
        b.spawn--;
        if (b.spawn <= 0) {
            spawnEnemy(b);
            b.spawn = Math.max(150, 420 - wave * 18) + rnd(0, 150);
        }
    });
    bases = bases.filter(b => !b.dead);
    
    spawnTimer--;
    if (spawnTimer <= 0) {
        spawnEnemy();
        spawnTimer = Math.max(120, 500 - wave * 25) + rnd(0, 180);
    }
    
    crates.forEach(c => {
        c.life--;
        if (dist(c, player) < 38) {
            const s = AIRFRAMES[player.type];
            player.missiles = Math.min(s.missiles, player.missiles + 3);
            player.flares = Math.min(s.flares, player.flares + 4);
            player.hp = Math.min(player.maxHp, player.hp + 45);
            c.life = 0;
            Sound.pickup();
            banner = 'RESUPPLIED';
            bannerTimer = 90;
        }
    });
    crates = crates.filter(c => c.life > 0);
    
    particles.forEach(p => {
        p.px = p.x; p.py = p.y;
        p.x += p.vx; p.y += p.vy;
        p.vx *= .97; p.vy *= .97;
        p.life--;
    });
    particles = particles.filter(p => p.life > 0);
    
    // Missile Warning System
    const inbound = missiles.filter(m => m.enemy && m.target === player);
    if (inbound.length && frame - warningTick > Math.max(14, 45 - Math.min(...inbound.map(m => dist(m, player))) / 25)) {
        Sound.warning();
        warningTick = frame;
    }
    
    // Radar Lock Warning — enemy aircraft pointing at the player
    radarSpike = enemies.some(e => !e.dead && dist(e, player) < 1300 &&
        Math.abs(angleDiff(Math.atan2(player.y - e.y, player.x - e.x), e.angle)) < .12);
    if (radarSpike && frame - radarTick > 50) {
        Sound.broken();
        radarTick = frame;
    }
    
    if (player.hp <= 0) {
        state = 'gameover';
        saveBest();
        Sound.boom(.55);
    }
    
    if (!bases.length && !enemies.length && !waveTimer) {
        score += 300 * wave;
        saveBest();
        waveTimer = 180;
        banner = `WAVE ${wave} CLEAR  +${300 * wave}`;
        bannerTimer = 180;
        Sound.wave();
    }
    
    if (waveTimer > 0 && !--waveTimer) {
        wave++;
        beginWave();
    }
}

function update() {
    if (state !== 'playing' || paused) return;
    
    frame++;
    updatePlayer();
    updateEnemies();
    updateWeapons();
    updateWorld();
    
    bannerTimer = Math.max(0, bannerTimer - 1);
    shake *= .88;
    
    // Camera follow — cam is the top-left corner of the (possibly zoomed-out) viewport
    const vw = W / cam.zoom, vh = H / cam.zoom;
    cam.x += (player.x - vw / 2 - cam.x) * .1;
    cam.y += (player.y - vh / 2 - cam.y) * .1;
    cam.x = clamp(cam.x, 0, Math.max(0, WORLD - vw));
    cam.y = clamp(cam.y, 0, Math.max(0, WORLD - vh));
    
    // Camera zooms out as the player goes faster
    const maxSpeed = AIRFRAMES[player.type].speed;
    const targetZoom = clamp(1.08 - (player.speed / maxSpeed) * .36, .72, 1.08);
    cam.zoom += (targetZoom - cam.zoom) * .04;
    
    // Lock-on Tone
    const lock = acquireTarget(player, false);
    if (lock && !lastLock) Sound.lock();
    if (!lock && lastLock) Sound.broken();
    lastLock = lock;
}

// --- Rendering ---

function visible(o, pad = 100) {
    const vw = W / cam.zoom, vh = H / cam.zoom;
    return o.x > cam.x - pad && o.x < cam.x + vw + pad && o.y > cam.y - pad && o.y < cam.y + vh + pad;
}

function drawTerrain() {
    ctx.fillStyle = '#789451';
    ctx.fillRect(cam.x - 20, cam.y - 20, W / cam.zoom + 40, H / cam.zoom + 40);
    
    // Draw Grid
    const grid = 180;
    ctx.strokeStyle = 'rgba(45,72,38,.16)';
    ctx.lineWidth = 1;
    for (let x = Math.floor(cam.x / grid) * grid; x < cam.x + W / cam.zoom; x += grid) {
        ctx.beginPath(); ctx.moveTo(x, cam.y); ctx.lineTo(x, cam.y + H / cam.zoom); ctx.stroke();
    }
    for (let y = Math.floor(cam.y / grid) * grid; y < cam.y + H / cam.zoom; y += grid) {
        ctx.beginPath(); ctx.moveTo(cam.x, y); ctx.lineTo(cam.x + W / cam.zoom, y); ctx.stroke();
    }
    
    terrain.filter(t => visible(t, 700)).forEach(t => {
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.rot);
        
        if (t.type === 'field') {
            ctx.fillStyle = t.c;
            ctx.globalAlpha = .62;
            ctx.fillRect(-t.w / 2, -t.h / 2, t.w, t.h);
            ctx.globalAlpha = 1;
        } else if (t.type === 'lake') {
            const g = ctx.createRadialGradient(0, 0, 20, 0, 0, t.w / 2);
            g.addColorStop(0, '#38bde0');
            g.addColorStop(1, '#126c9a');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(0, 0, t.w / 2, t.h / 2, 0, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = '#b4d989';
            ctx.lineWidth = 10;
            ctx.stroke();
        } else if (t.type === 'mountain') {
            for (let i = 0; i < 9; i++) {
                const x = ((i * 97) % 101 / 100 - .5) * t.w;
                const y = ((i * 53) % 89 / 88 - .5) * t.h;
                const r = 32 + (i * 17) % 43;
                
                ctx.fillStyle = '#59634c';
                ctx.beginPath();
                ctx.moveTo(x - r, y + r); ctx.lineTo(x, y - r); ctx.lineTo(x + r, y + r);
                ctx.fill();
                
                ctx.fillStyle = '#d8dfd0';
                ctx.beginPath();
                ctx.moveTo(x - r * .32, y - r * .35); ctx.lineTo(x, y - r); ctx.lineTo(x + r * .32, y - r * .35);
                ctx.fill();
            }
        } else {
            ctx.fillStyle = '#7b7467';
            ctx.fillRect(-t.w / 2, -t.h / 2, t.w, t.h);
            
            // Draw city grid
            for (let x = -t.w / 2 + 12; x < t.w / 2; x += 28) {
                for (let y = -t.h / 2 + 12; y < t.h / 2; y += 28) {
                    ctx.fillStyle = (x + y) % 3 ? '#d4b06a' : '#b96955';
                    ctx.fillRect(x, y, t.type === 'city' ? 18 : 13, t.type === 'city' ? 18 : 12);
                }
            }
            ctx.strokeStyle = '#d2c6a7';
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.moveTo(-t.w / 2, 0); ctx.lineTo(t.w / 2, 0);
            ctx.stroke();
        }
        ctx.restore();
    });
}

function jetPath(type) {
    ctx.beginPath();
    if (type === 'f16') {
        // F-16 Fighting Falcon — slender chined fuselage, cropped delta wing, single tail, small stabilators
        ctx.moveTo(31, 0);
        ctx.lineTo(20, -2.2);   // nose chine
        ctx.lineTo(11, -3.4);   // cockpit section
        ctx.lineTo(6, -4.4);    // wing root leading edge
        ctx.lineTo(-7, -16.5);  // ~40° swept leading edge
        ctx.lineTo(-13, -16);   // cropped wingtip
        ctx.lineTo(-8, -5.5);   // forward-swept trailing edge
        ctx.lineTo(-20, -4.2);  // aft fuselage
        ctx.lineTo(-27, -10.5); // stabilator leading edge
        ctx.lineTo(-30.5, -9.5);
        ctx.lineTo(-26, -3);
        ctx.lineTo(-26, 3);
        ctx.lineTo(-30.5, 9.5);
        ctx.lineTo(-27, 10.5);
        ctx.lineTo(-20, 4.2);
        ctx.lineTo(-8, 5.5);
        ctx.lineTo(-13, 16);
        ctx.lineTo(-7, 16.5);
        ctx.lineTo(6, 4.4);
        ctx.lineTo(11, 3.4);
        ctx.lineTo(20, 2.2);
        ctx.closePath();
    } else if (type === 'mig29') {
        // MiG-29 Fulcrum — wide lifting body, LERX blending into wing, big tail surfaces, twin fins
        ctx.moveTo(29, 0);
        ctx.lineTo(18, -3);
        ctx.lineTo(10, -4.2);   // LERX start
        ctx.lineTo(3, -8);      // LERX blending curve
        ctx.lineTo(-7, -19);    // swept leading edge
        ctx.lineTo(-14, -18);   // wingtip
        ctx.lineTo(-9, -7);     // trailing edge
        ctx.lineTo(-22, -6.2);  // nacelle side
        ctx.lineTo(-26, -13.5); // stabilator
        ctx.lineTo(-31, -12.5);
        ctx.lineTo(-26, -4.5);
        ctx.lineTo(-26, 4.5);
        ctx.lineTo(-31, 12.5);
        ctx.lineTo(-26, 13.5);
        ctx.lineTo(-22, 6.2);
        ctx.lineTo(-9, 7);
        ctx.lineTo(-14, 18);
        ctx.lineTo(-7, 19);
        ctx.lineTo(3, 8);
        ctx.lineTo(10, 4.2);
        ctx.lineTo(18, 3);
        ctx.closePath();
    } else {
        // Su-27 Flanker — long needle nose, generous LERX, huge swept wing, wide flat tailplane
        ctx.moveTo(37, 0);
        ctx.lineTo(24, -1.8);
        ctx.lineTo(14, -3);     // LERX begin
        ctx.lineTo(5, -9);      // deep LERX curve
        ctx.lineTo(-9, -23);    // long swept leading edge
        ctx.lineTo(-17, -22);   // wingtip
        ctx.lineTo(-11, -8);    // trailing edge
        ctx.lineTo(-24, -7.5);  // engine nacelle
        ctx.lineTo(-29, -16);   // wide tailplane
        ctx.lineTo(-34, -14.5);
        ctx.lineTo(-29, -5);
        ctx.lineTo(-29, 5);
        ctx.lineTo(-34, 14.5);
        ctx.lineTo(-29, 16);
        ctx.lineTo(-24, 7.5);
        ctx.lineTo(-11, 8);
        ctx.lineTo(-17, 22);
        ctx.lineTo(-9, 23);
        ctx.lineTo(5, 9);
        ctx.lineTo(14, 3);
        ctx.lineTo(24, 1.8);
        ctx.closePath();
    }
}

function drawJet(a, scale = 1) {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.angle);
    ctx.scale(scale, scale);
    
    const enemy = a.enemy;
    const body = enemy ? '#8a9478' : AIRFRAMES[a.type].color;
    const dark = enemy ? '#5f6a4e' : 'rgba(0,0,0,.3)';
    const trim = enemy ? '#efe8d4' : '#dff7ff';
    
    ctx.shadowColor = 'rgba(0,0,0,.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 7;
    jetPath(a.type);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    
    // Shaded underside + spine highlight (clip to silhouette)
    ctx.save();
    jetPath(a.type);
    ctx.clip();
    ctx.fillStyle = dark;
    ctx.fillRect(-40, 1.5, 80, 40);
    ctx.fillStyle = enemy ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.3)';
    ctx.fillRect(-30, -1.7, 56, 3.4);
    ctx.restore();
    
    ctx.strokeStyle = trim;
    ctx.lineWidth = 1.4;
    jetPath(a.type);
    ctx.stroke();
    
    // Bubble canopy
    const cg = ctx.createLinearGradient(4, -4, 15, 4);
    cg.addColorStop(0, '#c4ecff');
    cg.addColorStop(1, '#1d4d68');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(11, 0, 7.5, 3.2, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(8,24,34,.85)';
    ctx.lineWidth = .8;
    ctx.stroke();
    
    // Vertical tail fins — twin for MiG-29 / Su-27, single canted for F-16
    ctx.fillStyle = dark;
    if (a.type === 'f16') {
        ctx.beginPath(); ctx.moveTo(-11, -2); ctx.lineTo(-21, -12); ctx.lineTo(-25, -11); ctx.lineTo(-18, -1); ctx.closePath(); ctx.fill();
    } else {
        ctx.beginPath(); ctx.moveTo(-13, -4); ctx.lineTo(-23, -13); ctx.lineTo(-26, -12); ctx.lineTo(-20, -3); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-13, 4); ctx.lineTo(-23, 13); ctx.lineTo(-26, 12); ctx.lineTo(-20, 3); ctx.closePath(); ctx.fill();
    }
    
    // Engine intakes
    ctx.fillStyle = 'rgba(0,0,0,.42)';
    ctx.fillRect(2, -6.5, 5, 2.4);
    ctx.fillRect(2, 4.1, 5, 2.4);
    
    // Under-wing pylons with AAMs
    const py = a.type === 'su27' ? 15.5 : a.type === 'mig29' ? 12.5 : 10.5;
    const pl = a.type === 'su27' ? 11 : 9;
    ctx.fillStyle = '#46525a';
    ctx.fillRect(-9, -py - 1.4, pl, 1.4);
    ctx.fillRect(-9, py, pl, 1.4);
    ctx.fillStyle = '#e6edf0';
    ctx.fillRect(-10, -py - 3, pl - 1, 1.4);
    ctx.fillRect(-10, py + 1.6, pl - 1, 1.4);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(-10 + pl - 3, -py - 3, 2, 1.4);
    ctx.fillRect(-10 + pl - 3, py + 1.6, 2, 1.4);
    
    // Engine nozzle(s)
    const nx = a.type === 'su27' ? -28 : -25;
    ctx.fillStyle = '#1b2226';
    ctx.fillRect(nx, -3.6, 5, 7.2);
    ctx.fillStyle = '#39434a';
    ctx.fillRect(nx + 3.4, -2.6, 1.6, 5.2);
    
    // Wing panel lines
    ctx.strokeStyle = 'rgba(0,0,0,.28)';
    ctx.lineWidth = .8;
    ctx.beginPath();
    ctx.moveTo(-4, -6); ctx.lineTo(-10, -py - 1);
    ctx.moveTo(-4, 6); ctx.lineTo(-10, py + 1);
    ctx.moveTo(-14, -3.6); ctx.lineTo(-20, -3.6);
    ctx.moveTo(-14, 3.6); ctx.lineTo(-20, 3.6);
    ctx.stroke();
    
    // Enemy roundel markings
    if (enemy) {
        ctx.fillStyle = '#d63a2f';
        ctx.strokeStyle = '#f5efdc';
        ctx.lineWidth = .9;
        [[-7, -11], [-7, 11]].forEach(([x, y]) => {
            ctx.beginPath(); ctx.arc(x, y, 3.2, 0, TAU); ctx.fill(); ctx.stroke();
        });
    }
    
    // Afterburner
    if (a.throttle > .92 || enemy) {
        const fl = 12 + Math.sin(frame * .8) * 3;
        ctx.fillStyle = '#67e8f9';
        ctx.shadowColor = '#ff6b21';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(-22, -4); ctx.lineTo(-35 - fl, 0); ctx.lineTo(-22, 4);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(-22, -2); ctx.lineTo(-30 - fl * .5, 0); ctx.lineTo(-22, 2);
        ctx.fill();
    }
    ctx.restore();
    
    if (a.hp < a.maxHp * .45 && frame % 2 === 0) {
        particles.push({ 
            x: a.x - Math.cos(a.angle) * 18, y: a.y - Math.sin(a.angle) * 18, 
            px: a.x, py: a.y, vx: rnd(-.3, .3), vy: rnd(-.3, .3), 
            life: 60, max: 60, color: '#30363a', size: rnd(4, 8) 
        });
    }
}

function drawBase(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    ctx.fillStyle = '#40484b';
    ctx.fillRect(-95, -16, 190, 32);
    ctx.fillStyle = '#d9d5c4';
    for (let i = -80; i < 90; i += 28) ctx.fillRect(i, -1, 14, 2);
    ctx.fillStyle = '#53606a';
    ctx.fillRect(-65, 28, 55, 35);
    ctx.fillRect(15, 27, 62, 38);
    ctx.fillStyle = '#222b31';
    ctx.fillRect(-55, 36, 35, 27);
    ctx.fillRect(25, 35, 42, 30);
    ctx.restore();
    drawBar(b.x - 45, b.y - 65, 90, 7, b.hp / b.maxHp, '#ef4444');
}

function drawFriendlyAirfield() {
    ctx.save();
    ctx.translate(friendlyAirfield.x, friendlyAirfield.y);
    ctx.rotate(friendlyAirfield.angle);
    ctx.fillStyle = '#59666a';
    ctx.fillRect(-180, -28, 360, 56);
    
    ctx.strokeStyle = '#f1f5d8';
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 16]);
    ctx.beginPath(); ctx.moveTo(-165, 0); ctx.lineTo(165, 0); ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(-130, 50, 90, 55);
    ctx.fillRect(10, 50, 95, 55);
    
    ctx.fillStyle = '#dbeafe';
    ctx.font = '800 18px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText('FRIENDLY AIRFIELD', 0, 130);
    ctx.restore();
}

function drawBar(x, y, w, h, p, color) {
    ctx.fillStyle = 'rgba(2,8,12,.72)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * clamp(p, 0, 1), h);
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.strokeRect(x, y, w, h);
}

function drawObjects() {
    if (visible(friendlyAirfield, 220)) drawFriendlyAirfield();
    
    bases.filter(visible).forEach(drawBase);
    
    crates.filter(visible).forEach(c => {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(frame * .025);
        ctx.shadowColor = '#67e8f9';
        ctx.shadowBlur = 18;
        ctx.fillStyle = '#0e7490';
        ctx.fillRect(-13, -13, 26, 26);
        ctx.fillStyle = '#fff';
        ctx.fillRect(-8, -2, 16, 4);
        ctx.fillRect(-2, -8, 4, 16);
        ctx.restore();
    });
    
    bullets.filter(visible).forEach(b => {
        ctx.strokeStyle = b.enemy ? '#ff554c' : '#fff2a1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * 1.6, b.y - b.vy * 1.6);
        ctx.stroke();
    });
    
    missiles.filter(visible).forEach(m => {
        ctx.strokeStyle = '#e6eeee';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(m.px, m.py);
        ctx.lineTo(m.x, m.y);
        ctx.stroke();
    });
    
    flares.filter(visible).forEach(f => {
        ctx.globalAlpha = f.life / 110;
        ctx.fillStyle = '#fff7bd';
        ctx.shadowColor = '#ff5b18';
        ctx.shadowBlur = 25;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 6, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    });
    
    particles.filter(visible).forEach(p => {
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
        ctx.strokeStyle = p.color;
        ctx.fillStyle = p.color;
        ctx.lineWidth = p.size || 2;
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
    });
    
    enemies.filter(visible).forEach(e => {
        drawJet(e);
        drawBar(e.x - 20, e.y - 34, 40, 4, e.hp / e.maxHp, '#ef4444');
    });
    
    drawJet(player);
}

function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(3,14,21,.74)';
    ctx.strokeStyle = 'rgba(180,235,245,.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
}

function drawHUD() {
    ctx.textBaseline = 'middle';
    const s = AIRFRAMES[player.type];
    
    // Top Left Player Stats
    panel(16, 62, 250, 105);
    ctx.fillStyle = '#e8f8fb';
    ctx.font = '800 14px Outfit';
    ctx.textAlign = 'left';
    ctx.fillText(AIRFRAMES[player.type].name, 28, 79);
    ctx.font = '600 12px Outfit';
    ctx.fillText('HULL', 28, 102);
    
    const hp = player.hp / player.maxHp;
    const hue = hp * 120;
    drawBar(72, 97, 175, 11, hp, `hsl(${hue} 85% 48%)`);
    ctx.fillText(`THROTTLE ${Math.round(player.throttle * 100)}%`, 28, 127);
    ctx.fillText(`SPEED ${Math.round(player.speed * 115)} KTS`, 28, 148);
    
    // Bottom Left Ordnance
    panel(16, H - 86, 270, 66);
    ctx.fillStyle = '#fff';
    ctx.font = '600 13px Outfit';
    ctx.fillText(`MISSILES  ${'◆ '.repeat(player.missiles)}`, 28, H - 64);
    ctx.fillText(`FLARES  ${player.flares}/${s.flares}  (REGEN)`, 28, H - 39);
    
    // Top Center Score
    ctx.textAlign = 'center';
    ctx.font = '800 16px Outfit';
    ctx.fillText(`SCORE ${score}   BEST ${highScore}`, W / 2, 24);
    ctx.font = '600 14px Outfit';
    ctx.fillText(`WAVE ${wave}   ENEMIES ${enemies.length}   BASES ${bases.length}`, W / 2, 47);
    
    drawMinimap();
    
    // Target Lock UI
    const lock = lastLock;
    if (lock) {
        const sx = lock.x - cam.x;
        const sy = lock.y - cam.y;
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx - 25, sy - 25, 50, 50);
        ctx.fillStyle = '#facc15';
        ctx.font = '800 13px Outfit';
        ctx.fillText('LOCK', sx, sy - 36);
    }
    
    // Incoming Missile UI
    const inbound = missiles.filter(m => m.enemy && m.target === player);
    if (inbound.length) {
        ctx.fillStyle = frame % 24 < 12 ? '#ff302e' : '#fff';
        ctx.font = '800 22px Outfit';
        ctx.fillText('⚠ MISSILE INBOUND ⚠', W / 2, 82);
        
        const m = inbound.sort((a, b) => dist(a, player) - dist(b, player))[0];
        const a = Math.atan2(m.y - player.y, m.x - player.x);
        
        ctx.save();
        ctx.translate(W / 2 + Math.cos(a) * Math.min(W, H) * .35, H / 2 + Math.sin(a) * Math.min(W, H) * .35);
        ctx.rotate(a);
        ctx.fillStyle = '#ff302e';
        ctx.beginPath();
        ctx.moveTo(18, 0); ctx.lineTo(-10, -10); ctx.lineTo(-10, 10);
        ctx.fill();
        ctx.restore();
    } else if (radarSpike) {
        // Radar Lock Warning — enemy nose-on to the player
        ctx.fillStyle = frame % 20 < 10 ? '#ffa02e' : '#fff';
        ctx.font = '800 18px Outfit';
        ctx.fillText('⚠ RADAR LOCK — ENEMY ON YOUR SIX ⚠', W / 2, 82);
    }
    
    // Center Banner Announcements
    if (bannerTimer) {
        ctx.globalAlpha = Math.min(1, bannerTimer / 30);
        panel(W / 2 - 240, H * .2 - 32, 480, 64);
        ctx.fillStyle = '#fff';
        ctx.font = '800 25px Outfit';
        ctx.fillText(banner, W / 2, H * .2);
        ctx.globalAlpha = 1;
    }
    
    if (touchDevice) drawTouch();
}

function drawMinimap() {
    const mw = 180, mh = 150;
    const x = W - mw - 18, y = 62;
    
    panel(x, y, mw, mh);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 5, y + 5, mw - 10, mh - 10);
    ctx.clip();
    
    ctx.fillStyle = '#8aad69';
    ctx.fillRect(x + 5, y + 5, mw - 10, mh - 10);
    
    const px = v => x + 5 + v / WORLD * (mw - 10);
    const py = v => y + 5 + v / WORLD * (mh - 10);
    
    bases.forEach(b => {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(px(b.x) - 3, py(b.y) - 3, 6, 6);
    });
    enemies.forEach(e => {
        ctx.fillStyle = '#ff9b86';
        ctx.fillRect(px(e.x) - 1, py(e.y) - 1, 3, 3);
    });
    
    ctx.fillStyle = '#67e8f9';
    ctx.beginPath();
    ctx.arc(px(player.x), py(player.y), 4, 0, TAU);
    ctx.fill();
    ctx.restore();
    
    ctx.fillStyle = '#fff';
    ctx.font = '800 10px Outfit';
    ctx.textAlign = 'left';
    ctx.fillText('TACTICAL MAP', x + 10, y + 15);
}

function drawTouch() {
    const sy = H - 125, sx = 95;
    
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy, 48, 0, TAU); ctx.stroke();
    
    ctx.fillStyle = 'rgba(103,232,249,.3)';
    ctx.beginPath(); ctx.arc(sx + clamp(touch.dx, -35, 35), sy + clamp(touch.dy, -35, 35), 18, 0, TAU); ctx.fill();
    
    [['GUN', W - 80, H - 90, 40], ['MSL', W - 170, H - 145, 34], ['FLR', W - 180, H - 62, 30]].forEach(b => {
        ctx.strokeStyle = 'rgba(255,255,255,.5)';
        ctx.beginPath(); ctx.arc(b[1], b[2], b[3], 0, TAU); ctx.stroke();
        
        ctx.fillStyle = 'rgba(239,68,68,.25)';
        ctx.fill();
        
        ctx.fillStyle = '#fff';
        ctx.font = '800 12px Outfit';
        ctx.textAlign = 'center';
        ctx.fillText(b[0], b[1], b[2]);
    });
}

function drawSelect() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#071e2c');
    g.addColorStop(1, '#103b48');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = '800 42px Outfit';
    ctx.fillText('JET FIGHTER', W / 2, 85);
    ctx.font = '600 16px Outfit';
    ctx.fillStyle = '#9bd5e1';
    ctx.fillText(`SELECT AIRFRAME  •  BEST ${highScore}`, W / 2, 122);
    
    const cardW = Math.min(260, (W - 60) / 3 - 15);
    const gap = 16;
    const total = cardW * 3 + gap * 2;
    const start = (W - total) / 2;
    
    Object.entries(AIRFRAMES).forEach(([k, s], i) => {
        const x = start + i * (cardW + gap);
        const y = 170, h = 330;
        
        panel(x, y, cardW, h);
        if (k === selected) {
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, cardW, h);
        }
        
        ctx.save();
        ctx.translate(x + cardW / 2, y + 90);
        ctx.rotate(-Math.PI / 2);
        ctx.scale(2.2, 2.2);
        jetPath(k);
        ctx.fillStyle = s.color;
        ctx.fill();
        ctx.restore();
        
        ctx.fillStyle = '#fff';
        ctx.font = '800 20px Outfit';
        ctx.fillText(`${i + 1}  ${s.name}`, x + cardW / 2, y + 175);
        ctx.font = '600 13px Outfit';
        ctx.fillStyle = '#c5dce3';
        ctx.fillText(`SPEED  ${Math.round(s.speed * 115)}`, x + cardW / 2, y + 215);
        ctx.fillText(`AGILITY  ${Math.round(s.turn * 1600)}`, x + cardW / 2, y + 242);
        ctx.fillText(`HULL  ${s.hp}`, x + cardW / 2, y + 269);
        ctx.fillText(`${s.missiles} MISSILES  •  ${s.flares} FLARES`, x + cardW / 2, y + 298);
    });
    
    ctx.fillStyle = '#fff';
    ctx.font = '800 17px Outfit';
    ctx.fillText('PRESS SPACE / ENTER OR TAP SELECTED JET TO DEPLOY', W / 2, 550);
    ctx.font = '600 13px Outfit';
    ctx.fillStyle = '#91b9c3';
    ctx.fillText('WASD / ARROWS fly  •  SPACE cannon  •  E missile  •  Q flare  •  P pause', W / 2, 585);
}

function drawGameOver() {
    ctx.fillStyle = 'rgba(2,8,12,.8)';
    ctx.fillRect(0, 0, W, H);
    panel(W / 2 - 220, H / 2 - 170, 440, 340);
    
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff665d';
    ctx.font = '800 36px Outfit';
    ctx.fillText('AIRCRAFT LOST', W / 2, H / 2 - 110);
    
    ctx.fillStyle = '#fff';
    ctx.font = '800 22px Outfit';
    ctx.fillText(`SCORE  ${score}`, W / 2, H / 2 - 50);
    ctx.font = '600 17px Outfit';
    ctx.fillText(`WAVE REACHED  ${wave}`, W / 2, H / 2);
    ctx.fillText(`KILLS  ${kills}`, W / 2, H / 2 + 35);
    ctx.fillText(`BEST  ${highScore}`, W / 2, H / 2 + 70);
    
    ctx.fillStyle = '#67e8f9';
    ctx.font = '800 15px Outfit';
    ctx.fillText('SPACE / TAP TO RETURN TO AIRCRAFT SELECT', W / 2, H / 2 + 125);
}

function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    
    if (state === 'select') {
        drawSelect();
        return;
    }
    
    ctx.save();
    if (shake) ctx.translate(rnd(-shake, shake), rnd(-shake, shake));
    ctx.translate(W / 2, H / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x - W / (2 * cam.zoom), -cam.y - H / (2 * cam.zoom));
    
    drawTerrain();
    drawObjects();
    ctx.restore();
    drawHUD();
    
    if (state === 'gameover') drawGameOver();
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}
loop();

// --- Input & Lifecycle ---

function setPaused(v) {
    if (state !== 'playing' && v) return;
    paused = v;
    document.getElementById('pauseOverlay')?.classList.toggle('show', v);
    document.getElementById('pauseBtn')?.classList.toggle('active', v);
}

function choose(n) {
    selected = ['f16', 'mig29', 'su27'][n] || selected;
}

addEventListener('keydown', e => {
    initAudio();
    keys[e.key] = true;
    keys[e.key.toLowerCase()] = true;
    
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    
    if (state === 'select') {
        if (e.key === '1' || e.key === '2' || e.key === '3') choose(+e.key - 1);
        if (e.key === ' ' || e.key === 'Enter') startGame();
        return;
    }
    
    if (state === 'gameover' && (e.key === ' ' || e.key === 'Enter')) {
        state = 'select';
        return;
    }
    
    if (e.key.toLowerCase() === 'p' || e.key === 'Escape') setPaused(!paused);
    if (state !== 'playing' || paused) return;
    
    if (e.key.toLowerCase() === 'e') launch(player, lastLock);
    if (e.key.toLowerCase() === 'q') deployFlares(player);
});

addEventListener('keyup', e => {
    keys[e.key] = false;
    keys[e.key.toLowerCase()] = false;
});

function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}

canvas.addEventListener('pointerdown', e => {
    initAudio();
    const p = pointerPos(e);
    
    if (state === 'gameover') {
        state = 'select';
        return;
    }
    
    if (state === 'select') {
        const cw = Math.min(260, (W - 60) / 3 - 15);
        const gap = 16;
        const start = (W - (cw * 3 + gap * 2)) / 2;
        
        for (let i = 0; i < 3; i++) {
            if (p.x > start + i * (cw + gap) && p.x < start + i * (cw + gap) + cw && p.y > 170 && p.y < 500) {
                choose(i);
                startGame();
                return;
            }
        }
        return;
    }
    
    if (paused || !touchDevice) return;
    canvas.setPointerCapture(e.pointerId);
    
    if (p.x < 180 && p.y > H - 210) {
        touch.stick = { id: e.pointerId, x: p.x, y: p.y };
        touch.dx = p.x - 95;
        touch.dy = p.y - (H - 125);
    } else if (Math.hypot(p.x - (W - 80), p.y - (H - 90)) < 55) {
        touch.cannon = true;
    } else if (Math.hypot(p.x - (W - 170), p.y - (H - 145)) < 48) {
        launch(player, lastLock);
    } else if (Math.hypot(p.x - (W - 180), p.y - (H - 62)) < 45) {
        deployFlares(player);
    }
});

canvas.addEventListener('pointermove', e => {
    if (touch.stick && touch.stick.id === e.pointerId) {
        const p = pointerPos(e);
        touch.dx = p.x - 95;
        touch.dy = p.y - (H - 125);
    }
});

function pointerUp(e) {
    if (touch.stick && touch.stick.id === e.pointerId) {
        touch.stick = null;
        touch.dx = touch.dy = 0;
    }
    touch.cannon = false;
}

canvas.addEventListener('pointerup', pointerUp);
canvas.addEventListener('pointercancel', pointerUp);

document.getElementById('pauseBtn')?.addEventListener('click', () => setPaused(!paused));
document.getElementById('resumeBtn')?.addEventListener('click', () => setPaused(false));
document.getElementById('restartBtn')?.addEventListener('click', () => { setPaused(false); state = 'select'; });

document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing' && !paused) setPaused(true); });
addEventListener('blur', () => { if (state === 'playing' && !paused) setPaused(true); });