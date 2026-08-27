// ============================================================
//  Flag Guessr — Daily flag guessing game
//  Modes: Daily, Endless, Quiz (Multiple Choice)
// ============================================================

// --- Web Audio Synthesizer ---
let audioCtx = null;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

// SFX toggle
let sfxEnabled = localStorage.getItem('flagguessr_sfx_enabled') !== 'false';

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
    },
    hint() {
        if (!sfxEnabled || !audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.15);
    }
};

// --- Data & State ---
const FLAGS_URL = '../data/flags.json';
const FLAG_CDN = 'https://flagcdn.com/w320/';

let COUNTRIES = [];
let TARGET_COUNTRY = null;
const TODAY_DATE_STR = new Date().toISOString().slice(0, 10);
const MAX_GUESSES = 6;
let guessesHistory = [];
let gameOver = false;
let hintsUsed = 0;
let currentMatches = [];
let suggestionActiveIndex = -1;
let lastGameWon = false;
let gameMode = 'daily'; // 'daily' | 'endless' | 'quiz'
let endlessRound = 1;
let endlessWins = 0;
let endlessStreak = 0;
let endlessUsedCountries = new Set();

// Quiz mode state
let quizRound = 1;
let quizScore = 0;
let quizStreak = 0;
let quizTotal = 10;
let quizAnswered = false;

// DOM Elements
const inputEl = document.getElementById('country-input');
const inputWrapper = document.getElementById('input-wrapper');
const btnGuess = document.getElementById('btn-guess');
const suggestionsEl = document.getElementById('suggestions');
const guessesContainer = document.getElementById('guesses-container');
const toastEl = document.getElementById('toast');
const hintBox = document.getElementById('hint-box');
const hintCountEl = document.getElementById('hint-count');
const btnHint = document.getElementById('btn-hint');
const btnSfx = document.getElementById('btn-sfx');
const btnStats = document.getElementById('btn-stats');
const btnHelp = document.getElementById('btn-help');
const btnDailyMode = document.getElementById('btn-daily-mode');
const btnEndlessMode = document.getElementById('btn-endless-mode');
const btnMcMode = document.getElementById('btn-mc-mode');
const endlessCounterEl = document.getElementById('endless-counter');
const endlessRoundEl = document.getElementById('endless-round');
const endlessScoreEl = document.getElementById('endless-score');
const endlessWinsEl = document.getElementById('endless-wins');
const endlessStreakEl = document.getElementById('endless-streak');
const countdownBar = document.getElementById('countdown-bar');
const countdownEl = document.getElementById('countdown');
const flagImage = document.getElementById('flag-image');
const selectionMode = document.getElementById('selection-mode');
const mcContainer = document.getElementById('mc-container');
const mcGrid = document.getElementById('mc-grid');
const mcRoundEl = document.getElementById('mc-round');
const mcTotalEl = document.getElementById('mc-total');
const mcScoreEl = document.getElementById('mc-score');
const mcStreakEl = document.getElementById('mc-streak');
const mcFeedback = document.getElementById('mc-feedback');
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

// Victory modal elements
const winFlagImg = document.getElementById('win-flag-img');
const winName = document.getElementById('win-name');
const winCapital = document.getElementById('win-capital');
const winContinent = document.getElementById('win-continent');
const winPopulation = document.getElementById('win-population');
const winGuesses = document.getElementById('win-guesses');
const guessDistributionEl = document.getElementById('guess-distribution');
const btnShare = document.getElementById('btn-share');
const btnCloseWin = document.getElementById('btn-close-win');

// Game over modal elements
const loseFlagImg = document.getElementById('lose-flag-img');
const loseName = document.getElementById('lose-name');
const loseCapital = document.getElementById('lose-capital');
const loseContinent = document.getElementById('lose-continent');
const losePopulation = document.getElementById('lose-population');
const loseCode = document.getElementById('lose-code');
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
const STATS_KEY = 'flagguessr_stats';

function getStats() {
    const defaultStats = {
        played: 0,
        won: 0,
        currentStreak: 0,
        maxStreak: 0,
        distribution: [0, 0, 0, 0, 0, 0], // guesses 1-6
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
        if (guessesUsed >= 1 && guessesUsed <= 6) {
            stats.distribution[guessesUsed - 1]++;
        }
    } else {
        stats.currentStreak = 0;
    }
    stats.lastPlayedDate = today;
    saveStats(stats);
    updateStatsDisplay();
    localStorage.setItem('flagguessr_streak', stats.currentStreak); // Sync with Arcade Hub Leaderboard
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
    const modeLabel = gameMode === 'daily' ? 'Daily' : (gameMode === 'endless' ? 'Endless' : 'Quiz');
    const roundNum = gameMode === 'daily'
        ? Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000)
        : endlessRound;

    lines.push(`🚩 Flag Guessr ${modeLabel} #${roundNum} ${won ? guessesHistory.length : 'X'}/${MAX_GUESSES}`);
    if (hintsUsed > 0) lines[0] += ` 💡${hintsUsed}`;
    lines.push('');

    if (gameMode === 'quiz') {
        lines.push(`Score: ${quizScore}/${quizTotal}`);
    } else {
        guessesHistory.forEach(guess => {
            lines.push(guess.isCorrect ? '🟩' : '⬛');
        });
    }

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
        color: ['#00f2fe', '#facc15', '#22c55e', '#eab308', '#ef4444', '#a855f7'][Math.floor(Math.random() * 6)],
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
    for (let i = 0; i < 6; i++) {
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
    localStorage.setItem('flagguessr_sfx_enabled', sfxEnabled);
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
    btnDailyMode.classList.toggle('active', mode === 'daily');
    btnEndlessMode.classList.toggle('active', mode === 'endless');
    btnMcMode.classList.toggle('active', mode === 'quiz');

    if (mode === 'daily') {
        endlessCounterEl.classList.remove('visible');
        endlessScoreEl.style.display = 'none';
        countdownBar.style.display = 'flex';
        selectionMode.style.display = 'block';
        mcContainer.style.display = 'none';
        inputEl.placeholder = "Enter country name...";
        toastEl.textContent = "Guess today's mystery country!";
        resetToDaily();
    } else if (mode === 'endless') {
        endlessCounterEl.classList.add('visible');
        endlessScoreEl.style.display = 'block';
        countdownBar.style.display = 'none';
        selectionMode.style.display = 'block';
        mcContainer.style.display = 'none';
        inputEl.placeholder = "Enter country name...";
        toastEl.textContent = "Endless mode! Guess the mystery country!";
        startEndlessRound();
    } else {
        // Quiz mode
        endlessCounterEl.classList.remove('visible');
        endlessScoreEl.style.display = 'none';
        countdownBar.style.display = 'none';
        selectionMode.style.display = 'none';
        mcContainer.style.display = 'flex';
        startQuizGame();
    }
}

function resetBoard() {
    guessesHistory = [];
    gameOver = false;
    lastGameWon = false;
    hintsUsed = 0;
    hintCountEl.textContent = '2';
    hintBox.style.display = 'none';
    guessesContainer.innerHTML = '';
    inputEl.disabled = false;
    btnGuess.disabled = false;
    inputEl.value = '';
    suggestionsEl.style.display = 'none';
    currentMatches = [];
    suggestionActiveIndex = -1;
    flagImage.classList.remove('revealed');
    flagImage.classList.add('loading');
    btnNextRound.style.display = 'none';
    btnNextRoundLose.style.display = 'none';
}

function setFlag(country) {
    if (!country) return;
    flagImage.classList.add('loading');
    flagImage.src = `${FLAG_CDN}${country.code.toLowerCase()}.png`;
    flagImage.onload = () => {
        flagImage.classList.remove('loading');
    };
    flagImage.onerror = () => {
        flagImage.classList.remove('loading');
        flagImage.src = '';
    };
}

function startEndlessRound() {
    resetBoard();
    const available = COUNTRIES.filter(c => !endlessUsedCountries.has(c.name));
    if (available.length === 0) {
        endlessUsedCountries.clear();
        TARGET_COUNTRY = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
    } else {
        TARGET_COUNTRY = available[Math.floor(Math.random() * available.length)];
    }
    endlessUsedCountries.add(TARGET_COUNTRY.name);
    endlessRoundEl.textContent = endlessRound;
    endlessWinsEl.textContent = endlessWins;
    endlessStreakEl.textContent = endlessStreak;
    setFlag(TARGET_COUNTRY);
    toastEl.textContent = `Endless Round ${endlessRound}! Guess the mystery country!`;
}

function resetToDaily() {
    resetBoard();
    const now = new Date();
    const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    TARGET_COUNTRY = COUNTRIES[seed % COUNTRIES.length];
    setFlag(TARGET_COUNTRY);
    restoreProgress();
    if (!gameOver) {
        toastEl.textContent = "Guess today's mystery country!";
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

btnMcMode.addEventListener('click', () => {
    if (gameMode === 'quiz') return;
    setGameMode('quiz');
});

// --- Quiz Mode ---
function startQuizGame() {
    quizRound = 1;
    quizScore = 0;
    quizStreak = 0;
    quizAnswered = false;
    mcRoundEl.textContent = quizRound;
    mcTotalEl.textContent = quizTotal;
    mcScoreEl.textContent = quizScore;
    mcStreakEl.textContent = quizStreak;
    mcFeedback.textContent = 'Pick the correct country!';
    loadQuizRound();
}

function loadQuizRound() {
    quizAnswered = false;
    mcRoundEl.textContent = quizRound;
    mcGrid.innerHTML = '';

    // Pick target
    TARGET_COUNTRY = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
    setFlag(TARGET_COUNTRY);

    // Pick 3 distractors
    const distractors = COUNTRIES.filter(c => c.name !== TARGET_COUNTRY.name);
    const shuffled = [...distractors].sort(() => Math.random() - 0.5).slice(0, 3);
    const options = [TARGET_COUNTRY, ...shuffled].sort(() => Math.random() - 0.5);

    options.forEach(country => {
        const btn = document.createElement('button');
        btn.className = 'mc-btn';
        btn.dataset.name = country.name;

        const span = document.createElement('span');
        span.textContent = country.name;

        btn.appendChild(span);
        btn.addEventListener('click', () => handleQuizAnswer(country, btn));
        mcGrid.appendChild(btn);
    });
}

function handleQuizAnswer(country, btn) {
    if (quizAnswered) return;
    initAudio();
    quizAnswered = true;

    const isCorrect = country.name === TARGET_COUNTRY.name;
    const allBtns = mcGrid.querySelectorAll('.mc-btn');

    allBtns.forEach(b => {
        b.disabled = true;
        if (b.dataset.name === TARGET_COUNTRY.name) {
            b.classList.add('correct');
        }
    });

    if (isCorrect) {
        btn.classList.add('correct');
        quizScore++;
        quizStreak++;
        mcScoreEl.textContent = quizScore;
        mcStreakEl.textContent = quizStreak;
        mcFeedback.textContent = `✅ Correct! ${TARGET_COUNTRY.name}`;
        Sound.win();
    } else {
        btn.classList.add('wrong');
        quizStreak = 0;
        mcStreakEl.textContent = quizStreak;
        mcFeedback.textContent = `❌ Wrong! It was ${TARGET_COUNTRY.name}`;
        Sound.lose();
    }

    setTimeout(() => {
        quizRound++;
        if (quizRound > quizTotal) {
            endQuizGame();
        } else {
            loadQuizRound();
        }
    }, 1500);
}

function endQuizGame() {
    mcFeedback.textContent = `Quiz Complete! Final Score: ${quizScore}/${quizTotal}`;
    flagImage.classList.add('revealed');

    if (quizScore >= 7) {
        Sound.win();
        runConfetti();
    }

    // Show result in modal
    winFlagImg.src = `${FLAG_CDN}${TARGET_COUNTRY.code.toLowerCase()}.png`;
    winName.textContent = TARGET_COUNTRY.name;
    winCapital.textContent = TARGET_COUNTRY.capital;
    winContinent.textContent = TARGET_COUNTRY.continent;
    winPopulation.textContent = TARGET_COUNTRY.population;
    winGuesses.textContent = `${quizScore}/${quizTotal}`;
    btnNextRound.style.display = 'block';
    btnNextRound.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Play Again';
    btnNextRound.onclick = () => {
        btnNextRound.onclick = null;
        btnNextRound.style.display = 'none';
        startQuizGame();
    };
    showModal(victoryModal);
}

// --- Hints ---
function useHint() {
    if (gameOver || !TARGET_COUNTRY) return;
    if (gameMode === 'quiz') return;
    if (hintsUsed >= 2) {
        toastEl.textContent = "No hints remaining!";
        return;
    }
    initAudio();
    hintsUsed++;
    hintCountEl.textContent = 2 - hintsUsed;
    Sound.hint();

    if (hintsUsed === 1) {
        hintBox.style.display = 'block';
        hintBox.innerHTML = `<i class="fa-solid fa-lightbulb"></i> <strong>Hint 1:</strong> This country is in <strong>${TARGET_COUNTRY.continent}</strong>`;
    } else if (hintsUsed === 2) {
        hintBox.style.display = 'block';
        hintBox.innerHTML = `<i class="fa-solid fa-lightbulb"></i> <strong>Hint 2:</strong> Capital is <strong>${TARGET_COUNTRY.capital}</strong> and starts with '<strong>${TARGET_COUNTRY.name.charAt(0)}</strong>'`;
    }
    if (gameMode === 'daily') saveProgress(false);
}

btnHint.addEventListener('click', useHint);

// --- Autocomplete ---
function handleAutocomplete() {
    const val = inputEl.value.toLowerCase().trim();
    suggestionsEl.innerHTML = '';

    if (!val || COUNTRIES.length === 0) {
        currentMatches = [];
        suggestionsEl.style.display = 'none';
        return;
    }

    // 1. Filter all countries that contain the string
    // 2. Sort them so "startsWith" matches appear first
    // 3. Take the top 8
    currentMatches = COUNTRIES.filter(c => 
        c.name.toLowerCase().includes(val)
    ).sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aStarts = aName.startsWith(val);
        const bStarts = bName.startsWith(val);

        // Put countries that START with the value at the top
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        // If both start with it, or both only contain it, sort alphabetically
        return aName.localeCompare(bName);
    }).slice(0, 8);

    if (currentMatches.length > 0) {
        suggestionsEl.style.display = 'block';
        currentMatches.forEach((c, idx) => {
            const div = document.createElement('div');
            div.className = `suggestion-item ${idx === 0 ? 'active' : ''}`;
            div.setAttribute('role', 'option');
            div.dataset.index = idx;

            const info = document.createElement('div');
            info.className = 'suggestion-info';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = c.name;

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
                selectCountry(c.name);
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

function selectCountry(name) {
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
        selectCountry(currentMatches[idx].name);
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
            selectCountry(currentMatches[suggestionActiveIndex].name);
        } else {
            submitGuess();
        }
    }
});

inputEl.addEventListener('input', handleAutocomplete);

// --- Guess Submission ---
function normalizeName(name) {
    if (!name) return '';
    return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function submitGuess() {
    if (gameOver || !TARGET_COUNTRY) return;
    initAudio();

    const val = inputEl.value.trim();
    if (!val) {
        toastEl.textContent = 'Please enter a country name.';
        triggerShake();
        return;
    }

    let guessedCountry = COUNTRIES.find(c => normalizeName(c.name) === normalizeName(val));

    if (!guessedCountry) guessedCountry = COUNTRIES.find(c => c.name.toLowerCase() === val.toLowerCase());

    if (!guessedCountry) guessedCountry = COUNTRIES.find(c => c.name.toLowerCase().startsWith(val.toLowerCase()) || c.name.toLowerCase().includes(val.toLowerCase()));

    if (!guessedCountry && currentMatches.length > 0) {
        const idx = suggestionActiveIndex >= 0 ? suggestionActiveIndex : 0;
        guessedCountry = currentMatches[idx];
    }

    if (!guessedCountry) {
        toastEl.textContent = "Country not found!";
        triggerShake();
        return;
    }

    if (guessesHistory.some(g => g.name === guessedCountry.name)) {
        toastEl.textContent = "Already Guessed!";
        triggerShake();
        return;
    }

    const isCorrect = guessedCountry.name === TARGET_COUNTRY.name;
    const guessData = { name: guessedCountry.name, isCorrect };
    guessesHistory.push(guessData);
    renderGuessRow(guessData);
    Sound.guess();

    inputEl.value = '';
    suggestionsEl.style.display = 'none';

    if (isCorrect) {
        gameOver = true;
        lastGameWon = true;
        Sound.win();
        toastEl.textContent = `Splendid! Flag Guessr Solved!`;
        inputEl.disabled = true;
        btnGuess.disabled = true;
        flagImage.classList.add('revealed');

        if (gameMode === 'daily') {
            saveProgress(true);
            recordGameResult(true, guessesHistory.length);
        } else if (gameMode === 'endless') {
            endlessWins++;
            endlessStreak++;
            endlessWinsEl.textContent = endlessWins;
            endlessStreakEl.textContent = endlessStreak;
        }

        triggerVictoryModal(TARGET_COUNTRY);
    } else if (guessesHistory.length >= MAX_GUESSES) {
        gameOver = true;
        lastGameWon = false;
        Sound.lose();
        toastEl.textContent = `Game Over! Country was: ${TARGET_COUNTRY.name}`;
        inputEl.disabled = true;
        btnGuess.disabled = true;
        flagImage.classList.add('revealed');

        if (gameMode === 'daily') {
            saveProgress(false);
            recordGameResult(false, 0);
        } else if (gameMode === 'endless') {
            endlessStreak = 0;
            endlessStreakEl.textContent = 0;
        }

        triggerGameOverModal(TARGET_COUNTRY);
    } else {
        toastEl.textContent = `Guess recorded! ${MAX_GUESSES - guessesHistory.length} attempts left.`;
        if (gameMode === 'daily') saveProgress(false);
    }
}

btnGuess.addEventListener('click', submitGuess);

function renderGuessRow(guess) {
    const row = document.createElement('div');
    row.className = 'guess-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'guess-country';
    nameSpan.textContent = guess.name;

    const status = document.createElement('span');
    status.className = `guess-status ${guess.isCorrect ? 'correct' : 'wrong'}`;
    status.textContent = guess.isCorrect ? '✅ CORRECT' : '❌ WRONG';

    row.appendChild(nameSpan);
    row.appendChild(status);
    guessesContainer.prepend(row);
}

// --- Victory Modal ---
function triggerVictoryModal(country) {
    if (!country) return;

    winFlagImg.src = `${FLAG_CDN}${country.code.toLowerCase()}.png`;
    winName.textContent = country.name;
    winCapital.textContent = country.capital;
    winContinent.textContent = country.continent;
    winPopulation.textContent = country.population;
    winGuesses.textContent = guessesHistory.length;

    const stats = getStats();
    renderGuessDistribution(guessDistributionEl, stats, guessesHistory.length);

    if (gameMode === 'endless') {
        btnNextRound.style.display = 'block';
        btnNextRound.innerHTML = '<i class="fa-solid fa-forward"></i> Next Round';
        btnNextRound.onclick = () => {
            btnNextRound.onclick = null;
            btnNextRound.style.display = 'none';
            hideModal(victoryModal);
            if (confettiAnimId) {
                cancelAnimationFrame(confettiAnimId);
                confettiAnimId = null;
            }
            endlessRound++;
            startEndlessRound();
        };
    }

    showModal(victoryModal);
    runConfetti();
}

// --- Game Over Modal ---
function triggerGameOverModal(country) {
    if (!country) return;

    loseFlagImg.src = `${FLAG_CDN}${country.code.toLowerCase()}.png`;
    loseName.textContent = country.name;
    loseCapital.textContent = country.capital;
    loseContinent.textContent = country.continent;
    losePopulation.textContent = country.population;
    loseCode.textContent = country.code;

    if (gameMode === 'endless') {
        btnNextRoundLose.style.display = 'block';
        btnNextRoundLose.innerHTML = '<i class="fa-solid fa-forward"></i> Next Round';
        btnNextRoundLose.onclick = () => {
            btnNextRoundLose.onclick = null;
            btnNextRoundLose.style.display = 'none';
            hideModal(gameoverModal);
            endlessRound++;
            startEndlessRound();
        };
    }

    showModal(gameoverModal);
}

btnCloseLose.addEventListener('click', () => hideModal(gameoverModal));
btnShareLose.addEventListener('click', () => shareResults(btnShareLose, false));

// --- Save / Restore ---
function restoreProgress() {
    if (gameMode !== 'daily') return;
    const saved = JSON.parse(localStorage.getItem(`flagguessr_save_${TODAY_DATE_STR}`));
    if (!saved) return;
    guessesHistory = saved.history || [];
    gameOver = saved.gameOver;
    hintsUsed = saved.hintsUsed || 0;
    hintCountEl.textContent = 2 - hintsUsed;
    if (saved.hintText) {
        hintBox.style.display = 'block';
        hintBox.innerHTML = saved.hintText;
    }

    guessesHistory.forEach(guess => {
        renderGuessRow(guess);
    });

    if (gameOver) {
        inputEl.disabled = true;
        btnGuess.disabled = true;
        flagImage.classList.add('revealed');
        toastEl.textContent = saved.passed ? "Daily Flag Guessr Solved!" : `Mystery Country was: ${TARGET_COUNTRY.name}`;
    }
}

function saveProgress(passed) {
    if (gameMode !== 'daily') return;
    localStorage.setItem(`flagguessr_save_${TODAY_DATE_STR}`, JSON.stringify({
        date: TODAY_DATE_STR,
        history: guessesHistory,
        gameOver: gameOver,
        passed: passed,
        hintsUsed: hintsUsed,
        hintText: hintBox.innerHTML
    }));
}

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
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

// --- Data Loading ---
async function fetchFlagsData() {
    try {
        const res = await fetch(FLAGS_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        COUNTRIES = Object.keys(data).map(key => {
            const c = data[key];
            return {
                id: key,
                name: c.name,
                code: c.code,
                continent: c.continent,
                capital: c.capital,
                population: c.population
            };
        }).sort((a, b) => a.name.localeCompare(b.name));

        if (!COUNTRIES || COUNTRIES.length === 0) {
            throw new Error('No countries loaded from ' + FLAGS_URL);
        }

        inputEl.placeholder = "Enter country name...";
        toastEl.textContent = "Guess today's mystery country!";
        updateStatsDisplay();
        updateCountdown();
        setInterval(updateCountdown, 1000);
        resetToDaily();
    } catch (err) {
        console.error('Failed to load flags data:', err);
        toastEl.textContent = "Error loading flag data. Check console for details.";
        inputEl.disabled = true;
        btnGuess.disabled = true;
    }
}

// --- Init ---
updateSfxButton();
fetchFlagsData();