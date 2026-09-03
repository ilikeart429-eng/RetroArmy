import { db } from "./firebase.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getSession, updateSessionProfile } from "./session.js";
import { showScreen } from "./screens.js";

const AVATAR_SIZE = 48;
const AVATAR_QUALITY = 0.7;

// undefined = no change pending, null = remove avatar, string = new data URI
let pendingAvatarThumb = undefined;

function setPreviewAvatar(thumb, name) {
  const img = document.getElementById('profileAvatarImg');
  const initial = document.getElementById('profileAvatarInitial');
  if (thumb) {
    img.src = thumb;
    img.classList.remove('hidden');
    initial.classList.add('hidden');
  } else {
    img.classList.add('hidden');
    initial.classList.remove('hidden');
    initial.textContent = (name || '?').trim().charAt(0).toUpperCase() || '?';
  }
}

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      img.onerror = () => reject(new Error('Not a valid image'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext('2d');
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
        resolve(canvas.toDataURL('image/jpeg', AVATAR_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function showProfileScreen() {
  const session = getSession();
  if (!session) return;
  pendingAvatarThumb = undefined;
  document.getElementById('profileError').classList.add('hidden');
  document.getElementById('profileStatus').classList.add('hidden');
  document.getElementById('profileDisplayNameInput').value = session.displayName || session.username || '';
  setPreviewAvatar(session.avatarThumb, session.displayName || session.username);
  showScreen('profileScreen');
}

document.getElementById('profileChooseAvatarBtn').addEventListener('click', () => {
  document.getElementById('profileAvatarInput').click();
});

document.getElementById('profileAvatarInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const errorEl = document.getElementById('profileError');
  errorEl.classList.add('hidden');
  try {
    const thumb = await resizeImageFile(file);
    pendingAvatarThumb = thumb;
    setPreviewAvatar(thumb, null);
  } catch (err) {
    errorEl.textContent = 'Could not use that image: ' + (err.message || 'unknown error');
    errorEl.classList.remove('hidden');
  }
  e.target.value = '';
});

document.getElementById('profileRemoveAvatarBtn').addEventListener('click', () => {
  pendingAvatarThumb = null;
  const session = getSession();
  setPreviewAvatar(null, session ? (session.displayName || session.username) : null);
});

document.getElementById('profileSaveBtn').addEventListener('click', async () => {
  const session = getSession();
  if (!session) return;
  const errorEl = document.getElementById('profileError');
  const statusEl = document.getElementById('profileStatus');
  errorEl.classList.add('hidden');
  statusEl.classList.add('hidden');

  const displayName = document.getElementById('profileDisplayNameInput').value.trim();
  if (!displayName || displayName.length > 20) {
    errorEl.textContent = 'Display name must be 1-20 characters.';
    errorEl.classList.remove('hidden');
    return;
  }

  const updates = { displayName };
  if (pendingAvatarThumb !== undefined) updates.avatarThumb = pendingAvatarThumb;

  const saveBtn = document.getElementById('profileSaveBtn');
  saveBtn.disabled = true;
  try {
    await updateDoc(doc(db, 'users', session.uid), updates);
    updateSessionProfile(updates);
    document.getElementById('dashPlayerName').textContent = displayName.toUpperCase();
    pendingAvatarThumb = undefined;
    statusEl.textContent = 'SAVED';
    statusEl.classList.remove('hidden');
  } catch (err) {
    errorEl.textContent = 'Could not save: ' + (err.message || err.code || 'unknown error');
    errorEl.classList.remove('hidden');
  } finally {
    saveBtn.disabled = false;
  }
});

document.getElementById('profileBackBtn').addEventListener('click', () => {
  showScreen('dashboardScreen');
});
