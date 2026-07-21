import { test, expect } from '../fixtures';
import { loginAdmin, diverField, rowText } from '../helpers';

test.beforeEach(async ({ page }) => { await loginAdmin(page); });

test('list renders, search, and filters', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'רשימת צוללים' })).toBeVisible();
  await expect(rowText(page, 'אורי כהן').first()).toBeVisible();

  // Search (server-side)
  await page.getByPlaceholder('חיפוש לפי שם או מספר אישי...').fill('חדד');
  await page.getByRole('button', { name: 'חיפוש' }).click();
  await expect(rowText(page, 'דן חדד').first()).toBeVisible();

  // Clear search
  await page.getByPlaceholder('חיפוש לפי שם או מספר אישי...').fill('');
  await page.getByRole('button', { name: 'חיפוש' }).click();

  // Open the filters panel and apply a status filter
  await page.getByRole('button', { name: 'פילטרים' }).click();
  await page.getByRole('button', { name: 'כשיר', exact: true }).click();
  await expect(page.getByText('נקה סינון')).toBeVisible();
  await page.getByText('נקה סינון').click();
});

test('open a diver, see provenance, edit and save', async ({ page }) => {
  await rowText(page, 'אורי כהן').first().click();
  await expect(page).toHaveURL(/\/divers\/\d+$/);
  await expect(page.getByRole('heading', { name: 'עריכת צולל' })).toBeVisible();
  await expect(page.getByText(/עודכן לאחרונה:/)).toBeVisible();

  // Edit notes and save
  const notes = page.locator('textarea').first();
  await notes.fill('הערת בדיקה אוטומטית');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('create a new diver', async ({ page }) => {
  await page.getByRole('button', { name: '+ הוסף צולל' }).click();
  await expect(page.getByRole('heading', { name: 'הוספת צולל' })).toBeVisible();

  await diverField(page, 'שם פרטי').fill('בדיקה');
  await diverField(page, 'שם משפחה').fill('אוטומטית');
  await diverField(page, 'מספר אישי').fill('5550001');
  await diverField(page, 'טלפון').fill('0539990001');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(rowText(page, 'בדיקה אוטומטית').first()).toBeVisible();
});
