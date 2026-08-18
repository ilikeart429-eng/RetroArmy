const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');

const FIREBASE_STUB = fs.readFileSync(path.join(__dirname, 'fixtures/firebase-stub.js'), 'utf8');
const LOADING_MS = 5000;

const ME = { username: 'retroplayer', password: 'hunter2', uid: 'uid-me' };

// Rank 3 of the top five, so the leaderboard renders the "me" highlight inline.
const users = (myHighScore = 5200) => ({
  'uid-nova': { username: 'nova', highScore: 9800 },
  'uid-blip': { username: 'blip', highScore: 7400 },
  [ME.uid]: { username: ME.username, highScore: myHighScore },
  'uid-zed': { username: 'zed', highScore: 3100 },
  'uid-kit': { username: 'kit', highScore: 900 },
  'uid-oldtimer': { username: 'oldtimer', highScore: 250 }
});

const seedData = (myHighScore) => ({
  accounts: { [`${ME.username}@retroarmy.local`]: { password: ME.password, uid: ME.uid } },
  collections: { users: users(myHighScore) }
});

// Freezes time and the piece sequence so canvas screenshots are reproducible.
async function openApp(page, data = seedData()) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.addInitScript(seed => {
    window.__RA_DATA = seed;
    let state = 0x9e3779b9;
    Math.random = () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, data);
  await page.route('https://www.gstatic.com/firebasejs/**', route =>
    route.fulfill({ contentType: 'text/javascript', body: FIREBASE_STUB })
  );
  await page.goto('/');
}

async function skipLoadingScreen(page) {
  await page.clock.runFor(LOADING_MS);
}

async function signIn(page, { username = ME.username, password = ME.password } = {}) {
  await page.locator('#signInChoice').click();
  await page.locator('#authUsername').fill(username);
  await page.locator('#authPassword').fill(password);
  await page.locator('#authSubmit').click();
  await skipLoadingScreen(page);
}

async function playAsGuest(page) {
  await page.locator('#guestChoice').click();
  await skipLoadingScreen(page);
}

async function startSoloGame(page) {
  await page.locator('#dashPlayBtn').click();
  await page.locator('#modeSoloBtn').click();
  await expect(page.locator('#gameApp')).toBeVisible();
}

// The gravity timer only advances when the test clock does, so the board holds
// still after the drops.
async function dropPieces(page, count) {
  for (let i = 0; i < count; i++) await page.keyboard.press(' ');
}

module.exports = { ME, seedData, openApp, skipLoadingScreen, signIn, playAsGuest, startSoloGame, dropPieces };
