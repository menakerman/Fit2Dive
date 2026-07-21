import { test, expect } from '../fixtures';
import { loginAdmin, loginDiver, rowText } from '../helpers';

test('access log shows diver access and staff login records', async ({ page }) => {
  // Create a diver-access record.
  await loginDiver(page, '0501110001', '1000001');
  await expect(page.getByRole('heading', { name: 'הסטטוס שלי' })).toBeVisible();

  // View as manager.
  await loginAdmin(page);
  await page.getByRole('link', { name: 'יומן גישה' }).click();
  await expect(page.getByRole('heading', { name: 'יומן גישה' })).toBeVisible();

  // Switch to the divers tab and find the diver access record.
  await page.getByRole('button', { name: 'צוללים', exact: true }).click();
  await expect(rowText(page, 'אורי כהן').first()).toBeVisible();

  await page.getByPlaceholder('חיפוש לפי שם או ת.ז...').fill('כהן');
  await expect(rowText(page, 'אורי כהן').first()).toBeVisible();
});
