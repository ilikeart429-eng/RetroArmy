import { db } from "./firebase.js";
import { collection, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { showScreen } from "./screens.js";

const FIELD_BY_DIFF = { easy: 'highScoreEasy', hard: 'highScoreHard', expert: 'highScoreExpert' };
const TAB_ID_BY_DIFF = { easy: 'lbEasyTab', hard: 'lbHardTab', expert: 'lbExpertTab' };

async function loadLeaderboard(diff) {
  Object.values(TAB_ID_BY_DIFF).forEach(id => document.getElementById(id).classList.remove('active'));
  document.getElementById(TAB_ID_BY_DIFF[diff]).classList.add('active');

  const listEl = document.getElementById('lbList');
  listEl.innerHTML = '<div class="lb-status">LOADING...</div>';

  try {
    const field = FIELD_BY_DIFF[diff];
    const q = query(collection(db, 'users'), orderBy(field, 'desc'), limit(10));
    const snap = await getDocs(q);
    const rows = snap.docs.map(d => d.data()).filter(d => (d[field] || 0) > 0);

    if (!rows.length) {
      listEl.innerHTML = '<div class="lb-status">NO SCORES YET</div>';
      return;
    }

    listEl.innerHTML = rows.map((r, i) => `
      <div class="lb-row">
        <span class="lb-rank">${i + 1}</span>
        <span class="lb-name">${escapeHtml((r.username || '?').toUpperCase())}</span>
        <span class="lb-score">${r[field] || 0}</span>
      </div>
    `).join('');
  } catch (e) {
    listEl.innerHTML = '<div class="lb-status">COULD NOT LOAD LEADERBOARD</div>';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function showLeaderboard() {
  showScreen('leaderboardScreen');
  loadLeaderboard('easy');
}

document.getElementById('lbEasyTab').addEventListener('click', () => loadLeaderboard('easy'));
document.getElementById('lbHardTab').addEventListener('click', () => loadLeaderboard('hard'));
document.getElementById('lbExpertTab').addEventListener('click', () => loadLeaderboard('expert'));
document.getElementById('lbBackBtn').addEventListener('click', () => showScreen('dashboardScreen'));
