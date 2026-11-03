import { test, expect, type Page } from '@playwright/test';

// Browser contract tests: no live accounts, writes or Drive uploads.
async function portal(page: Page, primary = true) {
  let uploaded = false;
  const deleted = new Set<number>();
  const classes = [{ id: 11, sinif: { ad: '12-A' }, ders: { ad: 'Matematik' }, weekly_hours: 6, rol: primary ? 'PRIMARY' : 'SECONDARY', groups: [] }, { id: 12, sinif: { ad: '11-B' }, ders: { ad: 'Matematik' }, weekly_hours: 4, rol: 'PRIMARY', groups: [] }];
  const cells = [
    { id: 1, day_id: 0, kind: 'class', class_lesson_plan_id: 11, lesson: { name: 'Matematik' }, classroom: { name: '12-A' }, room: { name: 'Derslik 204' }, student: null, start: '09:00:00', end: '09:40:00' },
    { id: 2, day_id: 0, kind: 'class', class_lesson_plan_id: 12, lesson: { name: 'Matematik' }, classroom: { name: '11-B' }, room: { name: 'Derslik 102' }, student: null, start: '11:00:00', end: '11:40:00' },
    { id: 3, day_id: 0, kind: 'private', class_lesson_plan_id: null, lesson: { name: 'Geometri' }, student: { id: 8, name: 'Deniz Yılmaz' }, room: { name: 'Birebir 02' }, start: '14:00:00', end: '14:50:00' },
  ];
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown = {};
    let status = 200;
    if (path.includes('/auth/api/me')) body = { authenticated: true, user: { id: 1, username: 'teacher', first_name: 'Elif', last_name: 'Yalçın', is_staff: false, is_superuser: false, teacher_portal: true, role_code: 'ogretmen', portals: [] } };
    else if (path === '/api/teacher/context/') body = { subeler: [{ id: 1, ad: '3K Kampüs · Merkez', kurum_id: 1, egitim_yili_id: 1 }], yillar: [{ id: 1, ad: '2026–2027' }] };
    else if (path === '/api/teacher/profile/') body = { ad: 'Elif', soyad: 'Yalçın' };
    else if (path === '/api/teacher/terms/') body = { results: [{ id: 1, name: '2026–2027 · Güz dönemi', is_current: true }] };
    else if (path === '/api/teacher/home/') body = { date: '2026-11-02', weekday: 0, next: cells[0], today: cells, counts: { classes: 2, lessons: 2, private: 1 } };
    else if (path === '/api/teacher/classes/') body = { results: classes };
    else if (path === '/api/teacher/private-students/') body = { results: [{ student_id: 8, ad: 'Deniz', soyad: 'Yılmaz', dersler: ['Geometri'] }] };
    else if (path === '/api/teacher/students/8/exams/') body = { ders: 'Matematik', groups: [{ label: 'TYT', last_net: 30, average_net: 25, exams: [{ id: 1, name: 'İlk deneme', net: 20, date: '2026-10-20' }, { id: 2, name: 'İkinci deneme', net: 30, date: '2026-11-02' }], topics: [{ name: 'Fonksiyonlar', mastery: 50, correct: 1, question_count: 2 }] }] };
    else if (path === '/api/teacher/students/8/') body = { ad: 'Deniz', soyad: 'Yılmaz', okul_no: '124', sinif: '12-A', grup: '', dersler: [{ ders: 'Matematik', sinif: '12-A' }] };
    else if (path === '/api/teacher/students/') body = { results: [{ student_id: 8, ad: 'Deniz', soyad: 'Yılmaz', okul_no: '124', sinif_ad: '12-A' }] };
    else if (path === '/api/teacher/schedule/') body = { days: [{ id: 0, short_name: 'Pzt', name: 'Pazartesi' }, { id: 1, short_name: 'Sal', name: 'Salı' }], slots: cells.map(c => ({ id: c.id, start: c.start, end: c.end })), cells };
    else if (path.endsWith('/notes/')) {
      if (route.request().method() === 'POST') { uploaded = true; status = 201; body = { id: 3 }; }
      else body = { results: [{ id: 1, file_name: 'Türev ve uygulamaları.pdf', session_date: '2026-11-02', mime_type: 'application/pdf', size: 245000 }, { id: 2, file_name: 'Fonksiyonlar konu özeti.pdf', session_date: '2026-10-30', mime_type: 'application/pdf', size: 140000 }, ...(uploaded ? [{ id: 3, file_name: 'Yeni ders notu.pdf', session_date: '2026-11-02', mime_type: 'application/pdf', size: 1000 }] : [])].filter(note => !deleted.has(note.id)) };
    }
    else if (path.includes('/notes/') && route.request().method() === 'DELETE') { deleted.add(Number(path.split('/')[4])); body = { deleted: true }; }
    else if (path === '/api/teacher/notifications/') body = { results: [{ id: '1', category: 'announcement', title: 'Yeni bir döneme birlikte', body: 'Kasım ayı branş toplantımız çarşamba günü öğretmenler odasında gerçekleşecek.', occurred_at: '2026-11-02T09:00:00+03:00' }], categories: [{ code: 'announcement', label: 'Kurum' }] };
    await route.fulfill({ status, json: body });
  });
}

for (const width of [360, 390, 768, 1024, 1440]) {
  test(`portal works without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await portal(page);
    await page.goto('/ogretmen');
    await expect(page.getByRole('heading', { name: /Elif/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Derse göz at/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: `/tmp/teacher-home-${width}.png`, fullPage: true });
    if (width < 1024) {
      await page.getByRole('button', { name: 'Menüyü aç' }).click();
      await expect(page.getByRole('navigation', { name: 'Öğretmen', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Menüyü aç' })).toBeFocused();
    }
    await page.goto('/ogretmen/notlar');
    await expect(page.getByRole('heading', { name: 'Türev ve uygulamaları.pdf' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: `/tmp/teacher-notes-${width}.png`, fullPage: true });
  });
}

test('materials search, validation, upload and deletion confirmation', async ({ page }) => {
  await portal(page);
  await page.goto('/ogretmen/notlar');
  await page.getByRole('textbox', { name: 'Ders notlarında ara' }).fill('Fonksiyon');
  await expect(page.getByRole('heading', { name: 'Fonksiyonlar konu özeti.pdf' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Türev ve uygulamaları.pdf' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Ders notlarında ara' }).clear();
  await page.getByRole('button', { name: 'Ders notu yükle', exact: true }).click();
  await page.getByLabel('Yüklenecek ders notları').setInputFiles({ name: 'unsafe.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('main').getByRole('alert')).toContainText('yüklenemiyor');
  await page.getByLabel('Yüklenecek ders notları').setInputFiles({ name: 'Yeni ders notu.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 example') });
  const request = page.waitForRequest(req => req.method() === 'POST' && req.url().includes('/classes/11/notes/'));
  await page.getByRole('button', { name: '1 dosya yükle' }).click();
  expect((await request).headers()['x-sube-id']).toBe('1');
  await expect(page.getByRole('status')).toContainText('yüklendi');
  await expect(page.getByRole('heading', { name: 'Yeni ders notu.pdf' })).toBeVisible();
  await page.getByRole('button', { name: 'Yeni ders notu.pdf dosyasını sil' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('kalıcı olarak silinecek');
  await page.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Yeni ders notu.pdf dosyasını sil' }).click();
  await page.getByRole('button', { name: 'Dosyayı sil', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Yeni ders notu.pdf' })).toHaveCount(0);
});

test('secondary teacher can read notes but cannot upload or delete', async ({ page }) => {
  await portal(page, false);
  await page.goto('/ogretmen/notlar');
  await expect(page.getByRole('heading', { name: 'Türev ve uygulamaları.pdf' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ders notu yükle', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /dosyasını sil/ })).toHaveCount(0);
});

test('class search and student navigation', async ({ page }) => {
  await portal(page);
  await page.goto('/ogretmen/siniflar');
  await page.getByLabel('Sınıf veya öğrenci ara').fill('12-A');
  await expect(page.getByRole('heading', { name: '11-B' })).toHaveCount(0);
  await page.getByRole('link', { name: /12-A/ }).last().click();
  await expect(page.getByRole('link', { name: /Deniz Yılmaz/ })).toBeVisible();
});


test('student development, timetable and notices render from API data', async ({ page }) => {
  await portal(page);
  await page.goto('/ogretmen/ogrenci/8?planId=11');
  await expect(page.getByRole('heading', { name: 'Deniz Yılmaz' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Sınav sırasına göre net gelişimi' })).toBeVisible();
  await expect(page.getByText('Fonksiyonlar', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/teacher-student-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: '/tmp/teacher-student-mobile.png', fullPage: true });
  await page.goto('/ogretmen/program');
  await expect(page.getByRole('heading', { name: 'Ders programım' })).toBeVisible();
  await page.getByRole('button', { name: 'Salı', exact: true }).click();
  await expect(page.getByText('Bu gün ders yok.')).toBeVisible();
  await page.goto('/ogretmen/bildirimler');
  await expect(page.getByRole('heading', { name: 'Yeni bir döneme birlikte' })).toBeVisible();
});

test('failed notes request offers retry and recovers', async ({ page }) => {
  await portal(page);
  let fail = true;
  await page.route('**/api/teacher/classes/11/notes/**', async route => {
    if (fail) await route.fulfill({ status: 503, json: { message: 'Notlar şu an alınamadı.' } });
    else await route.fulfill({ json: { results: [] } });
  });
  await page.goto('/ogretmen/notlar');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Notlar şu an alınamadı.');
  fail = false;
  await page.getByRole('button', { name: 'Yeniden dene' }).click();
  await expect(page.getByRole('heading', { name: 'İlk notun için yer hazır' })).toBeVisible();
});
