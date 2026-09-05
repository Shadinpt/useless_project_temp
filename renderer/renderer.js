// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let items = [];              // [{ name, path, isDirectory, ext, el }]
let selectedPaths = new Set();
let isChomping = false;      // prevents overlapping chomp sequences
let eatenCount = parseInt(localStorage.getItem('eatenCount') || '0', 10);

const iconGrid = document.getElementById('icon-grid');
const stage = document.getElementById('stage');
const comboPopup = document.getElementById('combo-popup');
const eatenCountEl = document.getElementById('eaten-count');
eatenCountEl.textContent = eatenCount;

// ---------------------------------------------------------------------------
// Icon rendering
// ---------------------------------------------------------------------------
const EMOJI_BY_EXT = {
  '.pdf': '📄',
  '.doc': '📄',
  '.docx': '📄',
  '.txt': '📝',
  '.png': '🖼️',
  '.jpg': '🖼️',
  '.jpeg': '🖼️',
  '.gif': '🖼️',
  '.mp3': '🎵',
  '.wav': '🎵',
  '.exe': '⚙️',
  '.app': '⚙️',
  '.zip': '🗜️',
};

function emojiFor(item) {
  if (item.isDirectory) return '📁';
  return EMOJI_BY_EXT[item.ext] || '📄';
}

async function loadDesktopItems() {
  items = await window.pacmanAPI.getDesktopItems();
  renderGrid();
}

// Preset scatter positions (as fractions of the icon-grid's own width/height)
// so files land here and there across the desktop instead of in a tidy grid —
// spread across the middle and right side, avoiding the widget cluster and dock.
const SCATTER_POSITIONS = [
  { x: 0.06, y: 0.04 },
  { x: 0.34, y: 0.10 },
  { x: 0.62, y: 0.02 },
  { x: 0.85, y: 0.14 },
  { x: 0.15, y: 0.28 },
  { x: 0.46, y: 0.34 },
  { x: 0.72, y: 0.30 },
  { x: 0.02, y: 0.52 },
  { x: 0.30, y: 0.58 },
  { x: 0.58, y: 0.55 },
  { x: 0.82, y: 0.62 },
  { x: 0.12, y: 0.78 },
  { x: 0.40, y: 0.80 },
  { x: 0.68, y: 0.78 },
];

function renderGrid() {
  iconGrid.innerHTML = '';
  items.forEach((item, index) => {
    const el = document.createElement('div');
    el.className = 'desktop-icon';
    el.dataset.path = item.path;
    el.innerHTML = `
      <div class="icon-emoji">${emojiFor(item)}</div>
      <div class="icon-label">${item.name}</div>
    `;
    const slot = SCATTER_POSITIONS[index % SCATTER_POSITIONS.length];
    el.style.left = `${slot.x * 100}%`;
    el.style.top = `${slot.y * 100}%`;
    el.addEventListener('click', () => toggleSelect(item.path, el));
    item.el = el;
    iconGrid.appendChild(el);
  });
}

function toggleSelect(itemPath, el) {
  if (selectedPaths.has(itemPath)) {
    selectedPaths.delete(itemPath);
    el.classList.remove('selected');
  } else {
    selectedPaths.add(itemPath);
    el.classList.add('selected');
  }
}

// ---------------------------------------------------------------------------
// Sound synthesis (no external audio files needed — pure Web Audio API)
// ---------------------------------------------------------------------------
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

// A quick two-note "waka" blip, called on a loop while Pac-Man is travelling.
function playWaka() {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  [520, 340].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now + i * 0.06);
    gain.gain.setValueAtTime(0.05, now + i * 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + i * 0.06);
    osc.stop(now + i * 0.06 + 0.06);
  });
}

// A bigger descending "CHOMP" when Pac-Man actually reaches and eats an icon.
function playChomp() {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.18);
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

// A quick rising "whoosh" when an icon notices Pac-Man and bolts.
function playFleeWhoosh() {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(760, now + 0.15);
  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.16);
}

// ---------------------------------------------------------------------------
// Pixel-art Pac-Man sprite (generated, not hand-drawn) + movement
// ---------------------------------------------------------------------------

// Builds a blocky retro Pac-Man as SVG rects on a grid — mouth opens to the
// right by default, with a small pixel eye near the top. Because it's a
// rotation of vector squares at cardinal angles only (0/90/180/270), it
// stays perfectly crisp when we rotate it to face up/down/left/right.
function buildPixelPacmanSVG(mouthOpenDeg) {
  const GRID = 14;
  const CELL = 6;
  const radius = GRID / 2;
  const center = radius - 0.5;
  const eyeCells = new Set(['7,3', '8,3', '7,4', '8,4']);
  let rects = '';

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue; // outside the circle

      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      if (dx >= 0 && Math.abs(angle) <= mouthOpenDeg) continue; // mouth wedge cut-out

      const fill = eyeCells.has(`${x},${y}`) ? '#151515' : '#ffe600';
      rects += `<rect x="${x * CELL}" y="${y * CELL}" width="${CELL}" height="${CELL}" fill="${fill}" shape-rendering="crispEdges"/>`;
    }
  }
  return `<svg viewBox="0 0 ${GRID * CELL} ${GRID * CELL}" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">${rects}</svg>`;
}

const PACMAN_OPEN_SVG = buildPixelPacmanSVG(34);
const PACMAN_CLOSED_SVG = buildPixelPacmanSVG(4);

function createPacmanElement() {
  const pac = document.createElement('div');
  pac.id = 'pacman';
  pac.innerHTML = PACMAN_OPEN_SVG;
  stage.appendChild(pac);
  return pac;
}

function setPacmanPosition(pac, x, y) {
  pac.style.left = `${x - 28}px`; // center the 56px sprite on (x, y)
  pac.style.top = `${y - 28}px`;
}

function facePacman(pac, fromX, fromY, toX, toY) {
  const angle = Math.atan2(toY - fromY, toX - fromX) * (180 / Math.PI);
  pac.style.transform = `rotate(${angle}deg)`;
}

// Animate pac-man's chomping mouth by swapping between the two pixel frames.
function startChompAnimation(pac) {
  let open = true;
  pac.innerHTML = PACMAN_OPEN_SVG;
  return setInterval(() => {
    pac.innerHTML = open ? PACMAN_CLOSED_SVG : PACMAN_OPEN_SVG;
    open = !open;
  }, 140);
}

function stopChompAnimation(intervalId) {
  clearInterval(intervalId);
}

// Move pac-man from current position to a target over `durationMs`,
// resolving once it arrives. Plays waka sound along the way.
function movePacman(pac, fromX, fromY, toX, toY, durationMs) {
  return new Promise((resolve) => {
    facePacman(pac, fromX, fromY, toX, toY);
    const startTime = performance.now();
    const wakaInterval = setInterval(playWaka, 160);

    function step(now) {
      const t = Math.min(1, (now - startTime) / durationMs);
      const x = fromX + (toX - fromX) * t;
      const y = fromY + (toY - fromY) * t;
      setPacmanPosition(pac, x, y);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        clearInterval(wakaInterval);
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

// ---------------------------------------------------------------------------
// Combo popup
// ---------------------------------------------------------------------------
function showCombo(n) {
  comboPopup.textContent = `${n}x COMBO!`;
  comboPopup.classList.remove('hidden');
  // restart the CSS animation
  comboPopup.style.animation = 'none';
  // eslint-disable-next-line no-unused-expressions
  comboPopup.offsetHeight; // force reflow
  comboPopup.style.animation = '';
}

// ---------------------------------------------------------------------------
// The main event: chomp-em-all
// ---------------------------------------------------------------------------
function getCenter(el) {
  const stageRect = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return {
    x: r.left + r.width / 2 - stageRect.left,
    y: r.top + r.height / 2 - stageRect.top,
  };
}

// Simple nearest-neighbor ordering so Pac-Man's path looks intentional
// rather than jumping around randomly.
function orderByNearestNeighbor(startPoint, targets) {
  const remaining = [...targets];
  const ordered = [];
  let current = startPoint;

  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((t, idx) => {
      const d = Math.hypot(t.point.x - current.x, t.point.y - current.y);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = idx;
      }
    });
    const [next] = remaining.splice(bestIdx, 1);
    ordered.push(next);
    current = next.point;
  }
  return ordered;
}

// ---------------------------------------------------------------------------
// Fleeing icons: reparented into #stage (its coordinate system) so absolute
// left/top values always mean what we think they mean. Fixes the old bug
// where icons could jump to the wrong place because #icon-grid was itself
// position:absolute and silently became the positioning context instead.
// ---------------------------------------------------------------------------
function makeIconFreeFloating(el) {
  const stageRect = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const left = r.left - stageRect.left;
  const top = r.top - stageRect.top;
  el.style.position = 'absolute';
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.width = `${r.width}px`;
  el.style.height = `${r.height}px`;
  el.style.margin = '0';
  el.style.zIndex = '40';
  stage.appendChild(el); // reparent so #stage is the positioning context
}

function moveIconTo(el, point) {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  el.style.left = `${point.x - w / 2}px`;
  el.style.top = `${point.y - h / 2}px`;
}

// 10 preset direction scripts. Each is a sequence of cardinal directions;
// the icon marches along one direction for LEG_DURATION_MS, then switches to
// the next in the list, looping back to the start if it runs out. This gives
// varied, deliberate-looking evasive movement without needing "real" AI.
const UP = { x: 0, y: -1 };
const DOWN = { x: 0, y: 1 };
const LEFT = { x: -1, y: 0 };
const RIGHT = { x: 1, y: 0 };

const FLEE_PATTERNS = [
  [RIGHT, UP, RIGHT, DOWN],
  [LEFT, DOWN, LEFT, UP],
  [UP, RIGHT, DOWN, RIGHT],
  [DOWN, LEFT, UP, LEFT],
  [RIGHT, RIGHT, UP, LEFT],
  [UP, UP, LEFT, DOWN],
  [LEFT, UP, RIGHT, UP],
  [DOWN, RIGHT, DOWN, LEFT],
  [RIGHT, DOWN, LEFT, DOWN],
  [UP, LEFT, DOWN, RIGHT],
];

function fleeBounds(stageRect) {
  return {
    minX: 380,
    maxX: stageRect.width - 60,
    minY: 70,
    maxY: stageRect.height - 130,
  };
}

// Speed + timing knobs — tune these to taste.
const MS_PER_PIXEL = 5.5;               // Pac-Man's plain travel speed (used for entrance/exit)
const MIN_SEGMENT_MS = 550;
const EATING_PAUSE_MS = 1000;           // how long Pac-Man "chews" before the file actually vanishes
const CATCH_DISTANCE = 26;              // px — how close counts as "caught"
const PACMAN_CHASE_SPEED = 1 / MS_PER_PIXEL; // px per ms
const ICON_FLEE_SPEED = PACMAN_CHASE_SPEED * 0.68; // fast enough for a longer chase, still always loses eventually
const LEG_DURATION_MS = 550;            // how long the icon holds one direction before switching
const MAX_CHASE_MS = 25000;             // safety net so a chase can never hang forever

// Moves in a straight axis-aligned line only (no diagonals): horizontal first, then vertical.
// Used for the simple entrance/exit moves, which don't need live chasing logic.
async function moveOrthogonally(pac, from, to) {
  const midPoint = { x: to.x, y: from.y };

  if (from.x !== midPoint.x) {
    const dist = Math.abs(midPoint.x - from.x);
    const duration = Math.max(MIN_SEGMENT_MS, dist * MS_PER_PIXEL);
    await movePacman(pac, from.x, from.y, midPoint.x, midPoint.y, duration);
  }
  if (midPoint.y !== to.y) {
    const dist = Math.abs(to.y - midPoint.y);
    const duration = Math.max(MIN_SEGMENT_MS, dist * MS_PER_PIXEL);
    await movePacman(pac, midPoint.x, midPoint.y, to.x, to.y, duration);
  }
}

// The real-time chase: Pac-Man continuously steers directly toward the
// icon's live position (a "seek" behavior), which naturally produces a
// smooth curved path as the icon dodges — no axis-locking, so no zigzag.
// The icon starts fleeing the instant the chase begins.
function chaseAndCatch(pac, iconEl, startPacPoint) {
  return new Promise((resolve) => {
    const stageRect = stage.getBoundingClientRect();
    const bounds = fleeBounds(stageRect);

    makeIconFreeFloating(iconEl);
    let iconPoint = getCenter(iconEl);
    let pacPoint = { ...startPacPoint };

    // Fleeing starts immediately — no waiting for Pac-Man to get close.
    let pattern = FLEE_PATTERNS[Math.floor(Math.random() * FLEE_PATTERNS.length)];
    let legIndex = 0;
    let legStartTime = 0;
    let lastTimestamp = null;
    let wakaAccum = 0;
    let chaseStart = null;
    playFleeWhoosh();

    function frame(ts) {
      if (lastTimestamp === null) {
        lastTimestamp = ts;
        chaseStart = ts;
        legStartTime = ts;
      }
      const dt = ts - lastTimestamp;
      lastTimestamp = ts;

      const dx = iconPoint.x - pacPoint.x;
      const dy = iconPoint.y - pacPoint.y;
      const dist = Math.hypot(dx, dy);
      const timedOut = ts - chaseStart > MAX_CHASE_MS;

      if (dist <= CATCH_DISTANCE || timedOut) {
        // Caught! Snap Pac-Man exactly onto the icon for a clean finish.
        setPacmanPosition(pac, iconPoint.x, iconPoint.y);
        resolve({ pacPoint: iconPoint, iconPoint });
        return;
      }

      // Move Pac-Man directly toward the icon's current position — a smooth
      // curved pursuit rather than a rigid axis-locked zigzag.
      const step = Math.min(PACMAN_CHASE_SPEED * dt, dist);
      const nx = dx / dist;
      const ny = dy / dist;
      pacPoint.x += nx * step;
      pacPoint.y += ny * step;
      setPacmanPosition(pac, pacPoint.x, pacPoint.y);
      pac.style.transform = `rotate(${Math.atan2(dy, dx) * (180 / Math.PI)}deg)`;

      // Move the icon along its current pattern leg (still cardinal directions).
      if (ts - legStartTime > LEG_DURATION_MS) {
        legIndex = (legIndex + 1) % pattern.length;
        legStartTime = ts;
      }
      const dir = pattern[legIndex];
      const iconStep = ICON_FLEE_SPEED * dt;
      let ix = iconPoint.x + dir.x * iconStep;
      let iy = iconPoint.y + dir.y * iconStep;
      ix = Math.min(Math.max(ix, bounds.minX), bounds.maxX);
      iy = Math.min(Math.max(iy, bounds.minY), bounds.maxY);
      iconPoint = { x: ix, y: iy };
      moveIconTo(iconEl, iconPoint);

      // Waka sound while actively chasing.
      wakaAccum += dt;
      if (wakaAccum > 160) {
        playWaka();
        wakaAccum = 0;
      }

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

async function chompEmAll() {
  if (isChomping || selectedPaths.size === 0) return;
  isChomping = true;

  const targets = items
    .filter((item) => selectedPaths.has(item.path))
    .map((item) => ({ item, point: getCenter(item.el) }));

  const stageRect = stage.getBoundingClientRect();
  // Emerges from the middle-bottom of the screen, just below the visible area.
  const spawnPoint = { x: stageRect.width / 2, y: stageRect.height + 40 };

  const ordered = orderByNearestNeighbor(spawnPoint, targets);

  const pac = createPacmanElement();
  setPacmanPosition(pac, spawnPoint.x, spawnPoint.y);
  const chompAnim = startChompAnimation(pac);

  let current = spawnPoint;
  let combo = 0;

  for (const target of ordered) {
    target.item.el.classList.add('about-to-be-eaten');

    const result = await chaseAndCatch(pac, target.item.el, current);
    current = result.pacPoint;

    target.item.el.classList.remove('about-to-be-eaten');

    // Pac-Man pauses here and visibly chews for a beat before the file actually vanishes.
    await new Promise((r) => setTimeout(r, EATING_PAUSE_MS));

    // Chomp!
    playChomp();
    target.item.el.classList.add('chomped');
    combo += 1;
    showCombo(combo);

    // Actually delete the real file on disk (moves to Trash, not permanent).
    window.pacmanAPI.deleteItem(target.item.path);

    eatenCount += 1;
    eatenCountEl.textContent = eatenCount;
    localStorage.setItem('eatenCount', String(eatenCount));

    // brief pause so the chomp registers visually before moving on
    await new Promise((r) => setTimeout(r, 200));
  }

  // Exit back out through the middle-bottom, same way it came in.
  const exitPoint = { x: stageRect.width / 2, y: stageRect.height + 60 };
  await moveOrthogonally(pac, current, exitPoint);

  stopChompAnimation(chompAnim);
  pac.remove();

  // Clean up state: remove eaten items from `items` and selection.
  const eatenPaths = ordered.map((t) => t.item.path);
  items = items.filter((item) => !eatenPaths.includes(item.path));
  selectedPaths.clear();
  isChomping = false;
}

// ---------------------------------------------------------------------------
// Input handling
// ---------------------------------------------------------------------------
document.addEventListener('keydown', (e) => {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    chompEmAll();
  }
});

// ---------------------------------------------------------------------------
// Decorative menu bar / widgets — computed once, never updates (by design)
// ---------------------------------------------------------------------------
function initStaticDateTime() {
  const now = new Date();
  const dayName = now.toLocaleDateString(undefined, { weekday: 'short' });
  const dayNum = now.getDate();
  const fullDate = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  document.getElementById('widget-day').textContent = dayName;
  document.getElementById('widget-num').textContent = dayNum;
  document.getElementById('widget-clock').textContent = '11:48';
  document.getElementById('menu-datetime').textContent = `${fullDate}  11:48 PM`;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
initStaticDateTime();
loadDesktopItems();
