'use strict';

const DECISIONS_PER_ROUND = 4;
const BASE_REMEMBER_MS = 1900;
const FEEDBACK_MS = 520;
const TRANSITION_MS = 360;
const DOT_ROWS = 7;
const DOT_COLS = 7;
const GRID_N = 4;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SYM_DIFFICULTY = 0.52;

const WORDS = [
  'APPLE', 'BRAIN', 'CHAIR', 'DANCE', 'EAGLE', 'FLAME', 'GRACE', 'HEART', 'IMAGE', 'JOKER',
  'KNIFE', 'LIGHT', 'MUSIC', 'NIGHT', 'OCEAN', 'PEACE', 'QUEEN', 'RIVER', 'STORM', 'TIGER',
  'UNITY', 'VOICE', 'WATER', 'YOUTH', 'ZEBRA', 'ANGLE', 'BLEND', 'CLOUD', 'DRIVE', 'EARTH',
  'FIELD', 'GIANT', 'HONOR', 'IVORY', 'JEWEL', 'LEMON', 'MAPLE', 'NOBLE', 'ORBIT', 'PLANT',
  'PRISM', 'QUICK', 'RHYTHM', 'SHAPE', 'TOWER', 'ULTRA', 'VALID', 'WORLD', 'XENON', 'YIELD',
  'BRAVE', 'CRISP', 'DELTA', 'FROST', 'GLIDE', 'HASTE', 'INLET', 'JAZZY', 'KNACK', 'LUNAR',
  'MIRTH', 'NORTH', 'OZONE', 'PIXEL', 'QUIRK', 'RIDER', 'SMOKE', 'TWIST', 'UMBER', 'VIVID',
];

let G = { level: 1 };
let audioCtx = null;

function freshState(mode) {
  G = {
    mode,
    level: G.level,
    round: 0,
    decIdx: 0,
    okCount: 0,
    totCount: 0,
    memories: [],
    task: null,
    picks: [],
    usedWords: new Set(),
    busy: false,
    stage: 'menu',
    runId: 0,
    focusIdx: 0,
  };
}

const el = id => document.getElementById(id);
const $ = (id, html) => { el(id).innerHTML = html; };
const txt = (id, t) => { el(id).textContent = t; };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
  el('s-' + name).classList.add('active');
}

function syncLevelPill() {
  txt('level-pill', `Level ${G.level}`);
}

function ensureAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(frequency, duration, type = 'sine', gainValue = 0.045) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.value = gainValue;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration / 1000);
  osc.stop(ctx.currentTime + duration / 1000);
}

function playFeedbackSound(correct) {
  if (correct) {
    playTone(660, 110, 'triangle', 0.05);
    setTimeout(() => playTone(880, 140, 'triangle', 0.04), 90);
  } else {
    playTone(180, 140, 'sawtooth', 0.05);
  }
}

function playMemSound() {
  playTone(520, 120, 'sine', 0.03);
}

function playSuccessSound() {
  playTone(523.25, 120, 'triangle', 0.045);
  setTimeout(() => playTone(659.25, 120, 'triangle', 0.045), 100);
  setTimeout(() => playTone(783.99, 150, 'triangle', 0.05), 210);
}

function playFailureSound() {
  playTone(220, 180, 'sawtooth', 0.045);
  setTimeout(() => playTone(165, 220, 'sawtooth', 0.04), 120);
}

function updateProgress() {
  const total = G.level * (DECISIONS_PER_ROUND + 1);
  const done = G.round * (DECISIONS_PER_ROUND + 1) + G.decIdx;
  el('game-prog').style.width = Math.min(100, Math.round(done / total * 100)) + '%';
  txt('gm-left', `Round ${G.round + 1} of ${G.level}`);
  txt('gm-right', `Decision ${G.decIdx + 1} / ${DECISIONS_PER_ROUND}`);
}

function makeDotGrid(symmetric) {
  const half = Math.floor(DOT_COLS / 2);
  const g = Array.from({ length: DOT_ROWS }, () => Array(DOT_COLS).fill(false));

  if (symmetric) {
    for (let r = 0; r < DOT_ROWS; r++) {
      for (let c = 0; c < half; c++) {
        const v = Math.random() < 0.5;
        g[r][c] = v;
        g[r][DOT_COLS - 1 - c] = v;
      }
      if (DOT_COLS % 2) g[r][half] = Math.random() < 0.45;
    }
  } else {
    let tries = 0;
    do {
      for (let r = 0; r < DOT_ROWS; r++) {
        for (let c = 0; c < DOT_COLS; c++) {
          g[r][c] = Math.random() < 0.42;
        }
      }
      tries++;
    } while (tries < 20 && isSymGrid(g));

    if (isSymGrid(g)) {
      const mid = Math.floor(DOT_ROWS / 2);
      g[mid][0] = !g[mid][DOT_COLS - 1];
    }
  }

  return g;
}

function isSymGrid(g) {
  for (let r = 0; r < DOT_ROWS; r++) {
    for (let c = 0; c < Math.floor(DOT_COLS / 2); c++) {
      if (g[r][c] !== g[r][DOT_COLS - 1 - c]) return false;
    }
  }
  return true;
}

function renderDotPattern(g) {
  let h = `<div class="dot-pattern" style="grid-template-columns:repeat(${DOT_COLS},18px);">`;
  for (let r = 0; r < DOT_ROWS; r++) {
    for (let c = 0; c < DOT_COLS; c++) {
      h += `<div class="dot${g[r][c] ? ' on' : ''}"></div>`;
    }
  }
  return h + '</div>';
}

function pickWord() {
  const avail = WORDS.filter(word => !G.usedWords.has(word));
  const pool = avail.length ? avail : WORDS;
  const word = pool[Math.floor(Math.random() * pool.length)];
  G.usedWords.add(word);
  return word;
}

function scramble(word) {
  const letters = word.split('');
  let result = word;
  let attempts = 0;
  while (result === word && attempts++ < 50) {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    result = letters.join('');
  }
  if (result === word) {
    const rotated = letters.slice(1).concat(letters[0]).join('');
    return rotated === word ? word.split('').reverse().join('') : rotated;
  }
  return result;
}

function pickDecisionTiming(level) {
  const memoryMs = Math.max(1100, BASE_REMEMBER_MS - ((level - 1) * 70));
  const transitionMs = Math.max(240, TRANSITION_MS - ((level - 1) * 12));
  return { memoryMs, transitionMs };
}

function startGame(mode) {
  ensureAudio();
  freshState(mode);
  showScreen('game');
  startRound();
}

function restartGame() {
  if (!G.mode) {
    startGame('spatial');
    return;
  }
  startGame(G.mode);
}

async function startRound() {
  G.decIdx = 0;
  updateProgress();
  txt('gm-right', `Decision 1 / ${DECISIONS_PER_ROUND}`);
  $('stage-hdr', '');
  $('game-body', `
    <div class="round-banner fade-in">Round ${G.round + 1} of ${G.level}</div>
    <div class="round-sub">Prepare for ${DECISIONS_PER_ROUND} decisions…</div>
  `);
  el('answer-row').style.display = 'none';
  await wait(850);
  if (G.runId === 0) G.runId = Date.now();
  runDecision(G.runId);
}

function runDecision(runId) {
  if (runId !== G.runId) return;
  G.busy = false;
  updateProgress();

  if (G.mode === 'spatial') {
    txt('stage-hdr', '');
    $('stage-hdr', `
      <div class="stage-title">Is this pattern symmetric?</div>
      <div class="stage-hint">Vertical left-right symmetry</div>
    `);
    const symmetric = Math.random() < SYM_DIFFICULTY;
    const grid = makeDotGrid(symmetric);
    G.task = { correct: symmetric };
    $('game-body', `<div class="fade-in">${renderDotPattern(grid)}</div>`);
  } else {
    $('stage-hdr', `
      <div class="stage-title">Is this word spelled correctly?</div>
      <div class="stage-hint">Press A for Yes, L for No</div>
    `);
    const word = pickWord();
    const correct = Math.random() < 0.5;
    const shown = correct ? word : scramble(word);
    G.task = { correct };
    $('game-body', `<div class="fade-in"><div class="word-card">${shown}</div></div>`);
  }

  const row = el('answer-row');
  row.style.display = 'flex';
  el('btn-yes').disabled = false;
  el('btn-no').disabled = false;
}

async function handleDecision(userYes) {
  if (G.busy) return;
  G.busy = true;

  el('btn-yes').disabled = true;
  el('btn-no').disabled = true;
  el('answer-row').style.display = 'none';

  const ok = userYes === G.task.correct;
  if (ok) G.okCount++;
  G.totCount++;

  playFeedbackSound(ok);
  await showFeedback(ok);

  G.decIdx++;
  if (G.decIdx >= DECISIONS_PER_ROUND) {
    runRemembering(G.runId);
  } else {
    runDecision(G.runId);
  }
}

async function showFeedback(correct) {
  const ic = el('fb-icon');
  ic.textContent = correct ? '✓' : '✗';
  ic.className = correct ? 'fb-ok' : 'fb-err';
  ic.classList.add('show');
  await wait(FEEDBACK_MS);
  ic.classList.remove('show');
  await wait(80);
}

async function runRemembering(runId) {
  if (runId !== G.runId) return;
  el('answer-row').style.display = 'none';
  const timing = pickDecisionTiming(G.level);
  txt('gm-right', 'Remember!');
  $('stage-hdr', `<div class="stage-title">Memorise this!</div>`);

  if (G.mode === 'spatial') {
    const totalCells = GRID_N * GRID_N;
    let cell;
    if (G.memories.length < totalCells) {
      do {
        cell = Math.floor(Math.random() * totalCells);
      } while (G.memories.includes(cell));
    } else {
      cell = Math.floor(Math.random() * totalCells);
    }
    G.memories.push(cell);

    let gridH = `<div class="grid4">`;
    for (let i = 0; i < totalCells; i++) {
      gridH += `<div class="gcell${i === cell ? ' lit' : ''}"></div>`;
    }
    gridH += '</div>';

    $('game-body', `
      <div class="fade-in" style="display:flex;flex-direction:column;align-items:center;gap:14px;">
        ${gridH}
        <div class="timer-track"><div id="mem-timer"></div></div>
      </div>
    `);
  } else {
    const letter = ALPHABET[Math.floor(Math.random() * 26)];
    G.memories.push(letter);

    $('game-body', `
      <div class="fade-in" style="display:flex;flex-direction:column;align-items:center;gap:14px;">
        <div class="big-letter">${letter}</div>
        <div class="timer-track"><div id="mem-timer"></div></div>
      </div>
    `);
  }

  playMemSound();
  await wait(30);
  const bar = el('mem-timer');
  if (bar) {
    bar.style.transition = `width ${timing.memoryMs}ms linear`;
    bar.style.width = '0%';
  }

  await wait(timing.memoryMs);
  G.round++;

  await wait(timing.transitionMs);
  if (G.round >= G.level) {
    startRecall(G.runId);
  } else {
    startRound();
  }
}

function startRecall(runId) {
  if (runId !== G.runId) return;
  G.picks = [];
  G.focusIdx = 0;
  showScreen('recall');
  txt('rc-total', G.level);
  refreshSlots();

  if (G.mode === 'spatial') {
    txt('recall-hint', 'Keyboard: arrows move, Enter/Space selects, Backspace undoes last');
    let h = `<div class="grid4" id="recall-grid">`;
    for (let i = 0; i < GRID_N * GRID_N; i++) {
      h += `<div class="gcell clickable" id="rc${i}" onclick="pickCell(${i})"></div>`;
    }
    h += '</div>';
    $('recall-body', h);
    updateSpatialFocus(0);
  } else {
    txt('recall-hint', 'Keyboard: type letters, Backspace undoes last, Enter submits when full');
    let h = `<div class="alpha-grid">`;
    for (const ch of ALPHABET) {
      h += `<div class="acell" id="ra${ch}" onclick="pickLetter('${ch}')">${ch}</div>`;
    }
    h += '</div>';
    $('recall-body', h);
  }

  el('btn-submit').disabled = true;
  el('btn-clear').disabled = false;
}

function refreshSlots() {
  let h = '';
  for (let i = 0; i < G.level; i++) {
    if (i < G.picks.length) {
      const v = G.mode === 'spatial' ? `#${i + 1}` : G.picks[i];
      h += `<div class="rslot filled">${v}</div>`;
    } else {
      h += '<div class="rslot empty"></div>';
    }
  }
  $('recall-slots', h);
  txt('rc-count', G.picks.length);
  el('btn-submit').disabled = G.picks.length < G.level;
}

function pickCell(idx) {
  if (G.picks.length >= G.level) return;
  if (G.picks.includes(idx)) return;
  G.picks.push(idx);
  const c = el('rc' + idx);
  c.classList.add('picked');
  c.textContent = G.picks.length;
  refreshSlots();
  updateSpatialFocus(idx);
}

function pickLetter(ch) {
  if (G.picks.length >= G.level) return;
  G.picks.push(ch);
  const c = el('ra' + ch);
  c.classList.add('a-picked');
  const times = G.picks.filter(value => value === ch).length;
  c.textContent = times > 1 ? `${ch}×${times}` : ch;
  refreshSlots();
}

function clearRecall() {
  G.picks = [];

  if (G.mode === 'spatial') {
    for (let i = 0; i < GRID_N * GRID_N; i++) {
      const c = el('rc' + i);
      if (c) {
        c.classList.remove('picked', 'r-ok', 'r-bad', 'r-miss');
        c.textContent = '';
      }
    }
  } else {
    for (const ch of ALPHABET) {
      const c = el('ra' + ch);
      if (c) {
        c.classList.remove('a-picked', 'r-ok', 'r-bad', 'r-miss');
        c.textContent = ch;
      }
    }
  }

  refreshSlots();
  if (G.mode === 'spatial') updateSpatialFocus(G.focusIdx);
}

function undoRecallSelection() {
  const last = G.picks.pop();
  if (last === undefined) return;

  if (G.mode === 'spatial') {
    const c = el('rc' + last);
    if (c) {
      c.classList.remove('picked', 'r-ok', 'r-bad', 'r-miss');
      c.textContent = '';
    }
    updateSpatialFocus(last);
  } else {
    const c = el('ra' + last);
    if (c) {
      c.classList.remove('a-picked', 'r-ok', 'r-bad', 'r-miss');
      c.textContent = last;
    }
  }

  refreshSlots();
}

function updateSpatialFocus(idx) {
  G.focusIdx = ((idx % (GRID_N * GRID_N)) + (GRID_N * GRID_N)) % (GRID_N * GRID_N);
  for (let i = 0; i < GRID_N * GRID_N; i++) {
    const c = el('rc' + i);
    if (!c) continue;
    c.classList.toggle('kb-focus', i === G.focusIdx && !c.classList.contains('picked'));
  }
}

function moveSpatialFocus(rowDelta, colDelta) {
  const row = Math.floor(G.focusIdx / GRID_N);
  const col = G.focusIdx % GRID_N;
  const nextRow = Math.max(0, Math.min(GRID_N - 1, row + rowDelta));
  const nextCol = Math.max(0, Math.min(GRID_N - 1, col + colDelta));
  updateSpatialFocus(nextRow * GRID_N + nextCol);
}

async function submitRecall() {
  el('btn-submit').disabled = true;
  el('btn-clear').disabled = true;

  let allOk = true;

  for (let i = 0; i < G.memories.length; i++) {
    const ok = G.picks[i] === G.memories[i];
    if (!ok) allOk = false;

    if (G.mode === 'spatial') {
      const pc = el('rc' + G.picks[i]);
      if (pc) pc.classList.add(ok ? 'r-ok' : 'r-bad');
      if (!ok) {
        const cc = el('rc' + G.memories[i]);
        if (cc) cc.classList.add('r-miss');
      }
    } else {
      const pc = el('ra' + G.picks[i]);
      if (pc) {
        pc.classList.remove('a-picked');
        pc.classList.add(ok ? 'r-ok' : 'r-bad');
      }
      if (!ok) {
        const cc = el('ra' + G.memories[i]);
        if (cc) cc.classList.add('r-miss');
      }
    }
  }

  if (allOk) {
    playSuccessSound();
  } else {
    playFailureSound();
  }

  await wait(1100);
  showResult(allOk);
}

function showResult(passed) {
  showScreen('result');

  if (passed) {
    G.level++;
    txt('r-emoji', '🎉');
    txt('r-heading', 'Perfect Recall!');
    el('r-heading').className = 'result-heading pass';
    txt('r-sub', `Outstanding! You've earned Level ${G.level}.`);
    txt('btn-again', 'Next Level →');
  } else {
    txt('r-emoji', '💪');
    txt('r-heading', 'Recall Incomplete');
    el('r-heading').className = 'result-heading fail';
    txt('r-sub', `Good effort — keep training! Stay on Level ${G.level}.`);
    txt('btn-again', 'Try Again');
  }

  txt('st-dec', `${G.okCount}/${G.totCount}`);
  txt('st-rec', passed ? '100%' : 'Incomplete');
  txt('st-lvl', G.level);
  syncLevelPill();
}

function goMenu() {
  showScreen('menu');
  syncLevelPill();
}

function playAgain() {
  startGame(G.mode);
}

function handleKeyboardChoice(yesChoice) {
  const currentScreen = document.querySelector('.screen.active');
  if (!currentScreen || currentScreen.id !== 's-game') return;
  const yesBtn = el('btn-yes');
  const noBtn = el('btn-no');
  if (yesBtn.disabled || noBtn.disabled || G.busy) return;
  handleDecision(yesChoice);
}

function handleRecallKeyboard(event) {
  const currentScreen = document.querySelector('.screen.active');
  if (!currentScreen || currentScreen.id !== 's-recall') return;

  if (G.mode === 'spatial') {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSpatialFocus(-1, 0);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSpatialFocus(1, 0);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSpatialFocus(0, -1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSpatialFocus(0, 1);
      return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      undoRecallSelection();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (G.picks.length >= G.level) {
        submitRecall();
      } else {
        pickCell(G.focusIdx);
      }
    }
    return;
  }

  if (event.key === 'Backspace') {
    event.preventDefault();
    undoRecallSelection();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    if (G.picks.length >= G.level) submitRecall();
    return;
  }

  if (event.key.length === 1) {
    const letter = event.key.toUpperCase();
    if (letter >= 'A' && letter <= 'Z' && G.picks.length < G.level) {
      event.preventDefault();
      pickLetter(letter);
      if (G.picks.length >= G.level) {
        txt('recall-hint', 'Press Enter to submit your sequence');
      }
    }
  }
}

document.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (key === 'a') {
    event.preventDefault();
    handleKeyboardChoice(true);
  }
  if (key === 'l') {
    event.preventDefault();
    handleKeyboardChoice(false);
  }
  if (key === 'r') {
    const active = document.querySelector('.screen.active');
    if (active && active.id === 's-result') {
      event.preventDefault();
      restartGame();
    }
  }
  handleRecallKeyboard(event);
});

syncLevelPill();
