// --- Box Office Showdown ---
// Guess which movie earned more at the worldwide box office.

const MOVIES_URL = './data/movies_boxoffice.json';
const ROUNDS_PER_GAME = 10;
const TOTAL_MATCHUP_POOL = 2 * ROUNDS_PER_GAME; // 20 distinct movies per full game

// Web Audio Synthesizer for sound effects
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
    }
};

// State
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

// DOM Elements
const vsContainer = document.getElementById('vs-container');
const resultBox = document.getElementById('result-box');
const resultTitle = document.getElementById('result-title');
const resultDetail = document.getElementById('result-detail');
const btnNext = document.getElementById('btn-next');
const toastEl = document.getElementById('toast');
const scoreVal = document.getElementById('score-val');
const streakVal = document.getElementById('streak-val');
const roundVal = document.getElementById('round-val');

// Load best streak from localStorage
bestStreak = parseInt(localStorage.getItem('boxoffice_best_streak') || '0', 10);

function formatMoney(amount) {
    return '$' + (amount / 1_000_000_000).toFixed(2) + 'B';
}

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Function to fetch top box office movies directly from Wikidata
async function fetchWikidataMovies() {
    toastEl.textContent = "Querying live movie data from Wikidata...";

    // SPARQL Query: Get top 50 films with box office gross, release year, and image/poster
    const sparqlQuery = `
        SELECT DISTINCT ?filmLabel ?year ?boxoffice ?image WHERE {
          ?film wdt:P31 wd:Q11424;           # Must be a film
                wdt:P2142 ?boxoffice;         # Has box office gross
                wdt:P577 ?pubdate.            # Has publication date

          OPTIONAL { ?film wdt:P18 ?image. }  # Optional Wikidata image/poster

          BIND(YEAR(?pubdate) AS ?year)

          SERVICE wikibase:label { 
            bd:serviceParam wikibase:language "en". 
          }
        }
        ORDER BY DESC(?boxoffice)
        LIMIT 50
    `;

    const endpointUrl = 'https://query.wikidata.org/sparql?query=' + encodeURIComponent(sparqlQuery);

    try {
        const response = await fetch(endpointUrl, {
            headers: { 'Accept': 'application/sparql-results+json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // Parse Wikidata triples into your existing game format
        MOVIES = data.results.bindings.map(item => ({
            title: item.filmLabel.value,
            year: parseInt(item.year.value, 10),
            worldwide: parseFloat(item.boxoffice.value),
            // Convert HTTP image links to HTTPS to avoid mixed content errors
            poster: item.image ? item.image.value.replace('http://', 'https://') : ''
        }));

        if (MOVIES.length >= 2) {
            startGame();
        } else {
            toastEl.textContent = "Not enough movie records retrieved from Wikidata.";
        }
    } catch (err) {
        console.error("Wikidata query failed:", err);
        toastEl.textContent = "Failed to fetch Wikidata! Check your network connection.";
    }
}

// Call the Wikidata fetch function instead of local JSON loading
fetchWikidataMovies();

function startGame() {
    if (MOVIES.length < 2) {
        toastEl.textContent = "Not enough movies in dataset!";
        return;
    }

    // Ensure we have enough movies - dynamically build pool
    currentBatch = shuffleArray(MOVIES);
    if (currentBatch.length < TOTAL_MATCHUP_POOL) {
        currentBatch = shuffleArray(MOVIES.concat(MOVIES));
    }

    round = 1;
    score = 0;
    streak = 0;
    totalCorrect = 0;
    totalWrong = 0;
    gameActive = true;
    answeredThisRound = false;

    scoreVal.textContent = score;
    streakVal.textContent = streak;
    roundVal.textContent = round;

    loadNextRound();
    toastEl.textContent = 'Which movie earned more at the worldwide box office?';
}

function loadNextRound() {
    answeredThisRound = false;
    resultBox.classList.remove('visible');
    btnNext.disabled = true;

    // Select two distinct movies from the batch
    let idxA = (round - 1) * 2 % currentBatch.length;
    let idxB = (idxA + 1) % currentBatch.length;

    // Ensure distinct
    if (currentBatch[idxA].title === currentBatch[idxB].title) {
        idxB = (idxB + 1) % currentBatch.length;
    }

    currentPair = {
        a: currentBatch[idxA],
        b: currentBatch[idxB]
    };

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

        // Handle poster image vs fallback cleanly
        if (movie.poster) {
            const poster = document.createElement('img');
            poster.className = 'poster';
            poster.src = movie.poster;
            poster.alt = movie.title;
            poster.onerror = () => {
                // If link fails at runtime, replace img element directly
                poster.replaceWith(createStyledFallbackCard(movie.title, movie.year));
            };
            card.appendChild(poster);
        } else {
            // Append fallback card immediately when no poster URL exists
            card.appendChild(createStyledFallbackCard(movie.title, movie.year));
        }

        const title = document.createElement('div');
        title.className = 'movie-title';
        title.textContent = movie.title;

        const year = document.createElement('div');
        year.className = 'movie-year';
        year.textContent = `(${movie.year})`;

        card.appendChild(title);
        card.appendChild(year);

        card.addEventListener('click', () => handleGuess(side));

        vsContainer.appendChild(card);
    });

    // VS badge in the middle
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
    const pickedCorrect = picked.worldwide >= other.worldwide;
    const isTie = picked.worldwide === other.worldwide;

    // Disable both card clicks
    document.querySelectorAll('.movie-card').forEach(c => c.classList.add('disabled'));

    const pickedCard = document.getElementById(`movie-${side}`);
    const otherCard = document.getElementById(`movie-${isTie ? side : (side === 'a' ? 'b' : 'a')}`);

    if (isTie) {
        // Tie counts as correct for the player
        pickedCard.classList.add('correct');
        score++;
        streak++;
        totalCorrect++;
        bestStreak = Math.max(bestStreak, streak);
        localStorage.setItem('boxoffice_best_streak', bestStreak);
        resultTitle.textContent = 'TIE! ✓';
        resultTitle.className = 'result-title correct-text';
        resultDetail.innerHTML = `<strong>${picked.title}</strong> and <strong>${other.title}</strong> both earned <strong>${formatMoney(picked.worldwide)}</strong>! Point awarded.`;
        Sound.correct();
    } else {
        if (pickedCorrect) {
            pickedCard.classList.add('correct');
            otherCard.classList.add('wrong');
            score++;
            streak++;
            totalCorrect++;
            bestStreak = Math.max(bestStreak, streak);
            localStorage.setItem('boxoffice_best_streak', bestStreak);
            resultTitle.textContent = 'CORRECT! ✓';
            resultTitle.className = 'result-title correct-text';
            resultDetail.innerHTML = `<strong>${picked.title}</strong> earned <strong>${formatMoney(picked.worldwide)}</strong> vs <strong>${formatMoney(other.worldwide)}</strong> for ${other.title}.`;
            Sound.correct();
        } else {
            pickedCard.classList.add('wrong');
            otherCard.classList.add('correct');
            streak = 0;
            totalWrong++;
            resultTitle.textContent = 'WRONG! ✗';
            resultTitle.className = 'result-title';
            resultTitle.style.color = 'var(--secondary-red)';
            resultDetail.innerHTML = `<strong>${other.title}</strong> actually earned more: <strong>${formatMoney(other.worldwide)}</strong> vs <strong>${formatMoney(picked.worldwide)}</strong> for ${picked.title}.`;
            Sound.wrong();
        }
    }

    scoreVal.textContent = score;
    streakVal.textContent = streak;

    // Show result
    resultBox.classList.add('visible');
    btnNext.disabled = false;
}

btnNext.addEventListener('click', () => {
    round++;
    if (round > ROUNDS_PER_GAME) {
        // Game complete
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

// Lightweight confetti for high scores
function runConfetti() {
    const confettiColors = ['#facc15', '#00f2fe', '#ef4444', '#22c55e', '#a855f7', '#06b6d4'];
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

    // Inject keyframe if not present
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

// Start
fetchWikidataMovies()

