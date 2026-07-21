import { test, expect } from '../fixtures';
import { loginAdmin, logout } from '../helpers';

// A wrong staff password returns 401; the API layer treats 401 as a session
// failure and redirects to /login, so the user simply stays on the login page.
test('staff login: wrong password keeps you on login', async ({ page }) => {
  await page.goto('/login');
  await page.locator('form input[type="text"]').first().fill('admin');
  await page.locator('form input[type="password"]').fill('nope');
  await page.getByRole('button', { name: 'המשך' }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('button', { name: 'המשך' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'יציאה' })).toHaveCount(0);
});

test('staff login: wrong OTP keeps you unauthenticated', async ({ page }) => {
  await page.goto('/login');
  await page.locator('form input[type="text"]').first().fill('admin');
  await page.locator('form input[type="password"]').fill('admin123');
  await page.getByRole('button', { name: 'המשך' }).click();
  await page.locator('input[placeholder="000000"]').fill('000000');
  await page.getByRole('button', { name: 'התחברות' }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('button', { name: 'יציאה' })).toHaveCount(0);
});

test('staff login + logout', async ({ page }) => {
  await loginAdmin(page);
  await expect(page.getByRole('heading', { name: 'רשימת צוללים' })).toBeVisible();
  await logout(page);
});
