import { Page, expect } from '@playwright/test';

// Staff 2-step login. In dev/test the login response returns otp_code on screen.
export async function loginStaff(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.locator('form input[type="text"]').first().fill(username);
  await page.locator('form input[type="password"]').fill(password);
  const [resp] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/auth/login') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'המשך' }).click(),
  ]);
  const body = await resp.json();
  expect(body.otp_code, 'dev OTP echo').toBeTruthy();
  await page.locator('input[placeholder="000000"]').fill(body.otp_code);
  await page.getByRole('button', { name: 'התחברות' }).click();
  await expect(page.getByRole('button', { name: 'יציאה' })).toBeVisible();
}

export async function loginAdmin(page: Page) {
  await loginStaff(page, 'admin', 'admin123');
}

// Diver OTP login. The temp code is shown on screen in dev.
export async function loginDiver(page: Page, phone: string, personalNumber: string) {
  await page.goto('/diver-login');
  await page.locator('input[type="tel"]').fill(phone);
  await page.locator('form input[type="text"]').fill(personalNumber);
  await page.getByRole('button', { name: 'שלח קוד אימות' }).click();
  const codeBox = page.locator('.font-mono.font-bold');
  await expect(codeBox).toBeVisible();
  const code = (await codeBox.textContent())!.trim();
  await page.locator('input[placeholder="000000"]').fill(code);
  await page.getByRole('button', { name: 'אימות' }).click();
}

// DiverForm labels aren't linked to inputs (no htmlFor), so target the input
// that immediately follows a label by its text.
export function diverField(page: Page, label: string) {
  return page.locator(`xpath=//label[contains(normalize-space(.),"${label}")]/following-sibling::input[1]`);
}

// DiverList / access log render both a hidden mobile card list and a desktop
// table; scope name lookups to the (visible) table to avoid the hidden copy.
export function rowText(page: Page, text: string) {
  return page.locator('table').getByText(text);
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'יציאה' }).click();
  await expect(page).toHaveURL(/\/login$/);
}
