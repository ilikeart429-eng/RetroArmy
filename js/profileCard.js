import { db } from "./firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

function setAvatar(imgEl, initialEl, avatarThumb, name) {
  if (avatarThumb) {
    imgEl.src = avatarThumb;
    imgEl.classList.remove('hidden');
    initialEl.classList.add('hidden');
  } else {
    imgEl.classList.add('hidden');
    initialEl.classList.remove('hidden');
    initialEl.textContent = (name || '?').trim().charAt(0).toUpperCase() || '?';
  }
}

export async function showProfileCard(uid) {
  if (!uid) return;
  const overlay = document.getElementById('profileCardOverlay');
  overlay.classList.remove('hidden');
  document.getElementById('profileCardName').textContent = 'LOADING...';
  document.getElementById('profileCardCoins').textContent = '';
  document.getElementById('profileCardEasy').textContent = '0';
  document.getElementById('profileCardHard').textContent = '0';
  document.getElementById('profileCardExpert').textContent = '0';

  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const data = snap.exists() ? snap.data() : {};
    const name = (data.displayName || data.username || 'PLAYER').toUpperCase();
    document.getElementById('profileCardName').textContent = name;
    document.getElementById('profileCardCoins').textContent = `${data.blockCoins || 0} BLOCK COINS`;
    document.getElementById('profileCardEasy').textContent = data.highScoreEasy || 0;
    document.getElementById('profileCardHard').textContent = data.highScoreHard || 0;
    document.getElementById('profileCardExpert').textContent = data.highScoreExpert || 0;
    setAvatar(
      document.getElementById('profileCardAvatarImg'),
      document.getElementById('profileCardAvatarInitial'),
      data.avatarThumb,
      data.displayName || data.username
    );
  } catch (e) {
    document.getElementById('profileCardName').textContent = 'COULD NOT LOAD PROFILE';
  }
}

document.getElementById('profileCardCloseBtn').addEventListener('click', () => {
  document.getElementById('profileCardOverlay').classList.add('hidden');
});
