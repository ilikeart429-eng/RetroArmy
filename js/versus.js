import { db } from "./firebase.js";
import {
  doc, setDoc, updateDoc, getDoc, deleteDoc, onSnapshot,
  collection, query, orderBy, limit, getDocs, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getSession } from "./session.js";
import { showScreen, returnToDashboard } from "./screens.js";

const COLS = 10, ROWS = 20, CELL_MINE = 19, CELL_OPP = 14;
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
const DEFAULT_TARGET_SCORE = 5000;
const SYNC_INTERVAL_MS = 150;

let engine = null;
let currentMatchId = null;
let opponentUid = null;
let targetScoreVal = 0;
let matchEnded = false;
let loopTimer = null;
let syncTimer = null;
let dirty = false;
let unsubMatch = null;
let unsubOpp = null;
let queueUnsub = null;
let roomWatchUnsub = null;
let hostedRoomCode = null;
let myCtx = null, oppCtx = null;

function randomShape() {
  return SHAPES[Math.random() * SHAPES.length | 0].map(row => row.slice());
}

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.random() * chars.length | 0];
  return s;
}

function placeAt(shape) {
  return { x: (COLS >> 1) - Math.ceil(shape[0].length / 2), y: 0, shape: shape.map(row => row.slice()) };
}

function spawnFromQueue(e) {
  const shape = e.nextShape;
  e.nextShape = randomShape();
  return placeAt(shape);
}

function collidesFor(e, nextX = e.piece.x, nextY = e.piece.y, shape = e.piece.shape) {
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (!shape[y][x]) continue;
      const bx = nextX + x, by = nextY + y;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && e.board[by][bx]) return true;
    }
  }
  return false;
}

function lockPiece(e, onScore) {
  for (let y = 0; y < e.piece.shape.length; y++) {
    for (let x = 0; x < e.piece.shape[y].length; x++) {
      if (e.piece.shape[y][x]) e.board[e.piece.y + y][e.piece.x + x] = e.piece.shape[y][x];
    }
  }
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (e.board[y].every(cell => cell)) {
      e.board.splice(y, 1);
      e.board.unshift(Array(COLS).fill(0));
      cleared++;
      y++;
    }
  }
  if (cleared) {
    e.score += [0, 100, 300, 500, 800][cleared] * e.level;
    e.lines += cleared;
    e.level = Math.floor(e.lines / 10) + 1;
    onScore && onScore();
  }
  e.piece = spawnFromQueue(e);
  if (collidesFor(e)) e.gameOver = true;
}

function newEngine() {
  const e = {
    board: Array.from({ length: ROWS }, () => Array(COLS).fill(0)),
    score: 0, level: 1, lines: 0,
    nextShape: randomShape(),
    piece: null,
    gameOver: false
  };
  e.piece = spawnFromQueue(e);
  return e;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

function drawCell(context, x, y, size, colorIndex) {
  const color = COLORS[colorIndex];
  const px = x * size, py = y * size, s = size - 1;
  context.fillStyle = "#0f0a1a";
  context.fillRect(px, py, s, s);
  if (!color) return;
  const bevel = Math.max(1, Math.round(size * 0.14));
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

function drawBoard(context, boardArr, piece, cellSize) {
  context.clearRect(0, 0, COLS * cellSize, ROWS * cellSize);
  context.strokeStyle = "rgba(255,255,255,0.05)";
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (boardArr[y][x]) drawCell(context, x, y, cellSize, boardArr[y][x]);
      else context.strokeRect(x * cellSize + .5, y * cellSize + .5, cellSize - 1, cellSize - 1);
    }
  }
  if (piece) {
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) drawCell(context, piece.x + x, piece.y + y, cellSize, piece.shape[y][x]);
      }
    }
  }
}

function render() {
  if (myCtx && engine) drawBoard(myCtx, engine.board, engine.piece, CELL_MINE);
}

function markDirty() { dirty = true; }

function tickSpeed() { return Math.max(120, 500 - (engine.level - 1) * 40); }

function onScoreChange() {
  document.getElementById('vsMyScore').textContent = engine.score;
  if (!matchEnded && engine.score >= targetScoreVal) onTargetReached();
}

function tick() {
  if (!engine || engine.gameOver || matchEnded) return;
  if (!collidesFor(engine, engine.piece.x, engine.piece.y + 1)) {
    engine.piece.y++;
  } else {
    lockPiece(engine, onScoreChange);
    if (engine.gameOver) { onTopOut(); return; }
  }
  render();
  markDirty();
  if (!matchEnded) loopTimer = setTimeout(tick, tickSpeed());
}

function moveLeft() {
  if (!engine || engine.gameOver || matchEnded) return;
  if (!collidesFor(engine, engine.piece.x - 1, engine.piece.y)) engine.piece.x--;
  render(); markDirty();
}
function moveRight() {
  if (!engine || engine.gameOver || matchEnded) return;
  if (!collidesFor(engine, engine.piece.x + 1, engine.piece.y)) engine.piece.x++;
  render(); markDirty();
}
function softDrop() {
  if (!engine || engine.gameOver || matchEnded) return;
  clearTimeout(loopTimer);
  tick();
}
function rotatePiece() {
  if (!engine || engine.gameOver || matchEnded) return;
  const shape = engine.piece.shape;
  const rotated = shape[0].map((_, i) => shape.map(row => row[i]).reverse());
  if (!collidesFor(engine, engine.piece.x, engine.piece.y, rotated)) engine.piece.shape = rotated;
  render(); markDirty();
}
function hardDrop() {
  if (!engine || engine.gameOver || matchEnded) return;
  clearTimeout(loopTimer);
  while (!collidesFor(engine, engine.piece.x, engine.piece.y + 1)) engine.piece.y++;
  lockPiece(engine, onScoreChange);
  if (engine.gameOver) { onTopOut(); return; }
  render(); markDirty();
  loopTimer = setTimeout(tick, tickSpeed());
}

function isVersusVisible() {
  const el = document.getElementById('versusApp');
  return el && !el.classList.contains('hidden');
}

function bindControlsOnce() {
  document.getElementById('vsLeftBtn').addEventListener('click', moveLeft);
  document.getElementById('vsRightBtn').addEventListener('click', moveRight);
  document.getElementById('vsDownBtn').addEventListener('click', softDrop);
  document.getElementById('vsRotateBtn').addEventListener('click', rotatePiece);
  document.getElementById('vsBackToDashBtn').addEventListener('click', () => {
    teardownMatch();
    returnToDashboard();
  });
  document.addEventListener('keydown', event => {
    if (!isVersusVisible()) return;
    if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " "].includes(event.key)) {
      event.preventDefault();
    }
    if (event.key === "ArrowLeft") moveLeft();
    else if (event.key === "ArrowRight") moveRight();
    else if (event.key === "ArrowDown") softDrop();
    else if (event.key === "ArrowUp") rotatePiece();
    else if (event.key === " ") hardDrop();
  });
}
bindControlsOnce();

function unflattenBoard(flat) {
  const b = [];
  for (let y = 0; y < ROWS; y++) b.push(flat.slice(y * COLS, y * COLS + COLS));
  return b;
}
function unflattenPiece(flat, w) {
  const h = flat.length / w;
  const shape = [];
  for (let y = 0; y < h; y++) shape.push(flat.slice(y * w, y * w + w));
  return shape;
}

async function pushState() {
  if (!dirty || !engine || !currentMatchId) return;
  dirty = false;
  const session = getSession();
  if (!session) return;
  const flatBoard = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) flatBoard.push(engine.board[y][x]);
  const payload = {
    board: flatBoard,
    score: engine.score,
    gameOver: engine.gameOver,
    updatedAt: serverTimestamp()
  };
  if (engine.piece) {
    const ph = engine.piece.shape.length, pw = engine.piece.shape[0].length;
    const flatPiece = [];
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) flatPiece.push(engine.piece.shape[y][x]);
    payload.pieceShape = flatPiece;
    payload.pieceW = pw;
    payload.pieceX = engine.piece.x;
    payload.pieceY = engine.piece.y;
  }
  try {
    await setDoc(doc(db, 'matches', currentMatchId, 'state', session.uid), payload, { merge: true });
  } catch (e) {}
}

function stopLoop() {
  clearTimeout(loopTimer); loopTimer = null;
  clearInterval(syncTimer); syncTimer = null;
}

function cleanupListeners() {
  if (unsubMatch) { unsubMatch(); unsubMatch = null; }
  if (unsubOpp) { unsubOpp(); unsubOpp = null; }
}

function teardownMatch() {
  stopLoop();
  cleanupListeners();
  engine = null;
  currentMatchId = null;
  opponentUid = null;
  matchEnded = true;
}

function endMatch(didWin, reason) {
  matchEnded = true;
  stopLoop();
  cleanupListeners();
  const overlayEl = document.getElementById('vsResultOverlay');
  document.getElementById('vsResultTitle').textContent = didWin ? 'YOU WIN' : 'YOU LOSE';
  document.getElementById('vsResultSub').textContent =
    reason === 'target' ? (didWin ? 'YOU REACHED THE TARGET SCORE FIRST' : 'OPPONENT REACHED THE TARGET SCORE FIRST') :
    reason === 'topout' ? (didWin ? 'OPPONENT TOPPED OUT' : 'YOU TOPPED OUT') : '';
  overlayEl.classList.remove('hidden');
}

async function onTargetReached() {
  if (matchEnded) return;
  matchEnded = true;
  stopLoop();
  try {
    await updateDoc(doc(db, 'matches', currentMatchId), {
      status: 'finished', winner: getSession().uid, endReason: 'target', endedAt: serverTimestamp()
    });
  } catch (e) {}
  endMatch(true, 'target');
}

async function onTopOut() {
  if (matchEnded) return;
  matchEnded = true;
  stopLoop();
  try {
    await updateDoc(doc(db, 'matches', currentMatchId), {
      status: 'finished', winner: opponentUid, endReason: 'topout', endedAt: serverTimestamp()
    });
  } catch (e) {}
  endMatch(false, 'topout');
}

function beginMatch(matchId, oppId, targetScore) {
  const session = getSession();
  if (!session) return;

  currentMatchId = matchId;
  opponentUid = oppId;
  targetScoreVal = targetScore || DEFAULT_TARGET_SCORE;
  matchEnded = false;
  dirty = false;
  engine = newEngine();

  const myCanvas = document.getElementById('vsMyCanvas');
  myCtx = myCanvas.getContext('2d');
  const oppCanvas = document.getElementById('vsOppCanvas');
  oppCtx = oppCanvas.getContext('2d');

  document.getElementById('vsTargetScore').textContent = targetScoreVal;
  document.getElementById('vsMyLabel').textContent = session.username.toUpperCase();
  document.getElementById('vsOppLabel').textContent = 'OPPONENT';
  document.getElementById('vsMyScore').textContent = '0';
  document.getElementById('vsOppScore').textContent = '0';
  document.getElementById('vsResultOverlay').classList.add('hidden');
  oppCtx.clearRect(0, 0, oppCanvas.width, oppCanvas.height);

  getDoc(doc(db, 'users', oppId)).then(s => {
    if (s.exists()) document.getElementById('vsOppLabel').textContent = (s.data().username || 'OPPONENT').toUpperCase();
  }).catch(() => {});

  showScreen('versusApp');
  render();

  unsubMatch = onSnapshot(doc(db, 'matches', matchId), snap => {
    const data = snap.data();
    if (!data) return;
    if (data.status === 'finished' && !matchEnded) {
      endMatch(data.winner === session.uid, data.endReason);
    }
  });

  unsubOpp = onSnapshot(doc(db, 'matches', matchId, 'state', oppId), snap => {
    const data = snap.data();
    if (!data || !data.board) return;
    document.getElementById('vsOppScore').textContent = data.score || 0;
    const oppBoard = unflattenBoard(data.board);
    const oppPiece = data.pieceShape ? {
      x: data.pieceX, y: data.pieceY, shape: unflattenPiece(data.pieceShape, data.pieceW)
    } : null;
    drawBoard(oppCtx, oppBoard, oppPiece, CELL_OPP);
  });

  markDirty();
  syncTimer = setInterval(pushState, SYNC_INTERVAL_MS);
  loopTimer = setTimeout(tick, tickSpeed());
}

// ---------- Matchmaking ----------

let randomScanInterval = null;

function stopRandomScan() {
  if (randomScanInterval) { clearInterval(randomScanInterval); randomScanInterval = null; }
}

async function tryPairWithWaiter(session) {
  const q = query(collection(db, 'matchmakingQueue'), orderBy('joinedAt'), limit(10));
  const snap = await getDocs(q);
  const candidate = snap.docs.find(d => d.id !== session.uid && !d.data().matchId);
  if (!candidate) return null;

  const matchRef = doc(collection(db, 'matches'));
  const queueRef = doc(db, 'matchmakingQueue', candidate.id);
  try {
    await runTransaction(db, async (tx) => {
      const fresh = await tx.get(queueRef);
      if (!fresh.exists() || fresh.data().matchId) throw new Error('taken');
      tx.set(matchRef, {
        status: 'active',
        targetScore: DEFAULT_TARGET_SCORE,
        createdAt: serverTimestamp(),
        players: {
          [session.uid]: { username: session.username },
          [candidate.id]: { username: fresh.data().username }
        },
        playerIds: [session.uid, candidate.id],
        winner: null,
        endReason: null
      });
      tx.update(queueRef, { matchId: matchRef.id });
    });
    return { matchId: matchRef.id, oppId: candidate.id };
  } catch (e) {
    return null;
  }
}

export async function startRandomMatch() {
  const session = getSession();
  if (!session) return;
  showScreen('vsWaitScreen');
  document.getElementById('vsWaitLead').textContent = 'SEARCHING FOR OPPONENT...';
  document.getElementById('vsRoomCodeDisplay').classList.add('hidden');
  document.getElementById('vsWaitError').classList.add('hidden');

  try {
    const found = await tryPairWithWaiter(session);
    if (found) {
      beginMatch(found.matchId, found.oppId, DEFAULT_TARGET_SCORE);
      return;
    }

    await setDoc(doc(db, 'matchmakingQueue', session.uid), {
      username: session.username,
      joinedAt: serverTimestamp(),
      matchId: null
    });

    queueUnsub = onSnapshot(doc(db, 'matchmakingQueue', session.uid), snap => {
      const data = snap.data();
      if (data && data.matchId) {
        stopRandomScan();
        if (queueUnsub) { queueUnsub(); queueUnsub = null; }
        deleteDoc(doc(db, 'matchmakingQueue', session.uid)).catch(() => {});
        getDoc(doc(db, 'matches', data.matchId)).then(m => {
          const mdata = m.data();
          if (!mdata) return;
          const oppId = mdata.playerIds.find(id => id !== session.uid);
          beginMatch(data.matchId, oppId, mdata.targetScore);
        });
      }
    }, err => {
      document.getElementById('vsWaitError').textContent = 'Connection error: ' + (err.message || err.code || 'unknown error');
      document.getElementById('vsWaitError').classList.remove('hidden');
    });

    // Keep actively re-scanning in case another player queued at nearly the
    // same instant and both clients missed each other in the initial query.
    randomScanInterval = setInterval(async () => {
      if (!queueUnsub) return;
      const retryFound = await tryPairWithWaiter(session);
      if (retryFound) {
        stopRandomScan();
        if (queueUnsub) { queueUnsub(); queueUnsub = null; }
        deleteDoc(doc(db, 'matchmakingQueue', session.uid)).catch(() => {});
        beginMatch(retryFound.matchId, retryFound.oppId, DEFAULT_TARGET_SCORE);
      }
    }, 3000);
  } catch (err) {
    document.getElementById('vsWaitError').textContent = 'Could not search for a match: ' + (err.message || err.code || 'unknown error');
    document.getElementById('vsWaitError').classList.remove('hidden');
  }
}

export async function createRoom() {
  const session = getSession();
  if (!session) return;

  showScreen('vsWaitScreen');
  document.getElementById('vsWaitLead').textContent = 'CREATING ROOM...';
  document.getElementById('vsRoomCodeDisplay').classList.add('hidden');
  document.getElementById('vsWaitError').classList.add('hidden');

  const code = makeCode();
  try {
    await setDoc(doc(db, 'matches', code), {
      status: 'waiting',
      targetScore: DEFAULT_TARGET_SCORE,
      createdAt: serverTimestamp(),
      players: { [session.uid]: { username: session.username } },
      playerIds: [session.uid],
      winner: null,
      endReason: null
    });
  } catch (err) {
    document.getElementById('vsWaitError').textContent = 'Could not create room: ' + (err.message || err.code || 'unknown error');
    document.getElementById('vsWaitError').classList.remove('hidden');
    return;
  }
  hostedRoomCode = code;

  document.getElementById('vsWaitLead').textContent = 'SHARE THIS CODE WITH A FRIEND';
  const codeEl = document.getElementById('vsRoomCodeDisplay');
  codeEl.textContent = code;
  codeEl.classList.remove('hidden');

  roomWatchUnsub = onSnapshot(doc(db, 'matches', code), snap => {
    const data = snap.data();
    if (data && data.status === 'active' && data.playerIds && data.playerIds.length === 2) {
      if (roomWatchUnsub) { roomWatchUnsub(); roomWatchUnsub = null; }
      hostedRoomCode = null;
      const oppId = data.playerIds.find(id => id !== session.uid);
      beginMatch(code, oppId, data.targetScore);
    }
  }, err => {
    document.getElementById('vsWaitError').textContent = 'Connection error: ' + (err.message || err.code || 'unknown error');
    document.getElementById('vsWaitError').classList.remove('hidden');
  });
}

export async function joinRoom(code) {
  const session = getSession();
  const errEl = document.getElementById('vsJoinError');
  errEl.classList.add('hidden');
  if (!session || !code || code.length < 4) {
    errEl.textContent = 'Enter a valid room code.';
    errEl.classList.remove('hidden');
    return;
  }
  const matchRef = doc(db, 'matches', code);
  try {
    let targetScore = DEFAULT_TARGET_SCORE;
    let hostId = null;
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(matchRef);
      if (!snap.exists()) throw new Error('not-found');
      const data = snap.data();
      if (data.status !== 'waiting') throw new Error('full');
      if (data.playerIds.includes(session.uid)) throw new Error('self');
      hostId = data.playerIds[0];
      targetScore = data.targetScore;
      tx.update(matchRef, {
        status: 'active',
        [`players.${session.uid}`]: { username: session.username },
        playerIds: [...data.playerIds, session.uid]
      });
    });
    beginMatch(code, hostId, targetScore);
  } catch (err) {
    errEl.textContent =
      err.message === 'not-found' ? 'Room not found.' :
      err.message === 'self' ? 'You already created this room.' :
      err.message === 'full' ? 'That room is full or no longer available.' :
      'Could not join room: ' + (err.message || err.code || 'unknown error');
    errEl.classList.remove('hidden');
  }
}

export async function cancelMatchmaking() {
  const session = getSession();
  stopRandomScan();
  if (queueUnsub) { queueUnsub(); queueUnsub = null; }
  if (roomWatchUnsub) { roomWatchUnsub(); roomWatchUnsub = null; }
  if (session) {
    try { await deleteDoc(doc(db, 'matchmakingQueue', session.uid)); } catch (e) {}
  }
  if (hostedRoomCode) {
    try { await deleteDoc(doc(db, 'matches', hostedRoomCode)); } catch (e) {}
    hostedRoomCode = null;
  }
}
