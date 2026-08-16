import { db } from "./firebase.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { setSession, getSession, updateSessionHighScore } from "./session.js";
import { showScreen, returnToDashboard } from "./screens.js";
import { startRandomMatch, createRoom, joinRoom, cancelMatchmaking } from "./versus.js";
import { renderLeaderboard } from "./leaderboard.js";

const DIFF_FIELD = { easy: 'highScoreEasy', hard: 'highScoreHard', expert: 'highScoreExpert' };

window.RA_backToDashboard = returnToDashboard;

document.getElementById('dashSignOutBtn').addEventListener('click', () => {
  window.RA_signOut && window.RA_signOut();
});

document.getElementById('dashPlayBtn').addEventListener('click', () => {
  showScreen('modePickerScreen');
});

document.getElementById('modeBackBtn').addEventListener('click', () => {
  showScreen('dashboardScreen');
});

document.getElementById('modeSoloBtn').addEventListener('click', () => {
  showScreen('difficultyPickerScreen');
});

document.getElementById('diffBackBtn').addEventListener('click', () => {
  showScreen('modePickerScreen');
});

document.getElementById('diffEasyBtn').addEventListener('click', () => startSolo('easy'));
document.getElementById('diffHardBtn').addEventListener('click', () => startSolo('hard'));
document.getElementById('diffExpertBtn').addEventListener('click', () => startSolo('expert'));

function startSolo(difficulty) {
  const session = getSession();
  const field = DIFF_FIELD[difficulty];
  const startingHighScore = session ? (session[field] || 0) : 0;

  window.RA_soloFromDashboard = true;
  window.RA_onGameOver = ({ score }) => {
    const s = getSession();
    if (s && score > (s.highScore || 0)) updateSessionHighScore(score);
  };
  window.saveHighScore = (score) => {
    const s = getSession();
    if (!s) return;
    const updates = { [field]: score };
    s[field] = score;
    if (score > (s.highScore || 0)) {
      updates.highScore = score;
      s.highScore = score;
    }
    updateDoc(doc(db, 'users', s.uid), updates).catch(() => {});
  };

  showScreen('gameApp');
  window.startGame(startingHighScore, difficulty);
}

document.getElementById('modeVersusBtn').addEventListener('click', () => {
  showScreen('versusPickerScreen');
});

document.getElementById('vsPickerBackBtn').addEventListener('click', () => {
  showScreen('modePickerScreen');
});

document.getElementById('vsRandomBtn').addEventListener('click', () => {
  startRandomMatch();
});

document.getElementById('vsCreateRoomBtn').addEventListener('click', () => {
  createRoom();
});

document.getElementById('vsJoinRoomBtn').addEventListener('click', () => {
  document.getElementById('vsJoinCodeInput').value = '';
  document.getElementById('vsJoinError').classList.add('hidden');
  showScreen('vsJoinScreen');
});

document.getElementById('vsJoinBackBtn').addEventListener('click', () => {
  showScreen('versusPickerScreen');
});

document.getElementById('vsJoinSubmitBtn').addEventListener('click', () => {
  const code = document.getElementById('vsJoinCodeInput').value.trim().toUpperCase();
  joinRoom(code);
});

document.getElementById('vsCancelBtn').addEventListener('click', () => {
  cancelMatchmaking();
  showScreen('versusPickerScreen');
});

export function showDashboard({ uid, username, highScore, highScoreEasy, highScoreHard, highScoreExpert }) {
  setSession({
    uid,
    username,
    highScore: highScore || 0,
    highScoreEasy: highScoreEasy || 0,
    highScoreHard: highScoreHard || 0,
    highScoreExpert: highScoreExpert || 0
  });
  document.getElementById('dashPlayerName').textContent = username.toUpperCase();
  document.getElementById('dashHighScore').textContent = highScore || 0;
  showScreen('dashboardScreen');
  renderLeaderboard('easy');
}
