import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { showDashboard } from "./dashboard.js";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_DOMAIN = "@retroarmy.local";
const usernameToEmail = name => name.trim().toLowerCase() + EMAIL_DOMAIN;

const authScreen = document.getElementById('authScreen');
const loadingScreen = document.getElementById('loadingScreen');
const gameApp = document.getElementById('gameApp');
const choiceView = document.getElementById('authChoice');
const formView = document.getElementById('authForm');
const formTitle = document.getElementById('authFormTitle');
const usernameInput = document.getElementById('authUsername');
const passwordInput = document.getElementById('authPassword');
const confirmRow = document.getElementById('authConfirmRow');
const confirmInput = document.getElementById('authConfirm');
const errorEl = document.getElementById('authError');
const submitBtn = document.getElementById('authSubmit');
const backBtn = document.getElementById('authBack');
const playerNameEl = document.getElementById('playerName');
const signOutBtn = document.getElementById('signOutBtn');

let mode = null; // 'signin' | 'signup'

const MIN_LOADING_MS = 5000;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function showLoading() {
  loadingScreen.classList.remove('hidden');
}

function hideLoading() {
  loadingScreen.classList.add('hidden');
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.toggle('hidden', !msg);
}

function openForm(kind) {
  mode = kind;
  showError('');
  usernameInput.value = '';
  passwordInput.value = '';
  confirmInput.value = '';
  formTitle.textContent = kind === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN';
  confirmRow.classList.toggle('hidden', kind !== 'signup');
  confirmInput.required = kind === 'signup';
  submitBtn.textContent = kind === 'signup' ? 'CREATE' : 'SIGN IN';
  choiceView.classList.add('hidden');
  formView.classList.remove('hidden');
  usernameInput.focus();
}

function backToChoice() {
  formView.classList.add('hidden');
  choiceView.classList.remove('hidden');
  showError('');
}

function friendlyError(err) {
  switch (err.code) {
    case 'auth/email-already-in-use': return 'That username is already taken.';
    case 'auth/weak-password': return 'Password must be at least 6 characters.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'Incorrect username or password.';
    case 'auth/invalid-email': return 'Usernames can only use letters, numbers, and underscores (3-20 characters).';
    case 'auth/too-many-requests': return 'Too many attempts. Try again later.';
    default: return err.message || 'Something went wrong. Try again.';
  }
}

function enterGame({ username, highScore, mode: playMode, uid }) {
  window.saveHighScore = (score) => {
    if (playMode === 'guest') {
      localStorage.setItem('blocksHighScore', score);
    } else if (uid) {
      updateDoc(doc(db, 'users', uid), { highScore: score }).catch(() => {});
    }
  };

  hideLoading();
  authScreen.classList.add('hidden');

  if (playMode === 'guest') {
    playerNameEl.textContent = 'GUEST';
    signOutBtn.classList.add('hidden');
    gameApp.classList.remove('hidden');
    window.startGame(highScore || 0);
  } else {
    playerNameEl.textContent = username.toUpperCase();
    signOutBtn.classList.remove('hidden');
    showDashboard({ uid, username, highScore: highScore || 0 });
  }
}

async function handleSignUp() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const confirm = confirmInput.value;

  if (!USERNAME_RE.test(username)) {
    showError('Usernames must be 3-20 characters: letters, numbers, underscores.');
    return;
  }
  if (password.length < 6) {
    showError('Password must be at least 6 characters.');
    return;
  }
  if (password !== confirm) {
    showError('Passwords do not match.');
    return;
  }

  submitBtn.disabled = true;
  showLoading();
  const started = Date.now();
  try {
    const cred = await createUserWithEmailAndPassword(auth, usernameToEmail(username), password);
    await setDoc(doc(db, 'users', cred.user.uid), {
      username,
      highScore: 0,
      createdAt: serverTimestamp()
    });
    await delay(Math.max(0, MIN_LOADING_MS - (Date.now() - started)));
    enterGame({ username, highScore: 0, mode: 'account', uid: cred.user.uid });
  } catch (err) {
    hideLoading();
    showError(friendlyError(err));
  } finally {
    submitBtn.disabled = false;
  }
}

async function handleSignIn() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    showError('Enter your username and password.');
    return;
  }

  submitBtn.disabled = true;
  showLoading();
  const started = Date.now();
  try {
    const cred = await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
    const snap = await getDoc(doc(db, 'users', cred.user.uid));
    const data = snap.exists() ? snap.data() : { username, highScore: 0 };
    await delay(Math.max(0, MIN_LOADING_MS - (Date.now() - started)));
    enterGame({ username: data.username || username, highScore: data.highScore || 0, mode: 'account', uid: cred.user.uid });
  } catch (err) {
    hideLoading();
    showError(friendlyError(err));
  } finally {
    submitBtn.disabled = false;
  }
}

async function playAsGuest() {
  showLoading();
  const highScore = Number(localStorage.getItem('blocksHighScore') || 0);
  await delay(MIN_LOADING_MS);
  enterGame({ username: 'Guest', highScore, mode: 'guest', uid: null });
}

document.getElementById('signInChoice').addEventListener('click', () => openForm('signin'));
document.getElementById('signUpChoice').addEventListener('click', () => openForm('signup'));
document.getElementById('guestChoice').addEventListener('click', playAsGuest);
backBtn.addEventListener('click', backToChoice);
formView.addEventListener('submit', (e) => {
  e.preventDefault();
  if (submitBtn.disabled) return;
  if (mode === 'signup') handleSignUp();
  else handleSignIn();
});
async function handleSignOut() {
  await signOut(auth);
  window.location.reload();
}
signOutBtn.addEventListener('click', handleSignOut);
window.RA_signOut = handleSignOut;
