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

// Use local bundled Meraki champions snapshot
const MERAKI_CHAMPIONS_URL = './data/champions.json';

// Detailed multi-species metadata map to distinguish stat twins
const CHAMPION_DETAILS = {
    "Aatrox": { gender: "Male", position: "Top", species: "Darkin, Humanoid", region: "Runeterra", releaseYear: "2013" },
    

};

let CHAMPIONS = [];
let TARGET_CHAMP = null;
const TODAY_DATE_STR = new Date().toISOString().slice(0, 10);
const MAX_GUESSES = 8;
let guessesHistory = [];
let gameOver = false;
let currentMatches = [];
let suggestionActiveIndex = -1;

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

// Celebration modal elements (created on demand)
let celebrationModal = null;
let winAvatar = null;
let winName = null;
let winGender = null;
let winPosition = null;
let winSpecies = null;
let winResource = null;
let winRange = null;
let winRegion = null;
let btnCloseWin = null;
let confettiAnimId = null;

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


// Try to infer gender from the champion lore (uses simple pronoun heuristics).
// This improves accuracy without requiring a full manual mapping for every champion.
function inferGenderFromLore(lore) {
    if (!lore) return 'Unknown';
    const low = lore.toLowerCase();
    // Look for strong indicators first
    if (/\b(she|her|hers)\b/.test(low)) return 'Female';
    if (/\b(he|his|him)\b/.test(low)) return 'Male';
    // Plural / neutral pronouns
    if (/\b(they|their|theirs)\b/.test(low)) return 'Other';
    // Titles like "the hound", "the conjurer" are ambiguous; fall back to Unknown
    return 'Unknown';
}

// Infer region from lore/title/blurb by searching for known region keywords
function inferRegionFromLore(text) {
    if (!text) return null;
    const low = text.toLowerCase();
    const regions = {
        'demacia': 'Demacia',
        'noxus': 'Noxus',
        'ionia': 'Ionia',
        'freljord': 'Freljord',
        'piltover': 'Piltover',
        'zaun': 'Zaun',
        'bilgewater': 'Bilgewater',
        'shurima': 'Shurima',
        'bandle': 'Bandle City',
        'ixtal': 'Ixtal',
        'targon': 'Targon',
        'shadow isles': 'Shadow Isles',
        'shadow isles': 'Shadow Isles',
        'runeterra': 'Runeterra',
        'the void': 'The Void',
        'void': 'The Void',
        'mount targon': 'Targon'
    };

    for (const key in regions) {
        if (low.includes(key)) return regions[key];
    }

    // Try to detect by common region words (e.g., 'isles', 'mountain', 'city') if specific name not matched
    if (/\b(isles|isle|island|shadows|shadow)\b/.test(low)) return 'Shadow Isles';
    if (/\b(piltover|zaun|city|city-state)\b/.test(low)) return 'Piltover/Zaun';

    return null;
}

// Infer species from lore/title by searching for known species keywords
function inferSpeciesFromLore(text) {
    if (!text) return null;
    const low = text.toLowerCase();
    const speciesMap = {
        'vastaya': 'Vastaya',
        'vastayan': 'Vastaya',
        'yordle': 'Yordle',
        'human': 'Human',
        'voidborn': 'Void',
        'voidborn': 'Void',
        'void': 'Void',
        'spirit': 'Spirit',
        'undead': 'Undead',
        'undying': 'Undead',
        'demon': 'Demon',
        'dragon': 'Dragon',
        'ascended': 'Ascended',
        'darkin': 'Darkin',
        'celestial': 'Celestial',
        'golem': 'Construct',
        'hextech': 'Hextech',
        'machine': 'Construct',
        'robot': 'Construct',
        'fox': 'Vastaya',
        'spider': 'Monster',
        'monkey': 'Primate',
        'lion': 'Beast',
        'wolf': 'Beast',
        'rabbit': 'Beast'
    };

    for (const key in speciesMap) {
        if (low.includes(key)) return speciesMap[key];
    }

    // Try title keywords like "the Nine-Tailed Fox" or "the Exile"
    const titleSpecies = (text.match(/the\s([a-z\-\s]{3,30})/i) || [])[1];
    if (titleSpecies) {
        for (const key in speciesMap) {
            if (titleSpecies.toLowerCase().includes(key)) return speciesMap[key];
        }
    }

    return null;
}

// Normalize champion names for robust matching (removes punctuation/spaces and lowercases)
function normalizeName(name) {
    if (!name) return '';
    return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Helper: map Meraki positions array to a readable position string
function mapMerakiPositions(positions) {
    if (!positions || positions.length === 0) return 'Unknown';
    const pos = positions.map(p => p.toLowerCase());
    if (pos.includes('top')) return 'Top';
    if (pos.includes('middle') || pos.includes('mid')) return 'Middle';
    if (pos.includes('bottom') || pos.includes('adc')) return 'Bottom';
    if (pos.includes('jungle')) return 'Jungle';
    if (pos.includes('support')) return 'Support';
    return positions.join(', ');
}

// Helper: humanize resource strings from Meraki data
function humanizeResource(res) {
    if (!res) return 'Manaless';
    const r = String(res).toLowerCase();
    if (r.includes('mana')) return 'Mana';
    if (r.includes('energy')) return 'Energy';
    if (r.includes('rage') || r.includes('blood')) return 'Energy';
    if (r.includes('true')) return 'Other';
    if (r.includes('none')) return 'Manaless';
    return res.replace(/_/g, ' ').replace(/\b([a-z])/g, s => s.toUpperCase());
}

async function fetchChampionsData() {
    try {
        // Load local champion details overrides if present (generated by scripts/generate_champion_metadata.py)
        try {
            const overridesRes = await fetch('./data/champion_details.json');
            if (overridesRes.ok) {
                const overrides = await overridesRes.json();
                // Merge into CHAMPION_DETAILS (client-side); generated file takes precedence
                Object.keys(overrides).forEach(k => {
                    CHAMPION_DETAILS[k] = Object.assign({}, CHAMPION_DETAILS[k] || {}, overrides[k]);
                });
                console.info('Loaded champion overrides from ./data/champion_details.json');
            }
        } catch (e) {
            console.info('No local champion_details.json found or failed to load; continuing without overrides.');
        }

        // Load local snapshot served from the same origin to avoid CORS issues
        const res = await fetch(MERAKI_CHAMPIONS_URL);
        const data = await res.json();
        const champsObj = data;

        CHAMPIONS = Object.keys(champsObj).map(key => {
            const c = champsObj[key];

            // Use manual overrides from CHAMPION_DETAILS when available, otherwise attempt to infer from lore/blurb/title
            const manual = CHAMPION_DETAILS[key] || {};
            const inferredGender = manual.gender && manual.gender !== 'Unknown' ? manual.gender : inferGenderFromLore(c.lore || c.blurb || c.title);

            const inferredSpecies = inferSpeciesFromLore(c.lore || c.blurb || c.title || (c.positions || []).join(' '));
            const inferredRegion = inferRegionFromLore(c.lore || c.blurb || c.title);

            const meta = {
                gender: inferredGender || 'Unknown',
                position: manual.position || mapMerakiPositions(c.positions || []),
                species: manual.species || inferredSpecies || 'Human',
                region: manual.region || inferredRegion || 'Runeterra',
                releaseYear: manual.releaseYear || 'Unknown'
            };

            // Attack range in Meraki data is at stats.attackRange.flat (if present)
            let attackRange = null;
            if (c.stats && c.stats.attackRange && typeof c.stats.attackRange.flat === 'number') attackRange = c.stats.attackRange.flat;

            return {
                id: c.id || c.key || key,
                name: c.name || key,
                image: c.icon || '',
                gender: meta.gender,
                position: meta.position,
                species: meta.species,
                resource: humanizeResource(c.resource || c.partype || ''),
                range: (attackRange !== null) ? (attackRange > 300 ? 'Ranged' : 'Melee') : 'Unknown',
                region: meta.region,
                releaseYear: meta.releaseYear
            };
        }).sort((a, b) => a.name.localeCompare(b.name));

        // Guard: ensure we loaded champions
        if (!CHAMPIONS || CHAMPIONS.length === 0) {
            throw new Error('No champions loaded from ' + MERAKI_CHAMPIONS_URL + '. Ensure the file exists at this path and that the page is served over HTTP/S (fetch() will not work from file://).');
        }

        // Seed today's champion deterministically by date so everyone gets same daily target
        const now = new Date();
        const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
        TARGET_CHAMP = CHAMPIONS[seed % CHAMPIONS.length];

        inputEl.placeholder = "Enter champion name...";
        toastEl.textContent = "Guess today's mystery champion!";
        restoreProgress();
    } catch (err) {
        // Provide more helpful guidance in dev console and UI
        console.error('Failed to load champions from:', MERAKI_CHAMPIONS_URL, err);
        if (err && err.message) console.error('Error message:', err.message);
        toastEl.textContent = "Error loading champion data. Check console for details.\nMake sure the file '" + MERAKI_CHAMPIONS_URL + "' is present and the page is served over HTTP (not file://).";
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


function submitGuess() {
    if (gameOver || !TARGET_CHAMP) return;
    initAudio();

    const val = inputEl.value.trim();
    if (!val) {
        toastEl.textContent = 'Please enter a champion name.';
        triggerShake();
        return;
    }

    // Try exact normalized match first (robust against spacing/punctuation like "Lee Sin" vs "Leesin")
    let guessedChamp = CHAMPIONS.find(c => normalizeName(c.name) === normalizeName(val));

    // Fallback: case-insensitive exact name
    if (!guessedChamp) guessedChamp = CHAMPIONS.find(c => c.name.toLowerCase() === val.toLowerCase());

    // Fallback: startsWith or includes
    if (!guessedChamp) guessedChamp = CHAMPIONS.find(c => c.name.toLowerCase().startsWith(val.toLowerCase()) || c.name.toLowerCase().includes(val.toLowerCase()));

    // Fallback: if suggestions are open, use the active suggestion
    if (!guessedChamp && currentMatches.length > 0) {
        const idx = suggestionActiveIndex >= 0 ? suggestionActiveIndex : 0;
        guessedChamp = currentMatches[idx];
    }

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


    guessesHistory.push(guessedChamp.name);
    renderRowUI(guessedChamp, true);
    Sound.guess();

    inputEl.value = '';
    suggestionsEl.style.display = 'none';

    checkHintState();

    const isCorrect = guessedChamp.name === TARGET_CHAMP.name;

    if (isCorrect) {
        gameOver = true;
        Sound.win();
        toastEl.textContent = `Splendid! Loldle Solved!`;
        inputEl.disabled = true;
        btnGuess.disabled = true;

        // Show celebration modal + confetti (creates modal dynamically if missing)
        try {
            triggerVictoryModal(TARGET_CHAMP);
        } catch (e) {
            console.warn('Unable to trigger victory modal:', e);
        }

        saveProgress(true);
    } else if (guessesHistory.length >= MAX_GUESSES) {
        gameOver = true;
        toastEl.textContent = `Game Over! Champion was: ${TARGET_CHAMP.name}`;
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
        const firstLetter = TARGET_CHAMP.name.charAt(0);
        hintBox.style.display = 'block';
        hintBox.innerHTML = `<i class="fa-solid fa-lightbulb"></i> <strong>Hint Unlocked:</strong> Released in <strong>${TARGET_CHAMP.releaseYear}</strong> and starts with the letter '<strong>${firstLetter}</strong>'!`;
    }
}

function renderRowUI(champ, shouldAnimate = false) {
    const row = document.createElement('div');
    row.className = 'guess-row';

    const fields = [
        { key: 'gender', val: champ.gender, label: 'Gender' },
        { key: 'position', val: champ.position, label: 'Position' },
        { key: 'species', val: champ.species, label: 'Species' },
        { key: 'resource', val: champ.resource, label: 'Resource' },
        { key: 'range', val: champ.range, label: 'Range' },
        { key: 'region', val: champ.region, label: 'Region' }
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
        // Provide data-label for small-screen CSS to show the attribute name
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
    // Inline styles to ensure visibility without depending on external CSS
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
    winAvatar.alt = 'Champion avatar';
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

    winGender = makeDetailSpan('Gender');
    winPosition = makeDetailSpan('Position');
    winSpecies = makeDetailSpan('Species');
    winResource = makeDetailSpan('Resource');
    winRange = makeDetailSpan('Range');
    winRegion = makeDetailSpan('Region');

    details.appendChild(winGender);
    details.appendChild(winPosition);
    details.appendChild(winSpecies);
    details.appendChild(winResource);
    details.appendChild(winRange);
    details.appendChild(winRegion);

    btnCloseWin = document.createElement('button');
    btnCloseWin.textContent = 'Close';
    btnCloseWin.style.marginTop = '14px';
    btnCloseWin.style.padding = '8px 12px';
    btnCloseWin.style.border = 'none';
    btnCloseWin.style.background = '#1f2937';
    btnCloseWin.style.color = '#fff';
    btnCloseWin.style.borderRadius = '8px';
    btnCloseWin.style.cursor = 'pointer';

    // Canvas for confetti (absolute positioned behind content)
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

    // Ensure content sits below the confetti canvas so confetti can appear in front
    content.style.zIndex = '10000';
    canvas.style.zIndex = '10001';

    celebrationModal.appendChild(canvas);
    celebrationModal.appendChild(content);
    // Hide initially
    celebrationModal.style.display = 'none';

    document.body.appendChild(celebrationModal);

    btnCloseWin.addEventListener('click', () => {
        // Hide and stop confetti
        celebrationModal.style.display = 'none';
        if (typeof confettiAnimId === 'number') {
            cancelAnimationFrame(confettiAnimId);
            confettiAnimId = null;
        }
        // Clear canvas
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

    // Size the canvas using device pixel ratio for crisp rendering
    const rect = celebrationModal.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    const ctx = canvas.getContext('2d');
    // Scale drawing context so coordinates are in CSS pixels
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = rect.width;
    const height = rect.height;

    const pieces = Array.from({ length: 140 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height - height,
        size: Math.random() * 12 + 6,
        color: ['#00f2fe', '#22c55e', '#eab308', '#ef4444', '#a855f7', '#06b6d4'][Math.floor(Math.random() * 6)],
        speedY: Math.random() * 120 + 80, // pixels per second
        speedX: (Math.random() - 0.5) * 120,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 360 // deg per second
    }));

    let lastTime = performance.now();

    function draw(now) {
        const dt = Math.min(100, now - lastTime) / 1000; // seconds
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
function triggerVictoryModal(champ) {
    if (!champ) return;
    try {
        createCelebrationModalIfMissing();

        winAvatar.src = champ.image || '';
        winName.textContent = champ.name || 'Champion';
        winGender.textContent = `Gender: ${champ.gender || 'Unknown'}`;
        winPosition.textContent = `Position: ${champ.position || 'Unknown'}`;
        winSpecies.textContent = `Species: ${champ.species || 'Unknown'}`;
        winResource.textContent = `Resource: ${champ.resource || 'Unknown'}`;
        winRange.textContent = `Range: ${champ.range || 'Unknown'}`;
        winRegion.textContent = `Region: ${champ.region || 'Unknown'}`;

        celebrationModal.style.display = 'flex';
        // Start confetti
        runConfetti();
    } catch (e) {
        console.error('Failed to show victory modal:', e);
    }
}

function restoreProgress() {
    const saved = JSON.parse(localStorage.getItem(`loldle_ddragon_save_${TODAY_DATE_STR}`));
    if (!saved) return;

    guessesHistory = saved.history || [];
    gameOver = saved.gameOver;

    guessesHistory.forEach(champName => {
        const champ = CHAMPIONS.find(c => c.name === champName);
        if (champ) renderRowUI(champ, false);
    });

    checkHintState();

    if (gameOver) {
        inputEl.disabled = true;
        btnGuess.disabled = true;
        toastEl.textContent = saved.passed ? `Daily Loldle Solved!` : `Mystery Champion was: ${TARGET_CHAMP.name}`;
    }
}

function saveProgress(passed = false) {
    localStorage.setItem(`loldle_ddragon_save_${TODAY_DATE_STR}`, JSON.stringify({
        date: TODAY_DATE_STR,
        history: guessesHistory,
        gameOver: gameOver,
        passed: passed
    }));
}

// Start Game
fetchChampionsData();

inputEl.addEventListener('input', debounce(handleAutocomplete, 150));
btnGuess.addEventListener('click', submitGuess);