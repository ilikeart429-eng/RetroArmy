import { db } from "./firebase.js";
import {
  collection, query, orderBy, limit, where, getDocs, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getSession } from "./session.js";

const TOP_N = 5;

async function fetchTop() {
  const snap = await getDocs(query(collection(db, 'users'), orderBy('highScore', 'desc'), limit(TOP_N)));
  return snap.docs.map(d => ({
    uid: d.id,
    username: d.data().username || 'PLAYER',
    highScore: d.data().highScore || 0
  }));
}

async function fetchRank(highScore) {
  const snap = await getCountFromServer(query(collection(db, 'users'), where('highScore', '>', highScore)));
  return snap.data().count + 1;
}

function makeRow({ rank, username, score, isMe }) {
  const row = document.createElement('div');
  row.className = isMe ? 'lb-row lb-me' : 'lb-row';
  const rankEl = document.createElement('span');
  rankEl.className = 'lb-rank';
  rankEl.textContent = rank;
  const nameEl = document.createElement('span');
  nameEl.className = 'lb-name';
  nameEl.textContent = username.toUpperCase();
  const scoreEl = document.createElement('span');
  scoreEl.className = 'lb-score';
  scoreEl.textContent = score;
  row.append(rankEl, nameEl, scoreEl);
  return row;
}

function makeSeparator() {
  const sep = document.createElement('div');
  sep.className = 'lb-sep';
  sep.textContent = '• • •';
  return sep;
}

export async function renderLeaderboard() {
  const session = getSession();
  const list = document.getElementById('leaderboardList');
  const status = document.getElementById('leaderboardStatus');
  if (!list || !session) return;

  list.replaceChildren();
  status.textContent = 'LOADING...';
  status.classList.remove('hidden');

  try {
    const top = await fetchTop();
    for (const [i, entry] of top.entries()) {
      list.append(makeRow({
        rank: i + 1,
        username: entry.username,
        score: entry.highScore,
        isMe: entry.uid === session.uid
      }));
    }

    if (!top.some(entry => entry.uid === session.uid)) {
      const myScore = session.highScore || 0;
      if (top.length) list.append(makeSeparator());
      list.append(makeRow({
        rank: await fetchRank(myScore),
        username: session.username,
        score: myScore,
        isMe: true
      }));
    }

    status.classList.toggle('hidden', list.childElementCount > 0);
    if (!list.childElementCount) status.textContent = 'NO SCORES YET';
  } catch (err) {
    status.textContent = 'Could not load leaderboard: ' + (err.message || err.code || 'unknown error');
    status.classList.remove('hidden');
  }
}
