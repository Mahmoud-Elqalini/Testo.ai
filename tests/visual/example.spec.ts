import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');
  // Just a basic test to ensure the suite runs
  await expect(page).toHaveTitle(/Testo|Create Next App/);
});
