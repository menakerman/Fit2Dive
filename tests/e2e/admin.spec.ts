import path from 'path';
import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { loginAdmin } from '../helpers';

const fixtures = path.resolve(__dirname, '../fixtures');

// Click a per-row action button (ערוך / מחק) for the list item named `name`,
// taking the nearest row ancestor so it doesn't match an outer container.
const rowBtn = (page: Page, name: string, btn: string) =>
  page.locator(`xpath=//span[normalize-space()="${name}"]/ancestor::div[contains(@class,"bg-gray-50")][1]//button[normalize-space()="${btn}"]`);

test.beforeEach(async ({ page }) => {
  page.on('dialog', d => d.accept()); // auto-accept delete confirmations
  await loginAdmin(page);
  await page.getByRole('link', { name: 'ניהול' }).click();
  await expect(page.getByRole('button', { name: 'משתמשים' })).toBeVisible();
});

test('certifications: add, edit, delete a level', async ({ page }) => {
  await page.getByRole('button', { name: 'רמות הסמכה' }).click();
  await page.getByPlaceholder('שם רמה').fill('כוכב בדיקה');
  await page.getByPlaceholder('תיאור').fill('רמת בדיקה');
  await page.getByRole('button', { name: 'הוסף', exact: true }).click();
  await expect(page.getByText('כוכב בדיקה').first()).toBeVisible();

  await rowBtn(page, 'כוכב בדיקה', 'ערוך').click();
  await page.getByPlaceholder('תיאור').fill('רמת בדיקה מעודכנת');
  await page.getByRole('button', { name: 'עדכן', exact: true }).click();

  await rowBtn(page, 'כוכב בדיקה', 'מחק').click();
  await expect(page.getByText('כוכב בדיקה')).toHaveCount(0);
});

test('teams: add, edit, delete a team', async ({ page }) => {
  await page.getByRole('button', { name: 'צוותים' }).click();
  await page.getByPlaceholder('שם צוות').fill('צוות בדיקה');
  await page.getByRole('button', { name: 'הוסף', exact: true }).click();
  await expect(page.getByText('צוות בדיקה').first()).toBeVisible();

  await rowBtn(page, 'צוות בדיקה', 'ערוך').click();
  await page.getByPlaceholder('שם צוות').fill('צוות בדיקה ב');
  await page.getByRole('button', { name: 'עדכן', exact: true }).click();
  await expect(page.getByText('צוות בדיקה ב').first()).toBeVisible();

  await rowBtn(page, 'צוות בדיקה ב', 'מחק').click();
  await expect(page.getByText('צוות בדיקה ב')).toHaveCount(0);
});

test('users: add a user', async ({ page }) => {
  await page.getByRole('button', { name: 'משתמשים' }).click();
  await page.getByRole('button', { name: '+ הוסף משתמש' }).click();
  await page.getByPlaceholder('שם משתמש').fill('newsec');
  await page.getByPlaceholder('סיסמה', { exact: true }).fill('Pass12345!');
  await page.getByPlaceholder('שם מלא').fill('משתמש חדש');
  await page.getByPlaceholder('טלפון (לקוד כניסה)').fill('0521230000');
  await page.getByRole('button', { name: 'הוסף', exact: true }).click();
  await expect(page.getByText('משתמש חדש').first()).toBeVisible();

  // Edit then delete that user (exercises PUT + DELETE on /users).
  await rowBtn(page, 'משתמש חדש', 'ערוך').click();
  await page.getByPlaceholder('שם מלא').fill('משתמש ערוך');
  await page.getByRole('button', { name: 'עדכן', exact: true }).click();
  await expect(page.getByText('משתמש ערוך').first()).toBeVisible();

  await rowBtn(page, 'משתמש ערוך', 'מחק').click();
  await expect(page.getByText('משתמש ערוך')).toHaveCount(0);
});

test('users: import from excel', async ({ page }) => {
  await page.getByRole('button', { name: 'משתמשים' }).click();
  await page.getByRole('button', { name: 'ייבוא מאקסל' }).click();
  await page.locator('input[type="file"]').setInputFiles(path.join(fixtures, 'users.xlsx'));
  const [resp] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/users/import') && r.request().method() === 'POST'),
    page.getByRole('button', { name: /ייבוא \d+ משתמשים/ }).click(),
  ]);
  expect(resp.status()).toBe(200);
});

test('settings: share links point at custom domain, QR present, save works', async ({ page }) => {
  await page.getByRole('button', { name: 'הגדרות' }).click();

  await expect(page.getByText('https://fit2dive.bimboapp.com/diver-login')).toBeVisible();
  await expect(page.getByText('https://fit2dive.bimboapp.com/login')).toBeVisible();

  // QR images rendered from those URLs.
  await expect(page.getByRole('img', { name: /QR/ }).first()).toBeVisible();

  await page.getByRole('button', { name: 'שמור הגדרות' }).click();
  await expect(page.getByText('נשמר בהצלחה')).toBeVisible();

  // Apply default certification levels + teams (exercises the config route).
  await page.getByPlaceholder('צולל 1, צולל 2, מדריך').fill('בדיקה א, בדיקה ב');
  await page.getByPlaceholder('צוות אלפא, צוות בטא').fill('צוות ברירת מחדל');
  await page.getByRole('button', { name: 'יישם ברירות מחדל' }).click();
  await expect(page.locator('p.text-green-700')).toBeVisible();
});
