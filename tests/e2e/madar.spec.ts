import { test, expect } from '../fixtures';
import { loginStaff, rowText } from '../helpers';

test('madar sees only their team and can open a diver', async ({ page }) => {
  await loginStaff(page, 'madar1', 'Test12345!');
  await expect(page.getByRole('heading', { name: 'רשימת צוללים' })).toBeVisible();

  // Team-alpha divers are visible; a team-bravo diver is not.
  await expect(rowText(page, 'אורי כהן').first()).toBeVisible();
  await expect(page.getByText('גיל בר')).toHaveCount(0);

  await rowText(page, 'דן חדד').first().click();
  await expect(page.getByRole('heading', { name: 'עריכת צולל' })).toBeVisible();
});
