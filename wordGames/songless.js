/* SONGdless — daily song guessing game.
 *  - Hears a short clip of a mystery song (iTunes Search API previews via proxy)
 *  - Each wrong guess reveals another lyric line (LRCLIB + lyrics.ovh via proxy)
 *  - 6 attempts, then reveal.
 */
const ITUNES_BASE = 'https://itunes.apple.com/search';

// Use LOCAL date so the daily song resets exactly at 00:00 local time
function getLocalDateStr(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
let TODAY = getLocalDateStr();
const SEED = new Date().getFullYear() * 10000 + (new Date().getMonth() + 1) * 100 + new Date().getDate();

// --- Genre presets: each genre has its own daily song & progress ---
const GENRES = [
    { key: 'pop',     label: 'Pop',     icon: 'fa-music',        terms: ['Taylor Swift', 'Ariana Grande', 'Dua Lipa', 'The Weeknd', 'Ed Sheeran', 'Katy Perry', 'Billie Eilish', 'Bruno Mars', 'Harry Styles', 'Justin Bieber', 'Lady Gaga', 'Rihanna', 'Shawn Mendes', 'Post Malone', 'Doja Cat', 'Adele', 'Sia', 'Camila Cabello', 'Lewis Capaldi', 'Olivia Rodrigo'] },
    { key: 'hiphop',  label: 'Hip-Hop', icon: 'fa-headphones',   terms: ['Drake', 'Kendrick Lamar', 'J. Cole', 'Travis Scott', 'Jay-Z', 'Nicki Minaj', 'Lil Wayne', 'Kanye West', 'Future', 'Cardi B', 'Megan Thee Stallion', 'A$AP Rocky', 'Playboi Carti', 'Wiz Khalifa', 'Tyler, the Creator', 'Ice Spice', 'Young Thug', 'Lil Uzi Vert', 'Big Sean', 'Lil Baby'] },
    { key: 'rap',     label: 'Rap',     icon: 'fa-microphone',   terms: ['Eminem', '50 Cent', 'Snoop Dogg', 'Nas', 'Dr. Dre', 'Ice Cube', 'Notorious B.I.G.', 'Tupac', 'Lil Nas X', 'Kendrick Lamar', 'Tech N9ne', 'MF DOOM', 'Kid Cudi', 'Logic', 'J. Cole', 'Chance the Rapper', 'Common', 'Lauryn Hill', 'Big L', 'Mobb Deep'] },
    { key: 'rock',    label: 'Rock',    icon: 'fa-guitar',       terms: ['Queen', 'The Beatles', 'Nirvana', 'AC/DC', 'Led Zeppelin', 'Pink Floyd', 'The Rolling Stones', 'Guns N Roses', 'Bon Jovi'] },
    { key: 'rnb',     label: 'R&B',     icon: 'fa-heart',        terms: ['Beyonce', 'Rihanna', 'SZA', 'Usher', 'Mariah Carey', 'Alicia Keys', 'John Legend', 'Chris Brown', 'Trey Songz'] },
    { key: 'country', label: 'Country', icon: 'fa-hat-cowboy',   terms: ['Taylor Swift', 'Luke Bryan', 'Carrie Underwood', 'Luke Combs', 'Dolly Parton', 'Garth Brooks', 'Kenny Chesney', 'Shania Twain', 'Morgan Wallen'] }
];
let gameMode = 'daily'; // 'daily' | 'endless'

// Endless-mode scoring: up to 100 pts per correct guess — more for being fast
// and using fewer attempts. 1st-attempt guess = high bonus; late guess = lower.
const ENDLESS_BASE = 100;
const ENDLESS_TIME_PENALTY = 2;       // minus pts per elapsed second at guess time
const ENDLESS_TIME_CAP_SEC = 30;      // beyond this, time penalty stops growing

let currentGenreKey = GENRES[0].key;

function getGenreByKey(key) {
    return GENRES.find(g => g.key === key) || GENRES[0];
}
function currentGenre() { return getGenreByKey(currentGenreKey); }
// Per-genre storage keys so switching genres gives an independent daily game
const stateKey  = () => `songless_state_${TODAY}_${currentGenreKey}`;
const trackKey  = () => `songless_track_${TODAY}_${currentGenreKey}`;

const MAX_ATTEMPTS = 6;
// Audio preview increases with each attempt (capped by Apple's 30s clip)
const PREVIEW_RAMP = [1, 2, 4, 7, 11, 16];
const MAX_PREVIEW_SECONDS = 16;
// Cover-art progressive de-blur (clears up with each wrong guess / skip, like Tunetile)
const ARTWORK_BLUR_START_PX = 6;
const ARTWORK_BLUR_STEP_PX = 1;
const MAX_LYRIC_CHECKS = 8;   // how many candidates to try before relaxing the lyric requirement

// -- Stop words excluded from lyric-title masking so common words stay readable
const STOP_WORDS = new Set([
    'A','AN','THE','IN','ON','AT','TO','OF','FOR','AND','YOU','I','ME','MY','IS','ARE',
    'WAS','WERE','IT','WE','HE','SHE','THEY','THESE','THOSE','YOUR','YOURE','ITS','THEYRE',
    'BE','AM','DO','DONT','CAN','CANT','SO','BUT','OR','IF','THAT','THIS','WITH'
]);

// DOM References
const playBtn0 = document.getElementById('playMelodyBtn');
let cluePreview = document.getElementById('cluePreview');
const guessInput = document.getElementById('guessInput');
const guessBtn = document.getElementById('guessBtn');
const skipBtn = document.getElementById('skipBtn');
const genreBar = document.getElementById('genreBar');
const modeToggle = document.getElementById('modeToggle');
const scoreBadge = document.getElementById('scoreBadge');
const scoreDisplay = document.getElementById('scoreDisplay');
const messageBox = document.getElementById('messageBox');
const attemptDisplay = document.getElementById('attemptDisplay');
const hintDisplay = document.getElementById('hintDisplay');
const boardContainer = document.getElementById('boardContainer');
const suggestionBox = document.getElementById('suggestionBox');
const lyricClue = document.getElementById('lyricClue');
const lyricSrc = document.getElementById('lyricSrc');
const progressFill = document.getElementById('progressFill');
const progressCount = document.getElementById('progressCount');
const progressTicks = document.getElementById('progressTicks');

let suggestionTimer = null;
let suggestionCache = {};
let suggestionDisabled = false;
let playBtn = playBtn0;

// Game State
let dailyTrack = null;
let lyrics = null;        // { plainLyrics, syncedLyrics, source, found }
let lyricLines = [];      // cleaned non-empty lyric lines (chronological)
let audio = new Audio();
let previewStopTimer = null;
let attempts = 0;
let guesses = [];
let gameOver = false;
let volume = 0.1;
audio.volume = volume;

// Endless mode state
let endlessScore = 0;
let endlessRounds = 0;
let endlessRoundStartTime = 0;   // ms timestamp when the current endless round started
let endlessUsedTerms = [];       // to reduce repeats across endless rounds

// --- CORS & Scheme-Redirect Safe Fetcher (iTunes search proxy + JSONP fallback) ---
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
        const callbackName = `songlessJSONP_${Math.random().toString(36).slice(2)}`;
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

// --- Lyrics proxy (no JSONP fallback; via /api/lyrics serverless function) ---
async function fetchLyrics(artist, title) {
    const q = `/api/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`;
    try {
        const res = await fetch(q);
        if (!res.ok) return { found: false };
        return await res.json();
    } catch (err) {
        console.warn('Lyrics fetch error:', err);
        return { found: false };
    }
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

// --- Lyric line extraction -------------------------------------------------

// Pick the best source: synced (LRC) gives clean line-per-line separation.
function buildLyricLines() {
    if (!lyrics || !lyrics.found) { lyricLines = []; return; }

    let lines;
    if (lyrics.syncedLyrics) {
        // Each line looks like "[00:52.66] I came along"
        lines = String(lyrics.syncedLyrics).split(/\n+/).map(l => l.replace(/^\s*\[[0-9:. \]]+\]\s*/, '').trim());
    } else if (lyrics.plainLyrics) {
        lines = String(lyrics.plainLyrics).split(/\n+/).map(l => l.trim());
    } else {
        lyricLines = [];
        return;
    }

    // Keep non-empty, non-bracketed (like [Chorus]) lines, modest length.
    lyricLines = lines.filter(l => {
        if (!l) return false;
        if (/^[\[\(].*[\]\)]$/.test(l)) return false; // section markers
        if (/^[≈~•\-\*]+$/.test(l)) return false;
        if (l.replace(/[^A-Za-z0-9]/g, '').length < 2) return false;
        if (l.length > 90) return false;
        return true;
    });
}

// Whole-word matches of significant title words get masked in lyric clues so
// the answer isn't trivially spelled out, while short stop words stay readable.
function titleMaskWords() {
    const out = new Set();
    if (!dailyTrack || !dailyTrack.trackName) return out;
    String(dailyTrack.trackName).split(/[^A-Za-z0-9]+/).forEach(w => {
        const up = (w || '').toUpperCase();
        if (up.length >= 2 && !STOP_WORDS.has(up)) out.add(up);
    });
    return out;
}

function maskLyricLine(line) {
    if (!line) return '';
    if (gameOver) return line; // fully revealed at end
    const maskWords = titleMaskWords();
    if (maskWords.size === 0) return line;
    return line.replace(/[A-Za-z0-9']+/g, (tok) => {
        const key = tok.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        if (key.length >= 2 && maskWords.has(key)) {
            return tok.replace(/[A-Za-z0-9]/g, '•'); // keep apostrophe, replace letters/digits
        }
        return tok;
    });
}

// Reveal lyric lines based on how many wrong guesses have been made.
function revealedLyricCount() {
    if (gameOver) return lyricLines.length;
    // Start with 1 line; each wrong guess reveals one more (max ~half).
    return Math.min(lyricLines.length, 1 + Math.min(attempts, MAX_ATTEMPTS - 1));
}

function updateLyricClue() {
    if (!lyricClue) return;
    if (!lyrics || !lyrics.found || lyricLines.length === 0) {
        lyricClue.textContent = dailyTrack && dailyTrack.collectionName && !albumRevealsSongName(dailyTrack.collectionName)
            ? `No lyrics available — hint: from album “${dailyTrack.collectionName}”`
            : 'No lyrics available for this track.';
        lyricClue.className = 'lyric-clue';
        if (lyricSrc) lyricSrc.textContent = '';
        return;
    }

    const count = revealedLyricCount();
    const shown = lyricLines.slice(0, count);
    const maskedShown = shown.map(maskLyricLine);
    const masked = maskedShown.join('  /  ');
    lyricClue.textContent = `"${masked}"`;
    lyricClue.className = 'lyric-clue' + (maskedShown.some((m, i) => m !== shown[i]) ? ' masked' : '');
    if (lyricSrc) lyricSrc.textContent = `${lyrics.source === 'lyrclib' ? 'LRCLIB' : 'lyrics.ovh'} · ${shown.length}/${lyricLines.length} lines revealed`;
}

function revealSeconds() {
    return Math.min(MAX_PREVIEW_SECONDS, PREVIEW_RAMP[Math.min(attempts, MAX_ATTEMPTS - 1)]);
}

// --- Audio ---
function playSnippet(seconds, preservePosition = false) {
    if (!dailyTrack || !dailyTrack.previewUrl) return;
    try {
        if (previewStopTimer) clearTimeout(previewStopTimer);
        if (!preservePosition) {
            audio.pause();
            audio.src = dailyTrack.previewUrl;
            audio.currentTime = 0;
        }
        audio.volume = volume;
        if (playBtn) playBtn.classList.add('pulse-anim');
        audio.play().catch(() => {});
        const stopAfter = Math.min(seconds, MAX_PREVIEW_SECONDS);
        const remaining = Math.max(0, stopAfter - (Number.isFinite(audio.currentTime) ? audio.currentTime : 0));
        previewStopTimer = setTimeout(() => {
            try {
                audio.pause();
                if (playBtn) playBtn.classList.remove('pulse-anim');
            } catch (e) {}
        }, remaining * 1000 + 250);
    } catch (e) {}
}

function playFullPreview() {
    playSongRemainder();
}

function playSongRemainder() {
    if (!dailyTrack || !dailyTrack.previewUrl) return;
    try {
        if (previewStopTimer) clearTimeout(previewStopTimer);
        const currentPosition = Number.isFinite(audio.currentTime) && audio.src && audio.currentTime > 0 ? audio.currentTime : revealSeconds();
        audio.pause();
        if (!audio.src || !audio.src.includes(dailyTrack.previewUrl)) audio.src = dailyTrack.previewUrl;
        audio.currentTime = Math.max(0, currentPosition);
        audio.volume = volume;
        audio.play().catch(() => {});
        if (playBtn) playBtn.classList.add('pulse-anim');
        audio.onended = () => playBtn && playBtn.classList.remove('pulse-anim');
    } catch (e) {}
}

function showResultPanel(won, matchedBy = '') {
    if (!dailyTrack || !messageBox) return;
    const oldPanel = document.getElementById('resultPanel');
    if (oldPanel) oldPanel.remove();
    const panel = document.createElement('section');
    panel.id = 'resultPanel';
    panel.className = 'result-panel';
    panel.setAttribute('aria-label', 'Round statistics');
    const art = document.createElement('img');
    art.className = 'result-art'; art.src = dailyTrack.artwork || ''; art.alt = `${dailyTrack.trackName} cover`;
    const details = document.createElement('div');
    const kicker = document.createElement('div'); kicker.className = 'result-kicker'; kicker.textContent = won ? `Solved${matchedBy ? ` by ${matchedBy}` : ''}` : 'Song revealed';
    const title = document.createElement('div'); title.className = 'result-title'; title.textContent = dailyTrack.trackName;
    const artist = document.createElement('div'); artist.className = 'result-artist'; artist.textContent = dailyTrack.artistName;
    const stats = document.createElement('div'); stats.className = 'result-stats';
    stats.innerHTML = `<span class="result-stat">Attempts <strong>${attempts}/${MAX_ATTEMPTS}</strong></span><span class="result-stat">Lyrics <strong>${lyricLines.length} lines</strong></span>`;
    details.append(kicker, title, artist, stats);
    const play = document.createElement('button'); play.type = 'button'; play.className = 'result-play'; play.innerHTML = '<i class="fa-solid fa-play"></i> Play rest';
    play.addEventListener('click', () => { playSongRemainder(); play.innerHTML = '<i class="fa-solid fa-volume-high"></i> Playing'; });
    panel.append(art, details, play);
    messageBox.parentNode.insertBefore(panel, messageBox);
}

function updateAttemptDisplay() {
    if (attemptDisplay) attemptDisplay.textContent = `${attempts}/${MAX_ATTEMPTS}`;
    updateSongProgress();
}

// --- Cover-art progressive de-blur (clears up with each wrong guess / skip) ---
function getArtworkBlurPx() {
    if (gameOver) return 0; // Fully clear on win/game-over
    return Math.max(0, ARTWORK_BLUR_START_PX - attempts * ARTWORK_BLUR_STEP_PX);
}

function updateArtworkBlur() {
    const art = document.getElementById('albumArt');
    if (!art) return;
    const blurPx = getArtworkBlurPx();
    art.style.filter = `blur(${blurPx}px)`;
    art.style.transform = blurPx > 0 ? 'scale(1.12)' : 'scale(1)';
}

// --- Song progress bar: fills as each guess unlocks more of the preview ---
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
    // While the song is playing, follow the exact playback timestamp.
    // When idle, show the unlocked level (how much of the preview is revealed).
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

// --- Skip a turn: consume one attempt and reveal more, without recording a guess ---
function handleSkip() {
    if (gameOver || !skipBtn || skipBtn.disabled) return;

    attempts++;
    updateAttemptDisplay();
    updateAutofillState();
    updateLyricClue();
    updateHint();
    updateArtworkBlur();

    if (attempts >= MAX_ATTEMPTS) {
        if (gameMode === 'endless') {
            setMessage(`It was: ${dailyTrack.trackName} — ${dailyTrack.artistName}. Next round!`, 'error');
            setTimeout(() => nextEndlessRound(), 400);
        } else {
            setMessage(`Out of attempts. It was: ${dailyTrack.trackName} — ${dailyTrack.artistName}`, 'error');
            endGame(false);
        }
        return;
    }

    const secs = revealSeconds();
    if (cluePreview) cluePreview.textContent = `Preview: ${secs}s / ${MAX_PREVIEW_SECONDS}s`;
    playSnippet(secs, true);
    setMessage(`Skipped a guess — ${MAX_ATTEMPTS - attempts} attempts left.`, 'info');
    saveState(false);
    guessInput.value = '';
    hideSuggestions();
}

// --- State persistence (keyed by local date) ---
function saveState(passed) {
    const state = { date: TODAY, genre: currentGenreKey, attempts, guesses, gameOver, passed, dailyTrack, lyrics, lyricLines };
    try { localStorage.setItem(stateKey(), JSON.stringify(state)); } catch (e) {}
}

function restoreState() {
    let raw;
    try { raw = localStorage.getItem(stateKey()); } catch (e) { return false; }
    if (!raw) return false;
    try {
        const s = JSON.parse(raw);
        if (s.date !== TODAY) return false;
        attempts = s.attempts || 0;
        guesses = s.guesses || [];
        gameOver = s.gameOver || false;
        dailyTrack = s.dailyTrack || null;
        lyrics = s.lyrics || null;
        lyricLines = s.lyricLines || [];
        if (s.guesses && boardContainer) updateBoardList();
        updateAttemptDisplay();
        updateHint();
        updateLyricClue();
        return true;
    } catch (e) {
        return false;
    }
}

// Returns true when the album name would give away the answer (e.g. singles
// where iTunes sets collectionName equal to the track title).
function albumRevealsSongName(collectionName) {
    const track = normalizeForCompare(dailyTrack && dailyTrack.trackName);
    const album = normalizeForCompare(collectionName);
    if (!track || !album) return true; // no safe album hint available
    return album === track || album.includes(track) || track.includes(album);
}

function updateHint() {
    if (!hintDisplay) return;
    if (!dailyTrack) { hintDisplay.textContent = '—'; return; }
    if (attempts >= 3 && dailyTrack.artistName) {
        hintDisplay.textContent = `Artist starts with '${dailyTrack.artistName.charAt(0)}'`;
    } else if (dailyTrack.collectionName && !albumRevealsSongName(dailyTrack.collectionName)) {
        hintDisplay.textContent = dailyTrack.collectionName;
    } else {
        hintDisplay.textContent = 'Popular track';
    }
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

function celebrateSuccess() {
    const overlay = document.getElementById('celebrationOverlay');
    if (!overlay) return;
    overlay.innerHTML = '';
    overlay.classList.add('active');
    const colors = ['#22c55e', '#34d399', '#38bdf8', '#fbbf24', '#00f2fe', '#22d3ee'];
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

// --- Share result as an emoji grid ---
function buildShareText() {
    if (!dailyTrack) return '';
    const grid = attempts >= MAX_ATTEMPTS && !gameOver
        ? '❌'
        : '🟩'.repeat(Math.max(1, attempts)) + '⬜'.repeat(Math.max(0, MAX_ATTEMPTS - attempts));
    return `SONGdless ${TODAY}\n${grid}\n${dailyTrack.trackName} — ${dailyTrack.artistName}`;
}

function showShareRow() {
    const existing = document.getElementById('shareRow');
    if (existing) existing.remove();
    const row = document.createElement('div');
    row.id = 'shareRow';
    row.className = 'share-row';
    const btn = document.createElement('button');
    btn.className = 'share-btn';
    btn.innerHTML = '<i class="fa-solid fa-share-nodes"></i> Copy result';
    btn.addEventListener('click', () => {
        const text = buildShareText();
        try {
            navigator.clipboard.writeText(text).then(() => {
                btn.textContent = '✓ Copied!';
                setTimeout(() => { btn.innerHTML = '<i class="fa-solid fa-share-nodes"></i> Copy result'; }, 1500);
            }, () => fallbackCopy(text, btn));
        } catch (e) {
            fallbackCopy(text, btn);
        }
    });
    row.appendChild(btn);
    messageBox.parentNode.insertBefore(row, messageBox.nextSibling);
}

function fallbackCopy(text, btn) {
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        btn.textContent = '✓ Copied!';
        setTimeout(() => { btn.textContent = 'Copy result'; }, 1500);
    } catch (e) {}
}

// --- Track selection (picks a track that has both a preview and lyrics) ---
// opts.fresh: for endless mode — ignore the daily cache and avoid reusing artists.
async function fetchDailyTrack(opts = {}) {
    const terms = currentGenre().terms;
    if (!opts.fresh) {
        let stored;
        try { stored = localStorage.getItem(trackKey()); } catch (e) {}
        if (stored) {
            try {
                const data = JSON.parse(stored);
                dailyTrack = data.track || null;
                lyrics = data.lyrics || { found: false };
                buildLyricLines();
                return !!dailyTrack;
            } catch (e) {}
        }
    }

    // Prefer terms we haven't used yet in this endless session.
    let ordered = terms.slice();
    if (opts.fresh && endlessUsedTerms.length) {
        const fresh = terms.filter(t => !endlessUsedTerms.includes(t));
        if (fresh.length) ordered = fresh;
    }

    const termIndex = opts.fresh ? Math.floor(Math.random() * ordered.length) : SEED % ordered.length;

    // 1) Fire off the iTunes searches for all terms in parallel instead of one
    //    at a time — removes most of the swing between genres.
    const termQueries = [];
    for (let pass = 0; pass < ordered.length; pass++) {
        const term = ordered[(termIndex + pass) % ordered.length];
        const params = `term=${encodeURIComponent(term)}&media=music&entity=song&limit=25&country=US`;
        termQueries.push(safeiTunesQuery(params));
    }
    const resultsArrays = await Promise.all(termQueries);

    // 2) Build an ordered candidate list (keeps the original seeded order so the
    //    chosen daily track is still deterministic) while capturing the fallback.
    const candidates = [];
    let fallback = null; // first preview-bearing track, used if no lyric track found
    for (let pass = 0; pass < ordered.length; pass++) {
        const data = resultsArrays[pass];
        const results = (data && data.results) || [];
        if (!results.length) continue;
        const start = opts.fresh ? Math.floor(Math.random() * results.length) : SEED % results.length;
        for (let offset = 0; offset < results.length; offset++) {
            const item = results[(start + offset) % results.length];
            if (!item || !item.previewUrl) continue;
            if (!fallback) fallback = buildTrack(item);
            candidates.push(item);
        }
    }

    // 3) Check lyrics for candidates. The lyric fetches are the slowest part, so
    //    run them in concurrent batches (still considered in original order).
    let lyricChecks = 0;
    const batchSize = 4; // concurrent lyric lookups per batch
    for (let i = 0; i < candidates.length && lyricChecks < MAX_LYRIC_CHECKS; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        const take = Math.min(batch.length, MAX_LYRIC_CHECKS - lyricChecks);
        const slice = batch.slice(0, take);
        lyricChecks += slice.length;

        const lyrResults = await Promise.all(slice.map(item => fetchLyrics(item.artistName, item.trackName)));
        for (let j = 0; j < slice.length; j++) {
            const lyr = lyrResults[j];
            if (lyr && lyr.found) {
                dailyTrack = buildTrack(slice[j]);
                lyrics = lyr;
                buildLyricLines();
                if (lyricLines.length >= 3) {
                    if (!opts.fresh) cacheDaily();
                    if (opts.fresh) recordEndlessTerm(dailyTrack.collectionName);
                    return true;
                }
            }
        }
    }

    // Couldn't find a track with usable lyrics — play melody-only with the fallback.
    if (fallback) {
        dailyTrack = fallback;
        lyrics = { found: false, plainLyrics: null, syncedLyrics: null, source: 'none' };
        lyricLines = [];
        if (!opts.fresh) cacheDaily();
        if (opts.fresh) recordEndlessTerm(dailyTrack.collectionName);
        return true;
    }

    dailyTrack = null;
    return false;
}

function recordEndlessTerm(collectionName) {
    // Track which artist/album produced a used endless track to reduce repeats.
    const mark = (collectionName || '').trim();
    if (mark && endlessUsedTerms.length < 40) endlessUsedTerms.push(mark);
}

function buildTrack(item) {
    return {
        trackName: item.trackName,
        artistName: item.artistName,
        previewUrl: item.previewUrl,
        artwork: (item.artworkUrl100 || item.artworkUrl60 || '').replace(/\/(\d+)x\1/, '/300x300'),
        collectionName: item.collectionName || ''
    };
}

function cacheDaily() {
    try {
        localStorage.setItem(trackKey(), JSON.stringify({ track: dailyTrack, lyrics }));
    } catch (e) {}
}

// --- First-attempt autofill toggle (mirrors TuneTile to defeat browser hints) ---
function updateAutofillState() {
    if (!guessInput) return;
    if (attempts === 0) {
        guessInput.setAttribute('name', `songless_${Math.random().toString(36).slice(2, 7)}`);
        guessInput.setAttribute('autocomplete', 'none');
    } else {
        guessInput.setAttribute('name', 'songlessGuess');
        guessInput.setAttribute('autocomplete', 'on');
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
    if (!items || items.length === 0) { hideSuggestions(); return; }

    items.forEach(it => {
        const row = document.createElement('div');
        row.className = 'suggestion-row';
        row.dataset.trackName = it.trackName;
        row.innerHTML = `<strong style="display:block;color:#fff">${it.trackName}</strong><span style="color:#9fb3cf">${it.artistName}</span>`;
        row.addEventListener('mousedown', (ev) => ev.preventDefault());
        row.addEventListener('click', () => {
            if (guessInput) guessInput.value = it.trackName;
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

function checkCorrectGuess(guess) {
    if (!dailyTrack) return false;
    const nGuess = normalizeForCompare(guess);
    const nTitle = normalizeForCompare(dailyTrack.trackName);
    const nArtist = normalizeForCompare(dailyTrack.artistName);
    if (nGuess === nTitle || nTitle.includes(nGuess)) return 'title';
    if (nGuess === nArtist || nArtist.includes(nGuess)) return 'artist';
    return false;
}

function endGame(won) {
    gameOver = true;
    updateLyricClue();
    updateArtworkBlur();
    playFullPreview();
    showResultPanel(won);
    if (guessInput) guessInput.disabled = true;
    if (guessBtn) guessBtn.disabled = true;
    if (skipBtn) skipBtn.disabled = true;
    hideSuggestions();
    if (gameMode === 'daily') {
        saveState(won);
        showShareRow();
    }
}

// --- Endless mode: score the round, then immediately move to the next track ---
function updateEndlessUI() {
    if (scoreBadge) scoreBadge.style.display = gameMode === 'endless' ? 'flex' : 'none';
    if (scoreDisplay) scoreDisplay.textContent = String(endlessScore);
}

async function nextEndlessRound() {
    // Reset round state
    attempts = 0; guesses = []; gameOver = false;
    lyrics = null; lyricLines = [];
    if (boardContainer) boardContainer.innerHTML = '';
    if (guessInput) { guessInput.value = ''; guessInput.disabled = false; }
    if (guessBtn) guessBtn.disabled = false;
    if (skipBtn) skipBtn.disabled = false;
    updateAutofillState();
    hideSuggestions();

    await fetchDailyTrack({ fresh: true });
    if (!dailyTrack) {
        setMessage('Could not load another track for endless mode — try switching genre.', 'error');
        if (guessInput) guessInput.disabled = true;
        if (guessBtn) guessBtn.disabled = true;
        if (skipBtn) skipBtn.disabled = true;
        return;
    }

    endlessRounds++;
    endlessRoundStartTime = Date.now();
    buildMelodyBox();
    buildProgressTicks();
    updateSongProgress();
    updateLyricClue();
    setTimeout(() => {
        if (cluePreview) cluePreview.textContent = `Preview: ${revealSeconds()}s / ${MAX_PREVIEW_SECONDS}s`;
        playSnippet(revealSeconds());
        setMessage(`Endless round ${endlessRounds} — name the song!`, 'info');
    }, 250);
}

function endlessRoundScore() {
    // Base points decay with the number of attempts used this round,
    // and with elapsed time at the moment of the guess.
    const elapsedSec = Math.min(ENDLESS_TIME_CAP_SEC, (Date.now() - endlessRoundStartTime) / 1000);
    const attemptPenalty = Math.max(0, attempts) * 10;
    const timePenalty = Math.floor(elapsedSec * ENDLESS_TIME_PENALTY);
    return Math.max(5, ENDLESS_BASE - attemptPenalty - timePenalty);
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
        if (gameMode === 'endless') {
            const pts = endlessRoundScore();
            endlessScore += pts;
            updateEndlessUI();
            setMessage(`🎉 +${pts} pts — ${dailyTrack.trackName} — ${dailyTrack.artistName}`, 'success');
            celebrateSuccess();
            // Give the celebration a moment, then load the next round.
            setTimeout(() => nextEndlessRound(), 1600);
        } else {
            setMessage(`🎉 Correct — ${res === 'title' ? 'song' : 'artist'} matched! ${dailyTrack.trackName} — ${dailyTrack.artistName}`, 'success');
            celebrateSuccess();
            endGame(true);
        }
        return;
    }

    attempts++;
    updateAttemptDisplay();
    updateAutofillState();
    updateLyricClue();
    updateArtworkBlur();

    if (attempts >= MAX_ATTEMPTS) {
        if (gameMode === 'endless') {
            setMessage(`It was: ${dailyTrack.trackName} — ${dailyTrack.artistName}. Next round!`, 'error');
            setTimeout(() => nextEndlessRound(), 1800);
        } else {
            setMessage(`❌ Out of attempts. It was: ${dailyTrack.trackName} — ${dailyTrack.artistName}`, 'error');
            endGame(false);
        }
        return;
    }

    const secs = revealSeconds();
    if (cluePreview) cluePreview.textContent = `Preview: ${secs}s / ${MAX_PREVIEW_SECONDS}s`;
    playSnippet(secs);
    setMessage(`Not quite — try again. ${MAX_ATTEMPTS - attempts} attempts left.`, 'info');
    if (gameMode === 'daily') saveState(false);
    guessInput.value = '';
    hideSuggestions();
}

// --- Build / hydrate the melody box (cover art, masked title, play, volume) ---
function buildMelodyBox() {
    const melodyBox = document.querySelector('.melody-box');
    if (!melodyBox) return;
    melodyBox.innerHTML = '';

    const art = document.createElement('img');
    art.id = 'albumArt';
    art.className = 'album-art';
    art.src = dailyTrack.artwork;
    art.alt = dailyTrack.trackName;
    art.style.width = '64px';
    art.style.height = '64px';
    art.style.borderRadius = '10px';
    art.style.marginRight = '10px';
    art.style.objectFit = 'cover';

    const info = document.createElement('div');
    const title = document.createElement('div');
    title.innerHTML = `<strong id="answerTitle">${gameOver ? dailyTrack.trackName + ' — ' + dailyTrack.artistName : maskTitle(dailyTrack.trackName)}</strong>`;
    title.style.marginBottom = '4px';
    const clue = document.createElement('div');
    clue.id = 'cluePreview';
    clue.className = 'clue-text';
    clue.innerHTML = `<i class="fa-regular fa-lightbulb"></i> <strong>Preview: ${revealSeconds()}s / ${MAX_PREVIEW_SECONDS}s</strong>`;
    cluePreview = clue; // track the live element (buildMelodyBox replaces the static one)
    info.appendChild(title);
    info.appendChild(clue);

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.appendChild(art);
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
    playBtn = play;
    play.addEventListener('click', () => playSnippet(revealSeconds()));
    updateArtworkBlur();
}

// --- Genre switcher UI ---
function updateGenreBar() {
    if (!genreBar) return;
    genreBar.innerHTML = '';
    GENRES.forEach(g => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'genre-chip' + (g.key === currentGenreKey ? ' active' : '');
        chip.dataset.genre = g.key;
        chip.innerHTML = `<i class="fa-solid ${g.icon}"></i><span>${g.label}</span>`;
        chip.setAttribute('aria-pressed', g.key === currentGenreKey ? 'true' : 'false');
        chip.addEventListener('click', () => loadGenre(g.key));
        genreBar.appendChild(chip);
    });
}

// --- Switch to a different genre (fresh independent daily game) ---
function loadGenre(key) {
    if (key === currentGenreKey && dailyTrack && !document.getElementById('shareRow')) {
        updateGenreBar();
        return;
    }
    currentGenreKey = key;
    try { localStorage.setItem('songless_genre', key); } catch (e) {}

    // Clear any prior game / share row between genres
    try { audio.pause(); audio.removeAttribute('src'); } catch (e) {}
    const oldRow = document.getElementById('shareRow');
    if (oldRow) oldRow.remove();
    if (messageBox) messageBox.classList.remove('celebrate');

    attempts = 0; guesses = []; gameOver = false;
    dailyTrack = null; lyrics = null; lyricLines = [];
    suggestionCache = {}; suggestionDisabled = false;
    if (boardContainer) boardContainer.innerHTML = '';
    if (guessInput) { guessInput.value = ''; guessInput.disabled = false; }
    if (guessBtn) guessBtn.disabled = false;
    if (skipBtn) skipBtn.disabled = false;
    hideSuggestions();

    // Clear stale data while the new genre's track loads (avoids showing the
    // previous genre's hint/lyrics during the slow fetch).
    if (hintDisplay) hintDisplay.textContent = 'Loading...';
    if (lyricClue) lyricClue.textContent = 'Loading lyrics...';
    if (lyricSrc) lyricSrc.textContent = '';

    updateGenreBar();
    if (gameMode === 'endless') {
        setMessage('Loading...');
        nextEndlessRound();
    } else {
        setMessage('Loading today\'s song...');
        updateAttemptDisplay();
        loadGenreTrack();
    }
}

// --- Load / restore the daily game for the currently selected genre ---
async function loadGenreTrack() {
    await fetchDailyTrack();
    const restored = restoreState();
    if (!restored || !dailyTrack) {
        updateAutofillState();
    }
    if (!dailyTrack) {
        setMessage('No track available for this genre today — try another.', 'error');
        if (hintDisplay) hintDisplay.textContent = '—';
        if (guessInput) guessInput.disabled = true;
        if (guessBtn) guessBtn.disabled = true;
        if (skipBtn) skipBtn.disabled = true;
        if (playBtn) playBtn.disabled = true;
        return;
    }

    buildMelodyBox();
    buildProgressTicks();
    updateSongProgress();

    if (!restored) {
        updateLyricClue();
        setTimeout(() => {
            if (cluePreview) cluePreview.textContent = `Preview: ${revealSeconds()}s / ${MAX_PREVIEW_SECONDS}s`;
            playSnippet(revealSeconds());
            setMessage(`Guess the song or artist from the clue AND the lyrics — ${MAX_ATTEMPTS} attempts.`, 'info');
        }, 300);
    } else if (gameOver) {
        showShareRow();
    }
}

function updateModeUI() {
    if (modeToggle) {
        modeToggle.querySelectorAll('.mode-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === gameMode);
        });
    }
    updateEndlessUI();
}

// --- Switch between Daily and Endless modes ---
function setMode(mode) {
    if (mode === gameMode) return;
    gameMode = mode;
    updateModeUI();

    try { audio.pause(); audio.removeAttribute('src'); } catch (e) {}
    const oldRow = document.getElementById('shareRow');
    if (oldRow) oldRow.remove();
    if (messageBox) messageBox.classList.remove('celebrate');
    hideSuggestions();

    attempts = 0; guesses = []; gameOver = false;
    dailyTrack = null; lyrics = null; lyricLines = [];
    if (boardContainer) boardContainer.innerHTML = '';
    if (guessInput) { guessInput.value = ''; guessInput.disabled = false; }
    if (guessBtn) guessBtn.disabled = false;
    if (skipBtn) skipBtn.disabled = false;
    if (hintDisplay) hintDisplay.textContent = 'Loading...';
    if (lyricClue) lyricClue.textContent = 'Loading lyrics...';
    if (lyricSrc) lyricSrc.textContent = '';
    updateAttemptDisplay();

    if (gameMode === 'endless') {
        endlessScore = 0; endlessRounds = 0; endlessUsedTerms = [];
        updateEndlessUI();
        setMessage('Loading endless round...');
        nextEndlessRound();
    } else {
        setMessage('Loading today\'s song...');
        loadGenreTrack();
    }
}

async function init() {
    // Pick up the user's saved genre preference (or default to Pop).
    let savedGenre = null;
    try { savedGenre = localStorage.getItem('songless_genre'); } catch (e) {}
    if (savedGenre && getGenreByKey(savedGenre)) currentGenreKey = savedGenre;

    // Pick up the saved mode (endless progress isn't persisted; just the choice).
    let savedMode = null;
    try { savedMode = localStorage.getItem('songless_mode'); } catch (e) {}
    if (savedMode === 'daily' || savedMode === 'endless') gameMode = savedMode;
    const requestedMode = new URLSearchParams(location.search).get('mode');
    if (requestedMode === 'daily' || requestedMode === 'endless') gameMode = requestedMode;

    updateGenreBar();
    updateModeUI();
    setMessage('Loading today\'s song...');
    updateAttemptDisplay();

    // Mode toggle buttons.
    if (modeToggle) {
        modeToggle.addEventListener('click', (e) => {
            const btn = e.target.closest('.mode-btn');
            if (!btn) return;
            const mode = btn.dataset.mode;
            if (mode === gameMode) return;
            try { localStorage.setItem('songless_mode', mode); } catch (err) {}
            setMode(mode);
        });
    }

    // Keep the progress bar in sync with the song while it plays.
    ['timeupdate', 'playing', 'durationchange', 'pause', 'ended', 'seeked'].forEach(ev =>
        audio.addEventListener(ev, updateSongProgress)
    );

    if (guessBtn) guessBtn.addEventListener('click', handleGuess);
    if (skipBtn) skipBtn.addEventListener('click', handleSkip);
    if (guessInput) {
        guessInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleGuess();
            } else if (e.key === 'Tab' && suggestionBox && suggestionBox.style.display === 'block') {
                const first = suggestionBox.querySelector('.suggestion-row');
                if (first) {
                    e.preventDefault();
                    guessInput.value = first.dataset.trackName || guessInput.value;
                    hideSuggestions();
                    guessInput.focus();
                }
            }
        });
        guessInput.addEventListener('input', (e) => {
            const term = e.target.value.trim();
            if (!suggestionsAllowed() || term.length < 2) { hideSuggestions(); return; }
            scheduleSuggestions(term);
        });
        guessInput.addEventListener('blur', () => setTimeout(hideSuggestions, 200));
    }

    const guessForm = document.getElementById('guessForm');
    if (guessForm) {
        guessForm.addEventListener('submit', (e) => { e.preventDefault(); handleGuess(); });
    }

    document.addEventListener('click', (e) => {
        if (suggestionBox && guessInput && !suggestionBox.contains(e.target) && !guessInput.contains(e.target)) {
            hideSuggestions();
        }
    });

    // Load the correct initial game for the active mode.
    if (gameMode === 'endless') {
        nextEndlessRound();
    } else {
        await loadGenreTrack();
    }
}

// --- Daily reset timer ---
function msUntilLocalMidnight() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
}

function updateResetTimer() {
    const el = document.getElementById('resetTimer');
    if (!el) return;
    const totalSec = Math.max(0, Math.floor(msUntilLocalMidnight() / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    el.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function checkDayRollover() {
    if (getLocalDateStr() === TODAY) return false;
    location.reload();
    return true;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
updateResetTimer();
setInterval(() => { if (!checkDayRollover()) updateResetTimer(); }, 1000);