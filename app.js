// =====================================================================
//  ぱじゃまパーティ♡  Chiikawa Cheer Rhythm
//  Pure HTML/CSS/JS  +  Local <video>  +  MediaPipe Hands
// =====================================================================

// ====== Configuration ======
const NOTE_TRAVEL_TIME = 2200;          // ms — note flight from spawn to hit zone
const HIT_ZONE_CENTER_Y = 70;           // px from top of lane (30 + 40)
const J_PERFECT = 110;                  // ±ms windows
const J_GREAT = 220;
const J_GOOD = 360;
const GESTURE_COOLDOWN = 280;           // ms between same-type gesture triggers
const CAM_W = 480;
const CAM_H = 360;

// ====== State ======
const player = document.getElementById('player');  // <video> element
let isPlaying = false;
let beatmap = [];
let activeNotes = [];
let nextNoteIdx = 0;
let score = 0;
let combo = 0;
let difficulty = 'easy';
let camReady = false;
const lastGestureTime = { clap: 0, hold: 0, release: 0 };
let lastFistState = false;
let lastOpenState = false;

// ====== Beatmap ======
// Approximate to the song timing. Tweak to match your taste.
//  type: 'clap' | 'hold' | 'release'
//  lyric: optional Japanese phrase to display
const easyMap = [
  { t:  6500, type: 'clap',    lyric: 'パジャマ パーティ ♡ はじまるよ！' },
  { t:  7500, type: 'clap' },
  { t:  8500, type: 'clap' },
  { t:  9500, type: 'clap' },
  { t: 11000, type: 'hold',    lyric: 'みんな あつまれ〜' },
  { t: 13000, type: 'release' },
  { t: 15000, type: 'clap',    lyric: 'パチパチ パチン！' },
  { t: 16000, type: 'clap' },
  { t: 17000, type: 'clap' },
  { t: 18500, type: 'clap' },
  { t: 20500, type: 'hold',    lyric: 'ぎゅっと ぎゅっと' },
  { t: 22500, type: 'release' },
  { t: 24500, type: 'clap',    lyric: 'いっしょに おどろう ♪' },
  { t: 25500, type: 'clap' },
  { t: 26500, type: 'clap' },
  { t: 27500, type: 'clap' },
  { t: 29000, type: 'hold',    lyric: 'ぱじゃま パーティ ♡' },
  { t: 31000, type: 'release' },
  { t: 33000, type: 'clap' },
  { t: 34000, type: 'clap' },
  { t: 35000, type: 'clap' },
  { t: 36000, type: 'clap',    lyric: 'もっと もっと もっと！' },
  { t: 37500, type: 'hold' },
  { t: 39500, type: 'release' },
  { t: 41000, type: 'clap',    lyric: 'パーティ タイム ☆' },
  { t: 42000, type: 'clap' },
  { t: 43000, type: 'clap' },
  { t: 44000, type: 'clap' },
  { t: 45500, type: 'hold' },
  { t: 47500, type: 'release' },
  { t: 49500, type: 'clap',    lyric: 'みんな だいすき ♡' },
  { t: 50500, type: 'clap' },
  { t: 51500, type: 'clap' },
  { t: 52500, type: 'clap' },
  { t: 54500, type: 'clap',    lyric: 'パジャマ パーティーズ！' },
  { t: 55500, type: 'clap' },
  { t: 56500, type: 'hold' },
  { t: 58500, type: 'release' },
  { t: 60500, type: 'clap' },
  { t: 61500, type: 'clap' },
  { t: 62500, type: 'clap' },
  { t: 63500, type: 'clap',    lyric: 'いえーい！' },
];

const beatmaps = {
  easy: easyMap,
  normal: deriveMap(easyMap, 'normal'),
  hard: deriveMap(easyMap, 'hard'),
};

function deriveMap(base, level) {
  const out = [];
  const types = ['clap', 'hold', 'release'];
  for (const n of base) {
    out.push({ ...n });
    if (level === 'normal') {
      if (n.type === 'clap') {
        out.push({ t: n.t + 500, type: 'clap' });
      }
    } else if (level === 'hard') {
      out.push({ t: n.t + 250, type: 'clap' });
      out.push({ t: n.t + 500, type: types[(out.length) % 3] });
      out.push({ t: n.t + 750, type: 'clap' });
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

// ====== Video Player ======
player.addEventListener('play',   () => { isPlaying = true; });
player.addEventListener('pause',  () => { isPlaying = false; });
player.addEventListener('ended',  () => {
  isPlaying = false;
  showJudgement('FINISH ♡', '#f06292');
  for (let i = 0; i < 5; i++) {
    setTimeout(() => triggerPartyEffect(50), i * 200);
  }
});

// ====== Webcam + MediaPipe Hands ======
const webcam = document.getElementById('webcam');
const handsCanvas = document.getElementById('hands-canvas');
const handsCtx = handsCanvas.getContext('2d');
let hands = null;

async function initHands() {
  // Get user media — force a low resolution per spec
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width:  { ideal: CAM_W,  max: CAM_W  },
      height: { ideal: CAM_H,  max: CAM_H  },
      frameRate: { ideal: 24, max: 30 },
      facingMode: 'user',
    },
    audio: false,
  });
  webcam.srcObject = stream;
  await new Promise((r) => (webcam.onloadedmetadata = r));
  await webcam.play();

  handsCanvas.width = webcam.videoWidth;
  handsCanvas.height = webcam.videoHeight;

  hands = new Hands({
    locateFile: (f) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}`,
  });
  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 0,             // lightest model for speed
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
  hands.onResults(onHandsResults);

  const tick = async () => {
    if (webcam.readyState >= 2) {
      try { await hands.send({ image: webcam }); } catch (_) {}
    }
    requestAnimationFrame(tick);
  };
  tick();
  camReady = true;
}

// ====== Gesture detection ======
function classifyHand(lm) {
  // index/middle/ring/pinky tip-vs-pip  (smaller y means upward in image space)
  const tipsAbovePip = [[8, 6], [12, 10], [16, 14], [20, 18]]
    .filter(([t, p]) => lm[t].y < lm[p].y - 0.02).length;

  if (tipsAbovePip >= 4) return 'open';
  if (tipsAbovePip <= 1) return 'fist';
  return 'partial';
}

function handCenter(lm, w, h) {
  return {
    x: ((lm[0].x + lm[9].x) / 2) * w,
    y: ((lm[0].y + lm[9].y) / 2) * h,
  };
}

function onHandsResults(results) {
  const w = handsCanvas.width, h = handsCanvas.height;
  handsCtx.save();
  handsCtx.clearRect(0, 0, w, h);

  const list = results.multiHandLandmarks || [];
  const states = [];
  const centers = [];

  for (const lm of list) {
    states.push(classifyHand(lm));
    centers.push(handCenter(lm, w, h));
  }

  // === Visualize (mirrored canvas, so just dot center + state color) ===
  for (let i = 0; i < centers.length; i++) {
    const c = centers[i];
    const s = states[i];
    const color =
      s === 'fist' ? '#ffd966' :
      s === 'open' ? '#b8e0d2' : '#ff8fab';
    handsCtx.beginPath();
    handsCtx.fillStyle = color;
    handsCtx.shadowColor = color;
    handsCtx.shadowBlur = 12;
    handsCtx.arc(c.x, c.y, 14, 0, Math.PI * 2);
    handsCtx.fill();
    handsCtx.shadowBlur = 0;
    // outline
    handsCtx.strokeStyle = 'white';
    handsCtx.lineWidth = 2;
    handsCtx.stroke();
  }
  handsCtx.restore();

  const now = performance.now();

  // ----- Clap (two hands close) -----
  if (centers.length === 2) {
    const dx = centers[0].x - centers[1].x;
    const dy = centers[0].y - centers[1].y;
    const dist = Math.hypot(dx, dy);
    if (dist < w * 0.18 && now - lastGestureTime.clap > GESTURE_COOLDOWN) {
      lastGestureTime.clap = now;
      handleGesture('clap');
    }
  }

  // ----- Fist / Open transitions -----
  const anyFist = states.includes('fist');
  const anyOpen = states.includes('open');

  if (anyFist && !lastFistState && now - lastGestureTime.hold > GESTURE_COOLDOWN) {
    lastGestureTime.hold = now;
    handleGesture('hold');
  }
  if (anyOpen && !lastOpenState && now - lastGestureTime.release > GESTURE_COOLDOWN) {
    lastGestureTime.release = now;
    handleGesture('release');
  }
  lastFistState = anyFist;
  lastOpenState = anyOpen;

  // ----- Status text -----
  const txt =
    states.length === 0 ? '👀 손이 안보여요' :
    states.length === 2 ? '👏 두 손 OK!' :
    anyFist ? '✊ 주먹 감지' :
    anyOpen ? '✋ 손바닥 감지' : '🤚 인식중';
  document.getElementById('gesture-text').textContent = txt;
}

// ====== Game Logic ======
function startGame() {
  beatmap = beatmaps[difficulty].slice();
  clearActiveNotes();
  nextNoteIdx = 0;
  score = 0;
  combo = 0;
  document.getElementById('score').textContent = '0';
  document.getElementById('combo').textContent = '0';
  document.getElementById('current-lyric').textContent = '♪ ぱじゃまパーティ♡ START ♪';
  player.currentTime = 0;
  player.muted = false;
  const p = player.play();
  if (p && p.catch) p.catch((err) => console.warn('play() rejected', err));
  isPlaying = true;
}

function resetGame() {
  player.pause();
  isPlaying = false;
  clearActiveNotes();
  nextNoteIdx = 0;
  score = 0;
  combo = 0;
  particles = [];
  document.getElementById('score').textContent = '0';
  document.getElementById('combo').textContent = '0';
  document.getElementById('current-lyric').textContent = 'START 버튼을 눌러 파티를 시작해줘!';
}

function clearActiveNotes() {
  for (const n of activeNotes) n.el.remove();
  activeNotes = [];
}

function gameLoop() {
  if (isPlaying) {
    const ct = player.currentTime * 1000;

    while (
      nextNoteIdx < beatmap.length &&
      beatmap[nextNoteIdx].t - ct <= NOTE_TRAVEL_TIME
    ) {
      spawnNote(beatmap[nextNoteIdx]);
      if (beatmap[nextNoteIdx].lyric) {
        document.getElementById('current-lyric').textContent = beatmap[nextNoteIdx].lyric;
      }
      nextNoteIdx++;
    }

    updateNotes(ct);
  }
  requestAnimationFrame(gameLoop);
}

function spawnNote(data) {
  const el = document.createElement('div');
  el.className = `note ${data.type}`;
  el.textContent =
    data.type === 'clap' ? '👏' :
    data.type === 'hold' ? '✊' : '✋';
  document.getElementById('notes-container').appendChild(el);
  activeNotes.push({ data, el, hit: false });
}

function updateNotes(currentTime) {
  const lane = document.querySelector('.note-lane');
  const laneH = lane.clientHeight;

  for (let i = activeNotes.length - 1; i >= 0; i--) {
    const n = activeNotes[i];
    const dt = n.data.t - currentTime;            // ms remaining until hit
    const progress = 1 - (dt / NOTE_TRAVEL_TIME); // 0 at spawn → 1 at hit
    const y = laneH - progress * (laneH - HIT_ZONE_CENTER_Y);
    n.el.style.top = `${y}px`;

    if (!n.hit && dt < -J_GOOD) {
      n.hit = true;
      combo = 0;
      document.getElementById('combo').textContent = '0';
      showJudgement('MISS', '#7a7a7a');
      n.el.style.opacity = '0.3';
      n.el.style.filter = 'grayscale(1)';
      setTimeout(() => n.el.remove(), 250);
      activeNotes.splice(i, 1);
    } else if (n.hit && dt < -J_GOOD) {
      n.el.remove();
      activeNotes.splice(i, 1);
    } else if (y < -100) {
      n.el.remove();
      activeNotes.splice(i, 1);
    }
  }
}

function handleGesture(type) {
  if (!isPlaying) return;
  const ct = player.currentTime * 1000;

  // Find closest unhit matching note within GOOD window
  let best = null;
  let bestDt = Infinity;
  for (const n of activeNotes) {
    if (n.hit || n.data.type !== type) continue;
    const d = Math.abs(n.data.t - ct);
    if (d < bestDt && d < J_GOOD) { bestDt = d; best = n; }
  }
  if (!best) return;

  best.hit = true;
  let label, color, pts;
  if (bestDt < J_PERFECT)      { label = 'PERFECT ♡'; color = '#f06292'; pts = 1000; }
  else if (bestDt < J_GREAT)   { label = 'GREAT!';    color = '#ff9800'; pts = 700;  }
  else                         { label = 'GOOD';      color = '#7ec8e3'; pts = 300;  }

  score += pts + combo * 10;
  combo += 1;
  document.getElementById('score').textContent = score;
  document.getElementById('combo').textContent = combo;
  showJudgement(label, color);

  if (label.startsWith('PERFECT')) triggerPartyEffect(70);
  else if (label === 'GREAT!')     triggerPartyEffect(35);
  else                              triggerPartyEffect(15);

  best.el.classList.add('hit-anim');
}

// ====== Judgement display ======
const judgeEl = document.getElementById('judgement');
let judgeTimeout = null;
function showJudgement(text, color) {
  judgeEl.textContent = text;
  judgeEl.style.color = color;
  judgeEl.style.opacity = '1';
  judgeEl.style.transition = 'none';
  judgeEl.style.transform = 'translate(-50%, -50%) scale(1.4)';
  if (judgeTimeout) clearTimeout(judgeTimeout);
  // next frame: animate down/out
  requestAnimationFrame(() => {
    judgeEl.style.transition = 'all 0.5s cubic-bezier(.2,.7,.3,1.4)';
    judgeEl.style.transform = 'translate(-50%, -50%) scale(1)';
    judgeTimeout = setTimeout(() => {
      judgeEl.style.opacity = '0';
    }, 450);
  });
}

// ====== Party effects ======
const effectsCanvas = document.getElementById('effects-canvas');
const effectsCtx = effectsCanvas.getContext('2d');
let particles = [];

function fitCanvas() {
  const rect = effectsCanvas.getBoundingClientRect();
  effectsCanvas.width = rect.width;
  effectsCanvas.height = rect.height;
}
window.addEventListener('resize', fitCanvas);

const PARTY_COLORS = ['#ff8fab', '#f06292', '#ffd966', '#ffe27a',
                      '#b8e0d2', '#7ec8e3', '#ffb6c1', '#ffec5c'];
const PARTY_SHAPES = ['confetti', 'star', 'heart', 'circle'];

function triggerPartyEffect(count) {
  if (effectsCanvas.width === 0) fitCanvas();
  const w = effectsCanvas.width, h = effectsCanvas.height;
  for (let i = 0; i < count; i++) {
    particles.push({
      x: w / 2 + (Math.random() - 0.5) * w * 0.6,
      y: h / 2 + (Math.random() - 0.2) * h * 0.4,
      vx: (Math.random() - 0.5) * 10,
      vy: -Math.random() * 11 - 4,
      gravity: 0.28,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.25,
      size: 8 + Math.random() * 14,
      color: PARTY_COLORS[(Math.random() * PARTY_COLORS.length) | 0],
      shape: PARTY_SHAPES[(Math.random() * PARTY_SHAPES.length) | 0],
      life: 110 + (Math.random() * 40) | 0,
    });
  }
}

function drawParticle(ctx, p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.fillStyle = p.color;
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 10;

  if (p.shape === 'confetti') {
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
  } else if (p.shape === 'star') {
    drawStar(ctx, 0, 0, 5, p.size, p.size / 2.2);
    ctx.fill();
  } else if (p.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else { // heart
    const s = p.size / 10;
    ctx.beginPath();
    ctx.moveTo(0, 3 * s);
    ctx.bezierCurveTo(0, -3 * s, -5 * s, -3 * s, -5 * s, 1 * s);
    ctx.bezierCurveTo(-5 * s, 4 * s, 0, 6 * s, 0, 8 * s);
    ctx.bezierCurveTo(0, 6 * s, 5 * s, 4 * s, 5 * s, 1 * s);
    ctx.bezierCurveTo(5 * s, -3 * s, 0, -3 * s, 0, 3 * s);
    ctx.fill();
  }
  ctx.restore();
}

function drawStar(ctx, cx, cy, spikes, outerR, innerR) {
  let rot = -Math.PI / 2;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
  for (let i = 0; i < spikes; i++) {
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
  }
  ctx.closePath();
}

function effectsLoop() {
  if (effectsCanvas.width === 0) fitCanvas();
  effectsCtx.clearRect(0, 0, effectsCanvas.width, effectsCanvas.height);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity;
    p.rot += p.vr;
    p.life -= 1;
    if (p.life <= 0 || p.y > effectsCanvas.height + 50) {
      particles.splice(i, 1);
      continue;
    }
    effectsCtx.globalAlpha = Math.min(1, p.life / 50);
    drawParticle(effectsCtx, p);
  }
  effectsCtx.globalAlpha = 1;
  requestAnimationFrame(effectsLoop);
}

// ====== UI Wiring ======
document.querySelectorAll('.diff-btn').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    difficulty = b.dataset.diff;
    if (!isPlaying) {
      document.getElementById('current-lyric').textContent =
        difficulty === 'easy'   ? '응원 모드 — 천천히 박수쳐봐요 ♡' :
        difficulty === 'normal' ? '오리지널 모드 — 좀 더 빨라요!' :
                                  '마스터 모드 — 풀파워 응원!! ♡♡♡';
    }
  });
});

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('reset-btn').addEventListener('click', resetGame);

document.getElementById('skip-cam').addEventListener('click', () => {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('gesture-text').textContent = '⌨️ 키보드 모드';
});

// Keyboard fallback
document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space') { e.preventDefault(); handleGesture('clap');    }
  else if (e.key === 'f' || e.key === 'F')      { handleGesture('hold');    }
  else if (e.key === 'r' || e.key === 'R')      { handleGesture('release'); }
});

// ====== Boot ======
(async function boot() {
  fitCanvas();
  setTimeout(fitCanvas, 200);
  setTimeout(fitCanvas, 800);

  effectsLoop();
  gameLoop();

  try {
    await initHands();
    document.getElementById('loading').style.display = 'none';
  } catch (err) {
    console.error('hand-init failed', err);
    const p = document.querySelector('#loading p');
    if (p) p.textContent = '⚠️ 웹캠을 사용할 수 없어요. 키보드로 플레이해 주세요.';
  }
})();
