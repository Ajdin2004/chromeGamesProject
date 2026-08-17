// ============================================================
//  IMDb Rating Rumble
//  Guess which movie has the higher IMDb rating (or guess the rating!)
// ============================================================

const DATA_URL = '../data/moviedle_data.json';
const ROUNDS_PER_GAME = 10;
const STORAGE_KEY = 'imdb_rumble_stats';

// ---------------- Web Audio Synthesizer ----------------
let audioCtx = null;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

const Sound = {
    correct() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.setValueAtTime(659, now + 0.1);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.25);
    },
    wrong() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.2);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.25);
    },
    click() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(700, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.08);
    }
};

// ---------------- State ----------------
let MOVIES = [];
let currentPair = null;
let round = 1;
let score = 0;
let streak = 0;
let bestStreak = 0;
let totalCorrect = 0;
let totalWrong = 0;
let answeredThisRound = false;
let gameActive = true;
let currentBatch = [];
let currentMode = 'duel'; // 'duel' | 'guess' | 'daily'
let currentDifficulty = 'normal';
let dailyDate = '';

// Guess-the-rating state
let guessMovie = null;
let guessAttempts = 0;
const MAX_GUESS_ATTEMPTS = 5;

// ---------------- DOM Elements ----------------
const vsContainer = document.getElementById('vs-container');
const resultBox = document.getElementById('result-box');
const resultTitle = document.getElementById('result-title');
const resultDetail = document.getElementById('result-detail');
const btnNext = document.getElementById('btn-next');
const toastEl = document.getElementById('toast');
const scoreVal = document.getElementById('score-val');
const streakVal = document.getElementById('streak-val');
const roundVal = document.getElementById('round-val');
const modeBtns = document.querySelectorAll('.mode-btn');
const difficultyBtns = document.querySelectorAll('.difficulty-btn');
const statsBtn = document.getElementById('stats-btn');
const statsModal = document.getElementById('stats-modal');
const closeStatsBtn = document.getElementById('close-stats-btn');
const resetStatsBtn = document.getElementById('reset-stats-btn');
const guessInput = document.getElementById('guess-input');
const guessSubmit = document.getElementById('guess-submit');
const guessFeedback = document.getElementById('guess-feedback');
const guessHistory = document.getElementById('guess-history');

// ---------------- Utilities ----------------
function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function parseRating(movie) {
    const r = parseFloat(movie.imdbRating);
    return isNaN(r) ? null : r;
}

function formatRating(r) {
    if (r === null || r === undefined || isNaN(r)) return 'N/A';
    return r.toFixed(1);
}

function starsHTML(rating) {
    if (rating === null || rating === undefined || isNaN(rating)) {
        return '<span class="stars stars-empty">No rating</span>';
    }
    const full = Math.round(rating / 2); // out of 5
    let html = '<span class="stars">';
    for (let i = 1; i <= 5; i++) {
        html += `<i class="fa-star ${i <= full ? 'fas' : 'far'}"></i>`;
    }
    html += `</span>`;
    return html;
}

function getTodayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Deterministic hash for daily seed
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

// ---------------- Stats ----------------
function getStats() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultStats();
    } catch (e) {
        return defaultStats();
    }
}

function defaultStats() {
    return {
        gamesPlayed: 0,
        wins: 0,
        totalCorrect: 0,
        totalWrong: 0,
        bestStreak: 0,
        dailyStreak: 0,
        lastDaily: '',
        guessGamesPlayed: 0,
        guessTotalGuesses: 0,
        guessBestScore: null
    };
}

function saveStats(stats) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

function updateStatsUI() {
    const stats = getStats();
    bestStreak = Math.max(bestStreak, stats.bestStreak);
    streakVal.textContent = streak;
    scoreVal.textContent = score;
}

// ---------------- Data Loading ----------------
async function loadMovies() {
    try {
        const res = await fetch(DATA_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        MOVIES = Object.values(data)
            .map(m => ({ ...m, rating: parseRating(m) }))
            .filter(m => m.rating !== null && m.rating > 0);
        if (MOVIES.length < 2) throw new Error('Not enough movies');
        init();
    } catch (err) {
        console.error('Failed to load movie data:', err);
        toastEl.textContent = 'Failed to load movie data. Please refresh.';
    }
}

// ---------------- Init ----------------
function init() {
    // Load best streak
    const stats = getStats();
    bestStreak = stats.bestStreak || 0;

    // Event listeners
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.mode === currentMode) return;
            Sound.click();
            modeBtns.forEach(b => b.classList.toggle('active', b === btn));
            currentMode = btn.dataset.mode;
            document.body.dataset.mode = currentMode;
            // Toggle difficulty visibility
            document.querySelector('.difficulty-selector').style.display = currentMode === 'daily' ? 'none' : 'flex';
            startGame();
        });
    });

    difficultyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            Sound.click();
            difficultyBtns.forEach(b => b.classList.toggle('active', b === btn));
            currentDifficulty = btn.dataset.difficulty;
            startGame();
        });
    });

    statsBtn.addEventListener('click', () => {
        Sound.click();
        renderStats();
        statsModal.classList.remove('hidden');
    });
    closeStatsBtn.addEventListener('click', () => statsModal.classList.add('hidden'));
    statsModal.addEventListener('click', (e) => { if (e.target === statsModal) statsModal.classList.add('hidden'); });
    resetStatsBtn.addEventListener('click', () => {
        if (confirm('Reset all stats?')) {
            localStorage.removeItem(STORAGE_KEY);
            renderStats();
            toastEl.textContent = 'Stats reset!';
        }
    });

    guessSubmit.addEventListener('click', handleGuessSubmit);
    guessInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleGuessSubmit(); });

    startGame();
}

// ---------------- Game Start ----------------
function startGame() {
    if (MOVIES.length < 2) return;

    round = 1;
    score = 0;
    streak = 0;
    totalCorrect = 0;
    totalWrong = 0;
    gameActive = true;
    answeredThisRound = false;

    if (currentMode === 'daily') {
        dailyDate = getTodayStr();
        setupDaily();
        return;
    }

    if (currentMode === 'guess') {
        setupGuessMode();
        return;
    }

    // Duel mode
    setupDuelMode();
}

function setupDuelMode() {
    // Filter movies by difficulty
    let pool = MOVIES;
    if (currentDifficulty === 'easy') {
        pool = MOVIES.filter(m => m.rating >= 7.5);
    } else if (currentDifficulty === 'hard') {
        pool = MOVIES.filter(m => m.rating >= 5.5);
    }
    if (pool.length < 2) pool = MOVIES;

    currentBatch = shuffleArray(pool);
    if (currentBatch.length < ROUNDS_PER_GAME * 2) {
        currentBatch = shuffleArray(pool.concat(pool));
    }

    scoreVal.textContent = score;
    streakVal.textContent = streak;
    roundVal.textContent = round;

    loadNextRound();
    toastEl.textContent = 'Which movie has the higher IMDb rating?';
}

function setupDaily() {
    // Deterministic daily selection
    const seed = hashString(dailyDate);
    const dailyMovies = [...MOVIES].sort((a, b) => hashString(a.title + dailyDate) - hashString(b.title + dailyDate));
    currentBatch = dailyMovies.slice(0, ROUNDS_PER_GAME * 2);

    scoreVal.textContent = score;
    streakVal.textContent = streak;
    roundVal.textContent = round;

    loadNextRound();
    toastEl.textContent = `Daily Challenge: ${dailyDate}`;
}

function setupGuessMode() {
    // Pick a random movie
    pickNewGuessMovie();
    guessAttempts = 0;
    guessHistory.innerHTML = '';
    guessFeedback.textContent = '';
    guessInput.value = '';
    guessInput.disabled = false;
    guessSubmit.disabled = false;
    guessInput.focus();

    resultBox.classList.remove('visible');
    btnNext.style.display = 'none';
    vsContainer.style.display = 'none';
    document.getElementById('guess-game').style.display = 'block';
    document.getElementById('round-info').style.display = 'none';

    toastEl.textContent = 'Guess the IMDb rating (0.0 - 10.0)';
}

function pickNewGuessMovie() {
    guessMovie = MOVIES[Math.floor(Math.random() * MOVIES.length)];
    guessAttempts = 0;
    guessHistory.innerHTML = '';
    guessFeedback.textContent = '';

    // Render the movie card
    const card = document.getElementById('guess-movie-card');
    card.innerHTML = '';

    const poster = document.createElement('img');
    poster.className = 'poster guess-poster';
    poster.src = guessMovie.poster;
    poster.alt = guessMovie.title;
    poster.onerror = () => { poster.src = ''; poster.alt = 'No poster'; };
    card.appendChild(poster);

    const info = document.createElement('div');
    info.className = 'guess-movie-info';
    info.innerHTML = `
        <div class="guess-movie-title">${guessMovie.title}</div>
        <div class="guess-movie-meta">${guessMovie.releaseVersion} · ${guessMovie.genre}</div>
        <div class="guess-movie-meta">Directed by ${guessMovie.director}</div>
    `;
    card.appendChild(info);
}

function handleGuessSubmit() {
    if (!guessMovie) return;
    const val = parseFloat(guessInput.value);
    if (isNaN(val) || val < 0 || val > 10) {
        guessFeedback.textContent = 'Enter a number between 0.0 and 10.0';
        guessFeedback.style.color = '#f87171';
        return;
    }

    guessAttempts++;
    const actual = guessMovie.rating;
    const diff = Math.abs(val - actual);
    const isCorrect = diff <= 0.5;

    // Add to history
    const row = document.createElement('div');
    row.className = 'guess-history-row';
    row.innerHTML = `<span>Guess ${guessAttempts}: <strong>${val.toFixed(1)}</strong></span><span>${isCorrect ? '🎯' : (val < actual ? '⬆️' : '⬇️')}</span>`;
    guessHistory.prepend(row);

    if (isCorrect) {
        // Win!
        guessFeedback.textContent = `Correct! ${guessMovie.title} is rated ${actual.toFixed(1)}.`;
        guessFeedback.style.color = '#4ade80';
        Sound.correct();
        const stats = getStats();
        stats.guessGamesPlayed++;
        stats.guessTotalGuesses += guessAttempts;
        if (stats.guessBestScore === null || guessAttempts < stats.guessBestScore) {
            stats.guessBestScore = guessAttempts;
        }
        saveStats(stats);
        guessInput.disabled = true;
        guessSubmit.disabled = true;
        btnNext.style.display = 'block';
        btnNext.innerHTML = '<i class="fa-solid fa-forward"></i> NEXT MOVIE';
        btnNext.onclick = () => {
            btnNext.onclick = null;
            pickNewGuessMovie();
        };
    } else if (guessAttempts >= MAX_GUESS_ATTEMPTS) {
        // Lose
        guessFeedback.textContent = `Out of guesses! It was ${actual.toFixed(1)}.`;
        guessFeedback.style.color = '#f87171';
        Sound.wrong();
        const stats = getStats();
        stats.guessGamesPlayed++;
        stats.guessTotalGuesses += guessAttempts;
        saveStats(stats);
        guessInput.disabled = true;
        guessSubmit.disabled = true;
        btnNext.style.display = 'block';
        btnNext.innerHTML = '<i class="fa-solid fa-forward"></i> NEXT MOVIE';
        btnNext.onclick = () => {
            btnNext.onclick = null;
            pickNewGuessMovie();
        };
    } else {
        guessFeedback.textContent = val < actual ? 'Too low! Try higher.' : 'Too high! Try lower.';
        guessFeedback.style.color = '#fbbf24';
        Sound.click();
    }

    guessInput.value = '';
    guessInput.focus();
}

// ---------------- Duel Mode ----------------
function loadNextRound() {
    answeredThisRound = false;
    resultBox.classList.remove('visible');
    btnNext.disabled = true;
    btnNext.style.display = 'block';
    vsContainer.style.display = 'grid';
    document.getElementById('guess-game').style.display = 'none';
    document.getElementById('round-info').style.display = 'flex';

    let idxA = (round - 1) * 2 % currentBatch.length;
    let idxB = (idxA + 1) % currentBatch.length;

    // Ensure distinct
    if (currentBatch[idxA].title === currentBatch[idxB].title) {
        idxB = (idxB + 1) % currentBatch.length;
    }

    currentPair = { a: currentBatch[idxA], b: currentBatch[idxB] };
    renderMatchup();
}

function createStyledFallbackCard(title, year) {
    const cardContainer = document.createElement('div');
    cardContainer.className = 'poster fallback-poster';
    cardContainer.innerHTML = `
        <i class="fa-solid fa-film fallback-icon"></i>
        <div class="fallback-title">${title}</div>
        <div class="fallback-year">(${year})</div>
    `;
    return cardContainer;
}

function renderMatchup() {
    if (!currentPair) return;

    vsContainer.innerHTML = '';

    const cards = [
        { movie: currentPair.a, side: 'a' },
        { movie: currentPair.b, side: 'b' }
    ];

    cards.forEach(({ movie, side }) => {
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.id = `movie-${side}`;
        card.dataset.side = side;

        // Poster
        if (movie.poster) {
            const poster = document.createElement('img');
            poster.className = 'poster';
            poster.src = movie.poster;
            poster.alt = movie.title;
            poster.loading = 'lazy';
            poster.onerror = () => {
                poster.replaceWith(createStyledFallbackCard(movie.title, movie.releaseVersion));
            };
            card.appendChild(poster);
        } else {
            card.appendChild(createStyledFallbackCard(movie.title, movie.releaseVersion));
        }

        // Title
        const title = document.createElement('div');
        title.className = 'movie-title';
        title.textContent = movie.title;
        card.appendChild(title);

        // Year + genre
        const meta = document.createElement('div');
        meta.className = 'movie-meta';
        meta.textContent = `${movie.releaseVersion} · ${(movie.genre || 'N/A').split(',')[0]}`;
        card.appendChild(meta);

        // Director
        const director = document.createElement('div');
        director.className = 'movie-director';
        director.textContent = movie.director || '';
        card.appendChild(director);

        // Stars (hidden until reveal)
        const stars = document.createElement('div');
        stars.className = 'movie-stars';
        stars.id = `stars-${side}`;
        stars.style.visibility = 'hidden';
        stars.innerHTML = starsHTML(movie.rating);
        card.appendChild(stars);

        // Rating badge (hidden until reveal)
        const ratingBadge = document.createElement('div');
        ratingBadge.className = 'rating-badge';
        ratingBadge.id = `rating-${side}`;
        ratingBadge.style.display = 'none';
        ratingBadge.innerHTML = `<i class="fa-solid fa-star"></i> ${formatRating(movie.rating)}`;
        card.appendChild(ratingBadge);

        card.addEventListener('click', () => handleGuess(side));
        vsContainer.appendChild(card);
    });

    // VS badge
    const vsBadge = document.createElement('div');
    vsBadge.className = 'vs-badge';
    vsBadge.textContent = 'VS';
    vsContainer.insertBefore(vsBadge, vsContainer.children[1]);
}

function handleGuess(side) {
    if (!gameActive || answeredThisRound || !currentPair) return;
    initAudio();

    answeredThisRound = true;

    const picked = side === 'a' ? currentPair.a : currentPair.b;
    const other = side === 'a' ? currentPair.b : currentPair.a;
    const pickedCorrect = picked.rating >= other.rating;
    const isTie = picked.rating === other.rating;

    // Reveal ratings
    ['a', 'b'].forEach(s => {
        const badge = document.getElementById(`rating-${s}`);
        if (badge) {
            badge.style.display = 'flex';
            const movie = s === 'a' ? currentPair.a : currentPair.b;
            badge.innerHTML = `<i class="fa-solid fa-star"></i> ${formatRating(movie.rating)}`;
        }
        const stars = document.getElementById(`stars-${s}`);
        if (stars) stars.style.visibility = 'visible';
    });

    document.querySelectorAll('.movie-card').forEach(c => c.classList.add('disabled'));

    const pickedCard = document.getElementById(`movie-${side}`);
    const otherCard = document.getElementById(`movie-${isTie ? side : (side === 'a' ? 'b' : 'a')}`);

    if (isTie || pickedCorrect) {
        pickedCard.classList.add('correct');
        if (!isTie) otherCard.classList.add('wrong');
        score++;
        streak++;
        totalCorrect++;
        bestStreak = Math.max(bestStreak, streak);
        resultTitle.textContent = isTie ? 'TIE! ✓' : 'CORRECT! ✓';
        resultTitle.className = 'result-title correct-text';
        resultDetail.innerHTML = `<strong>${picked.title}</strong> is rated <strong>${formatRating(picked.rating)}</strong> vs <strong>${formatRating(other.rating)}</strong> for ${other.title}.`;
        Sound.correct();
    } else {
        pickedCard.classList.add('wrong');
        otherCard.classList.add('correct');
        streak = 0;
        totalWrong++;
        resultTitle.textContent = 'WRONG! ✗';
        resultTitle.className = 'result-title';
        resultTitle.style.color = 'var(--secondary-red)';
        resultDetail.innerHTML = `<strong>${other.title}</strong> is rated <strong>${formatRating(other.rating)}</strong> vs <strong>${formatRating(picked.rating)}</strong> for ${picked.title}.`;
        Sound.wrong();
    }

    scoreVal.textContent = score;
    streakVal.textContent = streak;

    resultBox.classList.add('visible');
    btnNext.disabled = false;
}

btnNext.addEventListener('click', () => {
    if (currentMode === 'guess') return; // handled separately
    round++;
    if (round > ROUNDS_PER_GAME) {
        gameActive = false;
        endGame();
        return;
    }
    roundVal.textContent = round;
    loadNextRound();
});

function endGame() {
    resultTitle.textContent = 'GAME COMPLETE!';
    resultTitle.className = 'result-title overall-text';
    resultDetail.innerHTML = `
        <div><strong>Final Score:</strong> ${score} / ${ROUNDS_PER_GAME}</div>
        <div><strong>Correct:</strong> ${totalCorrect} &nbsp;|&nbsp; <strong>Wrong:</strong> ${totalWrong}</div>
        <div><strong>Best Streak:</strong> ${bestStreak}</div>
    `;

    // Update stats
    const stats = getStats();
    stats.gamesPlayed++;
    if (score >= 8) stats.wins++;
    stats.totalCorrect += totalCorrect;
    stats.totalWrong += totalWrong;
    stats.bestStreak = Math.max(stats.bestStreak, bestStreak);
    if (currentMode === 'daily') {
        if (stats.lastDaily === dailyDate) {
            // Already played today
        } else {
            stats.lastDaily = dailyDate;
            if (score >= 8) stats.dailyStreak++;
            else stats.dailyStreak = 0;
        }
    }
    saveStats(stats);

    btnNext.innerHTML = '<i class="fa-solid fa-rotate-right"></i> PLAY AGAIN';
    btnNext.onclick = () => {
        btnNext.onclick = null;
        btnNext.innerHTML = '<i class="fa-solid fa-forward"></i> NEXT MATCHUP';
        btnNext.disabled = true;
        startGame();
    };

    toastEl.textContent = 'Great job! Tap PLAY AGAIN to start a new game.';

    // Confetti burst if score >= 8/10
    if (score >= 8) {
        try { runConfetti(); } catch (e) { /* ignore */ }
    }
}

// ---------------- Stats Modal ----------------
function renderStats() {
    const stats = getStats();
    const total = stats.totalCorrect + stats.totalWrong;
    const accuracy = total > 0 ? Math.round((stats.totalCorrect / total) * 100) : 0;
    const winRate = stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0;

    document.getElementById('stat-games').textContent = stats.gamesPlayed;
    document.getElementById('stat-wins').textContent = stats.wins;
    document.getElementById('stat-winrate').textContent = winRate + '%';
    document.getElementById('stat-accuracy').textContent = accuracy + '%';
    document.getElementById('stat-beststreak').textContent = stats.bestStreak;
    document.getElementById('stat-dailystreak').textContent = stats.dailyStreak;
    document.getElementById('stat-guessgames').textContent = stats.guessGamesPlayed;
    document.getElementById('stat-guessbest').textContent = stats.guessBestScore !== null ? stats.guessBestScore : '—';
}

// ---------------- Confetti ----------------
function runConfetti() {
    const confettiColors = ['#f5c518', '#00f2fe', '#ef4444', '#22c55e', '#a855f7', '#06b6d4'];
    const count = 60;
    const durations = [2500, 2000, 3000, 2800, 3500];

    for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        const size = Math.random() * 12 + 6;
        const color = confettiColors[Math.floor(Math.random() * confettiColors.length)];
        const duration = durations[Math.floor(Math.random() * durations.length)];

        el.style.cssText = `
            position: fixed;
            top: -20px;
            left: ${Math.random() * 100}vw;
            width: ${size}px;
            height: ${size * 0.6}px;
            background: ${color};
            border-radius: 2px;
            z-index: 9999;
            pointer-events: none;
            opacity: 0.9;
            transform: rotate(${Math.random() * 360}deg);
            animation: boxConfetti ${duration}ms ease-out forwards;
        `;

        document.body.appendChild(el);
        setTimeout(() => el.remove(), duration);
    }

    if (!document.getElementById('box-confetti-keyframes')) {
        const style = document.createElement('style');
        style.id = 'box-confetti-keyframes';
        style.textContent = `
            @keyframes boxConfetti {
                0% { transform: translateY(0) rotate(0deg); opacity: 0.9; }
                100% { transform: translateY(105vh) rotate(720deg); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
}

// ---------------- Start ----------------
loadMovies();
