// --- Video Game Showdown ---
// Guess which video game sold more copies worldwide.

const ROUNDS_PER_GAME = 10;
const TOTAL_MATCHUP_POOL = 2 * ROUNDS_PER_GAME;

// Sound Synthesizer
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

// Game State
let GAMES = [];
let currentPair = null;
let round = 1;
let score = 0;
let streak = 0;
let bestStreak = parseInt(localStorage.getItem('vg_best_streak') || '0', 10);
let totalCorrect = 0;
let totalWrong = 0;
let answeredThisRound = false;
let gameActive = true;
let currentBatch = [];

// Poster cache to avoid repeated API calls for the same game
const posterCache = new Map();

// Fetch a game poster directly from the Wikipedia API (supports CORS, no key needed)
async function fetchGamePoster(title) {
    if (posterCache.has(title)) return posterCache.get(title);

    try {
        const response = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&pithumbsize=600&origin=*`);
        const data = await response.json();
        const pages = data.query && data.query.pages ? data.query.pages : {};
        let posterUrl = null;

        for (const pageId in pages) {
            const page = pages[pageId];
            if (page.thumbnail && page.thumbnail.source) {
                posterUrl = page.thumbnail.source;
                break;
            }
        }

        posterCache.set(title, posterUrl);
        return posterUrl;
    } catch (err) {
        console.error('Error fetching game poster:', err);
        posterCache.set(title, null);
        return null;
    }
}

// Elements
const vsContainer = document.getElementById('vs-container');
const resultBox = document.getElementById('result-box');
const resultTitle = document.getElementById('result-title');
const resultDetail = document.getElementById('result-detail');
const btnNext = document.getElementById('btn-next');
const toastEl = document.getElementById('toast');
const scoreVal = document.getElementById('score-val');
const streakVal = document.getElementById('streak-val');
const roundVal = document.getElementById('round-val');

function formatCopies(amount) {
    if (amount >= 1_000_000) {
        return (amount / 1_000_000).toFixed(1) + 'M copies';
    }
    return amount.toLocaleString() + ' copies';
}

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function createStyledFallbackCard(title, year) {
    const cardContainer = document.createElement('div');
    cardContainer.className = 'poster fallback-poster';
    cardContainer.innerHTML = `
        <i class="fa-solid fa-gamepad fallback-icon"></i>
        <div class="fallback-title">${title}</div>
        <div class="fallback-year">(${year})</div>
    `;
    return cardContainer;
}

async function fetchWikidataGames() {
    toastEl.textContent = "Loading top video games from Wikidata...";

    // SPARQL Query: Forces an explicit English language label (lang(?gameLabel) = "en")
    const sparqlQuery = `
        SELECT DISTINCT ?gameLabel ?year ?unitsSold ?image WHERE {
          ?game wdt:P31 wd:Q7889;                          # Instance of video game
                wdt:P2664 ?unitsSold;                      # Units sold
                rdfs:label ?gameLabel.                     # Fetch direct label

          # Force the label language strictly to English
          FILTER(LANG(?gameLabel) = "en")

          OPTIONAL { ?game wdt:P18 ?image. }
          OPTIONAL { 
            ?game wdt:P577 ?pubdate. 
            BIND(YEAR(?pubdate) AS ?rawYear)
          }

          BIND(COALESCE(?rawYear, 2020) AS ?year)
        }
        ORDER BY DESC(?unitsSold)
        LIMIT 150
    `;

    const endpointUrl = 'https://query.wikidata.org/sparql?query=' + encodeURIComponent(sparqlQuery);

    try {
        const response = await fetch(endpointUrl, {
            headers: { 'Accept': 'application/sparql-results+json' }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        // Secondary JavaScript Filter: Clean up non-Latin characters or raw entity IDs
        GAMES = data.results.bindings
            .map(item => ({
                title: item.gameLabel.value,
                year: parseInt(item.year.value, 10),
                unitsSold: parseFloat(item.unitsSold.value),
                image: item.image ? item.image.value.replace('http://', 'https://') : ''
            }))
            .filter(game => {
                // Reject titles containing raw IDs (e.g. Q12345 or G95832386)
                const isRawId = /^[QG]\d+$/.test(game.title);
                
                // Allow only standard printable Latin characters, numbers, and basic punctuation
                const isLatinEnglish = /^[\x00-\x7F\sA-Za-z0-9\:\-\.\'\!\?\&]+$/.test(game.title);

                return !isRawId && isLatinEnglish && game.unitsSold > 0;
            });

        if (GAMES.length >= 2) {
            startGame();
        } else {
            toastEl.textContent = "Failed to load enough game records.";
        }
    } catch (err) {
        console.error("Wikidata query failed:", err);
        toastEl.textContent = "Error fetching video game data.";
    }
}

function startGame() {
    if (GAMES.length < 2) return;

    currentBatch = shuffleArray(GAMES);
    if (currentBatch.length < TOTAL_MATCHUP_POOL) {
        currentBatch = shuffleArray(GAMES.concat(GAMES));
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
    toastEl.textContent = 'Which game sold more copies worldwide?';
}

function loadNextRound() {
    answeredThisRound = false;
    resultBox.classList.remove('visible');
    btnNext.disabled = true;

    let idxA = (round - 1) * 2 % currentBatch.length;
    let idxB = (idxA + 1) % currentBatch.length;

    if (currentBatch[idxA].title === currentBatch[idxB].title) {
        idxB = (idxB + 1) % currentBatch.length;
    }

    currentPair = { a: currentBatch[idxA], b: currentBatch[idxB] };
    renderMatchup();
}

function renderMatchup() {
    if (!currentPair) return;

    vsContainer.innerHTML = '';

    const cards = [
        { game: currentPair.a, side: 'a' },
        { game: currentPair.b, side: 'b' }
    ];

    cards.forEach(({ game, side }) => {
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.id = `game-${side}`;
        card.dataset.side = side;

        if (game.image) {
            const img = document.createElement('img');
            img.className = 'poster';
            img.src = game.image;
            img.alt = game.title;
            img.onerror = () => {
                img.replaceWith(createStyledFallbackCard(game.title, game.year));
            };
            card.appendChild(img);
        } else {
            // Append fallback card immediately when no poster URL exists
            const fallback = createStyledFallbackCard(game.title, game.year);
            card.appendChild(fallback);

            // Fetch a poster asynchronously and replace the fallback when it arrives
            fetchGamePoster(game.title).then(posterUrl => {
                if (posterUrl && card.contains(fallback)) {
                    const img = document.createElement('img');
                    img.className = 'poster';
                    img.src = posterUrl;
                    img.alt = game.title;
                    img.onerror = () => {
                        img.replaceWith(createStyledFallbackCard(game.title, game.year));
                    };
                    fallback.replaceWith(img);
                }
            });
        }

        const title = document.createElement('div');
        title.className = 'movie-title';
        title.textContent = game.title;

        const year = document.createElement('div');
        year.className = 'movie-year';
        year.textContent = `(${game.year})`;

        card.appendChild(title);
        card.appendChild(year);

        card.addEventListener('click', () => handleGuess(side));
        vsContainer.appendChild(card);
    });

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
    const pickedCorrect = picked.unitsSold >= other.unitsSold;
    const isTie = picked.unitsSold === other.unitsSold;

    document.querySelectorAll('.movie-card').forEach(c => c.classList.add('disabled'));

    const pickedCard = document.getElementById(`game-${side}`);
    const otherCard = document.getElementById(`game-${isTie ? side : (side === 'a' ? 'b' : 'a')}`);

    if (isTie || pickedCorrect) {
        pickedCard.classList.add('correct');
        if (!isTie) otherCard.classList.add('wrong');
        score++;
        streak++;
        totalCorrect++;
        bestStreak = Math.max(bestStreak, streak);
        localStorage.setItem('vg_best_streak', bestStreak);
        
        resultTitle.textContent = 'CORRECT! ✓';
        resultTitle.className = 'result-title correct-text';
        resultDetail.innerHTML = `<strong>${picked.title}</strong> has sold <strong>${formatCopies(picked.unitsSold)}</strong> vs <strong>${formatCopies(other.unitsSold)}</strong> for ${other.title}.`;
        Sound.correct();
    } else {
        pickedCard.classList.add('wrong');
        otherCard.classList.add('correct');
        streak = 0;
        totalWrong++;
        
        resultTitle.textContent = 'WRONG! ✗';
        resultTitle.className = 'result-title';
        resultTitle.style.color = 'var(--secondary-red)';
        resultDetail.innerHTML = `<strong>${other.title}</strong> sold more: <strong>${formatCopies(other.unitsSold)}</strong> vs <strong>${formatCopies(picked.unitsSold)}</strong> for ${picked.title}.`;
        Sound.wrong();
    }

    scoreVal.textContent = score;
    streakVal.textContent = streak;

    resultBox.classList.add('visible');
    btnNext.disabled = false;
}

btnNext.addEventListener('click', () => {
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

    btnNext.innerHTML = '<i class="fa-solid fa-rotate-right"></i> PLAY AGAIN';
    btnNext.onclick = () => {
        btnNext.onclick = null;
        btnNext.innerHTML = '<i class="fa-solid fa-forward"></i> NEXT MATCHUP';
        btnNext.disabled = true;
        startGame();
    };

    toastEl.textContent = 'Great job! Tap PLAY AGAIN to start a new game.';
}

// Start game
fetchWikidataGames();