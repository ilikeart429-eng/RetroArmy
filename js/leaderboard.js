import { db } from "./firebase.js";
import {
  collection, query, orderBy, limit, where, getDocs, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getSession } from "./session.js";

const TOP_N = 5;
const FIELD_BY_DIFF = { easy: 'highScoreEasy', hard: 'highScoreHard', expert: 'highScoreExpert' };
const TAB_ID_BY_DIFF = { easy: 'lbEasyTab', hard: 'lbHardTab', expert: 'lbExpertTab' };

let activeDiff = 'easy';

async function fetchTop(field) {
  const snap = await getDocs(query(collection(db, 'users'), orderBy(field, 'desc'), limit(TOP_N)));
  return snap.docs.map(d => ({
    uid: d.id,
    username: d.data().username || 'PLAYER',
    score: d.data()[field] || 0
  }));
}

async function fetchRank(field, score) {
  const snap = await getCountFromServer(query(collection(db, 'users'), where(field, '>', score)));
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

export async function renderLeaderboard(difficulty) {
  activeDiff = difficulty || activeDiff || 'easy';
  Object.entries(TAB_ID_BY_DIFF).forEach(([diff, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', diff === activeDiff);
  });

  const field = FIELD_BY_DIFF[activeDiff];
  const session = getSession();
  const list = document.getElementById('leaderboardList');
  const status = document.getElementById('leaderboardStatus');
  if (!list || !session) return;

  list.replaceChildren();
  status.textContent = 'LOADING...';
  status.classList.remove('hidden');

  try {
    const top = await fetchTop(field);
    for (const [i, entry] of top.entries()) {
      list.append(makeRow({
        rank: i + 1,
        username: entry.username,
        score: entry.score,
        isMe: entry.uid === session.uid
      }));
    }

    if (!top.some(entry => entry.uid === session.uid)) {
      const myScore = session[field] || 0;
      if (top.length) list.append(makeSeparator());
      list.append(makeRow({
        rank: await fetchRank(field, myScore),
        username: session.username,
        score: myScore,
        isMe: true
      }));
    }

    status.classList.toggle('hidden', list.childElementCount > 0);
    if (!list.childElementCount) status.textContent = 'NO SCORES YET';
  } catch (err) {
    status.textContent = 'Could not load high scores: ' + (err.message || err.code || 'unknown error');
    status.classList.remove('hidden');
  }
}

document.getElementById('lbEasyTab').addEventListener('click', () => renderLeaderboard('easy'));
document.getElementById('lbHardTab').addEventListener('click', () => renderLeaderboard('hard'));
document.getElementById('lbExpertTab').addEventListener('click', () => renderLeaderboard('expert'));
