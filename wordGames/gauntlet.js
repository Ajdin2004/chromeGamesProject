// ============================================================
//  Category Gauntlet — survive escalating trivia categories
//  Powered by Open Trivia DB (https://opentdb.com)
// ============================================================

const API_BASE = 'https://opentdb.com';

const STAGES = [
    { name: 'General Knowledge', id: 9,  difficulty: 'easy',   required: 3 },
    { name: 'Video Games',       id: 15, difficulty: 'easy',   required: 3 },
    { name: 'Film',              id: 11, difficulty: 'medium', required: 3 },
    { name: 'Science & Nature',  id: 17, difficulty: 'medium', required: 3 },
    { name: 'Computers',         id: 18, difficulty: 'hard',   required: 4 },
    { name: 'Geography',         id: 22, difficulty: 'medium', required: 4 },
    { name: 'Mythology',         id: 20, difficulty: 'hard',   required: 4 },
    { name: 'History',           id: 23, difficulty: 'hard',   required: 5 }
];

const MAX_LIVES = 3;
const TIME_BY_DIFFICULTY = { easy: 20, medium: 25, hard: 30 };
const MULT_BY_DIFFICULTY = { easy: 1, medium: 2, hard: 3 };
const STORAGE_STATS = 'gauntlet_stats';
const STORAGE_SFX = 'gauntlet_sfx';

// ---------------- Web Audio Synthesizer ----------------
let audioCtx = null;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

let sfxEnabled = localStorage.getItem(STORAGE_SFX) !== 'off';

function playTone(type, freqPoints, duration, volume = 0.12) {
    if (!audioCtx || !sfxEnabled) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    freqPoints.forEach(([freq, offset]) => osc.frequency.setValueAtTime(freq, now + offset));
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + duration);
}

const Sound = {
    correct() { playTone('triangle', [[523, 0], [659, 0.1]], 0.25); },
    wrong() { playTone('sawtooth', [[180, 0], [80, 0.2]], 0.25); },
    click() { playTone('sine', [[700, 0]], 0.08, 0.08); },
    stageUp() { playTone('triangle', [[523, 0], [659, 0.08], [784, 0.16], [1046, 0.24]], 0.4); },
    gameOver() { playTone('sawtooth', [[220, 0], [180, 0.15], [120, 0.3], [80, 0.45]], 0.6); }
};

// ---------------- State ----------------
let lives = MAX_LIVES;
let score = 0;
let stageIdx = 0;
let stageCorrect = 0;
let questionQueue = [];
let currentQuestion = null;
let answeredThisQuestion = false;
let runActive = false;
let fiftyUsed = false;
let skipUsed = false;
let totalCorrectThisRun = 0;
let totalAnsweredThisRun = 0;
let sessionToken = null;

let timerInterval = null;
let timeLeft = 0;
let timeTotal = 1;

let stats = loadStats();

// ---------------- DOM Elements ----------------
const startScreen = document.getElementById('start-screen');
const runUI = document.getElementById('run-ui');
const loadingBox = document.getElementById('loading-box');
const btnStart = document.getElementById('btn-start');
const livesRow = document.getElementById('lives-row');
const scoreVal = document.getElementById('score-val');
const stageNumEl = document.getElementById('stage-num');
const stageProgressText = document.getElementById('stage-progress-text');
const stageDots = document.getElementById('stage-dots');
const timerFill = document.getElementById('timer-fill');
const qCategory = document.getElementById('q-category');
const qDifficulty = document.getElementById('q-difficulty');
const questionText = document.getElementById('question-text');
const answersGrid = document.getElementById('answers-grid');
const feedbackEl = document.getElementById('feedback');
const btnFifty = document.getElementById('btn-fifty');
const btnSkip = document.getElementById('btn-skip');
const statBestScore = document.getElementById('stat-best-score');
const statBestStage = document.getElementById('stat-best-stage');
const btnSfx = document.getElementById('btn-sfx');
const statsModal = document.getElementById('stats-modal');
const helpModal = document.getElementById('help-modal');
const gameoverModal = document.getElementById('gameover-modal');
const victoryModal = document.getElementById('victory-modal');
const stageBanner = document.getElementById('stage-banner');

// ---------------- Utilities ----------------
function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Open Trivia DB returns HTML-encoded entities (&quot; &#039; &amp; ...)
function decodeHtml(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

function loadStats() {
    const defaults = { played: 0, bestScore: 0, bestStage: 0, totalCorrect: 0, totalAnswered: 0 };
    try {
        return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_STATS) || '{}') };
    } catch (e) {
        return defaults;
    }
}

function saveStats() {
    localStorage.setItem(STORAGE_STATS, JSON.stringify(stats));
}

function showModal(modal) {
    modal.classList.add('active');
}

function hideModal(modal) {
    modal.classList.remove('active');
}

// ---------------- Open Trivia DB API ----------------
async function ensureToken() {
    if (sessionToken) return;
    try {
        const res = await fetch(`${API_BASE}/api_token.php?command=request`);
        const data = await res.json();
        if (data.token) sessionToken = data.token;
    } catch (err) {
        // Token is optional — the API works without one (questions may repeat)
        console.warn('Could not obtain trivia session token:', err);
    }
}

async function fetchQuestions(stage) {
    const amount = stage.required + 3; // buffer for wrong answers / skips
    let url = `${API_BASE}/api.php?amount=${amount}&category=${stage.id}&difficulty=${stage.difficulty}&type=multiple`;
    if (sessionToken) url += `&token=${encodeURIComponent(sessionToken)}`;

    let data;
    try {
        const res = await fetch(url);
        data = await res.json();
    } catch (err) {
        throw new Error('Network error while fetching questions.');
    }

    // response_code 3/4: token exhausted or invalid -> reset and retry once
    if ((data.response_code === 3 || data.response_code === 4)) {
        sessionToken = null;
        await ensureToken();
        url = `${API_BASE}/api.php?amount=${amount}&category=${stage.id}&difficulty=${stage.difficulty}&type=multiple`;
        if (sessionToken) url += `&token=${encodeURIComponent(sessionToken)}`;
        const retryRes = await fetch(url);
        data = await retryRes.json();
    }

    if (data.response_code !== 0 || !Array.isArray(data.results) || data.results.length === 0) {
        throw new Error(`No questions available (code ${data.response_code}).`);
    }

    return data.results.map(q => ({
        question: decodeHtml(q.question),
        correct: decodeHtml(q.correct_answer),
        incorrect: q.incorrect_answers.map(decodeHtml),
        category: decodeHtml(q.category),
        difficulty: q.difficulty
    }));
}

// ---------------- Run / Stage Flow ----------------
function startRun() {
    initAudio();
    Sound.click();

    lives = MAX_LIVES;
    score = 0;
    stageIdx = 0;
    stageCorrect = 0;
    questionQueue = [];
    currentQuestion = null;
    fiftyUsed = false;
    skipUsed = false;
    totalCorrectThisRun = 0;
    totalAnsweredThisRun = 0;
    runActive = true;

    stats.played++;
    saveStats();

    startScreen.style.display = 'none';
    runUI.style.display = 'flex';

    btnFifty.disabled = false;
    btnSkip.disabled = false;

    renderLives();
    updateHud();
    renderStageDots();
    feedbackEl.textContent = '';

    beginStage(0);
}

async function beginStage(index) {
    stageIdx = index;
    stageCorrect = 0;

    const stage = STAGES[index];
    stageNumEl.textContent = index + 1;
    renderStageDots();
    updateHud();

    // Cinematic stage banner
    document.getElementById('banner-stage').textContent = `STAGE ${index + 1} OF ${STAGES.length}`;
    document.getElementById('banner-name').textContent = stage.name;
    document.getElementById('banner-diff').textContent =
        `${stage.difficulty.charAt(0).toUpperCase() + stage.difficulty.slice(1)} · Get ${stage.required} correct to advance`;

    if (index > 0) Sound.stageUp();
    stageBanner.classList.add('active');

    stopTimer();
    setQuestionLoading(true);
    setTimeout(() => stageBanner.classList.remove('active'), 1600);

    try {
        questionQueue = shuffleArray(await fetchQuestions(stage));
        setQuestionLoading(false);
        nextQuestion();
    } catch (err) {
        console.error(err);
        setQuestionLoading(false);
        questionText.textContent = 'Could not load questions.';
        feedbackEl.textContent = '⚠ ' + err.message + ' Check your connection and try again.';
        feedbackEl.className = 'toast bad';
        runActive = false;
    }
}

function setQuestionLoading(loading) {
    loadingBox.style.display = loading ? 'flex' : 'none';
    answersGrid.innerHTML = '';
    if (!loading) return;
}

// ---------------- Question Rendering & Timer ----------------
function nextQuestion() {
    if (!runActive) return;

    if (questionQueue.length === 0) {
        // Queue ran dry (many wrong answers/skips) — refill from the API
        setQuestionLoading(true);
        fetchQuestions(STAGES[stageIdx])
            .then(qs => {
                setQuestionLoading(false);
                questionQueue = shuffleArray(qs);
                nextQuestion();
            })
            .catch(err => {
                console.error(err);
                setQuestionLoading(false);
                feedbackEl.textContent = '⚠ Could not load more questions.';
                feedbackEl.className = 'toast bad';
                endRun(false);
            });
        return;
    }

    currentQuestion = questionQueue.shift();
    answeredThisQuestion = false;
    feedbackEl.textContent = '';
    feedbackEl.className = 'toast';

    qCategory.textContent = currentQuestion.category;
    const diff = currentQuestion.difficulty;
    qDifficulty.textContent = diff.toUpperCase();
    qDifficulty.className = `diff-${diff}`;

    questionText.textContent = currentQuestion.question;

    answersGrid.innerHTML = '';
    const answers = shuffleArray([currentQuestion.correct, ...currentQuestion.incorrect]);
    answers.forEach(answerText => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.textContent = answerText;
        btn.onclick = () => handleAnswer(btn, answerText === currentQuestion.correct);
        answersGrid.appendChild(btn);
    });

    startTimer(diff);
}

function startTimer(difficulty) {
    stopTimer();
    timeTotal = TIME_BY_DIFFICULTY[difficulty] || 20;
    timeLeft = timeTotal;
    updateTimerBar();

    timerInterval = setInterval(() => {
        timeLeft -= 0.1;
        updateTimerBar();
        if (timeLeft <= 0) {
            stopTimer();
            handleTimeout();
        }
    }, 100);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateTimerBar() {
    const pct = Math.max(0, (timeLeft / timeTotal) * 100);
    timerFill.style.width = pct + '%';
    timerFill.classList.toggle('danger', pct < 30);
}

// ---------------- Answering ----------------
function lockAnswers() {
    answersGrid.querySelectorAll('.answer-btn').forEach(b => b.disabled = true);
}

function revealCorrectAnswer() {
    answersGrid.querySelectorAll('.answer-btn').forEach(b => {
        if (b.textContent === currentQuestion.correct) b.classList.add('correct');
    });
}

function handleAnswer(btn, isCorrect) {
    if (answeredThisQuestion || !runActive) return;
    answeredThisQuestion = true;
    stopTimer();
    lockAnswers();
    totalAnsweredThisRun++;

    if (isCorrect) {
        btn.classList.add('correct');
        Sound.correct();
        totalCorrectThisRun++;
        stageCorrect++;

        const stage = STAGES[stageIdx];
        const mult = MULT_BY_DIFFICULTY[currentQuestion.difficulty] || 1;
        const basePoints = 100 * mult;
        const timeBonus = Math.round(Math.max(0, timeLeft)) * mult;
        score += basePoints + timeBonus;
        feedbackEl.textContent = `✅ Correct! +${basePoints} pts${timeBonus > 0 ? ` · +${timeBonus} time bonus` : ''}`;
        feedbackEl.className = 'toast good';

        updateHud();
        setTimeout(() => {
            if (stageCorrect >= stage.required) advanceStage();
            else nextQuestion();
        }, 1400);
    } else {
        btn.classList.add('wrong');
        revealCorrectAnswer();
        Sound.wrong();
        loseLife('❌ Wrong!');
    }
}

function handleTimeout() {
    if (answeredThisQuestion || !runActive) return;
    answeredThisQuestion = true;
    lockAnswers();
    revealCorrectAnswer();
    Sound.wrong();
    totalAnsweredThisRun++;
    loseLife("⏰ Time's up!");
}

function loseLife(message) {
    lives--;
    renderLives();
    feedbackEl.textContent = message;
    feedbackEl.className = 'toast bad';

    if (lives <= 0) {
        runActive = false;
        setTimeout(() => endRun(false), 1200);
    } else {
        setTimeout(() => nextQuestion(), 1600);
    }
}

function advanceStage() {
    if (stageIdx + 1 >= STAGES.length) {
        runActive = false;
        endRun(true);
    } else {
        beginStage(stageIdx + 1);
    }
}

// ---------------- Lifelines ----------------
function useFifty() {
    if (fiftyUsed || answeredThisQuestion || !runActive || !currentQuestion) return;
    fiftyUsed = true;
    btnFifty.disabled = true;
    Sound.click();

    const wrongButtons = [...answersGrid.querySelectorAll('.answer-btn')]
        .filter(b => !b.classList.contains('correct') && b.textContent !== currentQuestion.correct);
    shuffleArray(wrongButtons).slice(0, 2).forEach(b => b.classList.add('eliminated'));
}

function useSkip() {
    if (skipUsed || answeredThisQuestion || !runActive) return;
    skipUsed = true;
    btnSkip.disabled = true;
    Sound.click();
    feedbackEl.textContent = '⏭ Question skipped — no penalty.';
    feedbackEl.className = 'toast';
    nextQuestion();
}

// ---------------- End of Run ----------------
function endRun(victory) {
    stopTimer();
    runActive = false;

    // Persist lifetime stats
    const stageReached = victory ? STAGES.length : stageIdx + 1;
    stats.bestScore = Math.max(stats.bestScore, score);
    stats.bestStage = Math.max(stats.bestStage, stageReached);
    stats.totalCorrect += totalCorrectThisRun;
    stats.totalAnswered += totalAnsweredThisRun;
    saveStats();
    updateStatsBar();

    if (victory) {
        document.getElementById('vic-score').textContent = score;
        document.getElementById('vic-lives').textContent = lives;
        document.getElementById('vic-accuracy').textContent = formatAccuracy();
        document.getElementById('vic-best').textContent = stats.bestScore;
        const newBest = score >= stats.bestScore && score > 0;
        document.getElementById('vic-newbest').style.display = newBest ? 'block' : 'none';
        Sound.stageUp();
        showModal(victoryModal);
        runConfetti();
    } else {
        document.getElementById('go-score').textContent = score;
        document.getElementById('go-stage').textContent = `${stageReached} / ${STAGES.length}`;
        document.getElementById('go-correct').textContent =
            `${totalCorrectThisRun} of ${totalAnsweredThisRun}`;
        document.getElementById('go-best').textContent = stats.bestScore;
        const newBest = score >= stats.bestScore && score > 0;
        document.getElementById('go-newbest').style.display = newBest ? 'block' : 'none';
        Sound.gameOver();
        showModal(gameoverModal);
    }
}

function backToStart() {
    hideModal(gameoverModal);
    hideModal(victoryModal);
    runUI.style.display = 'none';
    startScreen.style.display = 'flex';
    questionText.textContent = 'Loading...';
}

// ---------------- Rendering Helpers ----------------
function renderLives() {
    livesRow.innerHTML = '';
    for (let i = 0; i < MAX_LIVES; i++) {
        const heart = document.createElement('i');
        heart.className = 'fa-solid fa-heart heart' + (i < lives ? '' : ' lost');
        livesRow.appendChild(heart);
    }
}

function renderStageDots() {
    stageDots.innerHTML = '';
    STAGES.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.className = 'stage-dot' + (i < stageIdx ? ' done' : (i === stageIdx ? ' current' : ''));
        stageDots.appendChild(dot);
    });
}

function updateHud() {
    scoreVal.textContent = score;
    const required = STAGES[stageIdx] ? STAGES[stageIdx].required : 3;
    stageProgressText.textContent = `${stageCorrect}/${required}`;
}

function updateStatsBar() {
    statBestScore.textContent = stats.bestScore;
    statBestStage.textContent = stats.bestStage > 0 ? `${stats.bestStage}/${STAGES.length}` : '–';
}

function formatAccuracy() {
    if (totalAnsweredThisRun === 0) return '0%';
    return Math.round((totalCorrectThisRun / totalAnsweredThisRun) * 100) + '%';
}

function renderStatsModal() {
    document.getElementById('stats-played').textContent = stats.played;
    document.getElementById('stats-best-score').textContent = stats.bestScore;
    document.getElementById('stats-best-stage').textContent = stats.bestStage > 0 ? `${stats.bestStage}/${STAGES.length}` : '–';
    const acc = stats.totalAnswered > 0 ? Math.round((stats.totalCorrect / stats.totalAnswered) * 100) : 0;
    document.getElementById('stats-accuracy').textContent = acc + '%';
}

// ---------------- Confetti ----------------
let confettiAnimId = null;

function runConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas || !victoryModal) return;

    const rect = victoryModal.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = rect.width;
    const height = rect.height;

    const pieces = Array.from({ length: 140 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height - height,
        size: Math.random() * 12 + 6,
        color: ['#facc15', '#00f2fe', '#22c55e', '#eab308', '#ef4444', '#a855f7'][Math.floor(Math.random() * 6)],
        speedY: Math.random() * 120 + 80,
        speedX: (Math.random() - 0.5) * 120,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 360
    }));

    let lastTime = performance.now();

    function draw(now) {
        const dt = Math.min(100, now - lastTime) / 1000;
        lastTime = now;
        ctx.clearRect(0, 0, width, height);

        for (const p of pieces) {
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

        if (victoryModal.classList.contains('active')) {
            confettiAnimId = requestAnimationFrame(draw);
        } else {
            confettiAnimId = null;
            ctx.clearRect(0, 0, width, height);
        }
    }

    if (confettiAnimId) cancelAnimationFrame(confettiAnimId);
    confettiAnimId = requestAnimationFrame(draw);
}

// ---------------- SFX Toggle ----------------
function updateSfxButton() {
    if (sfxEnabled) {
        btnSfx.classList.add('active');
        btnSfx.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
    } else {
        btnSfx.classList.remove('active');
        btnSfx.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
    }
}

// ---------------- Event Wiring & Init ----------------
btnStart.addEventListener('click', startRun);
document.getElementById('btn-play-again-lose').addEventListener('click', () => { hideModal(gameoverModal); startRun(); });
document.getElementById('btn-play-again-vic').addEventListener('click', () => { hideModal(victoryModal); startRun(); });
document.getElementById('btn-close-lose').addEventListener('click', backToStart);
document.getElementById('btn-close-vic').addEventListener('click', backToStart);

btnFifty.addEventListener('click', useFifty);
btnSkip.addEventListener('click', useSkip);

document.getElementById('btn-stats').addEventListener('click', () => { initAudio(); Sound.click(); renderStatsModal(); showModal(statsModal); });
document.getElementById('btn-close-stats').addEventListener('click', () => hideModal(statsModal));
document.getElementById('btn-help').addEventListener('click', () => { initAudio(); Sound.click(); showModal(helpModal); });
document.getElementById('btn-close-help').addEventListener('click', () => hideModal(helpModal));

btnSfx.addEventListener('click', () => {
    initAudio();
    sfxEnabled = !sfxEnabled;
    localStorage.setItem(STORAGE_SFX, sfxEnabled ? 'on' : 'off');
    updateSfxButton();
    if (sfxEnabled) Sound.click();
});

updateStatsBar();
updateSfxButton();
renderLives();
renderStageDots();