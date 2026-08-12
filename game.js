
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const COLS = 10, ROWS = 20, CELL = 20;

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
const COLORS = ["#000","#0ff","#ff0","#f0f","#0f0","#f00","#00f","#fa0"];

let piece = newPiece();
let score = 0;

function newPiece() {
  const shape = SHAPES[Math.random() * SHAPES.length | 0].map(row => row.slice());
  return {x: 3, y: 0, shape};
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = COLORS[board[y][x]] || "#222";
      ctx.fillRect(x * CELL, y * CELL, CELL - 1, CELL - 1);
    }
  }
  for (let y = 0; y < piece.shape.length; y++) {
    for (let x = 0; x < piece.shape[y].length; x++) {
      if (piece.shape[y][x]) {
        ctx.fillStyle = COLORS[piece.shape[y][x]];
        ctx.fillRect((piece.x + x) * CELL, (piece.y + y) * CELL, CELL - 1, CELL - 1);
      }
    }
  }
  document.getElementById("score").textContent = score;
}

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
  for (let y = ROWS - 1; y >= 0; y--) {
    if (board[y].every(cell => cell)) {
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(0));
      score += 100;
      y++;
    }
  }
  piece = newPiece();
  if (collides()) {
    alert("Game Over");
    board.forEach(row => row.fill(0));
    score = 0;
  }
}

function rotate() {
  const shape = piece.shape;
  const rotated = shape[0].map((_, i) => shape.map(row => row[i]).reverse());
  if (!collides(piece.x, piece.y, rotated)) piece.shape = rotated;
}

document.addEventListener("keydown", event => {
  if (event.key == "ArrowLeft" && !collides(piece.x - 1, piece.y)) piece.x--;
  if (event.key == "ArrowRight" && !collides(piece.x + 1, piece.y)) piece.x++;
  if (event.key == "ArrowDown") tick();
  if (event.key == "ArrowUp") rotate();
  draw();
});

function tick() {
  if (!collides(piece.x, piece.y + 1)) piece.y++;
  else lockPiece();
  draw();
}

setInterval(tick, 500);
draw();
