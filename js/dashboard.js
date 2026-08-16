import { setSession, getSession, updateSessionHighScore } from "./session.js";
import { showScreen, returnToDashboard } from "./screens.js";
import { startRandomMatch, createRoom, joinRoom, cancelMatchmaking } from "./versus.js";
import { renderLeaderboard } from "./leaderboard.js";

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
  const session = getSession();
  window.RA_soloFromDashboard = true;
  window.RA_onGameOver = ({ score }) => {
    const session = getSession();
    if (session && score > (session.highScore || 0)) updateSessionHighScore(score);
  };
  showScreen('gameApp');
  window.startGame(session ? session.highScore || 0 : 0);
});

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

export function showDashboard({ uid, username, highScore }) {
  setSession({ uid, username, highScore });
  document.getElementById('dashPlayerName').textContent = username.toUpperCase();
  document.getElementById('dashHighScore').textContent = highScore || 0;
  showScreen('dashboardScreen');
  renderLeaderboard();
}
