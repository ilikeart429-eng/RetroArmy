import { db } from "./firebase.js";
import {
  doc, setDoc, updateDoc, getDoc, deleteDoc, addDoc, onSnapshot,
  collection, query, orderBy, limit, getDocs, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getSession } from "./session.js";
import { showScreen, returnToDashboard } from "./screens.js";

const COLS = 10, ROWS = 20, CELL = 12;
const LOBBY_SIZE = 4;
const ROUND_SECONDS = 60;
const VOTE_SECONDS = 20;
const SYNC_INTERVAL_MS = 150;
const SABOTAGE_COOLDOWN_MS = 8000;
const SPEED_BOOST_MS = 8000;
const BLIND_MS = 4000;
const FREEZE_MS = 2500;
const HOLES_PUNCHED = 5;

const SHAPES = [
  [[1,1,1,1]],
  [[2,2],[2,2]],
  [[0,3,0],[3,3,3]],
  [[4,4,0],[0,4,4]],
  [[0,5,5],[5,5,0]],
  [[6,0,0],[6,6,6]],
  [[0,0,7],[7,7,7]],
];
const COLORS = [null, "#2dd4f7", "#f9e94e", "#b96bf5", "#3ee06a", "#f75c5c", "#4d7dfa", "#f7a53e", "#8a8a99"];
const GARBAGE_CELL = 8;

let currentLobbyId = null;
let hostedLobbyCode = null;
let queueUnsub = null;
let lobbyWatchUnsub = null;
let lobbyRoundUnsub = null;
let sabotageUnsub = null;
let stateUnsubs = [];

let myEngine = null;
let myRole = null;
let mySlot = -1;
let playerIds = [];
let players = {};
let myCtx = null;
let loopTimer = null;
let syncTimer = null;
let dirty = false;
let roundTimerInterval = null;
let voteTimerInterval = null;
let roundEndedLocally = false;
let selectedTargetUid = null;
let cooldownUntil = {};
let cooldownUiInterval = null;

const sabotageState = { speedBoostUntil: 0, blindUntil: 0, frozenUntil: 0 };

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

function lockPiece(e) {
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
    e.score += [0, 100, 300, 500, 800][Math.min(cleared, 4)] * e.level;
    e.lines += cleared;
    e.level = Math.floor(e.lines / 10) + 1;
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

function drawBoard(context, boardArr, piece) {
  context.clearRect(0, 0, COLS * CELL, ROWS * CELL);
  context.strokeStyle = "rgba(255,255,255,0.05)";
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (boardArr[y][x]) drawCell(context, x, y, CELL, boardArr[y][x]);
      else context.strokeRect(x * CELL + .5, y * CELL + .5, CELL - 1, CELL - 1);
    }
  }
  if (piece) {
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) drawCell(context, piece.x + x, piece.y + y, CELL, piece.shape[y][x]);
      }
    }
  }
}

function renderMine() {
  if (!myCtx || !myEngine) return;
  drawBoard(myCtx, myEngine.board, myEngine.piece);
  if (Date.now() < sabotageState.blindUntil) {
    myCtx.fillStyle = 'rgba(5,3,10,0.94)';
    myCtx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
  }
  document.getElementById(`impScore${mySlot}`).textContent = myEngine.score;
}

function markDirty() { dirty = true; }

function isFrozen() { return Date.now() < sabotageState.frozenUntil; }

function tickSpeed() {
  let speed = Math.max(120, 500 - (myEngine.level - 1) * 40);
  if (Date.now() < sabotageState.speedBoostUntil) speed = Math.max(60, speed / 2);
  return speed;
}

function tick() {
  if (!myEngine || myEngine.gameOver || roundEndedLocally) return;
  if (!collidesFor(myEngine, myEngine.piece.x, myEngine.piece.y + 1)) {
    myEngine.piece.y++;
  } else {
    lockPiece(myEngine);
  }
  renderMine();
  markDirty();
  if (!roundEndedLocally) loopTimer = setTimeout(tick, tickSpeed());
}

function moveLeft() {
  if (isFrozen() || !myEngine || myEngine.gameOver || roundEndedLocally) return;
  if (!collidesFor(myEngine, myEngine.piece.x - 1, myEngine.piece.y)) myEngine.piece.x--;
  renderMine(); markDirty();
}
function moveRight() {
  if (isFrozen() || !myEngine || myEngine.gameOver || roundEndedLocally) return;
  if (!collidesFor(myEngine, myEngine.piece.x + 1, myEngine.piece.y)) myEngine.piece.x++;
  renderMine(); markDirty();
}
function softDrop() {
  if (isFrozen() || !myEngine || myEngine.gameOver || roundEndedLocally) return;
  clearTimeout(loopTimer);
  tick();
}
function rotatePiece() {
  if (isFrozen() || !myEngine || myEngine.gameOver || roundEndedLocally) return;
  const shape = myEngine.piece.shape;
  const rotated = shape[0].map((_, i) => shape.map(row => row[i]).reverse());
  if (!collidesFor(myEngine, myEngine.piece.x, myEngine.piece.y, rotated)) myEngine.piece.shape = rotated;
  renderMine(); markDirty();
}
function hardDrop() {
  if (isFrozen() || !myEngine || myEngine.gameOver || roundEndedLocally) return;
  clearTimeout(loopTimer);
  while (!collidesFor(myEngine, myEngine.piece.x, myEngine.piece.y + 1)) myEngine.piece.y++;
  lockPiece(myEngine);
  renderMine(); markDirty();
  if (!roundEndedLocally) loopTimer = setTimeout(tick, tickSpeed());
}

// ---------- Sabotage ----------

function receiveGarbageRow(e) {
  const row = Array(COLS).fill(GARBAGE_CELL);
  row[Math.random() * COLS | 0] = 0;
  if (e.board[0].some(cell => cell)) { e.gameOver = true; return; }
  e.board.shift();
  e.board.push(row);
  while (e.piece && collidesFor(e)) e.piece.y--;
}

function punchHoles(e, count) {
  const filled = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (e.board[y][x]) filled.push([y, x]);
    }
  }
  for (let i = 0; i < count && filled.length; i++) {
    const idx = Math.random() * filled.length | 0;
    const [y, x] = filled.splice(idx, 1)[0];
    e.board[y][x] = 0;
  }
}

function applyIncomingSabotage(type) {
  if (!myEngine) return;
  const now = Date.now();
  if (type === 'garbage') {
    receiveGarbageRow(myEngine);
  } else if (type === 'holes') {
    punchHoles(myEngine, HOLES_PUNCHED);
  } else if (type === 'speed') {
    sabotageState.speedBoostUntil = now + SPEED_BOOST_MS;
  } else if (type === 'blind') {
    sabotageState.blindUntil = now + BLIND_MS;
  } else if (type === 'freeze') {
    sabotageState.frozenUntil = now + FREEZE_MS;
  }
  renderMine();
  markDirty();
}

async function issueSabotage(type, targetUid) {
  if (!currentLobbyId || !targetUid) return;
  const session = getSession();
  const statusEl = document.getElementById('impSabotageStatus');
  try {
    await addDoc(collection(db, 'imposterLobbies', currentLobbyId, 'sabotage'), {
      targetUid, type, issuedBy: session.uid, issuedAt: serverTimestamp()
    });
    cooldownUntil[type] = Date.now() + SABOTAGE_COOLDOWN_MS;
    statusEl.textContent = 'SABOTAGE SENT';
    statusEl.classList.remove('hidden');
  } catch (e) {
    statusEl.textContent = 'Sabotage failed: ' + (e.message || e.code || 'unknown error');
    statusEl.classList.remove('hidden');
  }
}

function updateCooldownUI() {
  document.querySelectorAll('.imp-sab-btn').forEach(btn => {
    const type = btn.dataset.action;
    const remaining = Math.max(0, Math.ceil(((cooldownUntil[type] || 0) - Date.now()) / 1000));
    btn.disabled = remaining > 0;
    btn.textContent = remaining > 0 ? `${remaining}s` : btn.dataset.label;
  });
}

function bindSabotagePanel() {
  document.querySelectorAll('.imp-sab-btn').forEach(btn => {
    btn.dataset.label = btn.textContent;
    btn.addEventListener('click', () => {
      if (btn.disabled || !selectedTargetUid) return;
      issueSabotage(btn.dataset.action, selectedTargetUid);
    });
  });
}
bindSabotagePanel();

function renderSabotageTargets() {
  const wrap = document.getElementById('impSabotageTargets');
  wrap.innerHTML = '';
  const session = getSession();
  const others = playerIds.filter(id => id !== session.uid);
  selectedTargetUid = others[0] || null;
  others.forEach(uid => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'imp-target-btn' + (uid === selectedTargetUid ? ' active' : '');
    btn.textContent = (players[uid] && players[uid].username || 'PLAYER').toUpperCase();
    btn.addEventListener('click', () => {
      selectedTargetUid = uid;
      wrap.querySelectorAll('.imp-target-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    wrap.append(btn);
  });
}

// ---------- Board sync ----------

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
  if (!dirty || !myEngine || !currentLobbyId) return;
  dirty = false;
  const session = getSession();
  if (!session) return;
  const flatBoard = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) flatBoard.push(myEngine.board[y][x]);
  const payload = {
    board: flatBoard,
    score: myEngine.score,
    gameOver: myEngine.gameOver,
    updatedAt: serverTimestamp()
  };
  if (myEngine.piece) {
    const ph = myEngine.piece.shape.length, pw = myEngine.piece.shape[0].length;
    const flatPiece = [];
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) flatPiece.push(myEngine.piece.shape[y][x]);
    payload.pieceShape = flatPiece;
    payload.pieceW = pw;
    payload.pieceX = myEngine.piece.x;
    payload.pieceY = myEngine.piece.y;
  }
  try {
    await setDoc(doc(db, 'imposterLobbies', currentLobbyId, 'state', session.uid), payload, { merge: true });
  } catch (e) {}
}

function watchOpponentState(slot, uid) {
  const canvas = document.getElementById(`impCanvas${slot}`);
  const ctx = canvas.getContext('2d');
  const unsub = onSnapshot(doc(db, 'imposterLobbies', currentLobbyId, 'state', uid), snap => {
    const data = snap.data();
    if (!data || !data.board) return;
    document.getElementById(`impScore${slot}`).textContent = data.score || 0;
    const board = unflattenBoard(data.board);
    const piece = data.pieceShape ? {
      x: data.pieceX, y: data.pieceY, shape: unflattenPiece(data.pieceShape, data.pieceW)
    } : null;
    drawBoard(ctx, board, piece);
  });
  stateUnsubs.push(unsub);
}

// ---------- Round lifecycle ----------

function stopRoundTimers() {
  clearTimeout(loopTimer); loopTimer = null;
  clearInterval(syncTimer); syncTimer = null;
  clearInterval(roundTimerInterval); roundTimerInterval = null;
  clearInterval(voteTimerInterval); voteTimerInterval = null;
  clearInterval(cooldownUiInterval); cooldownUiInterval = null;
}

function teardownRound() {
  stopRoundTimers();
  if (sabotageUnsub) { sabotageUnsub(); sabotageUnsub = null; }
  stateUnsubs.forEach(u => u());
  stateUnsubs = [];
  if (lobbyRoundUnsub) { lobbyRoundUnsub(); lobbyRoundUnsub = null; }
  myEngine = null;
  currentLobbyId = null;
  myRole = null;
  mySlot = -1;
  playerIds = [];
  players = {};
  roundEndedLocally = false;
  sabotageState.speedBoostUntil = 0;
  sabotageState.blindUntil = 0;
  sabotageState.frozenUntil = 0;
  cooldownUntil = {};
}

async function beginRound(lobbyId, ids, playerMap) {
  const session = getSession();
  currentLobbyId = lobbyId;
  playerIds = ids;
  players = playerMap;
  mySlot = playerIds.indexOf(session.uid);
  if (mySlot === -1) return;

  const roleSnap = await getDoc(doc(db, 'imposterLobbies', lobbyId, 'roles', session.uid));
  myRole = roleSnap.exists() ? roleSnap.data().role : 'crew';

  showScreen('impRoleScreen');
  document.getElementById('impRoleTitle').textContent = myRole === 'imposter' ? 'YOU ARE THE IMPOSTER' : 'YOU ARE CREW';
  document.getElementById('impRoleSub').textContent = myRole === 'imposter'
    ? 'Sabotage the crew without getting caught'
    : 'Play Blocks and find the imposter';

  setTimeout(() => startRound(session), 3000);
}

function startRound(session) {
  roundEndedLocally = false;
  myEngine = newEngine();

  for (let i = 0; i < 4; i++) {
    document.getElementById(`impLabel${i}`).textContent = '';
    document.getElementById(`impScore${i}`).textContent = '0';
    document.getElementById(`impCol${i}`).classList.remove('imp-col-mine');
  }

  playerIds.forEach((uid, i) => {
    const name = (players[uid] && players[uid].username || 'PLAYER').toUpperCase();
    document.getElementById(`impLabel${i}`).textContent = uid === session.uid ? `${name} (YOU)` : name;
  });
  document.getElementById(`impCol${mySlot}`).classList.add('imp-col-mine');

  myCtx = document.getElementById(`impCanvas${mySlot}`).getContext('2d');
  stateUnsubs.forEach(u => u());
  stateUnsubs = [];
  playerIds.forEach((uid, i) => {
    if (i !== mySlot) watchOpponentState(i, uid);
  });

  document.getElementById('impSabotagePanel').classList.toggle('hidden', myRole !== 'imposter');
  document.getElementById('impSabotageStatus').classList.add('hidden');
  if (myRole === 'imposter') {
    renderSabotageTargets();
    cooldownUiInterval = setInterval(updateCooldownUI, 250);
  }

  showScreen('imposterApp');
  renderMine();
  markDirty();
  syncTimer = setInterval(pushState, SYNC_INTERVAL_MS);
  loopTimer = setTimeout(tick, tickSpeed());

  sabotageUnsub = onSnapshot(
    query(collection(db, 'imposterLobbies', currentLobbyId, 'sabotage'), orderBy('issuedAt')),
    snap => {
      snap.docChanges().forEach(change => {
        if (change.type !== 'added') return;
        const d = change.doc.data();
        if (d.targetUid === session.uid) applyIncomingSabotage(d.type);
      });
    }
  );

  getDoc(doc(db, 'imposterLobbies', currentLobbyId)).then(snap => {
    const data = snap.data();
    if (!data || !data.startedAt) return;
    runRoundTimer(data.startedAt.toMillis());
  });

  lobbyRoundUnsub = onSnapshot(doc(db, 'imposterLobbies', currentLobbyId), snap => {
    const data = snap.data();
    if (data && data.status === 'finished') {
      handleFinished(data);
    }
  });
}

function runRoundTimer(startedAtMs) {
  const timerEl = document.getElementById('impTimer');
  roundTimerInterval = setInterval(() => {
    const elapsed = (Date.now() - startedAtMs) / 1000;
    const remaining = Math.max(0, Math.ceil(ROUND_SECONDS - elapsed));
    timerEl.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(roundTimerInterval);
      roundTimerInterval = null;
      beginVoting();
    }
  }, 250);
}

function beginVoting() {
  if (roundEndedLocally) return;
  roundEndedLocally = true;
  clearTimeout(loopTimer); loopTimer = null;
  clearInterval(syncTimer); syncTimer = null;

  const session = getSession();
  showScreen('impVoteScreen');
  const optionsEl = document.getElementById('impVoteOptions');
  optionsEl.innerHTML = '';
  document.getElementById('impVoteStatus').textContent = '';

  playerIds.forEach(uid => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'auth-btn imp-vote-btn';
    btn.textContent = (players[uid] && players[uid].username || 'PLAYER').toUpperCase() + (uid === session.uid ? ' (YOU)' : '');
    btn.addEventListener('click', () => {
      optionsEl.querySelectorAll('.imp-vote-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      submitVote(uid);
    });
    optionsEl.append(btn);
  });

  let remaining = VOTE_SECONDS;
  document.getElementById('impVoteLead').textContent = `WHO IS THE IMPOSTER? (${remaining}s)`;
  voteTimerInterval = setInterval(() => {
    remaining--;
    document.getElementById('impVoteLead').textContent = `WHO IS THE IMPOSTER? (${Math.max(0, remaining)}s)`;
    if (remaining <= 0) {
      clearInterval(voteTimerInterval);
      voteTimerInterval = null;
      if (myRole === 'imposter') finalizeVoting();
    }
  }, 1000);
}

async function submitVote(targetUid) {
  const session = getSession();
  document.getElementById('impVoteStatus').textContent = 'VOTE SUBMITTED';
  try {
    await updateDoc(doc(db, 'imposterLobbies', currentLobbyId), { [`votes.${session.uid}`]: targetUid });
  } catch (e) {}
}

function tallyVotes(votes, ids) {
  const counts = {};
  ids.forEach(uid => counts[uid] = 0);
  Object.values(votes || {}).forEach(v => { if (counts[v] !== undefined) counts[v]++; });
  let max = 0, top = [];
  ids.forEach(uid => {
    if (counts[uid] > max) { max = counts[uid]; top = [uid]; }
    else if (counts[uid] === max && max > 0) top.push(uid);
  });
  if (max === 0 || top.length !== 1) return null;
  return top[0];
}

async function finalizeVoting() {
  const session = getSession();
  try {
    const snap = await getDoc(doc(db, 'imposterLobbies', currentLobbyId));
    const data = snap.data();
    if (!data || data.status === 'finished') return;
    const ejected = tallyVotes(data.votes, data.playerIds);
    const crewWon = ejected === session.uid;
    await updateDoc(doc(db, 'imposterLobbies', currentLobbyId), {
      status: 'finished',
      ejectedUid: ejected || null,
      imposterUidPublic: session.uid,
      result: crewWon ? 'crew_win' : 'imposter_win'
    });
  } catch (e) {}
}

function handleFinished(data) {
  if (!document.getElementById('impResultScreen').classList.contains('hidden')) return;
  clearInterval(voteTimerInterval); voteTimerInterval = null;
  showScreen('impResultScreen');

  const iAmImposter = myRole === 'imposter';
  const crewWon = data.result === 'crew_win';
  const won = (iAmImposter && !crewWon) || (!iAmImposter && crewWon);
  const imposterName = (data.players[data.imposterUidPublic] || {}).username || 'UNKNOWN';
  const ejectedName = data.ejectedUid ? (data.players[data.ejectedUid] || {}).username : null;

  document.getElementById('impResultLead').textContent = won ? 'YOU WIN' : 'YOU LOSE';
  document.getElementById('impResultSub').textContent =
    `THE IMPOSTER WAS ${imposterName.toUpperCase()}. ` +
    (ejectedName ? `THE GROUP EJECTED ${ejectedName.toUpperCase()}.` : 'NO ONE WAS EJECTED.');
}

document.getElementById('impBackToDashBtn').addEventListener('click', () => {
  teardownRound();
  returnToDashboard();
});

document.getElementById('impLeftBtn').addEventListener('click', moveLeft);
document.getElementById('impRightBtn').addEventListener('click', moveRight);
document.getElementById('impDownBtn').addEventListener('click', softDrop);
document.getElementById('impRotateBtn').addEventListener('click', rotatePiece);

function isImposterAppVisible() {
  const el = document.getElementById('imposterApp');
  return el && !el.classList.contains('hidden');
}

document.addEventListener('keydown', event => {
  if (!isImposterAppVisible()) return;
  if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " "].includes(event.key)) {
    event.preventDefault();
  }
  if (event.key === "ArrowLeft") moveLeft();
  else if (event.key === "ArrowRight") moveRight();
  else if (event.key === "ArrowDown") softDrop();
  else if (event.key === "ArrowUp") rotatePiece();
  else if (event.key === " ") hardDrop();
});

// ---------- Matchmaking ----------

function renderWaitPlayers(ids, playerMap) {
  const wrap = document.getElementById('impWaitPlayers');
  wrap.innerHTML = ids.map(uid => `<div class="imp-wait-row">${((playerMap[uid] || {}).username || '?').toUpperCase()}</div>`).join('');
  document.getElementById('impWaitLead').textContent = `WAITING FOR PLAYERS... (${ids.length}/${LOBBY_SIZE})`;
}

function watchLobby(lobbyId) {
  if (lobbyWatchUnsub) { lobbyWatchUnsub(); lobbyWatchUnsub = null; }
  lobbyWatchUnsub = onSnapshot(doc(db, 'imposterLobbies', lobbyId), snap => {
    const data = snap.data();
    if (!data) return;
    if (data.status === 'waiting') {
      renderWaitPlayers(data.playerIds, data.players);
    } else if (data.status === 'active') {
      if (lobbyWatchUnsub) { lobbyWatchUnsub(); lobbyWatchUnsub = null; }
      hostedLobbyCode = null;
      beginRound(lobbyId, data.playerIds, data.players);
    }
  });
}

async function tryFormGroup(session) {
  const q = query(collection(db, 'imposterQueue'), orderBy('joinedAt'), limit(20));
  const snap = await getDocs(q);
  const candidates = snap.docs.filter(d => d.id !== session.uid && !d.data().lobbyId);
  if (candidates.length < LOBBY_SIZE - 1) return null;
  const chosen = candidates.slice(0, LOBBY_SIZE - 1);

  const lobbyRef = doc(collection(db, 'imposterLobbies'));
  try {
    await runTransaction(db, async (tx) => {
      const freshDocs = [];
      for (const c of chosen) {
        const ref = doc(db, 'imposterQueue', c.id);
        const fresh = await tx.get(ref);
        if (!fresh.exists() || fresh.data().lobbyId) throw new Error('taken');
        freshDocs.push({ id: c.id, data: fresh.data() });
      }

      const ids = [session.uid, ...freshDocs.map(f => f.id)];
      const playerMap = { [session.uid]: { username: session.username } };
      freshDocs.forEach(f => { playerMap[f.id] = { username: f.data.username }; });
      const imposterIdx = Math.random() * ids.length | 0;

      tx.set(lobbyRef, {
        status: 'active',
        playerIds: ids,
        players: playerMap,
        createdAt: serverTimestamp(),
        startedAt: serverTimestamp(),
        votes: {},
        ejectedUid: null,
        imposterUidPublic: null,
        result: null
      });
      freshDocs.forEach(f => {
        tx.update(doc(db, 'imposterQueue', f.id), { lobbyId: lobbyRef.id });
      });
      ids.forEach((uid, i) => {
        tx.set(doc(db, 'imposterLobbies', lobbyRef.id, 'roles', uid), {
          role: i === imposterIdx ? 'imposter' : 'crew'
        });
      });
    });
    return lobbyRef.id;
  } catch (e) {
    return null;
  }
}

export async function startRandomLobby() {
  const session = getSession();
  if (!session) return;
  showScreen('impWaitScreen');
  document.getElementById('impWaitLead').textContent = 'SEARCHING FOR PLAYERS...';
  document.getElementById('impRoomCodeDisplay').classList.add('hidden');
  document.getElementById('impWaitPlayers').innerHTML = '';
  document.getElementById('impWaitError').classList.add('hidden');

  try {
    const lobbyId = await tryFormGroup(session);
    if (lobbyId) {
      const snap = await getDoc(doc(db, 'imposterLobbies', lobbyId));
      const data = snap.data();
      beginRound(lobbyId, data.playerIds, data.players);
      return;
    }

    await setDoc(doc(db, 'imposterQueue', session.uid), {
      username: session.username,
      joinedAt: serverTimestamp(),
      lobbyId: null
    });
    renderWaitPlayers([session.uid], { [session.uid]: { username: session.username } });
    queueUnsub = onSnapshot(doc(db, 'imposterQueue', session.uid), snap => {
      const data = snap.data();
      if (data && data.lobbyId) {
        if (queueUnsub) { queueUnsub(); queueUnsub = null; }
        deleteDoc(doc(db, 'imposterQueue', session.uid)).catch(() => {});
        getDoc(doc(db, 'imposterLobbies', data.lobbyId)).then(m => {
          const mdata = m.data();
          if (!mdata) return;
          beginRound(data.lobbyId, mdata.playerIds, mdata.players);
        });
      }
    });

    let scanned = 0;
    const scanInterval = setInterval(async () => {
      if (!queueUnsub) { clearInterval(scanInterval); return; }
      scanned++;
      if (scanned > 40) { clearInterval(scanInterval); return; }
      const found = await tryFormGroup(session);
      if (found) {
        clearInterval(scanInterval);
        if (queueUnsub) { queueUnsub(); queueUnsub = null; }
        deleteDoc(doc(db, 'imposterQueue', session.uid)).catch(() => {});
        const snap = await getDoc(doc(db, 'imposterLobbies', found));
        const data = snap.data();
        beginRound(found, data.playerIds, data.players);
      }
    }, 3000);
  } catch (err) {
    document.getElementById('impWaitError').textContent = 'Could not search for players: ' + (err.message || err.code || 'unknown error');
    document.getElementById('impWaitError').classList.remove('hidden');
  }
}

export async function createLobbyRoom() {
  const session = getSession();
  if (!session) return;

  showScreen('impWaitScreen');
  document.getElementById('impWaitLead').textContent = 'CREATING LOBBY...';
  document.getElementById('impRoomCodeDisplay').classList.add('hidden');
  document.getElementById('impWaitPlayers').innerHTML = '';
  document.getElementById('impWaitError').classList.add('hidden');

  const code = makeCode();
  try {
    await setDoc(doc(db, 'imposterLobbies', code), {
      status: 'waiting',
      playerIds: [session.uid],
      players: { [session.uid]: { username: session.username } },
      createdAt: serverTimestamp(),
      startedAt: null,
      votes: {},
      ejectedUid: null,
      imposterUidPublic: null,
      result: null
    });
  } catch (err) {
    document.getElementById('impWaitError').textContent = 'Could not create lobby: ' + (err.message || err.code || 'unknown error');
    document.getElementById('impWaitError').classList.remove('hidden');
    return;
  }
  hostedLobbyCode = code;

  const codeEl = document.getElementById('impRoomCodeDisplay');
  codeEl.textContent = code;
  codeEl.classList.remove('hidden');
  renderWaitPlayers([session.uid], { [session.uid]: { username: session.username } });

  watchLobby(code);
}

export async function joinLobbyRoom(code) {
  const session = getSession();
  const errEl = document.getElementById('impJoinError');
  errEl.classList.add('hidden');
  if (!session || !code || code.length < 4) {
    errEl.textContent = 'Enter a valid lobby code.';
    errEl.classList.remove('hidden');
    return;
  }

  const lobbyRef = doc(db, 'imposterLobbies', code);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(lobbyRef);
      if (!snap.exists()) throw new Error('not-found');
      const data = snap.data();
      if (data.status !== 'waiting') throw new Error('full');
      if (data.playerIds.includes(session.uid)) throw new Error('self');
      if (data.playerIds.length >= LOBBY_SIZE) throw new Error('full');

      const ids = [...data.playerIds, session.uid];
      const playerMap = { ...data.players, [session.uid]: { username: session.username } };

      if (ids.length >= LOBBY_SIZE) {
        const imposterIdx = Math.random() * ids.length | 0;
        tx.update(lobbyRef, {
          playerIds: ids,
          players: playerMap,
          status: 'active',
          startedAt: serverTimestamp()
        });
        ids.forEach((uid, i) => {
          tx.set(doc(db, 'imposterLobbies', code, 'roles', uid), {
            role: i === imposterIdx ? 'imposter' : 'crew'
          });
        });
      } else {
        tx.update(lobbyRef, { playerIds: ids, players: playerMap });
      }
    });

    showScreen('impWaitScreen');
    document.getElementById('impRoomCodeDisplay').classList.add('hidden');
    document.getElementById('impWaitError').classList.add('hidden');
    watchLobby(code);
  } catch (err) {
    errEl.textContent =
      err.message === 'not-found' ? 'Lobby not found.' :
      err.message === 'self' ? 'You already joined this lobby.' :
      err.message === 'full' ? 'That lobby is full or already started.' :
      'Could not join lobby: ' + (err.message || err.code || 'unknown error');
    errEl.classList.remove('hidden');
  }
}

export async function cancelLobbyMatchmaking() {
  const session = getSession();
  if (queueUnsub) { queueUnsub(); queueUnsub = null; }
  if (lobbyWatchUnsub) { lobbyWatchUnsub(); lobbyWatchUnsub = null; }
  if (session) {
    try { await deleteDoc(doc(db, 'imposterQueue', session.uid)); } catch (e) {}
  }
  if (hostedLobbyCode) {
    try { await deleteDoc(doc(db, 'imposterLobbies', hostedLobbyCode)); } catch (e) {}
    hostedLobbyCode = null;
  }
}
