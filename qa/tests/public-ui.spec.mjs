import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main h1')).toBeVisible();
});

test('CampusConnect public entry renders', async ({ page }) => {
  await expect(page).toHaveTitle(/CampusConnect/i);
  await expect(page.getByText('CampusConnect').first()).toBeVisible();
});

test('public page does not overflow horizontally', async ({ page }) => {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
});

test('public page has no axe WCAG A/AA violations', async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map(v => v.id + ': ' + v.nodes.length)).toEqual([]);
});

test('keyboard tab reaches a visible public control when configured', async ({ page }) => {
  const focusables = page.locator('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
  test.skip(await focusables.count() === 0, 'Firebase config missing or public screen has no controls; authenticated flow not evaluated.');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
});
