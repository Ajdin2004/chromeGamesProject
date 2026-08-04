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

// DataDragon Version & CDN Base
const DDRAGON_VER = "14.1.1";
const CDN_IMG_URL = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VER}/img/champion/`;

// Extended Attributes Metadata Map
const CHAMPION_METADATA = {
    "Aatrox": { gender: "Male", position: "Top", species: "Darkin", region: "Runeterra" },
    "Ahri": { gender: "Female", position: "Middle", species: "Vastaya", region: "Ionia" },
    "Akali": { gender: "Female", position: "Middle, Top", species: "Human", region: "Ionia" },
    "Ashe": { gender: "Female", position: "Bottom", species: "Human", region: "Freljord" },
    "Darius": { gender: "Male", position: "Top", species: "Human", region: "Noxus" },
    "Garen": { gender: "Male", position: "Top", species: "Human", region: "Demacia" },
    "Jinx": { gender: "Female", position: "Bottom", species: "Human", region: "Zaun" },
    "LeeSin": { gender: "Male", position: "Jungle", species: "Human", region: "Ionia" },
    "Lux": { gender: "Female", position: "Middle, Support", species: "Human", region: "Demacia" },
    "Thresh": { gender: "Male", position: "Support", species: "Undead", region: "Shadow Isles" },
    "Yasuo": { gender: "Male", position: "Middle, Top", species: "Human", region: "Ionia" },
    "Zed": { gender: "Male", position: "Middle", species: "Human", region: "Ionia" }
};

let CHAMPIONS = [];
let TARGET_CHAMP = null;
const TODAY_DATE_STR = new Date().toISOString().slice(0, 10);
const MAX_GUESSES = 8;
let guessesHistory = [];
let gameOver = false;

// DOM Elements
const inputEl = document.getElementById('champ-input');
const btnGuess = document.getElementById('btn-guess');
const suggestionsEl = document.getElementById('suggestions');
const guessesContainer = document.getElementById('guesses-container');
const toastEl = document.getElementById('toast');

// --- Fetch Full Champion Dataset from Riot DataDragon API ---
async function fetchChampionsData() {
    try {
        const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VER}/data/en_US/champion.json`);
        const data = await response.json();
        const champsObj = data.data;

        CHAMPIONS = Object.keys(champsObj).map(key => {
            const c = champsObj[key];
            const meta = CHAMPION_METADATA[key] || {
                gender: "Male/Female",
                position: c.tags.join(", "),
                species: "Human",
                region: "Runeterra"
            };

            return {
                id: c.id,
                name: c.name,
                image: `${CDN_IMG_URL}${c.image.full}`,
                gender: meta.gender,
                position: meta.position,
                species: meta.species,
                resource: c.partype || "Manaless",
                range: c.stats.attackrange > 300 ? "Ranged" : "Melee",
                region: meta.region
            };
        }).sort((a, b) => a.name.localeCompare(b.name));

        // Deterministic Daily Target
        const now = new Date();
        const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
        TARGET_CHAMP = CHAMPIONS[seed % CHAMPIONS.length];

        inputEl.placeholder = "Enter champion name...";
        toastEl.textContent = "Guess today's mystery champion!";
        restoreProgress();
    } catch (err) {
        toastEl.textContent = "Error fetching DataDragon dataset.";
    }
}

// --- Attribute Comparison Helper ---
function compareAttribute(val1, val2) {
    if (val1 === val2) return 'correct';
    const list1 = val1.split(', ').map(s => s.trim());
    const list2 = val2.split(', ').map(s => s.trim());
    if (list1.some(v => list2.includes(v))) return 'partial';
    return 'wrong';
}

// --- Autocomplete ---
function handleAutocomplete() {
    const val = inputEl.value.toLowerCase().trim();
    suggestionsEl.innerHTML = '';

    if (!val || CHAMPIONS.length === 0) {
        suggestionsEl.style.display = 'none';
        return;
    }

    const matches = CHAMPIONS.filter(c => c.name.toLowerCase().includes(val)).slice(0, 8);
    if (matches.length > 0) {
        suggestionsEl.style.display = 'block';
        matches.forEach(c => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `<img src="${c.image}" alt="${c.name}"> <span>${c.name}</span>`;
            div.addEventListener('click', () => {
                inputEl.value = c.name;
                suggestionsEl.style.display = 'none';
            });
            suggestionsEl.appendChild(div);
        });
    } else {
        suggestionsEl.style.display = 'none';
    }
}

// --- Submit Guess ---
function submitGuess() {
    if (gameOver || !TARGET_CHAMP) return;
    initAudio();

    const val = inputEl.value.trim();
    const guessedChamp = CHAMPIONS.find(c => c.name.toLowerCase() === val.toLowerCase());

    if (!guessedChamp) {
        toastEl.textContent = "Unknown Champion!";
        return;
    }

    if (guessesHistory.includes(guessedChamp.name)) {
        toastEl.textContent = "Already Guessed!";
        return;
    }

    guessesHistory.push(guessedChamp.name);
    renderRowUI(guessedChamp);
    Sound.guess();

    inputEl.value = '';
    suggestionsEl.style.display = 'none';

    const isCorrect = guessedChamp.name === TARGET_CHAMP.name;

    if (isCorrect) {
        gameOver = true;
        Sound.win();
        toastEl.textContent = "Splendid! Loldle Solved!";
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
        saveProgress(false);
    }
}

function renderRowUI(champ) {
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

    let html = `
        <div class="attribute-box champ-card">
            <img src="${champ.image}" class="champ-avatar" alt="${champ.name}">
            <span>${champ.name}</span>
        </div>
    `;

    fields.forEach(f => {
        const status = compareAttribute(f.val, TARGET_CHAMP[f.key]);
        html += `<div class="attribute-box ${status}">${f.val}</div>`;
    });

    row.innerHTML = html;
    guessesContainer.insertBefore(row, guessesContainer.firstChild);
}

function restoreProgress() {
    const saved = JSON.parse(localStorage.getItem(`loldle_ddragon_save_${TODAY_DATE_STR}`));
    if (!saved) return;

    guessesHistory = saved.history || [];
    gameOver = saved.gameOver;

    guessesHistory.forEach(champName => {
        const champ = CHAMPIONS.find(c => c.name === champName);
        if (champ) renderRowUI(champ);
    });

    if (gameOver) {
        inputEl.disabled = true;
        btnGuess.disabled = true;
        toastEl.textContent = saved.passed ? "Daily Loldle Solved!" : `Mystery Champion was: ${TARGET_CHAMP.name}`;
    }
}

function saveProgress(passed) {
    localStorage.setItem(`loldle_ddragon_save_${TODAY_DATE_STR}`, JSON.stringify({
        date: TODAY_DATE_STR,
        history: guessesHistory,
        gameOver: gameOver,
        passed: passed
    }));
}

// Start Game
fetchChampionsData();

inputEl.addEventListener('input', handleAutocomplete);
btnGuess.addEventListener('click', submitGuess);
inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') submitGuess(); });