/* Tunetile — Songdle-style overhaul using iTunes API with Safe Redirect Bypass */

const ITUNES_BASE = 'https://itunes.apple.com/search';
const TODAY = new Date().toISOString().slice(0, 10);
const SEED = new Date().getFullYear() * 10000 + (new Date().getMonth() + 1) * 100 + new Date().getDate();

const CURATED_TERMS = [
    'Taylor Swift','Ed Sheeran','The Weeknd','Adele','Bruno Mars','Michael Jackson','Queen','The Beatles',
    'ABBA','Nirvana','Pharrell Williams','Beyonce','Drake','Ariana Grande','Coldplay','Billie Eilish','Katy Perry'
];

const MAX_ATTEMPTS = 6;
const INITIAL_REVEAL_SECONDS = 3;
const REVEAL_INCREMENT = 3;
const MAX_PREVIEW_SECONDS = 30;

// DOM References
let playBtn = document.getElementById('playMelodyBtn');
let cluePreview = document.getElementById('cluePreview');
const guessInput = document.getElementById('guessInput');
const guessBtn = document.getElementById('guessBtn');
const messageBox = document.getElementById('messageBox');
const attemptDisplay = document.getElementById('attemptDisplay');
const hintDisplay = document.getElementById('hintDisplay');
const boardContainer = document.getElementById('boardContainer');
const suggestionBox = document.getElementById('suggestionBox');

let suggestionTimer = null;
let suggestionCache = {};
let suggestionDisabled = false;
let answerTitleElement = null;

// Game State
let dailyTrack = null;
let audio = new Audio();
let attempts = 0;
let guesses = [];
let gameOver = false;

// --- CORS & Scheme-Redirect Safe Fetcher ---
async function safeiTunesQuery(params) {
    const proxyUrl = `/api/itunes-search?${params}`;

    try {
        const res = await fetch(proxyUrl);
        if (res.ok) return await res.json();
        console.warn('iTunes proxy query failed:', res.status, res.statusText);
    } catch (err) {
        console.warn('iTunes proxy fetch error:', err);
    }

    return await safeItunesJsonpQuery(params);
}

function safeItunesJsonpQuery(params) {
    return new Promise((resolve) => {
        const directUrl = `${ITUNES_BASE}?${params}`;
        const callbackName = `tunetileJSONP_${Math.random().toString(36).slice(2)}`;
        const url = `${directUrl}&callback=${callbackName}&urlDesc=`;
        const script = document.createElement('script');
        let timeoutId;

        function cleanup() {
            if (timeoutId) clearTimeout(timeoutId);
            delete window[callbackName];
            if (script.parentNode) script.parentNode.removeChild(script);
        }

        window[callbackName] = (data) => {
            cleanup();
            resolve(data);
        };

        script.onerror = () => {
            cleanup();
            suggestionDisabled = true;
            hideSuggestions();
            resolve(null);
        };

        timeoutId = setTimeout(() => {
            cleanup();
            suggestionDisabled = true;
            hideSuggestions();
            resolve(null);
        }, 10000);

        script.src = url;
        script.type = 'text/javascript';
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.referrerPolicy = 'no-referrer';
        document.body.appendChild(script);
    });
}

function setMessage(text, type = 'info') {
    messageBox.textContent = text;
    messageBox.className = `message-box ${type} msg-anim`;
}

function normalizeForCompare(s) {
    return (s || '').toString().toUpperCase().replace(/[^A-Z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
}

function maskTitle(s) {
    if (!s) return '';
    return s.replace(/[A-Za-z0-9]/g, '•');
}

function revealAnswer() {
    try {
        if (answerTitleElement && dailyTrack) {
            answerTitleElement.textContent = `${dailyTrack.trackName} — ${dailyTrack.artistName}`;
            answerTitleElement.classList.add('pulse-anim');
        } else if (dailyTrack && cluePreview) {
            cluePreview.textContent = `${dailyTrack.trackName} — ${dailyTrack.artistName}`;
        }
    } catch (e) { console.warn('revealAnswer failed', e); }
}

function celebrateSuccess() {
    const overlay = document.getElementById('celebrationOverlay');
    if (!overlay) return;
    overlay.innerHTML = '';
    overlay.classList.add('active');

    const colors = ['#22c55e', '#34d399', '#38bdf8', '#fbbf24', '#f472b6', '#a855f7'];
    const count = 25;
    const width = window.innerWidth;

    for (let i = 0; i < count; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = `${Math.random() * width}px`;
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.transform = `rotate(${Math.random() * 360}deg)`;
        piece.style.animationDuration = `${1.6 + Math.random() * 0.8}s`;
        piece.style.animationDelay = `${Math.random() * 0.2}s`;
        piece.style.width = `${6 + Math.random() * 6}px`;
        piece.style.height = `${12 + Math.random() * 12}px`;
        overlay.appendChild(piece);
    }

    messageBox.classList.add('celebrate');
    setTimeout(() => {
        overlay.classList.remove('active');
        overlay.innerHTML = '';
        messageBox.classList.remove('celebrate');
    }, 2200);
}

function updateAttemptDisplay() {
    attemptDisplay.textContent = `${attempts}/${MAX_ATTEMPTS}`;
}

// --- Dynamic Hint Generation ---
function updateHint() {
    if (!dailyTrack) {
        hintDisplay.textContent = '—';
        return;
    }

    // Progressively reveal hints based on attempts or default to Album name
    if (attempts >= 3 && dailyTrack.artistName) {
        hintDisplay.textContent = `Artist starts with '${dailyTrack.artistName.charAt(0)}'`;
    } else if (dailyTrack.collectionName) {
        hintDisplay.textContent = dailyTrack.collectionName;
    } else {
        hintDisplay.textContent = 'Popular Track';
    }
}

function updateBoardList() {
    boardContainer.innerHTML = '';
    guesses.forEach(g => {
        const div = document.createElement('div');
        div.className = 'message-box guess-row-anim';
        div.style.marginBottom = '6px';
        div.textContent = g;
        boardContainer.appendChild(div);
    });
    boardContainer.scrollTop = boardContainer.scrollHeight;
}

// --- Autocomplete ---
function hideSuggestions() {
    if (!suggestionBox) return;
    suggestionBox.style.display = 'none';
    suggestionBox.innerHTML = '';
}

function renderSuggestions(items) {
    if (!suggestionBox) return;
    suggestionBox.innerHTML = '';

    if (!items || items.length === 0) { 
        hideSuggestions(); 
        return; 
    }

    items.forEach(it => {
        const row = document.createElement('div');
        row.className = 'suggestion-row';
        row.dataset.trackName = it.trackName;
        row.innerHTML = `<strong style="display:block;color:#fff">${it.trackName}</strong><span style="color:#9fb3cf">${it.artistName}</span>`;
        
        row.addEventListener('mousedown', (ev) => ev.preventDefault());
        row.addEventListener('click', () => {
            guessInput.value = `${it.trackName}`;
            hideSuggestions();
            guessInput.focus();
        });
        
        suggestionBox.appendChild(row);
    });
    
    suggestionBox.style.display = 'block';
}

async function fetchSuggestions(term) {
    if (!term || term.length < 2 || suggestionDisabled) return [];
    if (suggestionCache[term]) return suggestionCache[term];
    
    const params = `term=${encodeURIComponent(term)}&media=music&entity=song&limit=6&country=US`;
    let data = null;
    try {
        data = await safeiTunesQuery(params);
    } catch (e) {
        console.warn('fetchSuggestions failed:', e);
        suggestionDisabled = true;
        return [];
    }
    
    if (!data || !data.results) return [];
    
    const items = data.results.filter(r => r.previewUrl).map(r => ({ trackName: r.trackName, artistName: r.artistName }));
    suggestionCache[term] = items;
    return items;
}

function scheduleSuggestions(term) {
    if (suggestionDisabled) return;
    if (suggestionTimer) clearTimeout(suggestionTimer);
    suggestionTimer = setTimeout(async () => {
        const items = await fetchSuggestions(term);
        renderSuggestions(items);
    }, 200);
}

function revealSeconds() {
    return Math.min(MAX_PREVIEW_SECONDS, INITIAL_REVEAL_SECONDS + attempts * REVEAL_INCREMENT);
}

function playSnippet(seconds) {
    if (!dailyTrack || !dailyTrack.previewUrl) return;
    try {
        audio.pause();
        audio.src = dailyTrack.previewUrl;
        audio.currentTime = 0;
        
        playBtn.classList.add('pulse-anim');
        audio.play().catch(() => {});
        
        const stopAfter = Math.min(seconds, MAX_PREVIEW_SECONDS);
        setTimeout(() => {
            try { 
                audio.pause(); 
                playBtn.classList.remove('pulse-anim');
            } catch (e) {}
        }, stopAfter * 1000 + 250);
    } catch (e) {}
}

function playFullPreview() {
    if (!dailyTrack || !dailyTrack.previewUrl) return;
    try {
        audio.pause();
        audio.src = dailyTrack.previewUrl;
        audio.currentTime = 0;
        audio.play().catch(() => {});
    } catch (e) {}
}

function saveState(passed) {
    const state = { date: TODAY, attempts, guesses, gameOver, passed, dailyTrack };
    localStorage.setItem(`tunetile_state_${TODAY}`, JSON.stringify(state));
}

function restoreState() {
    const raw = localStorage.getItem(`tunetile_state_${TODAY}`);
    if (!raw) return false;
    try {
        const st = JSON.parse(raw);
        attempts = st.attempts || 0;
        guesses = st.guesses || [];
        gameOver = !!st.gameOver;
        dailyTrack = st.dailyTrack || null;
        updateAttemptDisplay();
        updateBoardList();
        
        if (gameOver) {
            setMessage(st.passed ? `🎉 Solved! ${dailyTrack.trackName} — ${dailyTrack.artistName}` : `Game over! It was ${dailyTrack.trackName} — ${dailyTrack.artistName}`, st.passed ? 'success' : 'error');
            guessInput.disabled = true; 
            guessBtn.disabled = true;
            revealAnswer();
        } else {
            setMessage(`Guess the song or artist — ${MAX_ATTEMPTS - attempts} attempts left.`, 'info');
        }
        updateHint();
        return true;
    } catch (e) { return false; }
}

async function fetchDailyTrack() {
    const stored = localStorage.getItem(`tunetile_track_${TODAY}`);
    if (stored) {
        try { dailyTrack = JSON.parse(stored); return dailyTrack; } catch (e) {}
    }

    const termIndex = SEED % CURATED_TERMS.length;
    let tries = CURATED_TERMS.length;
    let idx = termIndex;

    while (tries-- > 0) {
        const term = CURATED_TERMS[idx];
        const params = `term=${encodeURIComponent(term)}&media=music&entity=song&limit=25&country=US`;
        const data = await safeiTunesQuery(params);

        if (data && data.results && data.results.length > 0) {
            const pick = SEED % data.results.length;
            const item = data.results[pick];
            if (item && item.previewUrl) {
                dailyTrack = {
                    trackName: item.trackName,
                    artistName: item.artistName,
                    previewUrl: item.previewUrl,
                    artwork: item.artworkUrl100 || item.artworkUrl60,
                    collectionName: item.collectionName || ''
                };
                localStorage.setItem(`tunetile_track_${TODAY}`, JSON.stringify(dailyTrack));
                return dailyTrack;
            }
        }
        idx = (idx + 1) % CURATED_TERMS.length;
    }

    dailyTrack = null;
    return null;
}

function checkCorrectGuess(guess) {
    if (!dailyTrack) return false;
    const nGuess = normalizeForCompare(guess);
    const nTitle = normalizeForCompare(dailyTrack.trackName);
    const nArtist = normalizeForCompare(dailyTrack.artistName);
    if (nGuess === nTitle || nTitle.includes(nGuess)) return 'title';
    if (nGuess === nArtist || nArtist.includes(nGuess)) return 'artist';
    return false;
}

async function handleGuess() {
    if (gameOver) return;
    const raw = guessInput.value.trim();
    if (!raw) { setMessage('Please type an artist or song title.', 'warning'); return; }
    
    if (guesses.map(x => x.toUpperCase()).includes(raw.toUpperCase())) { 
        setMessage('You already guessed that.', 'warning'); 
        guessInput.value = ''; 
        return; 
    }

    guesses.push(raw);
    updateBoardList();

    const res = checkCorrectGuess(raw);
    if (res) {
        gameOver = true;
        setMessage(`🎉 Correct — ${res === 'title' ? 'song' : 'artist'} matched! ${dailyTrack.trackName} — ${dailyTrack.artistName}`, 'success');
        celebrateSuccess();
        guessInput.disabled = true; 
        guessBtn.disabled = true;
        playFullPreview();
        revealAnswer();
        saveState(true);
        hideSuggestions();
        return;
    }

    attempts++;
    updateAttemptDisplay();

    if (attempts >= MAX_ATTEMPTS) {
        gameOver = true;
        setMessage(`❌ Out of attempts. It was: ${dailyTrack.trackName} — ${dailyTrack.artistName}`, 'error');
        guessInput.disabled = true; 
        guessBtn.disabled = true;
        playFullPreview();
        revealAnswer();
        saveState(false);
        hideSuggestions();
        return;
    }

    const secs = revealSeconds();
    cluePreview.textContent = `Preview: ${secs}s / ${MAX_PREVIEW_SECONDS}s`;
    playSnippet(secs);
    setMessage(`Not quite — try again. ${MAX_ATTEMPTS - attempts} attempts left.`, 'info');
    saveState(false);
    guessInput.value = '';
    hideSuggestions();
}

async function init() {
    setMessage('Loading today\'s tune...');
    updateAttemptDisplay();
    updateHint();

    boardContainer.innerHTML = '';

    await fetchDailyTrack();
    const restored = restoreState();
    updateHint();

    if (!dailyTrack) {
        setMessage('No track available today — try again later.', 'error');
        guessInput.disabled = true; 
        guessBtn.disabled = true; 
        playBtn.disabled = true;
        return;
    }

    const title = document.createElement('div');
    const masked = maskTitle(dailyTrack.trackName);
    title.innerHTML = `<strong id="answerTitle">${masked}</strong>`;
    title.style.marginBottom = '4px';

    const art = document.createElement('img');
    art.src = dailyTrack.artwork;
    art.alt = dailyTrack.trackName;
    art.style.width = '64px'; 
    art.style.height = '64px'; 
    art.style.borderRadius = '10px'; 
    art.style.marginRight = '10px';

    const melodyBox = document.querySelector('.melody-box');
    if (melodyBox) {
        melodyBox.innerHTML = '';
        const left = document.createElement('div');
        left.style.display = 'flex'; 
        left.style.alignItems = 'center';
        left.appendChild(art);
        
        const info = document.createElement('div');
        info.appendChild(title);
        
        const clue = document.createElement('div');
        clue.id = 'cluePreview';
        clue.className = 'clue-text';
        clue.innerHTML = `<i class="fa-regular fa-lightbulb"></i> <strong>Preview: ${revealSeconds()}s / ${MAX_PREVIEW_SECONDS}s</strong>`;
        info.appendChild(clue);
        left.appendChild(info);

        const right = document.createElement('div');
        const play = document.createElement('button');
        play.id = 'playMelodyBtn';
        play.className = 'play-btn';
        play.innerHTML = '<i class="fa-solid fa-play"></i> Play preview';
        right.appendChild(play);
        
        melodyBox.appendChild(left);
        melodyBox.appendChild(right);

        play.addEventListener('click', () => playSnippet(revealSeconds()));
        playBtn = play;
        cluePreview = clue;
        answerTitleElement = document.getElementById('answerTitle');
    }

    if (!restored) {
        setTimeout(() => {
            cluePreview.textContent = `Preview: ${revealSeconds()}s / ${MAX_PREVIEW_SECONDS}s`;
            playSnippet(revealSeconds());
            setMessage(`Guess the song or artist — ${MAX_ATTEMPTS} attempts.`, 'info');
        }, 300);
    }

    guessBtn.addEventListener('click', handleGuess);
    guessInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleGuess();
        } else if (e.key === 'Tab' && suggestionBox && suggestionBox.style.display === 'block') {
            const firstRow = suggestionBox.querySelector('.suggestion-row');
            if (firstRow) {
                e.preventDefault();
                guessInput.value = firstRow.dataset.trackName || guessInput.value;
                hideSuggestions();
                guessInput.focus();
            }
        }
    });

    guessInput.addEventListener('focus', () => {
        setTimeout(() => {
            guessInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
    });

    guessInput.addEventListener('input', (e) => {
        const term = e.target.value.trim();
        if (suggestionDisabled || term.length < 2) {
            hideSuggestions();
            return;
        }
        scheduleSuggestions(term);
    });

    document.addEventListener('click', (e) => {
        if (!suggestionBox.contains(e.target) && !guessInput.contains(e.target)) {
            hideSuggestions();
        }
    });

    guessInput.addEventListener('blur', () => setTimeout(hideSuggestions, 200));
}

init();