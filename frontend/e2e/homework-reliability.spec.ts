import { test, expect, type Page } from '@playwright/test';

const tasks = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1, lesson_block: 1, title: `Test ${i + 1}`, task_type: 'SOLVE_TEST',
  completion_status: 'PENDING', task_completion_percent: 0, question_count: 10,
  completed_question_count: 0, page_count: null, order: i, description: '',
  coach_evaluation_note: '', status: 'PENDING', content_topic_name: 'Konu',
}));
const assignment = {
  id: 1, student: 1, student_name: 'Sentetik Öğrenci', coach_name: 'Test Koç',
  title: 'Test Ödevi', status: 'ASSIGNED', status_display: 'Atandı', risk_status: 'PENDING',
  priority: 'MEDIUM', due_date: '2099-11-10T12:00:00+03:00', assigned_date: '2026-11-03T12:00:00+03:00',
  description: '', coach_notes: '', student_notes: '', non_submission_reason: '',
  is_control_locked: false, can_override_control_lock: true, completion_percent: 0,
  lessons: [{ id: 1, lesson: 1, lesson_name: 'Matematik', resource_book: 1, resource_book_name: 'Test Kitabı', topic_name: 'Konu', tasks }],
  report_summary: { total_tasks: 20, pending_tasks: 20, done_tasks: 0, not_done_tasks: 0, partial_tasks: 0, total_questions: 200, completed_questions: 0, remaining_questions: 200, total_pages: 0, completed_pages: 0, remaining_pages: 0, question_completion_percent: 0, page_completion_percent: 0, task_completion_percent: 0, overall_completion_percent: 0 },
};

async function mockPortal(page: Page, previewFails = false) {
  let failPreview = previewFails;
  const counts = { detail: 0, batch: 0, single: 0, preview: 0, send: 0 };
  await page.addInitScript(() => {
    localStorage.setItem('3k_active_kurum', '1');
    localStorage.setItem('3k_active_sube', '1');
    document.cookie = 'lms_csrftoken=synthetic';
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = { success: true, data: [] };
    let status = 200;
    if (path.includes('/auth/api/me')) body = { authenticated: true, user: { id: 1, username: 'mock', first_name: 'Test', is_staff: true, is_superuser: true, role_code: 'koc', portals: [{ code: 'coach' }], active_portal: 'coach' } };
    else if (path.includes('/legacy/kurumlar')) body = { success: true, data: { kurumlar: [{ id: 1, ad: 'Test', aktif_mi: true }], subeler: [{ id: 1, kurum_id: 1, ad: 'Merkez', aktif_mi: true }], egitim_yillari: [] } };
    else if (path.endsWith('/assignments/1/')) { counts.detail++; body = assignment; }
    else if (path.endsWith('/assignments/1/report/')) body = { success: true, data: assignment, overall_stats: { total_assignments: 1, total_tasks_all: 20, total_questions_all: 200, completed_questions_all: 0 }, topic_cumulative: [], book_cumulative: [] };
    else if (path.endsWith('/batch-status/')) {
      counts.batch++;
      body = { success: true, data: { tasks: tasks.map(t => ({ ...t, completion_status: 'DONE', task_completion_percent: 100, completed_question_count: 10 })), assignment_summary: { id: 1, status: 'COMPLETED', completion_percent: 100, is_control_locked: true } } };
    } else if (path.endsWith('/update_task_status/')) { counts.single++; }
    else if (path.endsWith('/notify-preview/')) {
      counts.preview++;
      if (failPreview) { status = 400; body = { success: false, error: 'Sentetik önizleme hatası' }; }
      else body = { success: true, data: { operation_ledger_enabled: true, recipients: [{ recipient_type: 'ogrenci', ogrenci_id: 1, display_name: 'Sentetik Öğrenci', telefon: '***', body: 'Ödev planı ektedir.' }], send_mode: 'document' } };
    } else if (path.endsWith('/notify-send/')) {
      counts.send++;
      const data = route.request().postDataJSON();
      expect(data.async).toBe(true);
      expect(data.idempotency_key).toBeTruthy();
      body = { success: true, data: { job_id: 'mock-job', status: 'PENDING' } };
    } else if (path.endsWith('/notify-job/')) body = { success: true, data: { job_id: 'mock-job', status: 'QUEUED', sent: 1, skipped: 0, errors: [], sent_details: [{ recipient_type: 'ogrenci', display_name: 'Sentetik Öğrenci', telefon: '***', message_status: 'PENDING' }] } };
    await route.fulfill({ status, json: body });
  });
  return { counts, recoverPreview: () => { failPreview = false; } };
}

for (const width of [390, 768, 1440]) {
  test(`20 tasks use one batch and no full refetch at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    const { counts } = await mockPortal(page);
    await page.goto('/coach/odev/kontrol/1');
    const button = page.getByRole('button', { name: 'Tümü Yaptı', exact: true }).first();
    await expect(button).toBeVisible();
    const before = counts.detail;
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await button.click();
    await expect.poll(() => counts.batch).toBe(1);
    await expect(page.getByText('20 görev güncellendi', { exact: false })).toBeVisible();
    expect(counts.single).toBe(0);
    expect(counts.detail).toBe(before);
  });
}

test('preview retry reloads and queued delivery is not labelled delivered', async ({ page }) => {
  const { counts, recoverPreview } = await mockPortal(page, true);
  await page.goto('/coach/odev/kontrol/1');
  await page.getByRole('button', { name: /WhatsApp.*Plan PDF Gönder/ }).click();
  await expect(page.getByText('Sentetik önizleme hatası')).toBeVisible();
  recoverPreview();
  const before = counts.preview;
  await page.getByRole('button', { name: 'Yeniden yükle' }).click();
  await page.getByRole('button', { name: '1 kişiye gönder' }).click();
  await expect(page.getByText('Sentetik Öğrenci: Kuyrukta', { exact: false }).first()).toBeVisible();
  expect(counts.preview).toBe(before + 1);
  expect(counts.send).toBe(1);
  await expect(page.getByText('Teslim edildi', { exact: true })).toHaveCount(0);
});

for (const kind of ['plan', 'rapor']) {
  test(`real ${kind} print component produces a populated PDF from mocked data`, async ({ page }) => {
    await mockPortal(page);
    await page.goto(`/print/odev-kontrol/1/${kind}?token=synthetic`);
    await expect(page.locator('body')).toHaveAttribute('data-pdf-ready', 'true');
    await expect(page.locator('body')).not.toHaveAttribute('data-pdf-error', 'true');
    await expect(page.getByText('Sentetik Öğrenci', { exact: false }).first()).toBeVisible();
    if (kind === 'plan') {
      await expect(page.getByText('Test 1', { exact: true })).toBeVisible();
      await expect(page.getByText('Test 20', { exact: true })).toBeVisible();
    }
    const document = await page.pdf({ format: 'A4', printBackground: true });
    expect(document.subarray(0, 4).toString()).toBe('%PDF');
    expect(document.length).toBeGreaterThan(2500);
  });
}

test('late student and book responses cannot replace the newest selection', async ({ page }) => {
  await mockPortal(page);
  await page.route('**/api/coaching/students/**', route => route.fulfill({ json: { success: true, data: [
    { id: 1, ad: 'Ayşe', soyad: 'Bir' }, { id: 2, ad: 'Zeynep', soyad: 'İki' },
  ] } }));
  let releaseStudent!: () => void;
  const studentGate = new Promise<void>(resolve => { releaseStudent = resolve; });
  let oldRequests = 0;
  await page.route('**/api/student-resources/assignments/student_detail/**', async route => {
    const id = new URL(route.request().url()).searchParams.get('student_id');
    if (id === '1') { oldRequests++; await studentGate; }
    await route.fulfill({ json: { success: true, data: { student: { id: Number(id) }, lessons: [{
      lesson_id: 1, lesson_name: id === '1' ? 'Eski Ders' : 'Yeni Ders',
      resources: [1, 2].map(book => ({ id: book, resource_book: book, resource_name: book === 1 ? 'Birinci Kitap' : 'İkinci Kitap', resource_type: 'Soru Bankası', status: 'ASSIGNED' })),
    }] } } });
  });
  let releaseBook!: () => void;
  const bookGate = new Promise<void>(resolve => { releaseBook = resolve; });
  let oldBookRequests = 0;
  await page.route('**/api/resources/books/*/structure/**', async route => {
    const old = new URL(route.request().url()).pathname.includes('/books/1/');
    if (old) { oldBookRequests++; await bookGate; }
    await route.fulfill({ json: { success: true, data: { id: old ? 1 : 2, ad: old ? 'Birinci Kitap' : 'İkinci Kitap', units: [] } } });
  });
  await page.goto('/coach/odev/ver');
  await page.getByText('Ayşe Bir', { exact: true }).click();
  await expect.poll(() => oldRequests).toBeGreaterThan(0);
  await page.locator('.wizard-step-item').filter({ hasText: 'Öğrenci Seçimi' }).click();
  await page.getByText('Zeynep İki', { exact: true }).click();
  await expect(page.getByRole('button', { name: /Yeni Ders/ })).toBeVisible();
  const lateStudent = page.waitForResponse(response => response.url().includes('student_detail/') && response.url().includes('student_id=1'));
  releaseStudent();
  await lateStudent;
  await expect(page.getByRole('button', { name: /Eski Ders/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Yeni Ders/ }).click();
  await page.getByRole('button', { name: /Soru Bankası/ }).click();
  await page.getByRole('button', { name: /Birinci Kitap/ }).click();
  await expect.poll(() => oldBookRequests).toBeGreaterThan(0);
  await page.getByRole('button', { name: /İkinci Kitap/ }).click();
  await expect(page.getByText('📖 İkinci Kitap', { exact: true })).toBeVisible();
  const lateBook = page.waitForResponse(response => response.url().includes('/books/1/structure/'));
  releaseBook();
  await lateBook;
  await expect(page.getByText('📖 İkinci Kitap', { exact: true })).toBeVisible();
  await expect(page.getByText('📖 Birinci Kitap', { exact: true })).toHaveCount(0);
});

test('uncertain previous delivery requires an explicit recipient choice', async ({ page }) => {
  const { counts } = await mockPortal(page);
  await page.route('**/notify-preview/**', route => route.fulfill({ json: { success: true, data: {
    operation_ledger_enabled: true, recipients: [{ recipient_type: 'ogrenci', ogrenci_id: 1,
      display_name: 'Sentetik Öğrenci', body: 'Ödev planı', send_count: 1,
      send_history: [{ sent_at: '03.11.2026 12:00', status: 'UNKNOWN' }],
    }],
  } } }));
  await page.goto('/coach/odev/kontrol/1');
  await page.getByRole('button', { name: /WhatsApp.*Plan PDF Gönder/ }).click();
  await expect(page.getByText(/Önceki gönderimin sonucu belirsiz/)).toBeVisible();
  const recipient = page.locator('.odev-notify-overlay').getByRole('checkbox');
  await expect(recipient).not.toBeChecked();
  await expect(page.getByRole('button', { name: '0 kişiye gönder' })).toBeDisabled();
  await recipient.check();
  await expect(page.getByRole('button', { name: '1 kişiye gönder' })).toBeEnabled();
  expect(counts.send).toBe(0);
});

test('saving a task note and resetting one task do not reload the detail tree', async ({ page }) => {
  await mockPortal(page);
  let detailLoads = 0, notes = 0, resets = 0;
  let firstTask = { ...tasks[0], completion_status: 'DONE', task_completion_percent: 100, completed_question_count: 10 };
  await page.route('**/assignments/1/', async route => {
    detailLoads++;
    await route.fulfill({ json: { ...assignment, status: 'IN_PROGRESS', completion_percent: 5,
      lessons: [{ ...assignment.lessons[0], tasks: [firstTask, ...tasks.slice(1)] }],
    } });
  });
  await page.route('**/tasks/1/evaluation_note/', async route => {
    notes++;
    firstTask = { ...firstTask, coach_evaluation_note: route.request().postDataJSON().coach_evaluation_note };
    await route.fulfill({ json: { success: true, data: firstTask } });
  });
  await page.route('**/tasks/1/reset_task_status/', async route => {
    resets++;
    firstTask = { ...firstTask, completion_status: 'PENDING', task_completion_percent: 0, completed_question_count: 0 };
    await route.fulfill({ json: { success: true, data: firstTask, assignment_summary: { id: 1, status: 'ASSIGNED', completion_percent: 0, is_control_locked: false } } });
  });
  await page.goto('/coach/odev/kontrol/1');
  await page.getByTitle('Not ekle', { exact: true }).first().click();
  const before = detailLoads;
  await page.getByPlaceholder('Koç değerlendirme notu...').fill('Konuyu tekrar et');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(page.getByText('Konuyu tekrar et', { exact: true })).toBeVisible();
  expect(detailLoads).toBe(before);
  page.on('dialog', dialog => dialog.accept());
  await page.getByTitle('Sıfırla', { exact: true }).first().click();
  await expect(page.getByText('Görev değerlendirmesi sıfırlandı', { exact: true })).toBeVisible();
  expect(notes).toBe(1);
  expect(resets).toBe(1);
  expect(detailLoads).toBe(before);
});
