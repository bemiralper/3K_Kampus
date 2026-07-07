import { test, expect } from '@playwright/test';

/**
 * Kimlik modal E2E — oturum gerektirir.
 * Çalıştırmak için: backend + frontend ayakta, geçerli oturum çerezi veya login adımı ekleyin.
 *
 *   cd frontend
 *   npx playwright install chromium
 *   npm run test:e2e
 */
test.describe('Kimlik birleştirme modal', () => {
  test.skip(!process.env.E2E_AUTH_COOKIE, 'E2E_AUTH_COOKIE tanımlı değil — atlanıyor');

  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      {
        name: 'sessionid',
        value: process.env.E2E_AUTH_COOKIE as string,
        domain: 'localhost',
        path: '/',
      },
    ]);
  });

  test('personel sayfası yüklenir', async ({ page }) => {
    await page.goto('/personel');
    await expect(page.getByRole('button', { name: /yeni personel/i })).toBeVisible({ timeout: 15_000 });
  });

  test('kimlik çakışmaları admin sayfası yüklenir', async ({ page }) => {
    await page.goto('/kurum-yonetimi/kimlik-cakismalari');
    await expect(page.getByRole('heading', { name: 'Kimlik Çakışmaları' })).toBeVisible({ timeout: 15_000 });
  });
});
