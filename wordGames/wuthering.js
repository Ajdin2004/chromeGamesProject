// --- Web Audio Synthesizer ---
let audioCtx = null;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

// SFX toggle
let sfxEnabled = localStorage.getItem('wutherdle_sfx_enabled') !== 'false';

const Sound = {
    guess() {
        if (!sfxEnabled || !audioCtx) return;
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
        if (!sfxEnabled || !audioCtx) return;
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
    },
    lose() {
        if (!sfxEnabled || !audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.4);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.4);
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
let lastGameWon = false;
let gameMode = 'daily'; // 'daily' or 'endless'
let endlessRound = 1;

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
const btnSfx = document.getElementById('btn-sfx');
const btnStats = document.getElementById('btn-stats');
const btnHelp = document.getElementById('btn-help');
const btnDailyMode = document.getElementById('btn-daily-mode');
const btnEndlessMode = document.getElementById('btn-endless-mode');
const endlessCounterEl = document.getElementById('endless-counter');
const endlessRoundEl = document.getElementById('endless-round');
const countdownBar = document.getElementById('countdown-bar');
const btnNextRound = document.getElementById('btn-next-round');
const btnNextRoundLose = document.getElementById('btn-next-round-lose');

// Modal elements
const victoryModal = document.getElementById('victory-modal');
const gameoverModal = document.getElementById('gameover-modal');
const statsModal = document.getElementById('stats-modal');
const helpModal = document.getElementById('help-modal');

// Stats elements
const statStreakEl = document.getElementById('stat-streak');
const statMaxStreakEl = document.getElementById('stat-max-streak');
const statWinrateEl = document.getElementById('stat-winrate');
const countdownEl = document.getElementById('countdown');

// Victory modal elements
const winAvatar = document.getElementById('win-avatar');
const winName = document.getElementById('win-name');
const winElement = document.getElementById('win-element');
const winWeapon = document.getElementById('win-weapon');
const winRarity = document.getElementById('win-rarity');
const winRole = document.getElementById('win-role');
const winFaction = document.getElementById('win-faction');
const winGender = document.getElementById('win-gender');
const guessDistributionEl = document.getElementById('guess-distribution');
const btnShare = document.getElementById('btn-share');
const btnCloseWin = document.getElementById('btn-close-win');

// Game over modal elements
const loseAvatar = document.getElementById('lose-avatar');
const loseName = document.getElementById('lose-name');
const loseElement = document.getElementById('lose-element');
const loseWeapon = document.getElementById('lose-weapon');
const loseRarity = document.getElementById('lose-rarity');
const loseRole = document.getElementById('lose-role');
const loseFaction = document.getElementById('lose-faction');
const loseGender = document.getElementById('lose-gender');
const btnShareLose = document.getElementById('btn-share-lose');
const btnCloseLose = document.getElementById('btn-close-lose');

// Stats modal elements
const statsPlayedEl = document.getElementById('stats-played');
const statsWonEl = document.getElementById('stats-won');
const statsStreakEl = document.getElementById('stats-streak');
const statsMaxStreakEl2 = document.getElementById('stats-max-streak');
const statsDistributionEl = document.getElementById('stats-distribution');
const btnCloseStats = document.getElementById('btn-close-stats');

// Help modal
const btnCloseHelp = document.getElementById('btn-close-help');

let confettiAnimId = null;

// --- Stats System ---
const STATS_KEY = 'wutherdle_stats';

function getStats() {
    const defaultStats = {
        played: 0,
        won: 0,
        currentStreak: 0,
        maxStreak: 0,
        distribution: [0, 0, 0, 0, 0, 0, 0, 0], // guesses 1-8
        lastPlayedDate: null
    };
    try {
        const saved = JSON.parse(localStorage.getItem(STATS_KEY));
        return Object.assign(defaultStats, saved || {});
    } catch (e) {
        return defaultStats;
    }
}

function saveStats(stats) {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function updateStatsDisplay() {
    const stats = getStats();
    statStreakEl.textContent = stats.currentStreak;
    statMaxStreakEl.textContent = stats.maxStreak;
    const winRate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
    statWinrateEl.textContent = winRate + '%';
}

function recordGameResult(won, guessesUsed) {
    const stats = getStats();
    const today = TODAY_DATE_STR;

    // Check if already played today
    if (stats.lastPlayedDate === today) return;

    stats.played++;
    if (won) {
        stats.won++;
        stats.currentStreak++;
        stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
        if (guessesUsed >= 1 && guessesUsed <= 8) {
            stats.distribution[guessesUsed - 1]++;
        }
    } else {
        stats.currentStreak = 0;
    }
    stats.lastPlayedDate = today;
    saveStats(stats);
    updateStatsDisplay();
}

// --- Countdown Timer ---
function updateCountdown() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0);
    const diff = tomorrow - now;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    countdownEl.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// --- Share Function ---
function buildShareText(won) {
    const lines = [];
    lines.push(`Wutherdle ${TODAY_DATE_STR} ${won ? guessesHistory.length : 'X'}/${MAX_GUESSES}`);
    lines.push('');

    const attrKeys = ['element', 'weapon', 'rarity', 'role', 'faction', 'gender'];
    guessesHistory.forEach(resonatorName => {
        const resonator = RESONATORS.find(r => r.name === resonatorName);
        if (!resonator) return;
        const row = attrKeys.map(key => {
            const status = compareAttribute(resonator[key], TARGET_RESONATOR[key]);
            if (status === 'correct') return '🟩';
            if (status === 'partial') return '🟨';
            return '⬛';
        }).join('');
        lines.push(row);
    });

    return lines.join('\n');
}

async function shareResults(btn, won) {
    const text = buildShareText(won);
    try {
        await navigator.clipboard.writeText(text);
        btn.classList.add('copied');
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = '<i class="fa-solid fa-share-nodes"></i> Share';
        }, 2000);
    } catch (e) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        btn.classList.add('copied');
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = '<i class="fa-solid fa-share-nodes"></i> Share';
        }, 2000);
    }
}

// --- Modal Helpers ---
function showModal(modal) {
    modal.classList.add('active');
}

function hideModal(modal) {
    modal.classList.remove('active');
}

// --- Confetti ---
function runConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas || !victoryModal) return;

    const rect = victoryModal.getBoundingClientRect();
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
        color: ['#8b5cf6', '#14b8a6', '#22c55e', '#eab308', '#ef4444', '#00d4ff'][Math.floor(Math.random() * 6)],
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

        if (victoryModal.classList.contains('active')) {
            confettiAnimId = requestAnimationFrame(draw);
        } else {
            confettiAnimId = null;
            ctx.clearRect(0, 0, width, height);
        }
    }

    if (confettiAnimId) cancelAnimationFrame(confettiAnimId);
    confettiAnimId = requestAnimationFrame(draw);
}

// --- Guess Distribution Display ---
function renderGuessDistribution(container, stats, highlightGuess = null) {
    container.innerHTML = '';
    const maxCount = Math.max(...stats.distribution, 1);
    for (let i = 0; i < 8; i++) {
        const row = document.createElement('div');
        row.className = 'dist-row';
        const label = document.createElement('span');
        label.className = 'dist-label';
        label.textContent = i + 1;
        const bar = document.createElement('div');
        bar.className = 'dist-bar' + (highlightGuess === i + 1 ? ' highlight' : '');
        const count = stats.distribution[i];
        bar.textContent = count;
        bar.style.width = Math.max(20, (count / maxCount) * 100) + '%';
        row.appendChild(label);
        row.appendChild(bar);
        container.appendChild(row);
    }
}

// --- Background Music Control ---
if (bgMusic) {
    try { bgMusic.crossOrigin = 'anonymous'; } catch (e) { /* ignore */ }
    bgMusic.volume = 0.10;

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
    initAudio();
    bgMusic.play().then(() => {
        btnMusic.classList.add('playing');
        btnMusic.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
        toastEl.textContent = "Guess today's mystery resonator!";
    }).catch(err => {
        console.warn("Autoplay prevented:", err);
        toastEl.textContent = "Click anywhere on the page to enable audio.";

        const unlockAudio = () => {
            bgMusic.play().then(() => {
                btnMusic.classList.add('playing');
                btnMusic.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
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
        btnMusic.innerHTML = '<i class="fa-solid fa-music"></i>';
    }
});

// --- SFX Toggle ---
function updateSfxButton() {
    if (sfxEnabled) {
        btnSfx.classList.add('active');
        btnSfx.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
    } else {
        btnSfx.classList.remove('active');
        btnSfx.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
    }
}

btnSfx.addEventListener('click', () => {
    sfxEnabled = !sfxEnabled;
    localStorage.setItem('wutherdle_sfx_enabled', sfxEnabled);
    updateSfxButton();
    if (sfxEnabled) initAudio();
});

// --- Stats Modal ---
btnStats.addEventListener('click', () => {
    const stats = getStats();
    statsPlayedEl.textContent = stats.played;
    statsWonEl.textContent = stats.won;
    statsStreakEl.textContent = stats.currentStreak;
    statsMaxStreakEl2.textContent = stats.maxStreak;
    renderGuessDistribution(statsDistributionEl, stats);
    showModal(statsModal);
});

btnCloseStats.addEventListener('click', () => hideModal(statsModal));

// --- Help Modal ---
btnHelp.addEventListener('click', () => showModal(helpModal));
btnCloseHelp.addEventListener('click', () => hideModal(helpModal));

// --- Victory Modal ---
btnCloseWin.addEventListener('click', () => {
    hideModal(victoryModal);
    if (confettiAnimId) {
        cancelAnimationFrame(confettiAnimId);
        confettiAnimId = null;
    }
});

btnShare.addEventListener('click', () => shareResults(btnShare, true));

// --- Mode Switching ---
function setGameMode(mode) {
    gameMode = mode;
    if (mode === 'daily') {
        btnDailyMode.classList.add('active');
        btnEndlessMode.classList.remove('active');
        endlessCounterEl.classList.remove('visible');
        if (countdownBar) countdownBar.style.display = 'flex';
        inputEl.placeholder = "Enter resonator name...";
        toastEl.textContent = "Guess today's mystery resonator!";
        resetToDaily();
    } else {
        btnEndlessMode.classList.add('active');
        btnDailyMode.classList.remove('active');
        endlessCounterEl.classList.add('visible');
        if (countdownBar) countdownBar.style.display = 'none';
        inputEl.placeholder = "Enter resonator name...";
        toastEl.textContent = "Endless mode! Guess the mystery resonator!";
        startEndlessRound();
    }
}

function resetBoard() {
    guessesHistory = [];
    gameOver = false;
    lastGameWon = false;
    guessesContainer.innerHTML = '';
    hintBox.style.display = 'none';
    inputEl.disabled = false;
    btnGuess.disabled = false;
    inputEl.value = '';
    suggestionsEl.style.display = 'none';
    currentMatches = [];
    suggestionActiveIndex = -1;
    // Show/hide buttons based on mode
    btnShare.style.display = gameMode === 'endless' ? 'none' : 'block';
    btnShareLose.style.display = gameMode === 'endless' ? 'none' : 'block';
    btnNextRound.style.display = gameMode === 'endless' ? 'block' : 'none';
    btnNextRoundLose.style.display = gameMode === 'endless' ? 'block' : 'none';
}

function startEndlessRound() {
    resetBoard();
    TARGET_RESONATOR = RESONATORS[Math.floor(Math.random() * RESONATORS.length)];
    endlessRoundEl.textContent = endlessRound;
    toastEl.textContent = `Endless Round ${endlessRound}! Guess the mystery resonator!`;
}

function resetToDaily() {
    resetBoard();
    const now = new Date();
    const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    TARGET_RESONATOR = RESONATORS[seed % RESONATORS.length];
    restoreProgress();
    if (!gameOver) {
        toastEl.textContent = "Guess today's mystery resonator!";
    }
}

btnDailyMode.addEventListener('click', () => {
    if (gameMode === 'daily') return;
    setGameMode('daily');
});

btnEndlessMode.addEventListener('click', () => {
    if (gameMode === 'endless') return;
    setGameMode('endless');
});

// Next round in endless mode
btnNextRound.addEventListener('click', () => {
    hideModal(victoryModal);
    if (confettiAnimId) {
        cancelAnimationFrame(confettiAnimId);
        confettiAnimId = null;
    }
    endlessRound++;
    startEndlessRound();
});

btnNextRoundLose.addEventListener('click', () => {
    hideModal(gameoverModal);
    endlessRound++;
    startEndlessRound();
});

// --- Game Over Modal ---
btnCloseLose.addEventListener('click', () => hideModal(gameoverModal));
btnShareLose.addEventListener('click', () => shareResults(btnShareLose, false));

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
    // Don't trigger when typing in input
    if (e.target === inputEl) return;

    if (e.key === '?') {
        e.preventDefault();
        showModal(helpModal);
    } else if (e.key.toLowerCase() === 's' && gameOver) {
        e.preventDefault();
        if (lastGameWon) {
            shareResults(btnShare, true);
        } else {
            shareResults(btnShareLose, false);
        }
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

        if (!RESONATORS || RESONATORS.length === 0) {
            throw new Error('No resonators loaded from ' + RESONATORS_URL + '. Ensure the file exists at this path and that the page is served over HTTP/S (fetch() will not work from file://).');
        }

        const now = new Date();
        const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
        TARGET_RESONATOR = RESONATORS[seed % RESONATORS.length];

        inputEl.placeholder = "Enter resonator name...";
        toastEl.textContent = "Guess today's mystery resonator!";
        updateStatsDisplay();
        updateCountdown();
        setInterval(updateCountdown, 1000);
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

// Attribute icons for display
const ATTR_ICONS = {
    element: 'fa-fire',
    weapon: 'fa-sword',
    rarity: 'fa-star',
    role: 'fa-shield-halved',
    faction: 'fa-flag',
    gender: 'fa-venus-mars'
};

const ATTR_STATUS_ICONS = {
    correct: 'fa-check',
    partial: 'fa-circle-half-stroke',
    wrong: 'fa-xmark'
};

function submitGuess() {
    if (gameOver || !TARGET_RESONATOR) return;
    initAudio();

    const val = inputEl.value.trim();
    if (!val) {
        toastEl.textContent = 'Please enter a resonator name.';
        triggerShake();
        return;
    }

    let guessedResonator = RESONATORS.find(r => normalizeName(r.name) === normalizeName(val));

    if (!guessedResonator) guessedResonator = RESONATORS.find(r => r.name.toLowerCase() === val.toLowerCase());

    if (!guessedResonator) guessedResonator = RESONATORS.find(r => r.name.toLowerCase().startsWith(val.toLowerCase()) || r.name.toLowerCase().includes(val.toLowerCase()));

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
        lastGameWon = true;
        Sound.win();
        toastEl.textContent = `Splendid! Wutherdle Solved!`;
        inputEl.disabled = true;
        btnGuess.disabled = true;

        if (gameMode === 'daily') {
            recordGameResult(true, guessesHistory.length);
            saveProgress(true);
        }
        triggerVictoryModal(TARGET_RESONATOR);
    } else if (guessesHistory.length >= MAX_GUESSES) {
        gameOver = true;
        lastGameWon = false;
        Sound.lose();
        toastEl.textContent = `Game Over! Resonator was: ${TARGET_RESONATOR.name}`;
        inputEl.disabled = true;
        btnGuess.disabled = true;

        if (gameMode === 'daily') {
            recordGameResult(false, 0);
            saveProgress(false);
        }
        triggerGameOverModal(TARGET_RESONATOR);
    } else {
        toastEl.textContent = `Guess recorded!`;
        if (gameMode === 'daily') saveProgress(false);
    }
}

function checkHintState() {
    if (guessesHistory.length >= 5 && !gameOver) {
        const firstLetter = TARGET_RESONATOR.name.charAt(0);
        hintBox.style.display = 'block';
        hintBox.innerHTML = `<i class="fa-solid fa-lightbulb"></i> <strong>Hint Unlocked:</strong> Released in version <strong>${TARGET_RESONATOR.releaseVersion}</strong> and starts with the letter '<strong>${firstLetter}</strong>'!`;
    }
}

function renderRowUI(resonator, shouldAnimate = false) {
    const row = document.createElement('div');
    row.className = 'guess-row';

    const fields = [
        { key: 'gender', val: resonator.gender, label: 'Gender' },
        { key: 'element', val: resonator.element, label: 'Element' },
        { key: 'weapon', val: resonator.weapon, label: 'Weapon' },
        { key: 'rarity', val: resonator.rarity, label: 'Rarity' },
        { key: 'role', val: resonator.role, label: 'Role' },
        { key: 'faction', val: resonator.faction, label: 'Faction' }
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

        // Add icon
        const icon = document.createElement('i');
        icon.className = `fa-solid ${ATTR_ICONS[f.key]} attr-icon`;
        box.appendChild(icon);

        // Add value text
        const valueSpan = document.createElement('span');
        valueSpan.textContent = f.val;
        box.appendChild(valueSpan);

        // Add status icon
        const statusIcon = document.createElement('i');
        statusIcon.className = `fa-solid ${ATTR_STATUS_ICONS[status]} attr-status`;
        box.appendChild(statusIcon);

        row.appendChild(box);
    });

    guessesContainer.insertBefore(row, guessesContainer.firstChild);
}

// Show victory modal
function triggerVictoryModal(resonator) {
    if (!resonator) return;

    winAvatar.src = resonator.image || '';
    winName.textContent = resonator.name || 'Resonator';
    winElement.textContent = resonator.element || 'Unknown';
    winWeapon.textContent = resonator.weapon || 'Unknown';
    winRarity.textContent = resonator.rarity || 'Unknown';
    winRole.textContent = resonator.role || 'Unknown';
    winFaction.textContent = resonator.faction || 'Unknown';
    winGender.textContent = resonator.gender || 'Unknown';

    // Show guess distribution
    const stats = getStats();
    renderGuessDistribution(guessDistributionEl, stats, guessesHistory.length);

    showModal(victoryModal);
    runConfetti();
}

// Show game over modal
function triggerGameOverModal(resonator) {
    if (!resonator) return;

    loseAvatar.src = resonator.image || '';
    loseName.textContent = resonator.name || 'Resonator';
    loseElement.textContent = resonator.element || 'Unknown';
    loseWeapon.textContent = resonator.weapon || 'Unknown';
    loseRarity.textContent = resonator.rarity || 'Unknown';
    loseRole.textContent = resonator.role || 'Unknown';
    loseFaction.textContent = resonator.faction || 'Unknown';
    loseGender.textContent = resonator.gender || 'Unknown';

    showModal(gameoverModal);
}

function restoreProgress() {
    const saved = JSON.parse(localStorage.getItem(`wutherdle_save_${TODAY_DATE_STR}`));
    if (!saved) return;

    guessesHistory = saved.history || [];
    gameOver = saved.gameOver;
    lastGameWon = saved.passed || false;

    guessesHistory.forEach(resonatorName => {
        const resonator = RESONATORS.find(r => r.name === resonatorName);
        if (resonator) renderRowUI(resonator, false);
    });

    checkHintState();

    if (gameOver) {
        inputEl.disabled = true;
        btnGuess.disabled = true;
        if (saved.passed) {
            toastEl.textContent = `Daily Wutherdle Solved!`;
        } else {
            toastEl.textContent = `Mystery Resonator was: ${TARGET_RESONATOR.name}`;
        }
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

// Initialize SFX button state
updateSfxButton();

// Start Game
fetchResonatorsData();

inputEl.addEventListener('input', debounce(handleAutocomplete, 150));
btnGuess.addEventListener('click', submitGuess);