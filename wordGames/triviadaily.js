"use strict";
    /* ============================ Config & Storage ============================ */
    const STATE_KEY = 'triviaDaily_state';
    const STATS_KEY = 'triviaDaily_stats';
    const THEME_KEY = 'triviaDaily_theme';
    const POOLS_URL = '../data/triviadaily_pools.json';
    const EPOCH = new Date(2024, 0, 3);       // puzzle #1 unlocks on this date (fixed epoch)
    const MAX = [340, 330, 330];              // points per round -> 1000 total

    const DEFAULTS = { currentStreak: 0, maxStreak: 0, played: 0, wins: 0, lastPlayed: null };
    let stats = { ...DEFAULTS };
    let state = null;  // per-day game state

    /* ----------------------------- helpers ----------------------------- */
    const $ = (id) => document.getElementById(id);
    const pad = (n) => String(n).padStart(2, '0');
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const fmtNum = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    function localDateStr(d) {
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    function midnightMs(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime(); }
    function secondsToMidnight(now) { return Math.max(0, (midnightMs(now) + 86400000 - now) / 1000); }
    function hms(totalSec) {
        totalSec = Math.floor(totalSec);
        const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60;
        return pad(h) + ':' + pad(m) + ':' + pad(s);
    }

    function getDayNumber(todayStr) {
        const y = +todayStr.slice(0, 4), mo = +todayStr.slice(5, 7), d = +todayStr.slice(8, 10);
        const t = new Date(y, mo - 1, d);
        return Math.floor((midnightMs(t) - midnightMs(EPOCH)) / 86400000) + 1;
    }

    /* --------------------------- seeded RNG --------------------------- */
    function fnv1a(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }
    function mulberry32(seed) {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6D2B79F5) >>> 0;
            let z = s;
            z = Math.imul(z ^ (z >>> 15), z | 1);
            z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
            return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
        };
    }
    function seededShuffle(arr, seed) {
        const r = mulberry32(seed), a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(r() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    /* --------------------------- storage IO --------------------------- */
    function loadStats() {
        try { const s = JSON.parse(localStorage.getItem(STATS_KEY)); if (s) stats = Object.assign({}, DEFAULTS, s); }
        catch (e) { /* ignore */ }
    }
    function saveStats() { try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) {} }
    function loadState(date) {
        try {
            const raw = JSON.parse(localStorage.getItem(STATE_KEY));
            if (raw && raw.date === date) state = raw;
        } catch (e) { /* ignore */ }
    }
    function saveState() {
        if (!state) return;
        try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {}
    }

    /* @@JS_DEFINE@@ */
    /* --------------------------- embedded FALLBACK pools ---------------------------
       Used only when ../data/triviadaily_pools.json cannot be fetched.
       The full dataset is generated from Wikidata via scripts/generate_trivia_pools.py */
    let RANK_POOLS = [
        { name: 'Highest average surface temperature', unit: '°C', order: 'desc', items: [
            { label: 'Venus', value: 462 }, { label: 'Mercury', value: 167 },
            { label: 'Earth', value: 15 }, { label: 'Mars', value: -65 } ] },
        { name: 'Largest moons in the Solar System', unit: 'km', order: 'desc', items: [
            { label: 'Ganymede', value: 2634 }, { label: 'Titan', value: 2575 },
            { label: 'Callisto', value: 2410 }, { label: 'Io', value: 1821 } ] },
        { name: 'First video games released (oldest first)', unit: '', order: 'asc', items: [
            { label: 'Pong', value: 1972 }, { label: 'Space Invaders', value: 1978 },
            { label: 'Pac-Man', value: 1980 }, { label: 'Tetris', value: 1984 } ] },
        { name: 'Tallest buildings', unit: 'm', order: 'desc', items: [
            { label: 'Burj Khalifa', value: 828 }, { label: 'Shanghai Tower', value: 632 },
            { label: 'Makkah Royal Clock Tower', value: 601 }, { label: 'Taipei 101', value: 508 } ] },
        { name: 'Loudest animal sounds', unit: 'dB', order: 'desc', items: [
            { label: 'Sperm whale', value: 230 }, { label: 'Blue whale', value: 148 },
            { label: 'Lion', value: 114 }, { label: 'Human shout', value: 90 } ] },
        { name: 'Highest-grossing films worldwide', unit: '$B', order: 'desc', items: [
            { label: 'Avatar', value: 2.92 }, { label: 'Avengers: Endgame', value: 2.79 },
            { label: 'Titanic', value: 2.20 }, { label: 'The Force Awakens', value: 2.07 } ] },
        { name: 'Most populous countries', unit: 'M', order: 'asc', items: [
            { label: 'Indonesia', value: 279 }, { label: 'USA', value: 340 },
            { label: 'China', value: 1425 }, { label: 'India', value: 1441 } ] },
        { name: 'Longest rivers', unit: 'km', order: 'desc', items: [
            { label: 'Nile', value: 2800 }, { label: 'Amazon–Ucayali', value: 2400 },
            { label: 'Yangtze', value: 2300 }, { label: 'Mississippi–Missouri', value: 2300 } ] },
        { name: 'Pokémon generations debut (oldest first)', unit: '', order: 'asc', items: [
            { label: 'Generation I', value: 1996 }, { label: 'Generation II', value: 1999 },
            { label: 'Generation III', value: 2002 }, { label: 'Generation IV', value: 2006 } ] },
        { name: 'Best-selling video game consoles', unit: 'M', order: 'desc', items: [
            { label: 'PlayStation 2', value: 155 }, { label: 'Nintendo DS', value: 154 },
            { label: 'Nintendo Switch', value: 132 }, { label: 'Game Boy / Game Boy Color', value: 118 } ] },
        { name: 'Heaviest land mammals', unit: 't', order: 'desc', items: [
            { label: 'African elephant', value: 6.3 }, { label: 'White rhinoceros', value: 2.3 },
            { label: 'Hippopotamus', value: 1.6 }, { label: 'Giraffe', value: 1.2 } ] },
        { name: 'Most-active social platforms', unit: 'B', order: 'desc', items: [
            { label: 'Facebook', value: 2.9 }, { label: 'WhatsApp', value: 2.5 },
            { label: 'YouTube', value: 2.5 }, { label: 'Instagram', value: 2.0 } ] }
    ];
    /* @@JS_RANK@@ */
    let OUTLIER_POOLS = [
        { rule: 'Prime numbers', set: ['11', '13', '17'], outlier: '15',
            reveal: '15 is not prime — 11, 13 and 17 are.' },
        { rule: 'Water-type Pokémon', set: ['Squirtle', 'Totodile', 'Froakie'], outlier: 'Charmander',
            reveal: 'Charmander is a Fire type — the rest are Water types.' },
        { rule: 'Countries in Europe', set: ['France', 'Spain', 'Italy'], outlier: 'Brazil',
            reveal: 'Brazil is in South America.' },
        { rule: 'Even numbers', set: ['12', '34', '56'], outlier: '27',
            reveal: '27 is odd — the other three are all even.' },
        { rule: 'Can fly', set: ['Eagle', 'Bat', 'Butterfly'], outlier: 'Penguin',
            reveal: 'A penguin cannot fly — eagles, bats and butterflies can.' },
        { rule: 'Instruments with strings', set: ['Guitar', 'Violin', 'Piano'], outlier: 'Trumpet',
            reveal: 'A trumpet is a brass instrument — the rest have strings.' },
        { rule: 'Capital cities', set: ['Paris', 'Madrid', 'Rome'], outlier: 'Zurich',
            reveal: 'Zurich is not a country capital.' },
        { rule: 'Months with 31 days', set: ['January', 'March', 'May'], outlier: 'February',
            reveal: 'February only has 28 (or 29) days.' },
        { rule: 'Oceans that touch the United States', set: ['Atlantic', 'Pacific', 'Arctic'], outlier: 'Indian',
            reveal: 'The Indian Ocean does not border the US.' },
        { rule: 'Members of The Beatles', set: ['John', 'George', 'Paul'], outlier: 'Sting',
            reveal: 'Sting was in The Police — not The Beatles.' },
        { rule: 'Melts when heated', set: ['Ice', 'Butter', 'Chocolate'], outlier: 'Stone',
            reveal: 'Ice, butter and chocolate melt; a stone does not.' },
        { rule: 'Countries in South America', set: ['Ecuador', 'Chile', 'Bolivia'], outlier: 'Canada',
            reveal: 'Canada is in North America.' }
    ];

    let TARGET_POOLS = [
        { name: "Earth's radius", min: 6000, max: 6600, step: 10, answer: 6371, unit: 'km' },
        { name: 'Year The Beatles released "Abbey Road"', min: 1960, max: 1975, step: 1, answer: 1969, unit: '' },
        { name: 'Speed of light', min: 299000, max: 300000, step: 10, answer: 299792, unit: 'km/s' },
        { name: 'Year the Declaration of Independence was signed', min: 1760, max: 1790, step: 1, answer: 1776, unit: '' },
        { name: "Mount Everest's height", min: 8000, max: 9000, step: 10, answer: 8849, unit: 'm' },
        { name: 'Distance from the Earth to the Moon', min: 300000, max: 450000, step: 1000, answer: 384400, unit: 'km' },
        { name: 'Year the first iPhone went on sale', min: 1980, max: 2020, step: 1, answer: 2007, unit: '' },
        { name: 'Number of states in the United States', min: 40, max: 60, step: 1, answer: 50, unit: '' },
        { name: 'World population (estimate)', min: 1, max: 10, step: 0.1, answer: 8.1, unit: 'B' },
        { name: 'Length of a modern marathon', min: 20, max: 50, step: 0.5, answer: 42.2, unit: 'km' },
        { name: 'Deepest point of the Mariana Trench', min: 9000, max: 11000, step: 10, answer: 10994, unit: 'm' },
        { name: 'Speed of sound in air', min: 100, max: 500, step: 5, answer: 343, unit: 'm/s' }
    ];
    /* @@JS_LOGIC@@ */
    /* --------------------------- today's puzzle selection --------------------------- */
    function computeDay(todayStr, dayNum) {
        const h = fnv1a(todayStr);
        // deterministic per-date picks drawn from whichever pool set is loaded
        // (generated Wikidata pools when available, embedded fallback otherwise)
        const rng = mulberry32(h);
        const pick = (arr) => arr[Math.floor(rng() * arr.length)];
        const rankPool = pick(RANK_POOLS);
        const outPool = pick(OUTLIER_POOLS);
        const tgtPool = pick(TARGET_POOLS);

        // desired rank order target (asc or desc)
        const desiredTop = rankPool.items
            .slice()
            .sort((a, b) => rankPool.order === 'asc' ? a.value - b.value : b.value - a.value);
        // fixed daily display order (shared for all players)
        const rankOrder = seededShuffle(rankPool.items.map(i => i.label), h ^ 0x9E3779B9);

        // outlier options (3 fitting + 1 outlier) in daily display order
        const outlierOptions = seededShuffle(outPool.set.concat(outPool.outlier), h ^ 0x85EBCA6B);

        return { rankPool, outPool, tgtPool, desiredTop, rankOrder, outlierOptions };
    }

    function ensureState(todayStr, day) {
        loadState(todayStr);
        const t = computeDayX(todayStr, day);
        if (!state) {
            state = {
                date: todayStr, day: day,
                round: 1,
                rankOrder: t.rankOrder.slice(),
                outlier: null,
                target: null,
                scores: [null, null, null],
                done: false
            };
        }
        return state;
    }
    function computeDayX(todayStr, day) { return computeDayX.cache && computeDayX.cacheDate === todayStr && computeDayX.cacheDay === day ? computeDayX.cache : (computeDayX.cache = computeDay(todayStr, day), computeDayX.cacheDate = todayStr, computeDayX.cacheDay = day, computeDayX.cache); }

    /* ------------------------------ clock / countdown ------------------------------ */
    function tickClock() {
        const now = new Date();
        const todayStr = localDateStr(now);
        const up = document.getElementById('countdown');

        // if the local date changed while the tab is open -> new puzzle
        if (window.__todayLoaded && window.__todayLoaded !== todayStr) {
            window.location.reload();
            return;
        }
        if (!window.__todayLoaded) window.__todayLoaded = todayStr;

        if (up) up.textContent = hms(secondsToMidnight(now));
        const np = document.getElementById('nextPuzzle');
        if (np) np.textContent = 'Next puzzle in ' + hms(secondsToMidnight(now));
    }

    /* --------------------------- theme --------------------------- */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        document.body.classList.toggle('theme-bg', true);
        const icon = document.querySelector('#themeBtn i');
        if (icon) icon.className = theme === 'light' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    }
    function loadTheme() {
        let th = 'dark';
        try { th = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) {}
        applyTheme(th);
    }

    /* @@JS_RENDER@@ */
    /* ------------------------------ rendering ------------------------------ */
    const ROUND_META = [
        { icon: 'fa-arrow-down-1-9', title: 'Round 1 · Rank the Stat' },
        { icon: 'fa-shield-halved', title: 'Round 2 · Find the Outlier' },
        { icon: 'fa-crosshairs', title: 'Round 3 · Target Guess' }
    ];
    function esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function runningTotalScore() { return state.scores.reduce((a, b) => a + (b || 0), 0); }

    function updateTabs() {
        for (let i = 1; i <= 3; i++) {
            const t = $('tab' + i);
            t.classList.toggle('active', i === state.round && !state.done);
            t.classList.toggle('done', !!state.scores[i - 1]);
        }
    }

    function showRound(round, dayPuzzle) {
        state.round = round;
        saveState();
        updateTabs();

        const meta = ROUND_META[round - 1];
        $('roundTitle').innerHTML = '<i class="fa-solid ' + meta.icon + '"></i> ' + meta.title;
        $('scoreChip').innerHTML = 'Score: <strong>' + runningTotalScore() + '</strong>/1000';

        if (round === 1) $('roundPrompt').textContent =
            dayPuzzle.rankPool.name + ' — arrange from the top (1st = ' +
            (dayPuzzle.rankPool.order === 'asc' ? 'lowest' : 'highest') + '). Drag or use the ▲▼ arrows.';
        else if (round === 2) $('roundPrompt').textContent =
            'Tap the one item that does NOT follow the hidden rule: “' + dayPuzzle.outPool.rule + '”.';
        else $('roundPrompt').textContent =
            'Move the slider to guess ' + dayPuzzle.tgtPool.name +
            (dayPuzzle.tgtPool.unit ? ' (' + dayPuzzle.tgtPool.unit + ')' : '') + '.';

        const body = $('roundBody');
        body.className = '';
        body.innerHTML = '';
        body.classList.add('anim');

        if (round === 1) renderRank1(body, dayPuzzle);
        else if (round === 2) renderOutlier(body, dayPuzzle);
        else renderTarget(body, dayPuzzle);

        const btn = $('submitBtn');
        if (round === 3) btn.innerHTML = 'Finish Game <i class="fa-solid fa-flag-checkered"></i>';
        else btn.innerHTML = 'Submit Round ' + round + ' <i class="fa-solid fa-arrow-right"></i>';
        $('feedback').innerHTML = '';
    }

    /* ---------------- Round 1: Rank the Stat (drag + buttons) ---------------- */
    function renderRank1(body) {
        const list = document.createElement('div');
        list.className = 'rank-list';
        list.id = 'rankList';
        body.appendChild(list);
        rebuildRank(list);

        const drag = { from: -1 };
        const targetIndex = (y) => {
            const rows = [].slice.call(list.children);
            let idx = rows.length - 1;
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i].getBoundingClientRect();
                if (y < r.top + r.height / 2) { idx = i; break; }
            }
            return idx;
        };

        list.addEventListener('click', (e) => {
            if (state.scores[0] !== null) return;
            const b = e.target.closest('.mini-btn');
            if (!b) { if (e.target.closest('.rank-handle')) e.preventDefault(); return; }
            const i = parseInt(b.dataset.i, 10);
            const to = b.classList.contains('up') ? i - 1 : i + 1;
            if (to >= 0 && to < state.rankOrder.length) {
                moveRank(i, to);
                rebuildRank(list);
                saveState();
            }
        });

        list.addEventListener('pointerdown', (e) => {
            if (state.scores[0] !== null) return;
            const handle = e.target.closest('.rank-handle');
            if (!handle) return;
            const row = handle.closest('.rank-item');
            drag.from = parseInt(row.dataset.i, 10);
            row.classList.add('dragging');
            try { row.setPointerCapture(e.pointerId); } catch (err) {}
            e.preventDefault();
        });

        list.addEventListener('pointermove', (e) => {
            if (drag.from < 0 || state.scores[0] !== null) return;
            const to = targetIndex(e.clientY);
            if (to !== drag.from) { moveRank(drag.from, to); drag.from = to; rebuildRank(list); saveState(); }
        });

        const endDrag = () => {
            if (drag.from < 0) return;
            [].slice.call(list.children).forEach(r => r.classList.remove('dragging'));
            drag.from = -1;
            saveState();
        };
        list.addEventListener('pointerup', endDrag);
        list.addEventListener('pointercancel', endDrag);
        window.addEventListener('pointerup', endDrag);
    }

    function moveRank(from, to) {
        if (to < 0 || to >= state.rankOrder.length || from === to) return;
        const val = state.rankOrder.splice(from, 1)[0];
        state.rankOrder.splice(to, 0, val);
    }

    function rebuildRank(list) {
        list.innerHTML = '';
        state.rankOrder.forEach((label, i) => {
            const row = document.createElement('div');
            row.className = 'rank-item';
            row.dataset.i = i;
            row.innerHTML =
                '<span class="rank-pos">' + (i + 1) + '</span>' +
                '<span class="rank-handle" title="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></span>' +
                '<span class="rank-label">' + esc(label) + '</span>' +
                '<span class="rank-btns">' +
                '<button class="mini-btn up" data-i="' + i + '" title="Move up"><i class="fa-solid fa-caret-up"></i></button>' +
                '<button class="mini-btn dn" data-i="' + i + '" title="Move down"><i class="fa-solid fa-caret-down"></i></button>' +
                '</span>';
            list.appendChild(row);
        });
        saveState();
    }
    /* @@JS_REGION@@ */
    /* ---------------- Round 2: Find the Outlier ---------------- */
    function renderOutlier(body, dayPuzzle) {
        const wrap = document.createElement('div');
        wrap.className = 'options';
        dayPuzzle.outlierOptions.forEach((label) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'option';
            b.dataset.label = label;
            b.textContent = label;
            if (state.outlier === label) b.classList.add('selected');
            wrap.appendChild(b);
        });
        body.appendChild(wrap);

        wrap.addEventListener('click', (e) => {
            if (state.scores[1] !== null) return;
            const b = e.target.closest('.option');
            if (!b) return;
            state.outlier = b.dataset.label;
            saveState();
            wrap.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
            b.classList.add('selected');
            flash(body, 'good');
        });
    }

    /* ---------------- Round 3: Target Guess ---------------- */
    function renderTarget(body, dayPuzzle) {
        const t = dayPuzzle.tgtPool;
        const unitSuffix = t.unit ? ' ' + t.unit : '';
        const fmtVal = (n) => {
            let s = Number.isInteger(n) ? String(n) : (+n).toFixed(1);
            return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + unitSuffix;
        };
        if (state.target === null) state.target = roundParam(t.min, t.step);

        const wrap = document.createElement('div');
        wrap.className = 'target-wrap';
        const val = document.createElement('div');
        val.className = 'target-value';
        const input = document.createElement('input');
        input.type = 'range';
        input.className = 'range';
        input.min = t.min;
        input.max = t.max;
        input.step = t.step;
        input.value = state.target;
        const scale = document.createElement('div');
        scale.className = 'target-scale';
        scale.innerHTML = '<span>' + fmtVal(t.min) + '</span><span>' + fmtVal(t.max) + '</span>';

        const paint = () => {
            const p = ((input.value - t.min) / (t.max - t.min)) * 100;
            input.style.setProperty('--fill', p.toFixed(4) + '%');
            val.textContent = fmtVal(+input.value);
        };
        input.addEventListener('input', () => { state.target = +input.value; paint(); saveState(); });

        body.appendChild(wrap);
        wrap.appendChild(val);
        wrap.appendChild(input);
        wrap.appendChild(scale);
        paint();
    }

    function roundParam(v, step) { return Math.round(v / step) * step; }

    function flash(box, kind) {
        box.classList.remove('flash-good', 'flash-bad');
        void box.offsetWidth;
        box.classList.add(kind === 'good' ? 'flash-good' : 'flash-bad');
        setTimeout(() => box.classList.remove('flash-good', 'flash-bad'), 500);
    }

    /* @@JS_SUBMIT@@ */
    /* ------------------------------ scoring ------------------------------ */
    function scoreRound(dayPuzzle) {
        const r = state.round;
        if (r === 1) {
            const desired = dayPuzzle.desiredTop.map(i => i.label);
            let correct = 0;
            state.rankOrder.forEach((lab, i) => { if (lab === desired[i]) correct++; });
            state.scores[0] = correct * 85;
        } else if (r === 2) {
            state.scores[1] = state.outlier === dayPuzzle.outPool.outlier ? MAX[1] : 0;
        } else if (r === 3) {
            const t = dayPuzzle.tgtPool;
            const range = (t.max - t.min);
            const dist = Math.abs(state.target - t.answer);
            const frac = clamp(1 - (range ? dist / range : 0), 0, 1);
            state.scores[2] = Math.round(MAX[2] * frac);
        }
        saveState();
    }

    function submitRound(dayPuzzle) {
        if (state.done) return;
        const r = state.round;
        const fb = $('feedback');
        const btn = $('submitBtn');

        // already scored this round -> just advance
        if (state.scores[r - 1] !== null) {
            if (r < 3) { showRound(r + 1, dayPuzzle); return; }
            finishGame(dayPuzzle);
            return;
        }

        scoreRound(dayPuzzle);
        const pts = state.scores[r - 1];

        if (r === 1) {
            const desired = dayPuzzle.desiredTop.map(i => i.label);
            let correct = 0;
            state.rankOrder.forEach((lab, i) => { if (lab === desired[i]) correct++; });
            fb.innerHTML = '<div class="feedback ' + (correct === 4 ? 'good' : 'bad') + '">' +
                correct + '/4 in the right spot &nbsp;+<strong>' + pts + '</strong> pts</div>';
            btn.disabled = true;
            setTimeout(() => { btn.disabled = false; showRound(2, dayPuzzle); }, 1500);
        } else if (r === 2) {
            const got = state.outlier === dayPuzzle.outPool.outlier;
            fb.innerHTML = '<div class="feedback ' + (got ? 'good' : 'bad') + '">' +
                (got ? 'Exactly right! +' : 'Not the outlier — +') + '<strong>' + pts + '</strong> pts</div>' +
                '<div class="second-line">Hidden rule: “' + esc(dayPuzzle.outPool.rule) + '”. ' + esc(dayPuzzle.outPool.reveal) + '</div>';
            btn.disabled = true;
            setTimeout(() => { btn.disabled = false; showRound(3, dayPuzzle); }, 2200);
        } else {
            const t = dayPuzzle.tgtPool;
            fb.innerHTML = '<div class="feedback ' + (pts >= MAX[2] * 0.7 ? 'good' : 'bad') + '">' +
                'You guessed ' + esc(String(state.target + (t.unit ? ' ' + t.unit : ''))) +
                ' &nbsp;·&nbsp; answer: <strong>' + fmtNum(t.answer) + (t.unit ? ' ' + t.unit : '') + '</strong> &nbsp;·&nbsp; +' + pts + ' pts</div>';
            btn.disabled = true;
            setTimeout(() => { finishGame(dayPuzzle); }, 1500);
        }
    }

    function finishGame(dayPuzzle) {
        state.done = true;
        saveState();

        const total = runningTotalScore();
        stats.played++;
        if (total >= 600) stats.wins++;
        const now = new Date();
        const todayStr = localDateStr(now);
        const yesterday = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
        stats.currentStreak = (stats.lastPlayed === yesterday) ? stats.currentStreak + 1 : 1;
        stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
        stats.lastPlayed = todayStr;
        saveStats();

        showSolvedView(dayPuzzle);
        showResults(total, dayPuzzle);
    }
    /* @@JS_RESULTS@@ */
    /* ------------------------------ results & share ------------------------------ */
    const ROUND_NAMES = ['Rank the Stat', 'Find the Outlier', 'Target Guess'];

    function openOverlay(id) { const el = $(id); el.hidden = false; requestAnimationFrame(() => el.classList.add('show')); }
    function closeOverlay(id) {
        const el = $(id);
        el.classList.remove('show');
        setTimeout(() => { el.hidden = true; }, 260);
    }

    function barClass(score, max) { const p = score / max; return p >= 0.7 ? '' : (p >= 0.35 ? 'warn' : 'bad'); }

    function showResults(total, dayPuzzle) {
        $('verdict').textContent =
            total === 1000 ? 'PERFECT!' :
            total >= 800 ? 'Outstanding!' :
            total >= 700 ? 'Great job!' :
            total >= 600 ? 'Solid work!' : 'Good effort — try again tomorrow!';
        $('verdictSub').textContent = state.date + ' · puzzle #' + state.day;

        // build breakdown
        let b = '';
        for (let i = 0; i < 3; i++) {
            const s = state.scores[i] || 0, m = MAX[i];
            const pct = Math.round((s / m) * 100);
            b += '<div class="brow">' +
                '<i class="fa-solid ' + ROUND_META[i].icon + '"></i>' +
                '<span class="brow-name">' + ROUND_NAMES[i] + '</span>' +
                '<span class="brow-pts">' + s + '/' + m + '</span>' +
                '<div class="bar ' + barClass(s, m) + '" style="width:64px"><i style="width:' + pct + '%"></i></div>' +
                '</div>';
        }
        $('breakdown').innerHTML = b;

        // stats
        const winPct = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
        $('statsGrid').innerHTML =
            statTile(stats.currentStreak, 'Streak') +
            statTile(stats.maxStreak, 'Max Streak') +
            statTile(stats.played, 'Played') +
            statTile(winPct + '%', 'Win Rate');
        $('nextPuzzle').textContent = 'Next puzzle in ' + hms(secondsToMidnight(new Date()));
        openOverlay('resultsOverlay');
        toggleAmount($('totalScore'), total);
    }

    function statTile(v, label) {
        return '<div class="stat"><b>' + esc(v) + '</b><span>' + label + '</span></div>';
    }
    function toggleAmount(el, target) { el.textContent = '0'; animateNumber(el, target, 800); }
    function animateNumber(el, target, dur) {
        const from = 0, t0 = performance.now();
        function step(t) {
            const p = Math.min(1, (t - t0) / dur), eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(from + (target - from) * eased);
            if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }
    function secondsUntil(now) { return secondsToMidnight(now); }

    function buildShareText(dayNum) {
        const total = runningTotalScore();
        const emoji = state.scores.map((s, i) => { const m = MAX[i]; return s >= m * 0.7 ? '🟩' : (s >= m * 0.35 ? '🟧' : '🟥'); }).join('');
        const winPct = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
        return 'Trivia Daily #' + dayNum + ' 🎯 ' + total + '/1000 ' + emoji +
            '\n🔥 Streak: ' + stats.currentStreak + ' · 📊 Win rate: ' + winPct + '%';
    }
    async function copyScore(day) {
        const text = buildShareText(day);
        try {
            await navigator.clipboard.writeText(text);
            showToast('Score copied!');
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (err) {}
            document.body.removeChild(ta);
            showToast(ok ? 'Score copied!' : 'Copy failed — select the text manually.');
        }
    }

    function showToast(msg) {
        const t = $('toast');
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => t.classList.remove('show'), 2200);
    }
    /* @@JS_INIT@@ */
    /* ------------------------------ solved view ------------------------------ */
    function showSolvedView() {
        updateTabs();
        $('roundTitle').innerHTML = '<i class="fa-solid fa-trophy"></i> Today Complete';
        $('roundPrompt').textContent = 'You already solved this puzzle — the next one unlocks at midnight.';
        $('roundBody').innerHTML =
            '<div class="solved-panel"><div class="solved-emoji">🏆</div>' +
            '<h2>Solved!</h2>' +
            '<p class="round-prompt">Final score: <strong>' + runningTotalScore() + '</strong> / 1000.</p>' +
            '<p class="round-prompt">Open the results below to review your answers.</p></div>';
        $('feedback').innerHTML = '';
        $('submitBtn').disabled = true;
        $('scoreChip').innerHTML = 'Score: <strong>' + runningTotalScore() + '</strong>/1000';
    }

    /* ------------------------------ boot ------------------------------ */
    function init() {
        loadTheme();
        loadStats();

        const now = new Date();
        const todayStr = localDateStr(now);
        const dayNum = getDayNumber(todayStr);
        const dayPuzzle = computeDayX(todayStr, dayNum);

        window.__todayLoaded = todayStr;
        $('dayLabel').textContent = 'Daily Trivia #' + dayNum;

        ensureState(todayStr, dayNum);   // creates/restores state (also caches)
        tickClock();
        setInterval(tickClock, 1000);

        if (state.done) {
            showSolvedView();
            showResults(runningTotalScore(), dayPuzzle);
        } else {
            showRound(state.round, dayPuzzle);
        }

        $('submitBtn').addEventListener('click', () => submitRound(dayPuzzle));

        $('themeBtn').addEventListener('click', () => {
            const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
            applyTheme(cur === 'light' ? 'dark' : 'light');
        });
        $('helpBtn').addEventListener('click', () => openOverlay('helpOverlay'));
        $('closeHelp').addEventListener('click', () => closeOverlay('helpOverlay'));
        $('helpOverlay').addEventListener('click', (e) => { if (e.target.id === 'helpOverlay') closeOverlay('helpOverlay'); });

        $('copyBtn').addEventListener('click', () => copyScore(dayNum));
        $('closeBtn').addEventListener('click', () => closeOverlay('resultsOverlay'));
        $('closeResults').addEventListener('click', () => closeOverlay('resultsOverlay'));
        $('resultsOverlay').addEventListener('click', (e) => { if (e.target.id === 'resultsOverlay') closeOverlay('resultsOverlay'); });
    }

function loadPools() {
        return fetch(POOLS_URL)
            .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then((data) => {
                if (Array.isArray(data.rank) && data.rank.length &&
                    Array.isArray(data.outlier) && data.outlier.length &&
                    Array.isArray(data.target) && data.target.length) {
                    RANK_POOLS = data.rank;
                    OUTLIER_POOLS = data.outlier;
                    TARGET_POOLS = data.target;
                    console.log('[Trivia Daily] Generated pools loaded:',
                        RANK_POOLS.length, 'rank /',
                        OUTLIER_POOLS.length, 'outlier /',
                        TARGET_POOLS.length, 'target');
                } else {
                    throw new Error('malformed pool payload');
                }
            })
            .catch((err) => console.warn('[Trivia Daily] Using built-in fallback pools:', err.message));
    }

    document.addEventListener('DOMContentLoaded', () => {
        // fetch the generated Wikidata pool dataset first (the game still boots
        // with the embedded fallback pools if the fetch fails), then init
        loadPools().then(init, init);
    });
    