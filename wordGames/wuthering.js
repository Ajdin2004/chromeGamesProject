// --- Web Audio Synthesizer ---
let audioCtx = null;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

const Sound = {
    guess() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(160, audioCtx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.08);
    },
    win() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.setValueAtTime(659, now + 0.1);
        osc.frequency.setValueAtTime(783, now + 0.2);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.35);
    }
};

function debounce(fn, wait = 150) {
    let t;
    return function(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

// Local bundled resonators dataset
const RESONATORS_URL = './data/wuwa_resonators.json';

let RESONATORS = [];
let TARGET_RESONATOR = null;
const TODAY_DATE_STR = new Date().toISOString().slice(0, 10);
const MAX_GUESSES = 8;
let guessesHistory = [];
let gameOver = false;
let currentMatches = [];
let suggestionActiveIndex = -1;

// DOM Elements
const inputEl = document.getElementById('resonator-input');
const inputWrapper = document.getElementById('input-wrapper');
const btnGuess = document.getElementById('btn-guess');
const suggestionsEl = document.getElementById('suggestions');
const guessesContainer = document.getElementById('guesses-container');
const toastEl = document.getElementById('toast');
const hintBox = document.getElementById('hint-box');
const btnMusic = document.getElementById('btn-music');
const bgMusic = document.getElementById('bg-music');

// Celebration modal elements
let celebrationModal = null;
let winAvatar = null;
let winName = null;
let winElement = null;
let winWeapon = null;
let winRarity = null;
let winRole = null;
let winFaction = null;
let winGender = null;
let btnCloseWin = null;
let confettiAnimId = null;

// Configure audio element safely
if (bgMusic) {
    try { bgMusic.crossOrigin = 'anonymous'; } catch (e) { /* ignore */ }
    bgMusic.volume = 0.10; // 10% low volume

    bgMusic.addEventListener('error', (ev) => {
        console.error('Background music failed to load or play', ev, bgMusic.error);
        if (toastEl) toastEl.textContent = 'Background music failed to load.';
    });

    bgMusic.addEventListener('canplaythrough', () => {
        console.info('Background music ready');
    });

    bgMusic.addEventListener('stalled', () => {
        console.warn('Background music stalled while fetching data');
    });
}

function playBackgroundMusic() {
    initAudio(); // Resumes Web Audio Context if suspended

    bgMusic.play().then(() => {
        btnMusic.classList.add('playing');
        btnMusic.innerHTML = '<i class="fa-solid fa-volume-high"></i> Music';
        toastEl.textContent = "Guess today's mystery resonator!";
    }).catch(err => {
        console.warn("Autoplay prevented:", err);
        toastEl.textContent = "Click anywhere on the page to enable audio.";

        const unlockAudio = () => {
            bgMusic.play().then(() => {
                btnMusic.classList.add('playing');
                btnMusic.innerHTML = '<i class="fa-solid fa-volume-high"></i> Music';
                toastEl.textContent = "Guess today's mystery resonator!";
            });
            document.removeEventListener('click', unlockAudio);
            document.removeEventListener('keydown', unlockAudio);
        };

        document.addEventListener('click', unlockAudio, { once: true });
        document.addEventListener('keydown', unlockAudio, { once: true });
    });
}

btnMusic.addEventListener('click', () => {
    if (bgMusic.paused) {
        playBackgroundMusic();
    } else {
        bgMusic.pause();
        btnMusic.classList.remove('playing');
        btnMusic.innerHTML = '<i class="fa-solid fa-music"></i> Music';
    }
});

// Normalize resonator names for robust matching
function normalizeName(name) {
    if (!name) return '';
    return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function fetchResonatorsData() {
    try {
        const res = await fetch(RESONATORS_URL);
        const data = await res.json();

        RESONATORS = Object.keys(data).map(key => {
            const r = data[key];
            return {
                id: key,
                name: r.name || key,
                image: r.image || '',
                element: r.element || 'Unknown',
                weapon: r.weapon || 'Unknown',
                rarity: r.rarity || 'Unknown',
                role: r.role || 'Unknown',
                faction: r.faction || 'Unknown',
                gender: r.gender || 'Unknown',
                releaseVersion: r.releaseVersion || 'Unknown'
            };
        }).sort((a, b) => a.name.localeCompare(b.name));

        // Guard: ensure we loaded resonators
        if (!RESONATORS || RESONATORS.length === 0) {
            throw new Error('No resonators loaded from ' + RESONATORS_URL + '. Ensure the file exists at this path and that the page is served over HTTP/S (fetch() will not work from file://).');
        }

        // Seed today's resonator deterministically by date so everyone gets same daily target
        const now = new Date();
        const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
        TARGET_RESONATOR = RESONATORS[seed % RESONATORS.length];

        inputEl.placeholder = "Enter resonator name...";
        toastEl.textContent = "Guess today's mystery resonator!";
        restoreProgress();
    } catch (err) {
        console.error('Failed to load resonators from:', RESONATORS_URL, err);
        if (err && err.message) console.error('Error message:', err.message);
        toastEl.textContent = "Error loading resonator data. Check console for details.\nMake sure the file '" + RESONATORS_URL + "' is present and the page is served over HTTP (not file://).";
        inputEl.disabled = true;
        btnGuess.disabled = true;
    }
}

function compareAttribute(val1, val2) {
    if (val1 === val2) return 'correct';
    const list1 = String(val1).split(/\s*,\s*/).map(s => s.trim().toLowerCase());
    const list2 = String(val2).split(/\s*,\s*/).map(s => s.trim().toLowerCase());
    if (list1.some(v => list2.includes(v))) return 'partial';
    return 'wrong';
}

function handleAutocomplete() {
    const val = inputEl.value.toLowerCase().trim();
    suggestionsEl.innerHTML = '';

    if (!val || RESONATORS.length === 0) {
        currentMatches = [];
        suggestionsEl.style.display = 'none';
        return;
    }

    currentMatches = RESONATORS.filter(r =>
        r.name.toLowerCase().startsWith(val) || r.name.toLowerCase().includes(val)
    ).slice(0, 8);

    if (currentMatches.length > 0) {
        suggestionsEl.style.display = 'block';
        currentMatches.forEach((r, idx) => {
            const div = document.createElement('div');
            div.className = `suggestion-item ${idx === 0 ? 'active' : ''}`;
            div.setAttribute('role', 'option');
            div.dataset.index = idx;

            const info = document.createElement('div');
            info.className = 'suggestion-info';

            const img = document.createElement('img');
            img.src = r.image;
            img.alt = r.name;

            const nameSpan = document.createElement('span');
            nameSpan.textContent = r.name;

            info.appendChild(img);
            info.appendChild(nameSpan);
            div.appendChild(info);

            if (idx === 0) {
                const tabHint = document.createElement('span');
                tabHint.className = 'tab-hint';
                tabHint.textContent = 'Tab ↹';
                div.appendChild(tabHint);
                suggestionActiveIndex = 0;
            }

            div.addEventListener('click', () => {
                suggestionActiveIndex = idx;
                selectResonator(r.name);
            });

            suggestionsEl.appendChild(div);
        });
    } else {
        suggestionsEl.style.display = 'none';
        suggestionActiveIndex = -1;
    }
}

function updateActiveSuggestion() {
    const items = suggestionsEl.querySelectorAll('.suggestion-item');
    items.forEach(item => item.classList.remove('active'));
    if (suggestionActiveIndex >= 0 && items[suggestionActiveIndex]) {
        items[suggestionActiveIndex].classList.add('active');
        items[suggestionActiveIndex].scrollIntoView({ block: 'nearest' });
    }
}

function selectResonator(name) {
    inputEl.value = name;
    suggestionsEl.style.display = 'none';
    inputEl.focus();
}

function triggerShake() {
    inputWrapper.classList.remove('shake');
    void inputWrapper.offsetWidth;
    inputWrapper.classList.add('shake');
}

inputEl.addEventListener('keydown', e => {
    const isSuggestionsVisible = suggestionsEl.style.display === 'block' && currentMatches.length > 0;
    if (e.key === 'Tab' && isSuggestionsVisible) {
        e.preventDefault();
        const idx = suggestionActiveIndex >= 0 ? suggestionActiveIndex : 0;
        selectResonator(currentMatches[idx].name);
    } else if (e.key === 'ArrowDown' && isSuggestionsVisible) {
        e.preventDefault();
        suggestionActiveIndex = (suggestionActiveIndex + 1) % currentMatches.length;
        updateActiveSuggestion();
    } else if (e.key === 'ArrowUp' && isSuggestionsVisible) {
        e.preventDefault();
        suggestionActiveIndex = (suggestionActiveIndex - 1 + currentMatches.length) % currentMatches.length;
        updateActiveSuggestion();
    } else if (e.key === 'Enter') {
        if (isSuggestionsVisible && suggestionActiveIndex >= 0) {
            e.preventDefault();
            selectResonator(currentMatches[suggestionActiveIndex].name);
        } else {
            submitGuess();
        }
    }
});

function submitGuess() {
    if (gameOver || !TARGET_RESONATOR) return;
    initAudio();

    const val = inputEl.value.trim();
    if (!val) {
        toastEl.textContent = 'Please enter a resonator name.';
        triggerShake();
        return;
    }

    // Try exact normalized match first
    let guessedResonator = RESONATORS.find(r => normalizeName(r.name) === normalizeName(val));

    // Fallback: case-insensitive exact name
    if (!guessedResonator) guessedResonator = RESONATORS.find(r => r.name.toLowerCase() === val.toLowerCase());

    // Fallback: startsWith or includes
    if (!guessedResonator) guessedResonator = RESONATORS.find(r => r.name.toLowerCase().startsWith(val.toLowerCase()) || r.name.toLowerCase().includes(val.toLowerCase()));

    // Fallback: if suggestions are open, use the active suggestion
    if (!guessedResonator && currentMatches.length > 0) {
        const idx = suggestionActiveIndex >= 0 ? suggestionActiveIndex : 0;
        guessedResonator = currentMatches[idx];
    }

    if (!guessedResonator) {
        toastEl.textContent = "Resonator not found!";
        triggerShake();
        return;
    }

    if (guessesHistory.includes(guessedResonator.name)) {
        toastEl.textContent = "Already Guessed!";
        triggerShake();
        return;
    }

    guessesHistory.push(guessedResonator.name);
    renderRowUI(guessedResonator, true);
    Sound.guess();

    inputEl.value = '';
    suggestionsEl.style.display = 'none';

    checkHintState();

    const isCorrect = guessedResonator.name === TARGET_RESONATOR.name;

    if (isCorrect) {
        gameOver = true;
        Sound.win();
        toastEl.textContent = `Splendid! Wutherdle Solved!`;
        inputEl.disabled = true;
        btnGuess.disabled = true;

        try {
            triggerVictoryModal(TARGET_RESONATOR);
        } catch (e) {
            console.warn('Unable to trigger victory modal:', e);
        }

        saveProgress(true);
    } else if (guessesHistory.length >= MAX_GUESSES) {
        gameOver = true;
        toastEl.textContent = `Game Over! Resonator was: ${TARGET_RESONATOR.name}`;
        inputEl.disabled = true;
        btnGuess.disabled = true;
        saveProgress(false);
    } else {
        toastEl.textContent = `Guess recorded!`;
        saveProgress(false);
    }
}

function checkHintState() {
    if (guessesHistory.length >= 4 && !gameOver) {
        const firstLetter = TARGET_RESONATOR.name.charAt(0);
        hintBox.style.display = 'block';
        hintBox.innerHTML = `<i class="fa-solid fa-lightbulb"></i> <strong>Hint Unlocked:</strong> Released in version <strong>${TARGET_RESONATOR.releaseVersion}</strong> and starts with the letter '<strong>${firstLetter}</strong>'!`;
    }
}

function renderRowUI(resonator, shouldAnimate = false) {
    const row = document.createElement('div');
    row.className = 'guess-row';

    const fields = [
        { key: 'element', val: resonator.element, label: 'Element' },
        { key: 'weapon', val: resonator.weapon, label: 'Weapon' },
        { key: 'rarity', val: resonator.rarity, label: 'Rarity' },
        { key: 'role', val: resonator.role, label: 'Role' },
        { key: 'faction', val: resonator.faction, label: 'Faction' },
        { key: 'gender', val: resonator.gender, label: 'Gender' }
    ];

    const resonatorCard = document.createElement('div');
    resonatorCard.className = 'attribute-box resonator-card';
    if (shouldAnimate) resonatorCard.classList.add('animate-flip');

    const avatar = document.createElement('img');
    avatar.src = resonator.image;
    avatar.className = 'resonator-avatar';
    avatar.alt = resonator.name;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = resonator.name;

    resonatorCard.appendChild(avatar);
    resonatorCard.appendChild(nameSpan);
    row.appendChild(resonatorCard);

    fields.forEach((f, idx) => {
        const status = compareAttribute(f.val, TARGET_RESONATOR[f.key]);
        const box = document.createElement('div');
        box.className = 'attribute-box ' + status;
        box.setAttribute('data-label', f.label || f.key);
        if (shouldAnimate) {
            box.classList.add('animate-flip');
            box.style.animationDelay = `${(idx + 1) * 0.1}s`;
        }
        box.textContent = f.val;
        row.appendChild(box);
    });

    guessesContainer.insertBefore(row, guessesContainer.firstChild);
}

// Create a lightweight celebration modal and confetti canvas if the HTML doesn't already provide them.
function createCelebrationModalIfMissing() {
    if (celebrationModal) return;

    celebrationModal = document.createElement('div');
    celebrationModal.id = 'celebration-modal';
    celebrationModal.style.position = 'fixed';
    celebrationModal.style.top = '0';
    celebrationModal.style.left = '0';
    celebrationModal.style.width = '100%';
    celebrationModal.style.height = '100%';
    celebrationModal.style.display = 'none';
    celebrationModal.style.alignItems = 'center';
    celebrationModal.style.justifyContent = 'center';
    celebrationModal.style.background = 'rgba(0,0,0,0.6)';
    celebrationModal.style.zIndex = '9999';
    celebrationModal.style.flexDirection = 'column';
    celebrationModal.style.padding = '20px';

    const content = document.createElement('div');
    content.style.background = '#0b1220';
    content.style.border = '2px solid rgba(255,255,255,0.06)';
    content.style.borderRadius = '12px';
    content.style.padding = '18px';
    content.style.minWidth = '260px';
    content.style.maxWidth = '90%';
    content.style.color = '#fff';
    content.style.textAlign = 'center';
    content.style.position = 'relative';
    content.style.boxShadow = '0 8px 30px rgba(0,0,0,0.6)';

    winAvatar = document.createElement('img');
    winAvatar.alt = 'Resonator avatar';
    winAvatar.style.width = '96px';
    winAvatar.style.height = '96px';
    winAvatar.style.objectFit = 'cover';
    winAvatar.style.borderRadius = '8px';
    winAvatar.style.display = 'block';
    winAvatar.style.margin = '0 auto 12px';

    winName = document.createElement('h2');
    winName.style.margin = '6px 0 12px';
    winName.style.fontSize = '1.4rem';

    const details = document.createElement('div');
    details.style.display = 'flex';
    details.style.flexWrap = 'wrap';
    details.style.justifyContent = 'center';
    details.style.gap = '8px';

    function makeDetailSpan(label) {
        const sp = document.createElement('div');
        sp.style.fontSize = '0.90rem';
        sp.style.padding = '6px 8px';
        sp.style.background = 'rgba(255,255,255,0.03)';
        sp.style.borderRadius = '6px';
        sp.style.minWidth = '90px';
        sp.style.boxSizing = 'border-box';
        sp.dataset.label = label;
        return sp;
    }

    winElement = makeDetailSpan('Element');
    winWeapon = makeDetailSpan('Weapon');
    winRarity = makeDetailSpan('Rarity');
    winRole = makeDetailSpan('Role');
    winFaction = makeDetailSpan('Faction');
    winGender = makeDetailSpan('Gender');

    details.appendChild(winElement);
    details.appendChild(winWeapon);
    details.appendChild(winRarity);
    details.appendChild(winRole);
    details.appendChild(winFaction);
    details.appendChild(winGender);

    btnCloseWin = document.createElement('button');
    btnCloseWin.textContent = 'Close';
    btnCloseWin.style.marginTop = '14px';
    btnCloseWin.style.padding = '8px 12px';
    btnCloseWin.style.border = 'none';
    btnCloseWin.style.background = '#1f2937';
    btnCloseWin.style.color = '#fff';
    btnCloseWin.style.borderRadius = '8px';
    btnCloseWin.style.cursor = 'pointer';

    const canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.display = 'block';

    content.appendChild(winAvatar);
    content.appendChild(winName);
    content.appendChild(details);
    content.appendChild(btnCloseWin);

    content.style.zIndex = '10000';
    canvas.style.zIndex = '10001';

    celebrationModal.appendChild(canvas);
    celebrationModal.appendChild(content);
    celebrationModal.style.display = 'none';

    document.body.appendChild(celebrationModal);

    btnCloseWin.addEventListener('click', () => {
        celebrationModal.style.display = 'none';
        if (typeof confettiAnimId === 'number') {
            cancelAnimationFrame(confettiAnimId);
            confettiAnimId = null;
        }
        try {
            const c = document.getElementById('confetti-canvas');
            if (c && c.getContext) {
                const ctx = c.getContext('2d');
                ctx.clearRect(0, 0, c.width, c.height);
            }
        } catch (e) { /* ignore */ }
    });
}

// Run a lightweight confetti animation on the 'confetti-canvas' element
function runConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas || !celebrationModal) return;

    const rect = celebrationModal.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = rect.width;
    const height = rect.height;

    const pieces = Array.from({ length: 140 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height - height,
        size: Math.random() * 12 + 6,
        color: ['#00d4ff', '#22c55e', '#eab308', '#ef4444', '#8b5cf6', '#0ea5e9'][Math.floor(Math.random() * 6)],
        speedY: Math.random() * 120 + 80,
        speedX: (Math.random() - 0.5) * 120,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 360
    }));

    let lastTime = performance.now();

    function draw(now) {
        const dt = Math.min(100, now - lastTime) / 1000;
        lastTime = now;
        ctx.clearRect(0, 0, width, height);

        for (let i = 0; i < pieces.length; i++) {
            const p = pieces[i];
            p.y += p.speedY * dt;
            p.x += p.speedX * dt;
            p.rotation += p.rotationSpeed * dt;

            if (p.y > height + 20) {
                p.y = -20;
                p.x = Math.random() * width;
            }

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rotation * Math.PI) / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
            ctx.restore();
        }

        if (celebrationModal && celebrationModal.style.display !== 'none') {
            confettiAnimId = requestAnimationFrame(draw);
        } else {
            confettiAnimId = null;
            ctx.clearRect(0, 0, width, height);
        }
    }

    if (confettiAnimId) cancelAnimationFrame(confettiAnimId);
    confettiAnimId = requestAnimationFrame(draw);
}

// Show victory modal and populate fields
function triggerVictoryModal(resonator) {
    if (!resonator) return;
    try {
        createCelebrationModalIfMissing();

        winAvatar.src = resonator.image || '';
        winName.textContent = resonator.name || 'Resonator';
        winElement.textContent = `Element: ${resonator.element || 'Unknown'}`;
        winWeapon.textContent = `Weapon: ${resonator.weapon || 'Unknown'}`;
        winRarity.textContent = `Rarity: ${resonator.rarity || 'Unknown'}`;
        winRole.textContent = `Role: ${resonator.role || 'Unknown'}`;
        winFaction.textContent = `Faction: ${resonator.faction || 'Unknown'}`;
        winGender.textContent = `Gender: ${resonator.gender || 'Unknown'}`;

        celebrationModal.style.display = 'flex';
        runConfetti();
    } catch (e) {
        console.error('Failed to show victory modal:', e);
    }
}

function restoreProgress() {
    const saved = JSON.parse(localStorage.getItem(`wutherdle_save_${TODAY_DATE_STR}`));
    if (!saved) return;

    guessesHistory = saved.history || [];
    gameOver = saved.gameOver;

    guessesHistory.forEach(resonatorName => {
        const resonator = RESONATORS.find(r => r.name === resonatorName);
        if (resonator) renderRowUI(resonator, false);
    });

    checkHintState();

    if (gameOver) {
        inputEl.disabled = true;
        btnGuess.disabled = true;
        toastEl.textContent = saved.passed ? `Daily Wutherdle Solved!` : `Mystery Resonator was: ${TARGET_RESONATOR.name}`;
    }
}

function saveProgress(passed = false) {
    localStorage.setItem(`wutherdle_save_${TODAY_DATE_STR}`, JSON.stringify({
        date: TODAY_DATE_STR,
        history: guessesHistory,
        gameOver: gameOver,
        passed: passed
    }));
}

// Start Game
fetchResonatorsData();

inputEl.addEventListener('input', debounce(handleAutocomplete, 150));
btnGuess.addEventListener('click', submitGuess);