// --- Web Audio Synthesizer ---
let audioCtx = null;
function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

const Sound = {
  select() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.05);
  },
  success() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.setValueAtTime(659.25, now + 0.08);
    osc.frequency.setValueAtTime(783.99, now + 0.16);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.3);
  },
  error() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.15);
  },
  gameover() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(200, now + 0.4);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.4);
  }
};

// --- Dynamic Dictionary Setup ---
let WORDS = new Set();
let isDictionaryLoaded = false;

async function loadDictionary() {
  try {
    flashToast('Loading dictionary...');
    const response = await fetch('https://cdn.jsdelivr.net/gh/raun/Scrabble/words.txt');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const text = await response.text();
    const wordList = text
      .split(/\r?\n/)
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length >= 3);

    WORDS = new Set(wordList);
    isDictionaryLoaded = true;
    flashToast('Dictionary loaded! Ready to play.');
  } catch (err) {
    console.error('Failed to load online dictionary:', err);
    flashToast('Error loading word list.');
  }
}

const LETTERS = 'EEEEEEEEEEEEAAAAAAAIIIIIIIOOOOOOOONNNNNNRRRRRRTTTTTLLLLSSSSUUMGPDHBFCMVWYKVJXZQ'.split('');

// --- DOM References ---
const boardEl = document.getElementById('board');
const currentEl = document.getElementById('current-word');
const foundEl = document.getElementById('found');
const foundCountEl = document.getElementById('found-count');
const timerEl = document.getElementById('timer');
const scoreEl = document.getElementById('score');
const toastEl = document.getElementById('toast');
const diffBtns = document.querySelectorAll('.diff-btn');

// --- Game State & Difficulty Specs ---
const DIFFICULTY_CONFIG = {
  easy: { time: 240, minLen: 3 },
  medium: { time: 180, minLen: 3 },
  hard: { time: 120, minLen: 4 }
};

let currentDifficulty = 'medium';
let grid = [];
let selected = [];
let found = new Set();
let score = 0;
let timer = 180;
let timerId = null;

function randLetter() {
  return LETTERS[Math.floor(Math.random() * LETTERS.length)];
}

function makeBoard() {
  grid = [];
  boardEl.innerHTML = '';
  for (let i = 0; i < 16; i++) {
    const L = randLetter();
    grid.push(L);
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.index = i;
    cell.textContent = L;
    boardEl.appendChild(cell);
  }
  attachEvents();
}

function attachEvents() {
  const cells = document.querySelectorAll('.cell');
  cells.forEach(cell => {
    cell.addEventListener('mousedown', startDrag);
    cell.addEventListener('mouseover', overCell);
    cell.addEventListener('touchstart', touchStart, { passive: false });
    cell.addEventListener('touchmove', touchMove, { passive: false });
  });
  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchend', endDrag);
}

function startTimer() {
  clearInterval(timerId);
  timer = DIFFICULTY_CONFIG[currentDifficulty].time;
  timerEl.textContent = formatTime(timer);
  timerId = setInterval(() => {
    timer--;
    timerEl.textContent = formatTime(timer);
    if (timer <= 0) {
      clearInterval(timerId);
      endGame();
    }
  }, 1000);
}

function formatTime(s) {
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function getNeighbors(idx) {
  const x = idx % 4, y = Math.floor(idx / 4);
  const neighbors = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < 4 && ny >= 0 && ny < 4) neighbors.push(ny * 4 + nx);
    }
  }
  return neighbors;
}

function startDrag(e) {
  if (timer <= 0) return;
  initAudio();
  e.preventDefault();
  const idx = Number(e.currentTarget.dataset.index);
  selected = [idx];
  Sound.select();
  updateSelection();
}

function overCell(e) {
  if (!selected.length || timer <= 0) return;
  const idx = Number(e.currentTarget.dataset.index);
  const last = selected[selected.length - 1];
  
  if (selected.includes(idx)) {
    if (selected.length >= 2 && selected[selected.length - 2] === idx) {
      selected.pop();
      Sound.select();
      updateSelection();
    }
    return;
  }
  
  if (getNeighbors(last).includes(idx)) {
    selected.push(idx);
    Sound.select();
    updateSelection();
  }
}

function endDrag() {
  if (!selected.length) return;
  submitCurrent();
  selected = [];
  updateSelection();
}

function touchStart(e) {
  if (timer <= 0) return;
  e.preventDefault();
  const touch = e.touches[0];
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  if (el && el.classList.contains('cell')) {
    startDrag({ currentTarget: el, preventDefault: () => {} });
  }
}

function touchMove(e) {
  if (timer <= 0) return;
  e.preventDefault();
  const touch = e.touches[0];
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  if (el && el.classList.contains('cell')) {
    overCell({ currentTarget: el });
  }
}

function updateSelection() {
  document.querySelectorAll('.cell').forEach(c => c.classList.remove('active'));
  selected.forEach(i => {
    const el = document.querySelector(`.cell[data-index="${i}"]`);
    if (el) el.classList.add('active');
  });
  currentEl.textContent = selected.map(i => grid[i]).join('') || '---';
}

function submitCurrent() {
  if (!isDictionaryLoaded) {
    flashToast('Dictionary still loading...');
    return;
  }

  const minLen = DIFFICULTY_CONFIG[currentDifficulty].minLen;
  const w = selected.map(i => grid[i]).join('').toLowerCase();
  
  if (w.length < minLen) {
    if (w.length > 0) flashToast(`Too short (min ${minLen} letters)`);
    Sound.error();
    flashInvalid(selected);
    return;
  }
  if (found.has(w)) {
    flashToast('Already found!');
    Sound.error();
    flashInvalid(selected);
    return;
  }
  if (!WORDS.has(w)) {
    flashToast('Not in dictionary');
    Sound.error();
    flashInvalid(selected);
    return;
  }

  // Valid word
  found.add(w);
  const pts = scoreFor(w);
  score += pts;
  scoreEl.textContent = score;
  addFound(w, pts);
  Sound.success();
  flashToast(`+${pts} pts!`);
}

function flashInvalid(indices) {
  indices.forEach(i => {
    const el = document.querySelector(`.cell[data-index="${i}"]`);
    if (el) {
      el.classList.add('invalid');
      setTimeout(() => el.classList.remove('invalid'), 350);
    }
  });
}

function flashToast(msg) {
  toastEl.textContent = msg;
}

function addFound(w, pts) {
  const tag = document.createElement('div');
  tag.className = 'found-tag';
  tag.innerHTML = `${w} <span>+${pts}</span>`;
  foundEl.prepend(tag);
  foundCountEl.textContent = found.size;
}

function scoreFor(w) {
  if (w.length <= 3) return 3;
  if (w.length === 4) return 4;
  if (w.length === 5) return 5;
  return w.length + 2;
}

function endGame() {
  Sound.gameover();
  flashToast(`Game Over! Final Score: ${score}`);
}

function provideHint() {
  if (!isDictionaryLoaded) {
    flashToast('Dictionary loading...');
    return;
  }
  const minLen = DIFFICULTY_CONFIG[currentDifficulty].minLen;

  for (const w of WORDS) {
    if (w.length < minLen || found.has(w)) continue;
    if (canForm(w)) {
      flashToast(`Hint: Try finding "${w.toUpperCase()}"`);
      return;
    }
  }
  flashToast('No hints available. Try shuffling!');
}

function canForm(word) {
  word = word.toUpperCase();
  const used = Array(16).fill(false);
  
  function dfs(pos, idx) {
    if (idx === word.length) return true;
    for (let i = 0; i < 16; i++) {
      if (used[i] || grid[i] !== word[idx]) continue;
      if (pos === -1 || getNeighbors(pos).includes(i)) {
        used[i] = true;
        if (dfs(i, idx + 1)) return true;
        used[i] = false;
      }
    }
    return false;
  }
  return dfs(-1, 0);
}

function resetGame() {
  score = 0;
  scoreEl.textContent = score;
  found.clear();
  foundEl.innerHTML = '';
  foundCountEl.textContent = '0';
  makeBoard();
  startTimer();
}

// --- Difficulty Listener ---
diffBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    initAudio();
    diffBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentDifficulty = btn.dataset.diff;
    flashToast(`Switched to ${currentDifficulty.toUpperCase()} mode`);
    resetGame();
  });
});

// --- Event Listeners ---
document.getElementById('new-btn').addEventListener('click', () => {
  initAudio();
  flashToast('New board ready!');
  resetGame();
});

document.getElementById('shuffle-btn').addEventListener('click', () => {
  initAudio();
  makeBoard();
  flashToast('Board reshuffled!');
});

document.getElementById('clear-btn').addEventListener('click', () => {
  initAudio();
  selected = [];
  updateSelection();
});

document.getElementById('submit-btn').addEventListener('click', () => {
  initAudio();
  submitCurrent();
  selected = [];
  updateSelection();
});

document.getElementById('hint-btn').addEventListener('click', () => {
  initAudio();
  provideHint();
});

// --- Initialization ---
makeBoard();
startTimer();
loadDictionary();