import { test, expect } from '../fixtures';
import { loginAdmin, rowText } from '../helpers';

// Auto-accept the confirm() dialogs used by the delete actions.
test.beforeEach(async ({ page }) => {
  page.on('dialog', d => d.accept());
  await loginAdmin(page);
});

test('diver certifications and activities: add and delete', async ({ page }) => {
  await rowText(page, 'אורי כהן').first().click();
  await expect(page.getByRole('heading', { name: 'עריכת צולל' })).toBeVisible();

  // --- Certification (uses /diver-certs) ---
  await page.getByRole('button', { name: '+ הוסף הסמכה' }).click();
  await page.locator('xpath=//label[contains(.,"רמת הסמכה")]/following-sibling::select[1]')
    .selectOption({ index: 1 });
  await page.getByRole('button', { name: 'הוסף', exact: true }).click();
  // A certification row now has a delete link (cert list rendered).
  await expect(page.getByRole('button', { name: 'מחק' }).first()).toBeVisible();

  // --- Activity (uses /activities) ---
  await page.getByRole('button', { name: '+ הוסף פעילות' }).click();
  await page.locator('input[type="date"]').last().fill('2026-05-01');
  await page.getByPlaceholder('למשל: צלילת אימון, תרגיל חיפוש, קורס').fill('צלילת בדיקה');
  await page.getByRole('button', { name: 'הוסף', exact: true }).click();
  await expect(page.getByText('צלילת בדיקה').first()).toBeVisible();

  // Delete the activity we just added (the last "מחק" link; confirm auto-accepted).
  await page.getByRole('button', { name: 'מחק' }).last().click();
  await expect(page.getByText('צלילת בדיקה')).toHaveCount(0);
});
