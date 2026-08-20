const { test, expect } = require('@playwright/test');
const { ME, seedData, openApp, signIn, playAsGuest, startSoloGame, dropPieces } = require('./helpers');

test.beforeEach(async ({ page }) => openApp(page));

test('rejects a wrong password', async ({ page }) => {
  await signIn(page, { password: 'nope123' });
  await expect(page.locator('#authError')).toHaveText('Incorrect username or password.');
  await expect(page.locator('#dashboardScreen')).toBeHidden();
});

test('guest goes straight into a solo game', async ({ page }) => {
  await playAsGuest(page);
  await expect(page.locator('#gameApp')).toBeVisible();
  await expect(page.locator('#playerName')).toHaveText('GUEST');
  await expect(page.locator('#signOutBtn')).toBeHidden();
});

test('signing in shows the dashboard with block coins and the easy leaderboard', async ({ page }) => {
  await signIn(page);
  await expect(page.locator('#dashPlayerName')).toHaveText('RETROPLAYER');
  await expect(page.locator('#dashBlockCoins')).toHaveText(String(ME.blockCoins));

  const rows = page.locator('#leaderboardList .lb-row');
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText('NOVA');
  await expect(page.locator('#lbEasyTab')).toHaveClass(/active/);
  await expect(page.locator('.lb-me')).toContainText('RETROPLAYER');
  await expect(page.locator('.lb-me .lb-score')).toHaveText('5200');
  await expect(page.locator('#leaderboardStatus')).toBeHidden();
});

test('leaderboard tabs switch between difficulty high scores', async ({ page }) => {
  await signIn(page);

  await page.locator('#lbHardTab').click();
  const rows = page.locator('#leaderboardList .lb-row');
  await expect(rows.first()).toContainText('RETROPLAYER');
  await expect(rows.first().locator('.lb-score')).toHaveText('8000');
  await expect(page.locator('#lbHardTab')).toHaveClass(/active/);

  await page.locator('#lbExpertTab').click();
  await expect(rows.first()).toContainText('NOVA');
  await expect(page.locator('.lb-me .lb-score')).toHaveText('600');
});

test('leaderboard appends your rank when you are outside the top five', async ({ page }) => {
  await openApp(page, seedData(100));
  await signIn(page);

  const rows = page.locator('#leaderboardList .lb-row');
  await expect(rows).toHaveCount(6);
  await expect(page.locator('#leaderboardList .lb-sep')).toBeVisible();
  await expect(page.locator('.lb-me .lb-rank')).toHaveText('6');
  await expect(page.locator('.lb-me .lb-score')).toHaveText('100');
});

test('signing out returns to the auth screen', async ({ page }) => {
  await signIn(page);
  await page.locator('#dashSignOutBtn').click();
  await expect(page.locator('#authScreen')).toBeVisible();
  await expect(page.locator('#dashboardScreen')).toBeHidden();
});

test('dropping pieces fills the board', async ({ page }) => {
  await signIn(page);
  await startSoloGame(page);

  const board = page.locator('#game');
  const empty = await board.evaluate(canvas => canvas.toDataURL());
  await dropPieces(page, 2);

  expect(await board.evaluate(canvas => canvas.toDataURL())).not.toBe(empty);
  await expect(page.locator('#level')).toHaveText('1');
  await expect(page.locator('#highscore')).toHaveText('5200');
  await expect(page.locator('#diffBadge')).toBeHidden();
});

test('expert mode carries its own badge and high score', async ({ page }) => {
  await signIn(page);
  await startSoloGame(page, 'expert');

  await expect(page.locator('#diffBadge')).toHaveText('EXPERT');
  await expect(page.locator('#highscore')).toHaveText('600');
});

test('pause button freezes and resumes the game', async ({ page }) => {
  await playAsGuest(page);

  await page.locator('#pauseBtn').click();
  await expect(page.locator('#overlay')).toBeVisible();
  await expect(page.locator('#overlayTitle')).toHaveText('PAUSED');

  await page.locator('#overlay').click();
  await expect(page.locator('#overlay')).toBeHidden();
});

test('game over overlay offers a way back to the dashboard', async ({ page }) => {
  await signIn(page);
  await startSoloGame(page);
  await dropPieces(page, 60);

  await expect(page.locator('#overlayTitle')).toHaveText('GAME OVER');
  await page.locator('#overlayDashboardBtn').click();
  await expect(page.locator('#dashboardScreen')).toBeVisible();
  await expect(page.locator('#dashPlayerName')).toHaveText(ME.username.toUpperCase());
});
