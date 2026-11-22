import { expect, test } from '@playwright/test';

test('LGS çift DAT için her iki şablonu uygular, kitapçığı düzeltir ve sonucu açar', async ({ page }) => {
  await page.addInitScript(() => {
    for (const key of ['kurum', 'sube', 'egitim_yili']) localStorage.setItem(`3k_active_${key}`, '1');
    document.cookie = 'lms_csrftoken=synthetic';
  });

  const sections = [
    ['Türkçe', 1, 20], ['İnkılap Tarihi', 21, 30], ['Din Kültürü', 31, 40],
    ['Yabancı Dil', 41, 50], ['Matematik', 51, 70], ['Fen Bilimleri', 71, 90],
  ].map(([name, start, end], index) => ({
    id: index + 1, name: String(name), question_start: Number(start), question_end: Number(end),
    width: Number(end) - Number(start) + 1, order: index, is_sub_section: false,
  }));
  const exam = { id: 1, name: 'Test LGS', exam_type: 'LGS', sections, status: 'ANSWER_KEY_READY', booklet_type: 'AB' };
  const session = { id: 7, is_dual_dat: true, original_filename: 's.dat + m.dat', total_rows: 1 };
  const student = { id: 9, name: 'Örnek Öğrenci', school_no: '12', class_name: '8-A' };
  const mapping = (selected: typeof sections) => {
    let start = 21;
    return [
      { field: 'ad_soyad', start: 0, end: 20, label: 'Ad soyad' },
      { field: 'kitapcik_turu', start: 20, end: 21, label: 'Kitapçık' },
      ...selected.map(section => {
        const field = { field: `ders_${section.id}`, start, end: start + section.width, label: section.name };
        start = field.end;
        return field;
      }),
    ];
  };
  const templates = [
    { id: 1, name: 'Sözel şablon', mappings: mapping(sections.slice(0, 4)), first_line_is_header: false },
    { id: 2, name: 'Sayısal şablon', mappings: mapping(sections.slice(4)), first_line_is_header: false },
  ];
  let saved = false;
  let previews = 0;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());

  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown = { success: true, data: [] };
    if (path.includes('/auth/api/me')) body = {
      authenticated: true, user: {
        id: 1, username: 'mock', is_staff: true, is_superuser: true, role_code: 'super_admin',
        portals: [{ code: 'admin' }], active_portal: 'admin',
      },
    };
    else if (path.includes('/legacy/kurumlar')) body = { success: true, data: {
      kurumlar: [{ id: 1, ad: 'Test', aktif_mi: true }],
      subeler: [{ id: 1, kurum_id: 1, ad: 'Merkez', aktif_mi: true }], egitim_yillari: [],
    } };
    else if (path.endsWith('/exams/1/')) body = exam;
    else if (path.endsWith('/mapping-templates/')) {
      const part = url.searchParams.get('source_part');
      body = part === 'verbal' ? [templates[0]] : part === 'numeric' ? [templates[1]] : [];
    }
    else if (path.endsWith('/results/sessions/')) body = saved ? [{ ...session, status: 'COMPLETED', status_display: 'Tamamlandı' }] : [];
    else if (path.endsWith('/results/dual-dat/')) {
      expect(route.request().headers()['content-type']).toMatch(/^multipart\/form-data; boundary=/);
      expect(route.request().postData()).toContain('name="verbal"');
      expect(route.request().postData()).toContain('name="numeric"');
      body = { session, settings: {}, files: {
        verbal: { lines: [`${student.name.padEnd(20)}A${'A'.repeat(50)}`], total_rows: 1, sections: sections.slice(0, 4) },
        numeric: { lines: [`${student.name.padEnd(20)}B${'A'.repeat(40)}`], total_rows: 1, sections: sections.slice(4) },
      } };
    } else if (path.endsWith('/results/dual-dat/7/')) {
      const { settings, preview_token } = route.request().postDataJSON();
      expect(settings.verbal.field_mappings).toEqual(templates[0].mappings);
      expect(settings.numeric.field_mappings).toEqual(templates[1].mappings);
      if (preview_token) {
        expect(preview_token).toBe('confirmed-preview');
        expect(settings.overrides.numeric['1'].booklet).toBe('A');
        saved = true;
        body = { session };
      } else {
        previews += 1;
        const corrected = settings.overrides.numeric['1']?.booklet === 'A';
        const issue = corrected ? null : 'İki optikteki kitapçık kodu farklı.';
        const row = {
          row: 1, name: student.name, student_name: student.name, student_id: student.id, booklet: 'A',
          automatic_student_id: student.id, school_no: student.school_no, excluded: false, issue,
        };
        body = {
          rows: {
            verbal: [{ ...row, source_booklet: 'A' }],
            numeric: [{ ...row, source_booklet: 'B', booklet: corrected ? 'A' : 'B' }],
          },
          pair_count: corrected ? 1 : 0, unresolved_count: corrected ? 0 : 2,
          students: [student], preview_token: corrected ? 'confirmed-preview' : null,
        };
      }
    } else if (path.endsWith('/results/sessions/7/results/')) {
      body = { total_rows: 1, results: [{
        id: 19, row: 1, student_name: student.name, matched_student_name: student.name, matched_student_id: student.id,
        booklet: 'A', total_correct: 90, total_wrong: 0, total_empty: 0, total_net: 90,
        section_nets: {}, match_score: 1, match_method: 'dual_dat',
      }] };
    }
    await route.fulfill({ json: body });
  });

  await page.goto('/admin/olcme-degerlendirme/1?tab=yukle');
  await expect(page.getByRole('tab', { name: 'Optik okuyucu dosyası' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'İki DAT (Sözel + Sayısal)' }).click();
  await page.getByLabel('Sözel DAT', { exact: true }).setInputFiles({ name: 's.dat', mimeType: 'text/plain', buffer: Buffer.from('s') });
  await page.getByLabel('Sayısal DAT', { exact: true }).setInputFiles({ name: 'm.dat', mimeType: 'text/plain', buffer: Buffer.from('m') });
  await page.getByRole('button', { name: 'Dosyaları yükle' }).click();
  await page.getByRole('button', { name: 'Sözel şablon', exact: true }).click();
  await page.getByRole('button', { name: 'Sayısal şablon', exact: true }).click();
  await page.getByRole('button', { name: 'Eşleşmeleri önizle' }).click();
  const confirm = page.getByRole('button', { name: 'Birleşik sonuçları kaydet' });
  await expect(confirm).toBeDisabled();
  await page.getByLabel('Sayısal 1. satır kitapçık').selectOption('A');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByRole('tab', { name: 'Optik okuyucu dosyası' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('cell', { name: student.name, exact: true }).first()).toBeVisible();
  expect(previews).toBe(2);
  expect(saved).toBe(true);
  expect(errors).toEqual([]);
});

test('eşleşmeyen öğrenci iki optiğe birlikte bağlanır, hariç tut iki satırı birden kapatır', async ({ page }) => {
  await page.addInitScript(() => {
    for (const key of ['kurum', 'sube', 'egitim_yili']) localStorage.setItem(`3k_active_${key}`, '1');
    document.cookie = 'lms_csrftoken=synthetic';
  });
  const sections = [
    ['Türkçe', 1, 20], ['İnkılap Tarihi', 21, 30], ['Din Kültürü', 31, 40],
    ['Yabancı Dil', 41, 50], ['Matematik', 51, 70], ['Fen Bilimleri', 71, 90],
  ].map(([name, start, end], index) => ({
    id: index + 1, name: String(name), question_start: Number(start), question_end: Number(end),
    width: Number(end) - Number(start) + 1, order: index, is_sub_section: false,
  }));
  const exam = { id: 1, name: 'Test LGS', exam_type: 'LGS', sections, status: 'ANSWER_KEY_READY', booklet_type: 'ABCD' };
  const session = { id: 7, is_dual_dat: true, original_filename: 's.dat + m.dat', total_rows: 2 };
  const student = { id: 9, name: 'Örnek Öğrenci', school_no: '12', class_name: '8-A' };
  const mapping = (selected: typeof sections) => {
    let start = 21;
    return [
      { field: 'ad_soyad', start: 0, end: 20, label: 'Ad soyad' },
      { field: 'kitapcik_turu', start: 20, end: 21, label: 'Kitapçık' },
      ...selected.map(section => {
        const field = { field: `ders_${section.id}`, start, end: start + section.width, label: section.name };
        start = field.end;
        return field;
      }),
    ];
  };
  const templates = [
    { id: 1, name: 'Sözel şablon', mappings: mapping(sections.slice(0, 4)), first_line_is_header: false },
    { id: 2, name: 'Sayısal şablon', mappings: mapping(sections.slice(4)), first_line_is_header: false },
  ];
  const sent: Array<Record<string, Record<string, { student_id?: number; excluded?: boolean }>>> = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown = { success: true, data: [] };
    if (path.includes('/auth/api/me')) body = {
      authenticated: true, user: {
        id: 1, username: 'mock', is_staff: true, is_superuser: true, role_code: 'super_admin',
        portals: [{ code: 'admin' }], active_portal: 'admin',
      },
    };
    else if (path.includes('/legacy/kurumlar')) body = { success: true, data: {
      kurumlar: [{ id: 1, ad: 'Test', aktif_mi: true }],
      subeler: [{ id: 1, kurum_id: 1, ad: 'Merkez', aktif_mi: true }], egitim_yillari: [],
    } };
    else if (path.endsWith('/exams/1/')) body = exam;
    else if (path.endsWith('/mapping-templates/')) {
      const part = url.searchParams.get('source_part');
      body = part === 'verbal' ? [templates[0]] : part === 'numeric' ? [templates[1]] : [];
    } else if (path.endsWith('/results/sessions/')) body = [];
    else if (path.endsWith('/results/dual-dat/')) {
      body = { session, settings: {}, files: {
        verbal: { lines: [`${'Optik Hatalı'.padEnd(20)}C${'A'.repeat(50)}`, `${'Misafir'.padEnd(20)}A${'A'.repeat(50)}`], total_rows: 2, sections: sections.slice(0, 4) },
        numeric: { lines: [`${'Misafir'.padEnd(20)}A${'A'.repeat(40)}`, `${'Optik Hatalı'.padEnd(20)}C${'A'.repeat(40)}`], total_rows: 2, sections: sections.slice(4) },
      } };
    } else if (path.endsWith('/results/dual-dat/7/')) {
      const { settings } = route.request().postDataJSON();
      const overrides = settings.overrides ?? { verbal: {}, numeric: {} };
      sent.push(overrides);
      const picked = (part: string, row: number) => overrides[part]?.[String(row)]?.student_id ?? null;
      const excluded = (part: string, row: number) => Boolean(overrides[part]?.[String(row)]?.excluded);
      const linked = picked('verbal', 1) === student.id && picked('numeric', 2) === student.id;
      const guestOut = excluded('verbal', 2) && excluded('numeric', 1);
      const guestSplit = excluded('verbal', 2) !== excluded('numeric', 1);
      const make = (
        row: number, name: string, booklet: string, studentId: number | null, isExcluded: boolean, unregistered: boolean,
      ) => ({
        row, name, school_no: '', booklet, source_booklet: booklet, automatic_student_id: null,
        student_id: studentId, student_name: studentId ? student.name : '', excluded: isExcluded,
        unregistered: unregistered && !isExcluded && !studentId,
        issue: isExcluded || studentId || unregistered ? null : 'Öğrenci doğrulanamadı.',
      });
      body = {
        rows: {
          verbal: [
            make(1, 'Optik Hatalı', 'C', picked('verbal', 1), false, !linked),
            make(2, 'Misafir', 'A', null, excluded('verbal', 2), !guestOut && !guestSplit),
          ],
          numeric: [
            make(1, 'Misafir', 'A', null, excluded('numeric', 1), !guestOut && !guestSplit),
            make(2, 'Optik Hatalı', 'C', picked('numeric', 2), false, !linked),
          ],
        },
        pair_count: 1 + (guestOut || guestSplit ? 0 : 1),
        unresolved_count: guestSplit ? 2 : 0,
        students: [student], scoring_error: null,
        preview_token: guestSplit ? null : 'ok',
      };
    }
    await route.fulfill({ json: body });
  });

  await page.goto('/admin/olcme-degerlendirme/1?tab=yukle');
  await page.getByRole('tab', { name: 'İki DAT (Sözel + Sayısal)' }).click();
  await page.getByLabel('Sözel DAT', { exact: true }).setInputFiles({ name: 's.dat', mimeType: 'text/plain', buffer: Buffer.from('s') });
  await page.getByLabel('Sayısal DAT', { exact: true }).setInputFiles({ name: 'm.dat', mimeType: 'text/plain', buffer: Buffer.from('m') });
  await page.getByRole('button', { name: 'Dosyaları yükle' }).click();
  await page.getByRole('button', { name: 'Sözel şablon', exact: true }).click();
  await page.getByRole('button', { name: 'Sayısal şablon', exact: true }).click();
  await page.getByRole('button', { name: 'Eşleşmeleri önizle' }).click();
  const confirm = page.getByRole('button', { name: 'Birleşik sonuçları kaydet' });
  await expect(page.getByText('Sonuç listesine yazılır').first()).toBeVisible();
  await expect(confirm).toBeEnabled();

  await page.getByRole('button', { name: 'Eşleştir' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Öğrenci eşleştir' });
  await dialog.getByRole('button', { name: /Örnek Öğrenci/ }).click();
  await dialog.getByRole('button', { name: 'Eşleştir', exact: true }).click();
  await expect.poll(() => sent.at(-1)?.numeric?.['2']?.student_id).toBe(student.id);
  expect(sent.at(-1)?.verbal?.['1']?.student_id).toBe(student.id);

  await page.getByRole('row').filter({ hasText: 'Misafir' }).first().getByRole('button', { name: 'Hariç tut' }).click();
  await expect.poll(() => sent.at(-1)?.verbal?.['2']?.excluded && sent.at(-1)?.numeric?.['1']?.excluded).toBe(true);
  expect(sent.at(-1)?.verbal?.['1']?.student_id).toBe(student.id);
  await expect(confirm).toBeEnabled();
  expect(errors).toEqual([]);
});
