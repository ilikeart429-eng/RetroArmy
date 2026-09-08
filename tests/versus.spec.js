const { test, expect } = require('@playwright/test');
const { openApp, roomData, signIn, joinVersusRoom, clearVersusBottomRow, dropPieces } = require('./helpers');

test('winning blinks a banner and leaves the board on screen', async ({ page }) => {
  await openApp(page, roomData(100), { fixedRandom: 0 });
  await signIn(page);
  await joinVersusRoom(page);

  await clearVersusBottomRow(page);

  await expect(page.locator('#vsMyScore')).toHaveText('100');
  await expect(page.locator('#vsWinBanner')).toBeVisible();
  await expect(page.locator('#vsWinSub')).toHaveText('YOU REACHED THE TARGET SCORE FIRST');
  await expect(page.locator('#vsResultOverlay')).toBeHidden();
  await expect(page.locator('#vsMyCanvas')).toBeVisible();
});

test('the win banner leads back to the dashboard', async ({ page }) => {
  await openApp(page, roomData(100), { fixedRandom: 0 });
  await signIn(page);
  await joinVersusRoom(page);
  await clearVersusBottomRow(page);

  await page.locator('#vsWinBackBtn').click();
  await expect(page.locator('#dashboardScreen')).toBeVisible();
});

test('losing still shows the full result overlay', async ({ page }) => {
  await openApp(page, roomData(5000), { fixedRandom: 0 });
  await signIn(page);
  await joinVersusRoom(page);

  await dropPieces(page, 25);

  await expect(page.locator('#vsResultOverlay')).toBeVisible();
  await expect(page.locator('#vsResultTitle')).toHaveText('YOU LOSE');
  await expect(page.locator('#vsResultSub')).toHaveText('YOU TOPPED OUT');
  await expect(page.locator('#vsWinBanner')).toBeHidden();
});
