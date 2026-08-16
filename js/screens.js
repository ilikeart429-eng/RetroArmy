import { getSession } from "./session.js";
import { renderLeaderboard } from "./leaderboard.js";

const SCREEN_IDS = [
  'authScreen',
  'dashboardScreen',
  'modePickerScreen',
  'versusPickerScreen',
  'vsJoinScreen',
  'vsWaitScreen',
  'versusApp',
  'gameApp'
];

export function showScreen(id) {
  for (const sid of SCREEN_IDS) {
    const el = document.getElementById(sid);
    if (el) el.classList.toggle('hidden', sid !== id);
  }
}

export function returnToDashboard() {
  const session = getSession();
  if (session) {
    document.getElementById('dashPlayerName').textContent = session.username.toUpperCase();
    document.getElementById('dashHighScore').textContent = session.highScore || 0;
  }
  showScreen('dashboardScreen');
  renderLeaderboard();
}
