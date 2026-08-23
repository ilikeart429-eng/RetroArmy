const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');

const FIREBASE_STUB = fs.readFileSync(path.join(__dirname, 'fixtures/firebase-stub.js'), 'utf8');
const LOADING_MS = 5000;

const ME = { username: 'retroplayer', password: 'hunter2', uid: 'uid-me', blockCoins: 1275 };

// On EASY I sit at rank 3 of the top five (inline "me" highlight); on HARD I
// lead. Expert scores differ again so tab switches are visible.
const PLAYERS = [
  { uid: 'uid-nova', username: 'nova', easy: 9800, hard: 1200, expert: 2400 },
  { uid: 'uid-blip', username: 'blip', easy: 7400, hard: 6000, expert: 1800 },
  { uid: ME.uid, username: ME.username, easy: 5200, hard: 8000, expert: 600 },
  { uid: 'uid-zed', username: 'zed', easy: 3100, hard: 400, expert: 1100 },
  { uid: 'uid-kit', username: 'kit', easy: 900, hard: 3000, expert: 300 },
  { uid: 'uid-oldtimer', username: 'oldtimer', easy: 250, hard: 100, expert: 50 }
];

const seedData = (myEasyHighScore = 5200) => ({
  accounts: { [`${ME.username}@retroarmy.local`]: { password: ME.password, uid: ME.uid } },
  collections: {
    users: Object.fromEntries(PLAYERS.map(player => {
      const easy = player.uid === ME.uid ? myEasyHighScore : player.easy;
      return [player.uid, {
        username: player.username,
        highScore: Math.max(easy, player.hard, player.expert),
        highScoreEasy: easy,
        highScoreHard: player.hard,
        highScoreExpert: player.expert,
        blockCoins: player.uid === ME.uid ? ME.blockCoins : 0
      }];
    }))
  }
});

const START_TIME = new Date('2026-01-01T00:00:00Z');

// Freezes time and the piece sequence so canvas screenshots are reproducible.
// install() alone still advances with real time, so the clock is paused once
// the page is up - from then on gravity only moves when a test says so.
async function openApp(page, data = seedData()) {
  await page.clock.install({ time: START_TIME });
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
  await page.clock.pauseAt(new Date(START_TIME.getTime() + 1000));
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

const DIFFICULTY_BUTTONS = { easy: '#diffEasyBtn', hard: '#diffHardBtn', expert: '#diffExpertBtn' };

async function startSoloGame(page, difficulty = 'easy') {
  await page.locator('#dashPlayClassicBtn').click();
  await page.locator('#modeSoloBtn').click();
  await page.locator(DIFFICULTY_BUTTONS[difficulty]).click();
  await expect(page.locator('#gameApp')).toBeVisible();
}

// The gravity timer only advances when the test clock does, so the board holds
// still after the drops.
async function dropPieces(page, count) {
  for (let i = 0; i < count; i++) await page.keyboard.press(' ');
}

module.exports = { ME, seedData, openApp, skipLoadingScreen, signIn, playAsGuest, startSoloGame, dropPieces };
