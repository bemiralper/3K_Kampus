import { test, expect, type Page } from '@playwright/test';
const student = { id: 1, ad: 'Deneme', soyad: 'Misafir', telefon: '', created_at: null, deneme_sayisi: 1,
  sinavlar: [11, 12].map((id, i) => ({ id: 5, participant_id: id, name: 'LGS Deneme', exam_date: '2099-01-10', acik: true,
    session_id: i + 1, session_name: i ? 'Akşam' : 'Sabah', sessions: [1, 2, 3].map(n => ({ id: n, name: `Oturum ${n}`, session_date: '2099-01-10' })) })) };
async function shell(page: Page) {
  await page.addInitScript(() => {
    for (const key of ['kurum', 'sube', 'egitim_yili']) localStorage.setItem(`3k_active_${key}`, '1');
    document.cookie = 'lms_csrftoken=synthetic';
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = { success: true, data: [] };
    if (path.includes('/auth/api/me')) body = { authenticated: true, user: { id: 1, username: 'mock', is_staff: true, is_superuser: true, role_code: 'super_admin', portals: [{ code: 'admin' }], active_portal: 'admin' } };
    if (path.includes('/legacy/kurumlar')) body = { success: true, data: { kurumlar: [{ id: 1, ad: 'Test', aktif_mi: true }], subeler: [{ id: 1, kurum_id: 1, ad: 'Merkez', aktif_mi: true }], egitim_yillari: [] } };
    await route.fulfill({ json: body });
  });
}
test('liste hatası boş liste olarak sunulmaz ve tekrar denenebilir', async ({ page }) => {
  await shell(page);
  let failed = true;
  await page.route('**/api/ogrenci-kayit/gunu-birlik/', route => route.fulfill({ status: failed ? 500 : 200, json: failed ? { detail: 'Liste hatası' } : { ogrenciler: [student] } }));
  await page.goto('/ogrenciler/misafir');
  await expect(page.getByRole('heading', { name: 'Liste yüklenemedi' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Deneme öğrencisi yok' })).toHaveCount(0);
  failed = false;
  await page.getByRole('button', { name: 'Tekrar dene' }).click();
  await expect(page.locator('.deneme-count')).toHaveText('1 öğrenci');
});
test('eski arama yanıtı yeni sonucu değiştirmez', async ({ page }) => {
  await shell(page);
  let release: (() => void) | undefined;
  await page.route('**/api/ogrenci-kayit/gunu-birlik/**', async route => {
    const q = new URL(route.request().url()).searchParams.get('q');
    if (q === 'Eski') await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: { ogrenciler: [{ ...student, ad: q || 'İlk' }] } });
  });
  await page.goto('/ogrenciler/misafir');
  await expect(page.locator('.deneme-count')).toHaveText('1 öğrenci');
  const input = page.getByRole('textbox', { name: 'Deneme öğrencisi ara' });
  await input.fill('Eski');
  await expect.poll(() => Boolean(release)).toBe(true);
  await input.fill('Yeni');
  const name = page.locator('.ogrenci-desktop-table .cell-primary');
  await expect(name).toHaveText('Yeni Misafir');
  const response = page.waitForResponse(r => new URL(r.url()).searchParams.get('q') === 'Eski');
  release!();
  await (await response).finished();
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await expect(name).toHaveText('Yeni Misafir');
});
for (const width of [390, 1440]) test(`oturum işlemleri seçilen katılıma uygulanır (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 950 });
  await shell(page);
  await page.route('**/api/ogrenci-kayit/gunu-birlik/', route => route.fulfill({ json: { ogrenciler: [student] } }));
  const actions: Record<string, unknown>[] = [];
  await page.route('**/api/ogrenci-kayit/gunu-birlik/sinav/', async route => {
    actions.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/ogrenciler/misafir');
  const menu = page.getByRole('button', { name: 'Deneme Misafir — işlemler', exact: true }).filter({ visible: true });
  await menu.click();
  await page.getByRole('menuitem', { name: 'Sınav düzenleme' }).click();
  await page.getByRole('button', { name: /LGS Deneme.*Akşam/ }).click();
  await page.getByRole('dialog').getByRole('combobox').selectOption('3');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect.poll(() => actions.length).toBe(1);
  expect(actions[0]).toMatchObject({ islem: 'oturum', participant_id: 12, exam_session_id: 3 });
  await expect(page.locator('.deneme-count')).toHaveText('1 öğrenci');
  await menu.click();
  await page.getByRole('menuitem', { name: 'Sınav silme' }).click();
  await page.getByRole('button', { name: /LGS Deneme.*Akşam/ }).click();
  await page.getByRole('button', { name: 'İptal et', exact: true }).click();
  await expect.poll(() => actions.length).toBe(2);
  expect(actions[1]).toMatchObject({ islem: 'iptal', participant_id: 12 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('pasif deneme kulübü öğrencisi detay sayfasına yönlenmeden forma alınır', async ({ page }) => {
  await shell(page);
  await page.route('**/api/ogrenci-kayit/metadata/**', route => route.fulfill({ json: {
    lookups: { registration_type: [{ id: 1, code: 'gunu_birlik', name: 'Tek deneme' }], gender: [], entry_type: [], guardian_type: [] },
    cities: [], rules: [], sinif_seviyeleri: [{ id: 8, ad: '8. Sınıf', kod: '8' }, { id: 9, ad: '9. Sınıf', kod: '9' }],
    alanlar: [], subeler: [], egitim_yillari: [{ id: 1, ad: '2026-2027', aktif_mi: true }],
  } }));
  await page.route('**/api/ogrenci-kayit/tc-check/**', route => route.fulfill({ json: {
    found: true, aktif_yilda_kayitli: true,
    ogrenci: { id: 1, tc_kimlik_no: '10000000146', ad: 'Pasif', soyad: 'Kulüp', aktif_mi: false, kayit_turu: 'deneme_kulubu', dogum_tarihi: '2011-04-04', telefon: '05321110049' },
    son_kayit: { sinif_seviyesi_id: 8, sinif_seviyesi: '8. Sınıf', aktif_mi: false },
    sonraki_seviye: { id: 9, ad: '9. Sınıf', kod: '9' }, veliler: [],
  } }));
  await page.goto('/ogrenciler/misafir/yeni');
  await page.getByPlaceholder('11 haneli TC Kimlik No').fill('10000000146');
  await expect(page.getByText('Öğrencinin eski kaydı pasif.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Öğrenci kaydını aç', exact: true })).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: /kullan|forma|bilgileri/i }).click();
  await expect(page).toHaveURL(/\/ogrenciler\/misafir\/yeni/);
  await expect(page.locator('input[value="Pasif"]')).toBeVisible();
});
