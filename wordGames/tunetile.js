/* Tunetile — Songdle-style overhaul using iTunes API with Safe Redirect Bypass */

const ITUNES_BASE = 'https://itunes.apple.com/search';

// Use LOCAL date (not UTC/ISO) so the daily song resets exactly at 00:00 local time
function getLocalDateStr(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
let TODAY = getLocalDateStr();
const SEED = new Date().getFullYear() * 10000 + (new Date().getMonth() + 1) * 100 + new Date().getDate();

const CURATED_TERMS = [
    'Taylor Swift','Ed Sheeran','The Weeknd','Adele','Bruno Mars','Michael Jackson','Queen','The Beatles',
    'ABBA','Nirvana','Pharrell Williams','Beyonce','Drake','Ariana Grande','Coldplay','Billie Eilish','Katy Perry'
];

const MAX_ATTEMPTS = 6;
const PREVIEW_RAMP = [1, 2, 4, 7, 11, 16]; //[cite: 2]
const MAX_PREVIEW_SECONDS = 16; //[cite: 2]

// Cover-art progressive de-blur (clears up with each wrong guess)
const ARTWORK_BLUR_START_PX = 6;
const ARTWORK_BLUR_STEP_PX = 1;

// DOM References
let playBtn = document.getElementById('playMelodyBtn');
let cluePreview = document.getElementById('cluePreview');
const guessInput = document.getElementById('guessInput');
const guessBtn = document.getElementById('guessBtn');
const skipBtn = document.getElementById('skipBtn');
const messageBox = document.getElementById('messageBox');
const attemptDisplay = document.getElementById('attemptDisplay');
const hintDisplay = document.getElementById('hintDisplay');
const boardContainer = document.getElementById('boardContainer');
const suggestionBox = document.getElementById('suggestionBox');
const progressFill = document.getElementById('progressFill');
const progressCount = document.getElementById('progressCount');
const progressTicks = document.getElementById('progressTicks');

let suggestionTimer = null;
let suggestionCache = {};
let suggestionDisabled = false;
let answerTitleElement = null;
let coverArtElement = null;

// Game State
let dailyTrack = null;
let audio = new Audio();
let attempts = 0;
let guesses = [];
let gameOver = false;
let volume = 0.1; // Default volume: 10%
audio.volume = volume;

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
    if (messageBox) {
        messageBox.textContent = text;
        messageBox.className = `message-box ${type} msg-anim`;
    }
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

    if (messageBox) messageBox.classList.add('celebrate');
    setTimeout(() => {
        overlay.classList.remove('active');
        overlay.innerHTML = '';
        if (messageBox) messageBox.classList.remove('celebrate');
    }, 2200);
}

function updateAttemptDisplay() {
    if (attemptDisplay) attemptDisplay.textContent = `${attempts}/${MAX_ATTEMPTS}`;
}

// --- Progressive Cover-Art De-blur ---
function getArtworkBlurPx() {
    if (gameOver) return 0; // Fully revealed on win/game-over
    return Math.max(0, ARTWORK_BLUR_START_PX - attempts * ARTWORK_BLUR_STEP_PX);
}

function updateArtworkBlur() {
    if (!coverArtElement) return;
    const blurPx = getArtworkBlurPx();
    coverArtElement.style.filter = `blur(${blurPx}px)`;
    coverArtElement.style.transform = blurPx > 0 ? 'scale(1.06)' : 'scale(1)';
}

// --- Song Progress Bar UI ---
function buildProgressTicks() {
    if (!progressTicks) return;
    progressTicks.innerHTML = '';
    const secs = revealSeconds();
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const t = document.createElement('div');
        t.className = 'tick' + (PREVIEW_RAMP[i] <= secs ? ' active' : '');
        t.style.left = ((PREVIEW_RAMP[i] / MAX_PREVIEW_SECONDS) * 100) + '%';
        t.setAttribute('aria-hidden', 'true');
        progressTicks.appendChild(t);
    }
}

function updateSongProgress() {
    if (!progressFill) return;
    const playing = audio && !audio.paused && !audio.ended && isFinite(audio.currentTime);
    const posSecs = playing ? Math.max(0, audio.currentTime) : revealSeconds();
    const pct = playing
        ? Math.min(100, (posSecs / MAX_PREVIEW_SECONDS) * 100)
        : Math.min(100, Math.round((posSecs / MAX_PREVIEW_SECONDS) * 100));
    
    progressFill.style.width = pct + '%';
    
    if (progressCount) {
        progressCount.textContent = playing
            ? `${Math.floor(audio.currentTime)}s / ${Math.min(revealSeconds(), MAX_PREVIEW_SECONDS)}s`
            : `${revealSeconds()}s / ${MAX_PREVIEW_SECONDS}s`;
    }
    
    if (progressTicks) {
        const ticks = progressTicks.querySelectorAll('.tick');
        const unlockSecs = revealSeconds();
        ticks.forEach(t => {
            const pos = parseFloat(t.style.left) || 0;
            const isActive = (pos / 100) * MAX_PREVIEW_SECONDS <= unlockSecs;
            t.classList.toggle('active', isActive);
        });
    }
}

// --- Dynamic Hint Generation ---
function updateHint() {
    if (!hintDisplay) return;
    if (!dailyTrack) {
        hintDisplay.textContent = '—';
        return;
    }

    let hint = `Artist starts with '${dailyTrack.artistName.charAt(0)}'`;
    
    if (attempts >= MAX_ATTEMPTS - 1 && dailyTrack.trackName) {
        hint += ` | Song starts with '${dailyTrack.trackName.charAt(0)}'`;
    }
    
    hintDisplay.textContent = hint;
}

function updateBoardList() {
    if (!boardContainer) return;
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

// --- First-Attempt Autofill Toggle ---
function updateAutofillState() {
    if (!guessInput) return;

    if (attempts === 0) {
        guessInput.type = 'text';
        guessInput.setAttribute('autocomplete', 'none');
        guessInput.setAttribute('aria-autocomplete', 'none');
        guessInput.setAttribute('role', 'presentation');
        guessInput.setAttribute('autocorrect', 'off');
        guessInput.setAttribute('autocapitalize', 'off');
        guessInput.setAttribute('spellcheck', 'false');
        guessInput.setAttribute('name', `field_no_fill_${Math.random().toString(36).substring(2, 7)}`);
    } else {
        guessInput.removeAttribute('role');
        guessInput.setAttribute('autocomplete', 'on');
        guessInput.setAttribute('aria-autocomplete', 'list');
        guessInput.setAttribute('autocorrect', 'on');
        guessInput.setAttribute('autocapitalize', 'on');
        guessInput.setAttribute('spellcheck', 'true');
        guessInput.setAttribute('name', 'guessInput');
    }
}

// --- Autocomplete ---
function suggestionsAllowed() {
    return attempts > 0 && !suggestionDisabled;
}

function hideSuggestions() {
    if (!suggestionBox) return;
    suggestionBox.style.display = 'none';
    suggestionBox.innerHTML = '';
}

function renderSuggestions(items) {
    if (!suggestionBox || !suggestionsAllowed()) return;
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
            if (guessInput) guessInput.value = `${it.trackName}`;
            hideSuggestions();
            if (guessInput) guessInput.focus();
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
    if (!suggestionsAllowed()) return;
    if (suggestionTimer) clearTimeout(suggestionTimer);
    suggestionTimer = setTimeout(async () => {
        const items = await fetchSuggestions(term);
        renderSuggestions(items);
    }, 200);
}

function revealSeconds() {
    return Math.min(MAX_PREVIEW_SECONDS, PREVIEW_RAMP[Math.min(attempts, MAX_ATTEMPTS - 1)]); //[cite: 2]
}

function playSnippet(seconds) {
    if (!dailyTrack || !dailyTrack.previewUrl) return;
    try {
        audio.pause();
        audio.src = dailyTrack.previewUrl;
        audio.currentTime = 0;
        audio.volume = volume;
        
        if (playBtn) playBtn.classList.add('pulse-anim');
        audio.play().catch(() => {});
        
        const stopAfter = Math.min(seconds, MAX_PREVIEW_SECONDS);
        setTimeout(() => {
            try { 
                audio.pause(); 
                if (playBtn) playBtn.classList.remove('pulse-anim');
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
        audio.volume = volume;
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
        updateAutofillState();
        updateBoardList();
        
        if (gameOver) {
            setMessage(st.passed ? `🎉 Solved! ${dailyTrack.trackName} — ${dailyTrack.artistName}` : `Game over! It was ${dailyTrack.trackName} — ${dailyTrack.artistName}`, st.passed ? 'success' : 'error');
            if (guessInput) guessInput.disabled = true; 
            if (guessBtn) guessBtn.disabled = true;
            if (skipBtn) skipBtn.disabled = true;
            revealAnswer();
        } else {
            setMessage(`Guess the song — ${MAX_ATTEMPTS - attempts} attempts left.`, 'info');
        }
        updateHint();
        buildProgressTicks();
        updateSongProgress();
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
                    artwork: (item.artworkUrl100 || item.artworkUrl60 || '').replace(/\/(\d+)x\1/, '/300x300'),
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
    
    if (nGuess === nTitle || nTitle.includes(nGuess)) return 'title';
    return false;
}

// --- Skip Action (Adapted from Songdless) ---
function handleSkip() {
    if (gameOver || !skipBtn || skipBtn.disabled) return;

    attempts++;
    updateAttemptDisplay();
    updateAutofillState();
    updateHint();
    updateArtworkBlur();
    updateSongProgress();

    if (attempts >= MAX_ATTEMPTS) {
        gameOver = true;
        setMessage(`❌ Out of attempts. It was: ${dailyTrack.trackName} — ${dailyTrack.artistName}`, 'error');
        if (guessInput) guessInput.disabled = true;
        if (guessBtn) guessBtn.disabled = true;
        if (skipBtn) skipBtn.disabled = true;
        playFullPreview();
        revealAnswer();
        updateArtworkBlur();
        updateSongProgress();
        saveState(false);
        hideSuggestions();
        return;
    }

    const secs = revealSeconds();
    if (cluePreview) cluePreview.textContent = `Preview: ${secs}s / ${MAX_PREVIEW_SECONDS}s`;
    playSnippet(secs);
    setMessage(`Skipped a guess — ${MAX_ATTEMPTS - attempts} attempts left.`, 'info');
    saveState(false);
    guessInput.value = '';
    hideSuggestions();
}

async function handleGuess() {
    if (gameOver || !guessInput) return;
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
        setMessage(`🎉 Correct! ${dailyTrack.trackName} — ${dailyTrack.artistName}`, 'success');
        celebrateSuccess();
        if (guessInput) guessInput.disabled = true; 
        if (guessBtn) guessBtn.disabled = true;
        if (skipBtn) skipBtn.disabled = true;
        playFullPreview();
        revealAnswer();
        updateArtworkBlur();
        updateSongProgress();
        saveState(true);
        hideSuggestions();
        return;
    }

    attempts++;
    updateAttemptDisplay();
    updateArtworkBlur();
    updateAutofillState();
    updateHint();
    updateSongProgress();

    if (attempts >= MAX_ATTEMPTS) {
        gameOver = true;
        setMessage(`❌ Out of attempts. It was: ${dailyTrack.trackName} — ${dailyTrack.artistName}`, 'error');
        if (guessInput) guessInput.disabled = true; 
        if (guessBtn) guessBtn.disabled = true;
        if (skipBtn) skipBtn.disabled = true;
        playFullPreview();
        revealAnswer();
        updateArtworkBlur();
        updateSongProgress();
        saveState(false);
        hideSuggestions();
        return;
    }

    const secs = revealSeconds();
    if (cluePreview) cluePreview.textContent = `Preview: ${secs}s / ${MAX_PREVIEW_SECONDS}s`;
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

    if (boardContainer) boardContainer.innerHTML = '';

    await fetchDailyTrack();
    const restored = restoreState();
    if (!restored) {
        updateAutofillState();
    }
    updateHint();

    if (!dailyTrack) {
        setMessage('No track available today — try again later.', 'error');
        if (guessInput) guessInput.disabled = true; 
        if (guessBtn) guessBtn.disabled = true; 
        if (skipBtn) skipBtn.disabled = true;
        if (playBtn) playBtn.disabled = true;
        return;
    }

    const title = document.createElement('div');
    const masked = maskTitle(dailyTrack.trackName);
    title.innerHTML = `<strong id="answerTitle">${masked}</strong>`;
    title.style.marginBottom = '4px';

    const art = document.createElement('img');
    art.src = dailyTrack.artwork;
    art.alt = dailyTrack.trackName;
    art.id = 'coverArt';
    art.style.width = '64px'; 
    art.style.height = '64px'; 
    art.style.borderRadius = '10px'; 
    art.style.marginRight = '10px';
    art.style.transition = 'filter 0.7s ease, transform 0.7s ease';
    coverArtElement = art;
    updateArtworkBlur();

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
        right.style.display = 'flex';
        right.style.flexDirection = 'column';
        right.style.alignItems = 'flex-end';
        right.style.gap = '0.5rem';

        const play = document.createElement('button');
        play.id = 'playMelodyBtn';
        play.className = 'play-btn';
        play.innerHTML = '<i class="fa-solid fa-play"></i> Play preview';
        right.appendChild(play);

        // Volume control
        const volControl = document.createElement('div');
        volControl.className = 'volume-control';
        const volIcon = document.createElement('i');
        volIcon.className = 'fa-solid fa-volume-low';
        const volSlider = document.createElement('input');
        volSlider.type = 'range';
        volSlider.className = 'volume-slider';
        volSlider.min = '0';
        volSlider.max = '100';
        volSlider.value = Math.round(volume * 100);
        volSlider.setAttribute('aria-label', 'Volume');
        volControl.appendChild(volIcon);
        volControl.appendChild(volSlider);
        right.appendChild(volControl);

        volSlider.addEventListener('input', () => {
            volume = volSlider.value / 100;
            audio.volume = volume;
            volIcon.className = volume === 0 ? 'fa-solid fa-volume-xmark' : (volume < 0.5 ? 'fa-solid fa-volume-low' : 'fa-solid fa-volume-high');
        });

        melodyBox.appendChild(left);
        melodyBox.appendChild(right);

        play.addEventListener('click', () => playSnippet(revealSeconds()));
        playBtn = play;
        cluePreview = clue;
        answerTitleElement = document.getElementById('answerTitle');
    }

    buildProgressTicks();
    updateSongProgress();

    ['timeupdate', 'playing', 'durationchange', 'pause', 'ended', 'seeked'].forEach(ev =>
        audio.addEventListener(ev, updateSongProgress)
    );

    if (!restored) {
        setTimeout(() => {
            if (cluePreview) cluePreview.textContent = `Preview: ${revealSeconds()}s / ${MAX_PREVIEW_SECONDS}s`;
            playSnippet(revealSeconds());
            setMessage(`Guess the song — ${MAX_ATTEMPTS} attempts.`, 'info');
        }, 300);
    }

    if (guessBtn) guessBtn.addEventListener('click', handleGuess);
    if (skipBtn) skipBtn.addEventListener('click', handleSkip);

    if (guessInput) {
        guessInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
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
            if (!suggestionsAllowed() || term.length < 2) {
                hideSuggestions();
                return;
            }
            scheduleSuggestions(term);
        });

        guessInput.addEventListener('blur', () => setTimeout(hideSuggestions, 200));
    }

    document.addEventListener('click', (e) => {
        if (suggestionBox && guessInput && !suggestionBox.contains(e.target) && !guessInput.contains(e.target)) {
            hideSuggestions();
        }
    });

    const guessForm = document.getElementById('guessForm');
    if (guessForm) {
        if (!document.getElementById('dummyAutofillTrap')) {
            const dummyInput = document.createElement('input');
            dummyInput.id = 'dummyAutofillTrap';
            dummyInput.type = 'text';
            dummyInput.name = 'search';
            dummyInput.style.position = 'absolute';
            dummyInput.style.top = '-9999px';
            dummyInput.style.left = '-9999px';
            dummyInput.setAttribute('autocomplete', 'on');
            dummyInput.tabIndex = -1;
            guessForm.prepend(dummyInput);
        }

        guessForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleGuess();
        });
    }
}

// --- Daily Reset Timer (counts down to 00:00 local time) ---
function msUntilLocalMidnight() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
}

function updateResetTimer() {
    const el = document.getElementById('resetTimer');
    if (!el) return;
    const totalSec = Math.max(0, Math.floor(msUntilLocalMidnight() / 1000));
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    el.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function checkDayRollover() {
    if (getLocalDateStr() === TODAY) return false;
    location.reload();
    return true;
}

updateResetTimer();
setInterval(() => {
    if (!checkDayRollover()) updateResetTimer();
}, 1000);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}