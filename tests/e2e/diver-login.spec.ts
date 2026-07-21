import { test, expect } from '../fixtures';
import { loginDiver, loginAdmin, rowText } from '../helpers';

test('diver login (existing phone) shows self status view', async ({ page }) => {
  await loginDiver(page, '0501110001', '1000001');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'הסטטוס שלי' })).toBeVisible();
  await expect(page.getByText('אורי כהן').first()).toBeVisible();
});

test('diver login: unknown details shows contact hint', async ({ page }) => {
  await page.goto('/diver-login');
  await page.locator('input[type="tel"]').fill('0500000000');
  await page.locator('form input[type="text"]').fill('9999999');
  await page.getByRole('button', { name: 'שלח קוד אימות' }).click();
  await expect(page.getByText(/מיכאל חמדי/)).toBeVisible();
});

test('diver login: wrong OTP shows error', async ({ page }) => {
  await page.goto('/diver-login');
  await page.locator('input[type="tel"]').fill('0501110001');
  await page.locator('form input[type="text"]').fill('1000001');
  await page.getByRole('button', { name: 'שלח קוד אימות' }).click();
  await expect(page.locator('.font-mono.font-bold')).toBeVisible();
  await page.locator('input[placeholder="000000"]').fill('000000');
  await page.getByRole('button', { name: 'אימות' }).click();
  await expect(page.locator('.bg-red-50')).toBeVisible();
});

test('phone-less diver claims a number; record gets flagged for staff', async ({ page }) => {
  // Diver 1000002 (נועה לוי) has no phone on file — supply one at login.
  await loginDiver(page, '0539990002', '1000002');
  await expect(page.getByRole('heading', { name: 'הסטטוס שלי' })).toBeVisible();

  // Staff should now see the record flagged with the self-phone badge.
  await loginAdmin(page);
  await page.getByPlaceholder('חיפוש לפי שם או מספר אישי...').fill('לוי');
  await page.getByRole('button', { name: 'חיפוש' }).click();
  await expect(rowText(page, 'טלפון עצמי').first()).toBeVisible();

  // And the diver form shows the verification banner.
  await rowText(page, 'נועה לוי').first().click();
  await expect(page.getByText(/הוזן על ידו בעת הכניסה הראשונה/)).toBeVisible();
});
