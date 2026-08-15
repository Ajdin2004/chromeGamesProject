// --- Web Audio Synthesizer ---
let audioCtx = null;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

// SFX toggle
let sfxEnabled = localStorage.getItem('zenlessdle_sfx_enabled') !== 'false';

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

// Local bundled agents dataset
const AGENTS_URL = './data/zenlessdle_characters.json';

let AGENTS = [];
let TARGET_AGENT = null;
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
const inputEl = document.getElementById('agent-input');
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
const winSpecialty = document.getElementById('win-specialty');
const winRarity = document.getElementById('win-rarity');
const winVersion = document.getElementById('win-version');
const winFaction = document.getElementById('win-faction');
const winGender = document.getElementById('win-gender');
const guessDistributionEl = document.getElementById('guess-distribution');
const btnShare = document.getElementById('btn-share');
const btnCloseWin = document.getElementById('btn-close-win');

// Game over modal elements
const loseAvatar = document.getElementById('lose-avatar');
const loseName = document.getElementById('lose-name');
const loseElement = document.getElementById('lose-element');
const loseSpecialty = document.getElementById('lose-specialty');
const loseRarity = document.getElementById('lose-rarity');
const loseVersion = document.getElementById('lose-version');
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
const STATS_KEY = 'zenlessdle_stats';

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
    lines.push(`Zenlessdle ${TODAY_DATE_STR} ${won ? guessesHistory.length : 'X'}/${MAX_GUESSES}`);
    lines.push('');

    const attrKeys = ['element', 'specialty', 'rarity', 'releaseVersion', 'faction', 'gender'];
    guessesHistory.forEach(agentName => {
        const agent = AGENTS.find(a => a.name === agentName);
        if (!agent) return;
        const row = attrKeys.map(key => {
            const status = compareAttribute(agent[key], TARGET_AGENT[key]);
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
        color: ['#facc15', '#f59e0b', '#22c55e', '#eab308', '#ef4444', '#f0f4f8'][Math.floor(Math.random() * 6)],
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
        toastEl.textContent = "Guess today's mystery agent!";
    }).catch(err => {
        console.warn("Autoplay prevented:", err);
        toastEl.textContent = "Click anywhere on the page to enable audio.";

        const unlockAudio = () => {
            bgMusic.play().then(() => {
                btnMusic.classList.add('playing');
                btnMusic.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
                toastEl.textContent = "Guess today's mystery agent!";
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
    localStorage.setItem('zenlessdle_sfx_enabled', sfxEnabled);
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
        inputEl.placeholder = "Enter agent name...";
        toastEl.textContent = "Guess today's mystery agent!";
        resetToDaily();
    } else {
        btnEndlessMode.classList.add('active');
        btnDailyMode.classList.remove('active');
        endlessCounterEl.classList.add('visible');
        if (countdownBar) countdownBar.style.display = 'none';
        inputEl.placeholder = "Enter agent name...";
        toastEl.textContent = "Endless mode! Guess the mystery agent!";
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
    TARGET_AGENT = AGENTS[Math.floor(Math.random() * AGENTS.length)];
    endlessRoundEl.textContent = endlessRound;
    toastEl.textContent = `Endless Round ${endlessRound}! Guess the mystery agent!`;
}

function resetToDaily() {
    resetBoard();
    const now = new Date();
    const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    TARGET_AGENT = AGENTS[seed % AGENTS.length];
    restoreProgress();
    if (!gameOver) {
        toastEl.textContent = "Guess today's mystery agent!";
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

// Normalize agent names for robust matching
function normalizeName(name) {
    if (!name) return '';
    return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function fetchAgentsData() {
    try {
        const res = await fetch(AGENTS_URL);
        const data = await res.json();

        AGENTS = Object.keys(data).map(key => {
            const a = data[key];
            return {
                id: key,
                name: a.name || key,
                image: a.image || '',
                element: a.element || 'Unknown',
                specialty: a.specialty || 'Unknown',
                rarity: a.rarity || 'Unknown',
                version: a.version || 'Unknown',
                faction: a.faction || 'Unknown',
                gender: a.gender || 'Unknown',
                releaseVersion: a.releaseVersion || 'Unknown'
            };
        }).sort((a, b) => a.name.localeCompare(b.name));

        if (!AGENTS || AGENTS.length === 0) {
            throw new Error('No agents loaded from ' + AGENTS_URL + '. Ensure the file exists at this path and that the page is served over HTTP/S (fetch() will not work from file://).');
        }

        const now = new Date();
        const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
        TARGET_AGENT = AGENTS[seed % AGENTS.length];

        inputEl.placeholder = "Enter agent name...";
        toastEl.textContent = "Guess today's mystery agent!";
        updateStatsDisplay();
        updateCountdown();
        setInterval(updateCountdown, 1000);
        restoreProgress();
    } catch (err) {
        console.error('Failed to load agents from:', AGENTS_URL, err);
        if (err && err.message) console.error('Error message:', err.message);
        toastEl.textContent = "Error loading agent data. Check console for details.\nMake sure the file '" + AGENTS_URL + "' is present and the page is served over HTTP (not file://).";
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

// Parse version string like "1.1" or "1.0" into a comparable number
function parseVersion(version) {
    if (!version || version === 'Unknown') return NaN;
    const match = String(version).trim().match(/^(\d+)(?:\.(\d+))?/);
    if (!match) return NaN;
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2] || '0', 10);
    return major * 10 + minor;
}

// Determine direction hint: 'higher', 'lower', or null (for equal/unknown)
function getVersionDirection(guessVersion, targetVersion) {
    const g = parseVersion(guessVersion);
    const t = parseVersion(targetVersion);
    if (isNaN(g) || isNaN(t)) return null;
    if (g < t) return 'higher';    // Target is newer, guess is lower -> show up arrow
    if (g > t) return 'lower';     // Target is older, guess is higher -> show down arrow
    return null;                    // Equal
}

function handleAutocomplete() {
    const val = inputEl.value.toLowerCase().trim();
    suggestionsEl.innerHTML = '';

    if (!val || AGENTS.length === 0) {
        currentMatches = [];
        suggestionsEl.style.display = 'none';
        return;
    }

    currentMatches = AGENTS.filter(a =>
        a.name.toLowerCase().startsWith(val) || a.name.toLowerCase().includes(val)
    ).slice(0, 8);

    if (currentMatches.length > 0) {
        suggestionsEl.style.display = 'block';
        currentMatches.forEach((a, idx) => {
            const div = document.createElement('div');
            div.className = `suggestion-item ${idx === 0 ? 'active' : ''}`;
            div.setAttribute('role', 'option');
            div.dataset.index = idx;

            const info = document.createElement('div');
            info.className = 'suggestion-info';

            const img = document.createElement('img');
            img.src = a.image;
            img.alt = a.name;

            const nameSpan = document.createElement('span');
            nameSpan.textContent = a.name;

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
                selectAgent(a.name);
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

function selectAgent(name) {
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
        selectAgent(currentMatches[idx].name);
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
            selectAgent(currentMatches[suggestionActiveIndex].name);
        } else {
            submitGuess();
        }
    }
});

// Attribute icons for display
const ATTR_ICONS = {
    element: 'fa-fire',
    specialty: 'fa-crosshairs',
    rarity: 'fa-star',
    version: 'fa-flag',
    faction: 'fa-flag',
    gender: 'fa-venus-mars'
};

const ATTR_STATUS_ICONS = {
    correct: 'fa-check',
    partial: 'fa-circle-half-stroke',
    wrong: 'fa-xmark'
};

function submitGuess() {
    if (gameOver || !TARGET_AGENT) return;
    initAudio();

    const val = inputEl.value.trim();
    if (!val) {
        toastEl.textContent = 'Please enter an agent name.';
        triggerShake();
        return;
    }

    let guessedAgent = AGENTS.find(a => normalizeName(a.name) === normalizeName(val));

    if (!guessedAgent) guessedAgent = AGENTS.find(a => a.name.toLowerCase() === val.toLowerCase());

    if (!guessedAgent) guessedAgent = AGENTS.find(a => a.name.toLowerCase().startsWith(val.toLowerCase()) || a.name.toLowerCase().includes(val.toLowerCase()));

    if (!guessedAgent && currentMatches.length > 0) {
        const idx = suggestionActiveIndex >= 0 ? suggestionActiveIndex : 0;
        guessedAgent = currentMatches[idx];
    }

    if (!guessedAgent) {
        toastEl.textContent = "Agent not found!";
        triggerShake();
        return;
    }

    if (guessesHistory.includes(guessedAgent.name)) {
        toastEl.textContent = "Already Guessed!";
        triggerShake();
        return;
    }

    guessesHistory.push(guessedAgent.name);
    renderRowUI(guessedAgent, true);
    Sound.guess();

    inputEl.value = '';
    suggestionsEl.style.display = 'none';

    checkHintState();

    const isCorrect = guessedAgent.name === TARGET_AGENT.name;

    if (isCorrect) {
        gameOver = true;
        lastGameWon = true;
        Sound.win();
        toastEl.textContent = `Splendid! Zenlessdle Solved!`;
        inputEl.disabled = true;
        btnGuess.disabled = true;

        if (gameMode === 'daily') {
            recordGameResult(true, guessesHistory.length);
            saveProgress(true);
        }
        triggerVictoryModal(TARGET_AGENT);
    } else if (guessesHistory.length >= MAX_GUESSES) {
        gameOver = true;
        lastGameWon = false;
        Sound.lose();
        toastEl.textContent = `Game Over! Agent was: ${TARGET_AGENT.name}`;
        inputEl.disabled = true;
        btnGuess.disabled = true;

        if (gameMode === 'daily') {
            recordGameResult(false, 0);
            saveProgress(false);
        }
        triggerGameOverModal(TARGET_AGENT);
    } else {
        toastEl.textContent = `Guess recorded!`;
        if (gameMode === 'daily') saveProgress(false);
    }
}

function checkHintState() {
    if (guessesHistory.length >= 5 && !gameOver) {
        const firstLetter = TARGET_AGENT.name.charAt(0);
        hintBox.style.display = 'block';
        hintBox.innerHTML = `<i class="fa-solid fa-lightbulb"></i> <strong>Hint Unlocked:</strong> Released in version <strong>${TARGET_AGENT.releaseVersion}</strong> and starts with the letter '<strong>${firstLetter}</strong>'!`;
    }
}

function renderRowUI(agent, shouldAnimate = false) {
    const row = document.createElement('div');
    row.className = 'guess-row';

    const fields = [
        { key: 'gender', val: agent.gender, label: 'Gender' },
        { key: 'element', val: agent.element, label: 'Element' },
        { key: 'specialty', val: agent.specialty, label: 'Specialty' },
        { key: 'rarity', val: agent.rarity, label: 'Rarity' },
        { key: 'releaseVersion', val: agent.releaseVersion, label: 'Release Version' },
        { key: 'faction', val: agent.faction, label: 'Faction' }
    ];

    const agentCard = document.createElement('div');
    agentCard.className = 'attribute-box agent-card';
    if (shouldAnimate) agentCard.classList.add('animate-flip');

    const avatar = document.createElement('img');
    avatar.src = agent.image;
    avatar.className = 'agent-avatar';
    avatar.alt = agent.name;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = agent.name;

    agentCard.appendChild(avatar);
    agentCard.appendChild(nameSpan);
    row.appendChild(agentCard);

    fields.forEach((f, idx) => {
        const status = compareAttribute(f.val, TARGET_AGENT[f.key]);
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

        // For version column, show up/down direction arrow to guide the player
        if (f.key === 'releaseVersion') {
            const direction = getVersionDirection(f.val, TARGET_AGENT.releaseVersion);
            if (direction === 'higher') {
                const dirIcon = document.createElement('i');
                dirIcon.className = 'fa-solid fa-arrow-up attr-dir';
                dirIcon.title = `Target agent released in a newer version (${TARGET_AGENT.releaseVersion})`;
                box.appendChild(dirIcon);
            } else if (direction === 'lower') {
                const dirIcon = document.createElement('i');
                dirIcon.className = 'fa-solid fa-arrow-down attr-dir';
                dirIcon.title = `Target agent released in an older version (${TARGET_AGENT.releaseVersion})`;
                box.appendChild(dirIcon);
            }
        }

        // Add status icon
        const statusIcon = document.createElement('i');
        statusIcon.className = `fa-solid ${ATTR_STATUS_ICONS[status]} attr-status`;
        box.appendChild(statusIcon);

        row.appendChild(box);
    });

    guessesContainer.insertBefore(row, guessesContainer.firstChild);
}

// Show victory modal
function triggerVictoryModal(agent) {
    if (!agent) return;

    winAvatar.src = agent.image || '';
    winName.textContent = agent.name || 'Agent';
    winElement.textContent = agent.element || 'Unknown';
    winSpecialty.textContent = agent.specialty || 'Unknown';
    winRarity.textContent = agent.rarity || 'Unknown';
    winVersion.textContent = agent.version || 'Unknown';
    winFaction.textContent = agent.faction || 'Unknown';
    winGender.textContent = agent.gender || 'Unknown';

    // Show guess distribution
    const stats = getStats();
    renderGuessDistribution(guessDistributionEl, stats, guessesHistory.length);

    showModal(victoryModal);
    runConfetti();
}

// Show game over modal
function triggerGameOverModal(agent) {
    if (!agent) return;

    loseAvatar.src = agent.image || '';
    loseName.textContent = agent.name || 'Agent';
    loseElement.textContent = agent.element || 'Unknown';
    loseSpecialty.textContent = agent.specialty || 'Unknown';
    loseRarity.textContent = agent.rarity || 'Unknown';
    loseVersion.textContent = agent.version || 'Unknown';
    loseFaction.textContent = agent.faction || 'Unknown';
    loseGender.textContent = agent.gender || 'Unknown';

    showModal(gameoverModal);
}

function restoreProgress() {
    const saved = JSON.parse(localStorage.getItem(`zenlessdle_save_${TODAY_DATE_STR}`));
    if (!saved) return;

    guessesHistory = saved.history || [];
    gameOver = saved.gameOver;
    lastGameWon = saved.passed || false;

    guessesHistory.forEach(agentName => {
        const agent = AGENTS.find(a => a.name === agentName);
        if (agent) renderRowUI(agent, false);
    });

    checkHintState();

    if (gameOver) {
        inputEl.disabled = true;
        btnGuess.disabled = true;
        if (saved.passed) {
            toastEl.textContent = `Daily Zenlessdle Solved!`;
        } else {
            toastEl.textContent = `Mystery Agent was: ${TARGET_AGENT.name}`;
        }
    }
}

function saveProgress(passed = false) {
    localStorage.setItem(`zenlessdle_save_${TODAY_DATE_STR}`, JSON.stringify({
        date: TODAY_DATE_STR,
        history: guessesHistory,
        gameOver: gameOver,
        passed: passed
    }));
}

// Initialize SFX button state
updateSfxButton();

// Start Game
fetchAgentsData();

inputEl.addEventListener('input', debounce(handleAutocomplete, 150));
btnGuess.addEventListener('click', submitGuess);