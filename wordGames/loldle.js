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

const DDRAGON_VER = "14.1.1";
const DDRAGON_CDN_URL = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VER}/data/en_US/champion.json`;
const DDRAGON_IMG_URL = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VER}/img/champion/`;

// Detailed multi-species metadata map to distinguish stat twins
const CHAMPION_DETAILS = {
    "Aatrox": { gender: "Male", position: "Top", species: "Darkin, Humanoid", region: "Runeterra", releaseYear: "2013" },
    "Ahri": { gender: "Female", position: "Middle", species: "Vastaya, Spirit", region: "Ionia", releaseYear: "2011" },
    "Akali": { gender: "Female", position: "Middle, Top", species: "Human, Martial", region: "Ionia", releaseYear: "2010" },
    "Anivia": { gender: "Female", position: "Middle", species: "God-Willow, Spirit", region: "Freljord", releaseYear: "2009" },
    "Annie": { gender: "Female", position: "Middle", species: "Human", region: "Noxus", releaseYear: "2009" },
    "Ashe": { gender: "Female", position: "Bottom", species: "Human, Iceborn", region: "Freljord", releaseYear: "2009" },
    "Bard": { gender: "Other", position: "Support", species: "Celestial", region: "Runeterra", releaseYear: "2015" },
    "Blitzcrank": { gender: "Other", position: "Support", species: "Golem, Hextech", region: "Zaun", releaseYear: "2009" },
    "Darius": { gender: "Male", position: "Top", species: "Human, Noxian", region: "Noxus", releaseYear: "2012" },
    "Fiddlesticks": { gender: "Other", position: "Jungle", species: "Demon", region: "Runeterra", releaseYear: "2009" },
    "Garen": { gender: "Male", position: "Top", species: "Human, Demacian", region: "Demacia", releaseYear: "2010" },
    "Janna": { gender: "Female", position: "Support", species: "Spirit, God", region: "Zaun", releaseYear: "2009" },
    "Jinx": { gender: "Female", position: "Bottom", species: "Human, Chemtech", region: "Zaun", releaseYear: "2013" },
    "Kindred": { gender: "Other", position: "Jungle", species: "Spirit, God", region: "Runeterra", releaseYear: "2015" },
    "LeeSin": { gender: "Male", position: "Jungle", species: "Human, Spiritual", region: "Ionia", releaseYear: "2011" },
    "Lux": { gender: "Female", position: "Middle, Support", species: "Human, Mage", region: "Demacia", releaseYear: "2010" },
    "Thresh": { gender: "Male", position: "Support", species: "Undead, Spirit", region: "Shadow Isles", releaseYear: "2013" },
    "Yasuo": { gender: "Male", position: "Middle, Top", species: "Human, Wind-Master", region: "Ionia", releaseYear: "2013" },
    "Zed": { gender: "Male", position: "Middle", species: "Human, Shadow", region: "Ionia", releaseYear: "2012" },
    "Swain": { gender: "Male", position: "Middle, Support", species: "Human", region: "Runeterra", releaseYear: "2010" }

};

let CHAMPIONS = [];
let TARGET_CHAMP = null;
const TODAY_DATE_STR = new Date().toISOString().slice(0, 10);
const MAX_GUESSES = 8;
let guessesHistory = [];
let gameOver = false;
let currentMatches = [];
let suggestionActiveIndex = -1;
let userScore = 0;

// DOM Elements
const inputEl = document.getElementById('champ-input');
const inputWrapper = document.getElementById('input-wrapper');
const btnGuess = document.getElementById('btn-guess');
const suggestionsEl = document.getElementById('suggestions');
const guessesContainer = document.getElementById('guesses-container');
const toastEl = document.getElementById('toast');
const hintBox = document.getElementById('hint-box');
const scoreValEl = document.getElementById('score-val');
// --- Local Background Music Control ---
const btnMusic = document.getElementById('btn-music');
const bgMusic = document.getElementById('bg-music');

// Configure audio element safely and add diagnostics
if (bgMusic) {
    try { bgMusic.crossOrigin = 'anonymous'; } catch (e) { /* ignore */ }
    bgMusic.volume = 0.15; // 15% low volume

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
        toastEl.textContent = "Guess today's mystery champion!";
    }).catch(err => {
        console.warn("Autoplay prevented:", err);
        toastEl.textContent = "Click anywhere on the page to enable audio.";
        
        // Add a one-time document listener to unlock audio on the next user tap/click
        const unlockAudio = () => {
            bgMusic.play().then(() => {
                btnMusic.classList.add('playing');
                btnMusic.innerHTML = '<i class="fa-solid fa-volume-high"></i> Music';
                toastEl.textContent = "Guess today's mystery champion!";
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

function mapRoleToPosition(tags) {
    if (tags.includes("Support")) return "Support";
    if (tags.includes("Marksman")) return "Bottom";
    if (tags.includes("Mage")) return "Middle";
    if (tags.includes("Assassin")) return "Middle, Jungle";
    if (tags.includes("Tank") || tags.includes("Fighter")) return "Top, Jungle";
    return "Middle";
}

async function fetchChampionsData() {
    try {
        const res = await fetch(DDRAGON_CDN_URL);
        const data = await res.json();
        const champsObj = data.data;

        CHAMPIONS = Object.keys(champsObj).map(key => {
            const c = champsObj[key];
            const meta = CHAMPION_DETAILS[key] || {
                            gender: "Unknown",
                position: mapRoleToPosition(c.tags),
                species: "Human",
                region: "Runeterra",
                releaseYear: "2012"
            };

            return {
                id: c.id,
                name: c.name,
                image: `${DDRAGON_IMG_URL}${c.image.full}`,
                gender: meta.gender,
                position: meta.position,
                species: meta.species,
                resource: c.partype || "Manaless",
                range: c.stats.attackrange > 300 ? "Ranged" : "Melee",
                region: meta.region,
                releaseYear: meta.releaseYear
            };
        }).sort((a, b) => a.name.localeCompare(b.name));

        const now = new Date();
        const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
        TARGET_CHAMP = CHAMPIONS[seed % CHAMPIONS.length];

        inputEl.placeholder = "Enter champion name...";
        toastEl.textContent = "Guess today's mystery champion!";
        restoreProgress();
    } catch (err) {
        toastEl.textContent = "Error fetching champion dataset.";
        console.error(err);
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

    if (!val || CHAMPIONS.length === 0) {
        currentMatches = [];
        suggestionsEl.style.display = 'none';
        return;
    }

    currentMatches = CHAMPIONS.filter(c => 
        c.name.toLowerCase().startsWith(val) || c.name.toLowerCase().includes(val)
    ).slice(0, 8);
    
    if (currentMatches.length > 0) {
        suggestionsEl.style.display = 'block';
        currentMatches.forEach((c, idx) => {
            const div = document.createElement('div');
            div.className = `suggestion-item ${idx === 0 ? 'active' : ''}`;
            div.setAttribute('role', 'option');
            div.dataset.index = idx;

            const info = document.createElement('div');
            info.className = 'suggestion-info';

            const img = document.createElement('img');
            img.src = c.image;
            img.alt = c.name;

            const nameSpan = document.createElement('span');
            nameSpan.textContent = c.name;

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
                selectChampion(c.name);
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

function selectChampion(name) {
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
        selectChampion(currentMatches[idx].name);
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
            selectChampion(currentMatches[suggestionActiveIndex].name);
        } else {
            submitGuess();
        }
    }
});

function calculateGuessPoints(champ) {
    const fields = ['gender', 'position', 'species', 'resource', 'range', 'region'];
    let guessPoints = 0;

    fields.forEach(f => {
        const status = compareAttribute(champ[f], TARGET_CHAMP[f]);
        if (status === 'correct') guessPoints += 100;
        else if (status === 'partial') guessPoints += 50;
    });

    return guessPoints;
}

function submitGuess() {
    if (gameOver || !TARGET_CHAMP) return;
    initAudio();

    const val = inputEl.value.trim();
    const guessedChamp = CHAMPIONS.find(c => c.name.toLowerCase() === val.toLowerCase());

    if (!guessedChamp) {
        toastEl.textContent = "Champion not found!";
        triggerShake();
        return;
    }

    if (guessesHistory.includes(guessedChamp.name)) {
        toastEl.textContent = "Already Guessed!";
        triggerShake();
        return;
    }

    const pts = calculateGuessPoints(guessedChamp);
    userScore += pts;
    scoreValEl.textContent = userScore;

    guessesHistory.push(guessedChamp.name);
    renderRowUI(guessedChamp, true);
    Sound.guess();

    inputEl.value = '';
    suggestionsEl.style.display = 'none';

    checkHintState();

    const isCorrect = guessedChamp.name === TARGET_CHAMP.name;

    if (isCorrect) {
        gameOver = true;
        userScore += 500;
        scoreValEl.textContent = userScore;
        Sound.win();
        toastEl.textContent = `Splendid! Loldle Solved! Final Score: ${userScore}`;
        inputEl.disabled = true;
        btnGuess.disabled = true;
        saveProgress(true);
    } else if (guessesHistory.length >= MAX_GUESSES) {
        gameOver = true;
        toastEl.textContent = `Game Over! Champion was: ${TARGET_CHAMP.name}`;
        inputEl.disabled = true;
        btnGuess.disabled = true;
        saveProgress(false);
    } else {
        toastEl.textContent = `Scored +${pts} pts on this guess!`;
        saveProgress(false);
    }
}

function checkHintState() {
    if (guessesHistory.length >= 4 && !gameOver) {
        const firstLetter = TARGET_CHAMP.name.charAt(0);
        hintBox.style.display = 'block';
        hintBox.innerHTML = `<i class="fa-solid fa-lightbulb"></i> <strong>Hint Unlocked:</strong> Released in <strong>${TARGET_CHAMP.releaseYear}</strong> and starts with the letter '<strong>${firstLetter}</strong>'!`;
    }
}

function renderRowUI(champ, shouldAnimate = false) {
    const row = document.createElement('div');
    row.className = 'guess-row';

    const fields = [
        { key: 'gender', val: champ.gender },
        { key: 'position', val: champ.position },
        { key: 'species', val: champ.species },
        { key: 'resource', val: champ.resource },
        { key: 'range', val: champ.range },
        { key: 'region', val: champ.region }
    ];

    const champCard = document.createElement('div');
    champCard.className = 'attribute-box champ-card';
    if (shouldAnimate) champCard.classList.add('animate-flip');

    const avatar = document.createElement('img');
    avatar.src = champ.image;
    avatar.className = 'champ-avatar';
    avatar.alt = champ.name;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = champ.name;

    champCard.appendChild(avatar);
    champCard.appendChild(nameSpan);
    row.appendChild(champCard);

    fields.forEach((f, idx) => {
        const status = compareAttribute(f.val, TARGET_CHAMP[f.key]);
        const box = document.createElement('div');
        box.className = 'attribute-box ' + status;
        if (shouldAnimate) {
            box.classList.add('animate-flip');
            box.style.animationDelay = `${(idx + 1) * 0.1}s`;
        }
        box.textContent = f.val;
        row.appendChild(box);
    });

    guessesContainer.insertBefore(row, guessesContainer.firstChild);
}

function restoreProgress() {
    const saved = JSON.parse(localStorage.getItem(`loldle_ddragon_save_${TODAY_DATE_STR}`));
    if (!saved) return;

    guessesHistory = saved.history || [];
    gameOver = saved.gameOver;
    userScore = saved.score || 0;
    scoreValEl.textContent = userScore;

    guessesHistory.forEach(champName => {
        const champ = CHAMPIONS.find(c => c.name === champName);
        if (champ) renderRowUI(champ, false);
    });

    checkHintState();

    if (gameOver) {
        inputEl.disabled = true;
        btnGuess.disabled = true;
        toastEl.textContent = saved.passed ? `Daily Loldle Solved! Final Score: ${userScore}` : `Mystery Champion was: ${TARGET_CHAMP.name}`;
    }
}

function saveProgress(passed = false) {
    localStorage.setItem(`loldle_ddragon_save_${TODAY_DATE_STR}`, JSON.stringify({
        date: TODAY_DATE_STR,
        history: guessesHistory,
        score: userScore,
        gameOver: gameOver,
        passed: passed
    }));
}

// Start Game
fetchChampionsData();

inputEl.addEventListener('input', debounce(handleAutocomplete, 150));
btnGuess.addEventListener('click', submitGuess);