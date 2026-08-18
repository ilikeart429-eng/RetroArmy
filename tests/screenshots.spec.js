const { test, expect } = require('@playwright/test');
const { openApp, signIn, startSoloGame, dropPieces } = require('./helpers');

test.beforeEach(async ({ page }) => openApp(page));

test('leaderboard', async ({ page }) => {
  await signIn(page);
  await expect(page.locator('#leaderboardList .lb-row')).toHaveCount(5);

  const leaderboard = page.locator('#dashboardScreen .panel', { hasText: 'HIGH SCORES' });
  await expect(leaderboard).toHaveScreenshot('leaderboard.png');
});

test('solo game after two pieces dropped', async ({ page }) => {
  await signIn(page);
  await startSoloGame(page);
  await dropPieces(page, 2);

  await expect(page.locator('#gameApp')).toHaveScreenshot('solo-two-pieces.png');
});
