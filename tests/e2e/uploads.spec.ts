import path from 'path';
import { test, expect } from '../fixtures';
import { loginAdmin } from '../helpers';

const fixtures = path.resolve(__dirname, '../fixtures');

test.beforeEach(async ({ page }) => { await loginAdmin(page); });

test('divers import: preview, map (auto), import with created/updated', async ({ page }) => {
  await page.getByRole('link', { name: 'ייבוא צוללים' }).click();
  await expect(page.getByRole('heading', { name: 'ייבוא מאקסל' })).toBeVisible();

  // Download the sample file (hits /api/upload/sample).
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/upload/sample')),
    page.getByRole('button', { name: 'הורד קובץ דוגמה' }).click(),
  ]);

  await page.locator('input[type="file"]').setInputFiles(path.join(fixtures, 'divers.xlsx'));

  // Auto-mapping fills personal_number; the import button becomes enabled.
  await expect(page.getByText('מיפוי עמודות')).toBeVisible();
  await page.getByRole('button', { name: /ייבוא \d+ שורות/ }).click();

  await expect(page.getByText(/יובאו \d+ מתוך \d+ שורות בהצלחה/)).toBeVisible();
  await expect(page.getByText(/חדשים,.*עודכנו/)).toBeVisible();
});

test('activities import', async ({ page }) => {
  await page.getByRole('link', { name: 'ייבוא פעילויות' }).click();
  await expect(page.getByRole('heading', { name: 'ייבוא פעילויות' })).toBeVisible();

  await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/activities/import/sample')),
    page.getByRole('button', { name: 'הורד קובץ דוגמה' }).click(),
  ]);

  await page.locator('input[type="file"]').setInputFiles(path.join(fixtures, 'activities.xlsx'));
  await expect(page.getByText('מיפוי עמודות')).toBeVisible();
  await page.getByRole('button', { name: /ייבוא \d+ שורות/ }).click();
  await expect(page.getByText(/יובאו \d+ מתוך \d+ שורות בהצלחה/)).toBeVisible();
});
