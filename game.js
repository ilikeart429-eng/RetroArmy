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
const COLORS = [null, "#2dd4f7", "#f9e94e", "#b96bf5", "#3ee06a", "#f75c5c", "#4d7dfa", "#f7a53e"];

let score = 0, level = 1, lines = 0;
let highScore = Number(localStorage.getItem('blocksHighScore') || 0);
let paused = false, gameOver = false;
let nextShape = randomShape();
let holdShape = null, holdUsed = false;
let piece = spawnFromQueue();

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlaySub = document.getElementById('overlaySub');

function randomShape() {
  return SHAPES[Math.random() * SHAPES.length | 0].map(row => row.slice());
}

function placeAt(shape) {
  return {x: (COLS >> 1) - Math.ceil(shape[0].length / 2), y: 0, shape: shape.map(row => row.slice())};
}

function spawnFromQueue() {
  const shape = nextShape;
  nextShape = randomShape();
  holdUsed = false;
  return placeAt(shape);
}

function drawCell(context, x, y, cellSize, colorIndex) {
  const color = COLORS[colorIndex];
  context.fillStyle = "#0b1524";
  context.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
  if (!color) return;
  context.save();
  context.shadowColor = color;
  context.shadowBlur = 8;
  context.fillStyle = color;
  context.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 3, cellSize - 3);
  context.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(45,212,247,0.08)";
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (board[y][x]) drawCell(ctx, x, y, CELL, board[y][x]);
      else ctx.strokeRect(x * CELL + .5, y * CELL + .5, CELL - 1, CELL - 1);
    }
  }
  for (let y = 0; y < piece.shape.length; y++) {
    for (let x = 0; x < piece.shape[y].length; x++) {
      if (piece.shape[y][x]) drawCell(ctx, piece.x + x, piece.y + y, CELL, piece.shape[y][x]);
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
      if (shape[y][x]) {
        const color = COLORS[shape[y][x]];
        context.save();
        context.shadowColor = color;
        context.shadowBlur = 8;
        context.fillStyle = color;
        context.fillRect(x * size + 1, y * size + 1, size - 3, size - 3);
        context.restore();
      }
    }
  }
  context.restore();
}

function drawNext() { drawPreview(nextCtx, nextCanvas, nextShape); }
function drawHold() { drawPreview(holdCtx, holdCanvas, holdShape); }

function collides(nextX = piece.x, nextY = piece.y, shape = piece.shape) {
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

function lockPiece() {
  for (let y = 0; y < piece.shape.length; y++) {
    for (let x = 0; x < piece.shape[y].length; x++) {
      if (piece.shape[y][x]) board[piece.y + y][piece.x + x] = piece.shape[y][x];
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
    score += [0, 100, 300, 500, 800][cleared] * level;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('blocksHighScore', highScore);
    }
  }

  piece = spawnFromQueue();
  drawNext();
  if (collides()) endGame();
}

function rotate() {
  if (paused || gameOver) return;
  const shape = piece.shape;
  const rotated = shape[0].map((_, i) => shape.map(row => row[i]).reverse());
  if (!collides(piece.x, piece.y, rotated)) piece.shape = rotated;
  draw();
}

function hardDrop() {
  if (paused || gameOver) return;
  while (!collides(piece.x, piece.y + 1)) piece.y++;
  lockPiece();
  draw();
}

function moveLeft() {
  if (paused || gameOver) return;
  if (!collides(piece.x - 1, piece.y)) piece.x--;
  draw();
}

function moveRight() {
  if (paused || gameOver) return;
  if (!collides(piece.x + 1, piece.y)) piece.x++;
  draw();
}

function softDrop() {
  if (paused || gameOver) return;
  tick();
}

function hold() {
  if (paused || gameOver || holdUsed) return;
  holdUsed = true;
  if (holdShape) {
    const swap = holdShape;
    holdShape = piece.shape.map(row => row.slice());
    piece = placeAt(swap);
  } else {
    holdShape = piece.shape.map(row => row.slice());
    piece = placeAt(nextShape);
    nextShape = randomShape();
  }
  drawHold();
  drawNext();
  draw();
}

function tick() {
  if (paused || gameOver) return;
  if (!collides(piece.x, piece.y + 1)) piece.y++;
  else lockPiece();
  draw();
}

function endGame() {
  gameOver = true;
  overlayTitle.textContent = "GAME OVER";
  overlaySub.textContent = `Score ${score} — tap to restart`;
  overlay.classList.remove('hidden');
}

function restart() {
  board.forEach(row => row.fill(0));
  score = 0; level = 1; lines = 0;
  holdShape = null; holdUsed = false;
  nextShape = randomShape();
  piece = spawnFromQueue();
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

function loop() {
  tick();
  const speed = Math.max(120, 500 - (level - 1) * 40);
  setTimeout(loop, speed);
}

drawNext();
drawHold();
draw();
loop();
