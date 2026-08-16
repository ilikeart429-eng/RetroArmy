import { db } from "./firebase.js";
import { doc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getSession } from "./session.js";

const COINS_PER_POINTS = 20;

export const DIFF_COIN_MULTIPLIER = { easy: 1, hard: 1.5, expert: 2.5 };
export const VERSUS_COIN_MULTIPLIER = 1.5;
export const IMPOSTER_COIN_MULTIPLIER = 2;

export function computeCoins(score, multiplier) {
  return Math.round((score / COINS_PER_POINTS) * multiplier);
}

export function awardCoins(coins) {
  if (!coins || coins <= 0) return;
  const session = getSession();
  if (!session || !session.uid) return;
  session.blockCoins = (session.blockCoins || 0) + coins;
  const dashEl = document.getElementById('dashBlockCoins');
  if (dashEl) dashEl.textContent = session.blockCoins;
  updateDoc(doc(db, 'users', session.uid), { blockCoins: increment(coins) }).catch(() => {});
}
