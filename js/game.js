const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold');
const holdCtx = holdCanvas.getContext('2d');

const COLS = 10, ROWS = 20, CELL = 22;

const board = Array.from({length: ROWS}, () => Array(COLS).fill(0));

const SHAPES = [
  [[1,1,1,1]],
  [[2,2],[2,2]],
  [[0,3,0],[3,3,3]],
  [[4,4,0],[0,4,4]],
  [[0,5,5],[5,5,0]],
  [[6,0,0],[6,6,6]],
  [[0,0,7],[7,7,7]],
];
const EXPERT_SHAPES = [
  [[0,8,0],[8,8,8],[0,8,0]],
  [[9,0,0],[9,9,0],[0,9,9]],
  [[10,10,10],[0,10,0],[0,10,0]],
  [[0,11,11],[0,11,0],[11,11,0]],
];
const COLORS = [null, "#2dd4f7", "#f9e94e", "#b96bf5", "#3ee06a", "#f75c5c", "#4d7dfa", "#f7a53e", "#ff6fd8", "#66ffe0", "#ffe066", "#9d6bff"];

let score = 0, level = 1, lines = 0;
let highScore = 0;
let difficulty = 'easy';
let paused = false, gameOver = false;
let nextShape = randomShape();
let holdShape = null, holdUsed = false;
let pieces = [];

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlaySub = document.getElementById('overlaySub');
const overlayDashboardBtn = document.getElementById('overlayDashboardBtn');
const gameAppEl = document.getElementById('gameApp');
const diffBadgeEl = document.getElementById('diffBadge');

function shapePool() {
  return difficulty === 'expert' ? SHAPES.concat(EXPERT_SHAPES) : SHAPES;
}

function randomShape() {
  const pool = shapePool();
  return pool[Math.random() * pool.length | 0].map(row => row.slice());
}

function placeAt(shape) {
  const w = shape[0].length;
  return { x: (COLS >> 1) - Math.ceil(w / 2), y: 0, shape: shape.map(row => row.slice()) };
}

function pullNextShape() {
  const shape = nextShape;
  nextShape = randomShape();
  return shape;
}

function spawnFromQueue() {
  holdUsed = false;
  return placeAt(pullNextShape());
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

function drawCell(context, x, y, cellSize, colorIndex) {
  const color = COLORS[colorIndex];
  const px = x * cellSize, py = y * cellSize, s = cellSize - 1;
  context.fillStyle = "#0f0a1a";
  context.fillRect(px, py, s, s);
  if (!color) return;
  const bevel = Math.max(2, Math.round(cellSize * 0.14));
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  context.fillStyle = shade(color, 55);
  context.fillRect(px, py, s, bevel);
  context.fillRect(px, py, bevel, s);
  context.fillStyle = shade(color, -55);
  context.fillRect(px, py + s - bevel, s, bevel);
  context.fillRect(px + s - bevel, py, bevel, s);
  context.strokeStyle = "#000";
  context.lineWidth = 1;
  context.strokeRect(px + .5, py + .5, s - 1, s - 1);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (board[y][x]) drawCell(ctx, x, y, CELL, board[y][x]);
      else ctx.strokeRect(x * CELL + .5, y * CELL + .5, CELL - 1, CELL - 1);
    }
  }
  for (const p of pieces) {
    for (let y = 0; y < p.shape.length; y++) {
      for (let x = 0; x < p.shape[y].length; x++) {
        if (p.shape[y][x]) drawCell(ctx, p.x + x, p.y + y, CELL, p.shape[y][x]);
      }
    }
  }

  document.getElementById('score').textContent = score;
  document.getElementById('level').textContent = level;
  document.getElementById('lines').textContent = lines;
  document.getElementById('highscore').textContent = highScore;
}

function drawPreview(context, canvasEl, shape) {
  context.clearRect(0, 0, canvasEl.width, canvasEl.height);
  if (!shape) return;
  const size = 20;
  const w = shape[0].length, h = shape.length;
  const offsetX = (canvasEl.width - w * size) / 2;
  const offsetY = (canvasEl.height - h * size) / 2;
  context.save();
  context.translate(offsetX, offsetY);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (shape[y][x]) drawCell(context, x, y, size, shape[y][x]);
    }
  }
  context.restore();
}

function drawNext() { drawPreview(nextCtx, nextCanvas, nextShape); }
function drawHold() { drawPreview(holdCtx, holdCanvas, holdShape); }

function collides(p, nextX = p.x, nextY = p.y, shape = p.shape) {
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (!shape[y][x]) continue;
      const boardX = nextX + x, boardY = nextY + y;
      if (boardX < 0 || boardX >= COLS || boardY >= ROWS) return true;
      if (boardY >= 0 && board[boardY][boardX]) return true;
    }
  }
  return false;
}

function handleLocks(locked) {
  for (const p of locked) {
    for (let y = 0; y < p.shape.length; y++) {
      for (let x = 0; x < p.shape[y].length; x++) {
        if (p.shape[y][x]) board[p.y + y][p.x + x] = p.shape[y][x];
      }
    }
  }

  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (board[y].every(cell => cell)) {
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(0));
      cleared++;
      y++;
    }
  }
  if (cleared) {
    score += [0, 100, 300, 500, 800][Math.min(cleared, 4)] * level;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
    if (score > highScore) {
      highScore = score;
      if (window.saveHighScore) window.saveHighScore(highScore, difficulty);
    }
  }

  for (let i = 0; i < locked.length; i++) {
    const p = spawnFromQueue();
    pieces.push(p);
    if (collides(p)) gameOver = true;
  }

  drawNext();
  if (gameOver) endGame();
}

function rotate() {
  if (paused || gameOver) return;
  for (const p of pieces) {
    const rotated = p.shape[0].map((_, i) => p.shape.map(row => row[i]).reverse());
    if (!collides(p, p.x, p.y, rotated)) p.shape = rotated;
  }
  draw();
}

function hardDrop() {
  if (paused || gameOver) return;
  for (const p of pieces) {
    while (!collides(p, p.x, p.y + 1)) p.y++;
  }
  const locked = pieces;
  pieces = [];
  handleLocks(locked);
  draw();
}

function moveLeft() {
  if (paused || gameOver) return;
  for (const p of pieces) if (!collides(p, p.x - 1, p.y)) p.x--;
  draw();
}

function moveRight() {
  if (paused || gameOver) return;
  for (const p of pieces) if (!collides(p, p.x + 1, p.y)) p.x++;
  draw();
}

function softDrop() {
  if (paused || gameOver) return;
  tick();
}

function hold() {
  if (paused || gameOver || holdUsed || pieces.length !== 1) return;
  holdUsed = true;
  const p = pieces[0];
  if (holdShape) {
    const swap = holdShape;
    holdShape = p.shape.map(row => row.slice());
    pieces[0] = placeAt(swap);
  } else {
    holdShape = p.shape.map(row => row.slice());
    pieces[0] = placeAt(nextShape);
    nextShape = randomShape();
  }
  drawHold();
  drawNext();
  draw();
}

function tick() {
  if (paused || gameOver) return;
  const falling = [];
  const locked = [];
  for (const p of pieces) {
    if (!collides(p, p.x, p.y + 1)) { p.y++; falling.push(p); }
    else locked.push(p);
  }
  if (locked.length) {
    pieces = falling;
    handleLocks(locked);
  }
  draw();
}

function endGame() {
  gameOver = true;
  overlayTitle.textContent = "GAME OVER";
  overlaySub.innerHTML = `SCORE ${score} &middot; LEVEL ${level} &middot; LINES ${lines}<br>tap to restart`;
  overlayDashboardBtn.classList.toggle('hidden', !window.RA_soloFromDashboard);
  overlay.classList.remove('hidden');
  if (window.RA_onGameOver) window.RA_onGameOver({ score, level, lines, highScore, difficulty });
}

function restart() {
  board.forEach(row => row.fill(0));
  score = 0; level = 1; lines = 0;
  holdShape = null; holdUsed = false;
  nextShape = randomShape();
  pieces = [spawnFromQueue()];
  gameOver = false;
  paused = false;
  overlay.classList.add('hidden');
  drawNext();
  drawHold();
  draw();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (paused) {
    overlayTitle.textContent = "PAUSED";
    overlaySub.textContent = "tap to resume";
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

document.getElementById('pauseBtn').addEventListener('click', togglePause);
overlay.addEventListener('click', () => {
  if (gameOver) restart();
  else if (paused) togglePause();
});
overlayDashboardBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (window.RA_backToDashboard) window.RA_backToDashboard();
});

document.getElementById('rotateBtn').addEventListener('click', rotate);
document.getElementById('holdPanel').addEventListener('click', hold);

function bindRepeat(el, fn) {
  let timer = null;
  const start = e => {
    e.preventDefault();
    fn();
    timer = setTimeout(function repeat() {
      fn();
      timer = setTimeout(repeat, 90);
    }, 300);
  };
  const stop = () => { clearTimeout(timer); timer = null; };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointerleave', stop);
  el.addEventListener('pointercancel', stop);
}
bindRepeat(document.getElementById('leftBtn'), moveLeft);
bindRepeat(document.getElementById('rightBtn'), moveRight);
bindRepeat(document.getElementById('downBtn'), softDrop);

document.addEventListener('keydown', event => {
  if (gameAppEl.classList.contains('hidden')) return;
  if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " "].includes(event.key)) {
    event.preventDefault();
  }
  if (event.key === "ArrowLeft") moveLeft();
  else if (event.key === "ArrowRight") moveRight();
  else if (event.key === "ArrowDown") softDrop();
  else if (event.key === "ArrowUp") rotate();
  else if (event.key === " ") hardDrop();
  else if (event.key.toLowerCase() === "p") togglePause();
  else if (event.key.toLowerCase() === "c") hold();
});

function tickSpeed() {
  if (difficulty === 'expert') return Math.max(50, 220 - (level - 1) * 26);
  if (difficulty === 'hard') return Math.max(75, 320 - (level - 1) * 34);
  return Math.max(120, 500 - (level - 1) * 40);
}

let loopId = 0;
function loop(id) {
  if (id !== loopId) return;
  tick();
  setTimeout(() => loop(id), tickSpeed());
}

function startGame(initialHighScore, diff) {
  highScore = initialHighScore || 0;
  difficulty = diff || 'easy';
  if (diffBadgeEl) {
    diffBadgeEl.textContent = difficulty === 'easy' ? '' : difficulty.toUpperCase();
    diffBadgeEl.classList.toggle('hidden', difficulty === 'easy');
  }
  restart();
  loopId++;
  loop(loopId);
}
window.startGame = startGame;
