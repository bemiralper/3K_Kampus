import { brandingFromKurum, getAppLogo, DEFAULT_BRANDING } from './kurum-branding';
import type { DaySchedule, GunAktiflik, PeriyotDersler, DaySessionCode } from './kutuphane-api';
import {
  PERIOD_DEFS,
  SESSION_BREAK_DEFS,
  buildScheduleMatrix,
  deriveGunAktiflik,
  getActiveDayDefs,
  getSessionBreak,
  normalizeGunlukDersSaatleri,
  timeToMinutes,
  type GunlukDersSaatleri,
} from './ders-programi-utils';

type KurumBrandingInput = Parameters<typeof brandingFromKurum>[0];

export type KutuphanePrintMeta = {
  title: string;
  subtitle?: string;
  subeAdi?: string;
  kurumBranding?: KurumBrandingInput | null;
  orientation?: 'portrait' | 'landscape';
};

export type SeatStudentRow = {
  no: string;
  ogrenci: string;
  tip?: string;
  baslangic?: string;
  durum?: string;
};

export type LockerStudentRow = {
  no: string;
  ogrenci: string;
  atamaTipi?: string;
  anahtar?: string;
  baslangic?: string;
  durum?: string;
};

const PERIODS: { code: DaySessionCode; label: string; color: string }[] = PERIOD_DEFS.map((p) => ({
  code: p.code,
  label: p.label,
  color: p.code === 'MORNING' ? '#d97706' : p.code === 'AFTERNOON' ? '#2563eb' : '#4f46e5',
}));

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function logoSrc(branding?: KurumBrandingInput | null, origin?: string): string {
  const b = branding ? brandingFromKurum(branding as Parameters<typeof brandingFromKurum>[0]) : null;
  const path = getAppLogo(b ?? DEFAULT_BRANDING);
  if (path.startsWith('http')) return path;
  return `${origin || (typeof window !== 'undefined' ? window.location.origin : '')}${path}`;
}

function printShell(options: {
  meta: KutuphanePrintMeta;
  bodyContent: string;
  extraStyles?: string;
  /** Tek A4 yatay sayfaya sığdır (ders programı vb.) */
  singlePage?: boolean;
}): string {
  const { meta, bodyContent, extraStyles = '', singlePage = false } = options;
  const branding = meta.kurumBranding;
  const theme = branding?.tema_rengi || '#0262a7';
  const kurumAd = branding?.gorunen_ad || branding?.ad || '3K Kampüs';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const logo = logoSrc(branding, origin);
  const orient = meta.orientation || 'landscape';
  const printedAt = new Date().toLocaleString('tr-TR');
  const bodyClass = singlePage ? ' class="single-page-print"' : '';

  const singlePageStyles = singlePage ? `
  body.single-page-print { padding: 3mm 4mm 2mm; font-size: 9px; height: auto; }
  body.single-page-print .brand-header { gap: 8px; padding-bottom: 4px; margin-bottom: 5px; border-bottom-width: 2px; }
  body.single-page-print .brand-header img { width: 34px; height: 34px; }
  body.single-page-print .brand-text h1 { font-size: 14px; }
  body.single-page-print .brand-text .kurum { font-size: 10px; }
  body.single-page-print .brand-text .meta-line { font-size: 8px; margin-top: 2px; }
  body.single-page-print .footer { margin-top: 3px; font-size: 7px; }
  body.single-page-print .section { margin-bottom: 0; }
  body.single-page-print .section-title { display: none; }
  @media print {
    body.single-page-print { padding: 0; height: 100%; overflow: hidden; }
    body.single-page-print .print-main { page-break-inside: avoid; break-inside: avoid; }
    @page { size: A4 landscape; margin: 3mm; }
  }` : '';

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/>
<title>${escapeHtml(meta.title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #0f172a; font-size: 10px; padding: 8mm; background: #fff; }
  .brand-header { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid ${theme}; padding-bottom: 10px; margin-bottom: 12px; }
  .brand-header img { width: 52px; height: 52px; object-fit: contain; flex-shrink: 0; }
  .brand-text h1 { font-size: 17px; font-weight: 800; color: ${theme}; letter-spacing: -0.02em; }
  .brand-text .kurum { font-size: 11px; font-weight: 600; color: #334155; margin-top: 2px; }
  .brand-text .meta-line { font-size: 9px; color: #64748b; margin-top: 4px; }
  .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
  .meta-card { background: linear-gradient(180deg, #f8fafc, #fff); border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; }
  .meta-card .label { font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
  .meta-card .value { font-size: 11px; font-weight: 700; color: #0f172a; margin-top: 3px; }
  .section { margin-bottom: 16px; }
  .section-title { font-size: 12px; font-weight: 800; color: ${theme}; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
  .section-title::before { content: ''; width: 4px; height: 16px; background: ${theme}; border-radius: 2px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: center; vertical-align: middle; }
  th { background: #f1f5f9; font-weight: 700; font-size: 9px; }
  td.left { text-align: left; }
  tr:nth-child(even) td { background: #fafbfc; }
  .footer { margin-top: 10px; font-size: 8px; color: #94a3b8; text-align: right; }
  ${singlePageStyles}
  ${extraStyles}
  @media print {
    body { padding: ${singlePage ? '0' : '5mm'}; }
    @page { size: ${singlePage ? 'A4 landscape' : orient}; margin: ${singlePage ? '3mm' : '5mm'}; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
</style></head><body${bodyClass}>
  <div class="brand-header">
    <img src="${logo}" alt="${escapeHtml(kurumAd)}" onerror="this.style.display='none'"/>
    <div class="brand-text">
      <h1>${escapeHtml(meta.title)}</h1>
      <div class="kurum">${escapeHtml(kurumAd)}</div>
      <div class="meta-line">${escapeHtml(meta.subtitle || '')}${meta.subeAdi ? ` · ${escapeHtml(meta.subeAdi)}` : ''}</div>
    </div>
  </div>
  ${bodyContent}
  <div class="footer">Yazdırma: ${printedAt} · 3K Kampüs LMS</div>
</body></html>`;
}

/**
 * Haftalık ders programı — yazdırma/PDF çıktısı.
 *
 * Ekrandaki matrisin aynısı: satır = etüt veya ara, sütun = gün. Böylece
 * ekranda görülen ile kâğıda çıkan birebir örtüşür. `meta.orientation`
 * 'landscape' (varsayılan) veya 'portrait' olabilir; yön yalnızca @page
 * kuralını değil, tek sayfaya sığması için tipografi ölçeğini de belirler.
 */
export function buildDersProgramiPrintHtml(options: {
  meta: KutuphanePrintMeta;
  programAd: string;
  dersSaatleri: Record<string, PeriyotDersler> | GunlukDersSaatleri;
  gunAktiflik?: Record<string, GunAktiflik>;
}): string {
  const { meta, programAd } = options;
  const gunluk = normalizeGunlukDersSaatleri(
    options.dersSaatleri as Record<string, unknown>,
    options.gunAktiflik,
  );
  const gunAktiflik = options.gunAktiflik || deriveGunAktiflik(gunluk);
  const branding = meta.kurumBranding;
  const theme = branding?.tema_rengi || '#0262a7';
  const kurumAd = branding?.gorunen_ad || branding?.ad || '3K Kampüs';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const logo = logoSrc(branding, origin);
  const printedAt = new Date().toLocaleString('tr-TR');

  const portrait = meta.orientation === 'portrait';
  const days = getActiveDayDefs(gunAktiflik);
  const sections = buildScheduleMatrix(gunluk, days).filter(
    (sec) => sec.rows.length > 0 || sec.breakRow,
  );

  const totalDers = days.reduce(
    (sum, d) => sum + PERIOD_DEFS.reduce((ps, p) => ps + (gunluk[d.key]?.[p.code]?.dersler?.length || 0), 0),
    0,
  );

  // Haftanın ilk dersinin başlangıcı ve son dersinin bitişi.
  let weekStart = '';
  let weekEnd = '';
  for (const sec of sections) {
    for (const row of sec.rows) {
      for (const day of days) {
        const cell = row.cells[day.key];
        if (!cell) continue;
        const from = timeToMinutes(cell.baslangic);
        const to = timeToMinutes(cell.bitis);
        if (from !== null && (!weekStart || from < (timeToMinutes(weekStart) ?? Infinity))) weekStart = cell.baslangic;
        if (to !== null && (!weekEnd || to > (timeToMinutes(weekEnd) ?? -Infinity))) weekEnd = cell.bitis;
      }
    }
  }

  /** Bir oturumun hafta genelindeki en erken başlangıcı ve en geç bitişi. */
  const sectionSpan = (sec: (typeof sections)[number]): string => {
    let from = '';
    let to = '';
    for (const row of sec.rows) {
      for (const day of days) {
        const cell = row.cells[day.key];
        if (!cell) continue;
        if (!from || (timeToMinutes(cell.baslangic) ?? 0) < (timeToMinutes(from) ?? Infinity)) from = cell.baslangic;
        if (!to || (timeToMinutes(cell.bitis) ?? 0) > (timeToMinutes(to) ?? -Infinity)) to = cell.bitis;
      }
    }
    return from && to ? `${from} – ${to}` : '';
  };

  const colWidth = `${(100 - (portrait ? 22 : 16)) / Math.max(days.length, 1)}%`;

  const head = `<tr>
    <th class="dp-corner">Oturum</th>
    ${days.map((d) => `<th class="dp-day" style="width:${colWidth}">
      <span class="dp-day-name">${escapeHtml(portrait ? d.short : d.label)}</span>
    </th>`).join('')}
  </tr>`;

  const body = sections.map((sec) => {
    const span = sectionSpan(sec);
    const group = `<tr class="dp-group" style="--acc:${sec.accent};background:${sec.light}">
      <td colspan="${days.length + 1}">
        <span class="dp-group-name">${escapeHtml(sec.label)}</span>
        <span class="dp-group-meta">${sec.rows.length} etüt${span ? ` · ${escapeHtml(span)}` : ''}</span>
      </td>
    </tr>`;

    const rows = sec.rows.map((row, idx) => `<tr class="${idx % 2 ? 'dp-alt' : ''}">
      <th class="dp-rowlabel">${escapeHtml(row.label)}</th>
      ${days.map((d) => {
        const cell = row.cells[d.key];
        return `<td class="dp-cell">${cell
          ? `<span class="dp-time">${escapeHtml(cell.baslangic)}<i>–</i>${escapeHtml(cell.bitis)}</span>`
          : '<span class="dp-none">—</span>'}</td>`;
      }).join('')}
    </tr>`).join('');

    const brk = sec.breakRow
      ? `<tr class="dp-brk">
          <th class="dp-rowlabel">${escapeHtml(sec.breakRow.label)}</th>
          ${days.map((d) => {
            const cell = sec.breakRow!.cells[d.key];
            return `<td class="dp-cell">${cell
              ? `<span class="dp-time">${escapeHtml(cell.baslangic)}<i>–</i>${escapeHtml(cell.bitis)}</span>`
              : '<span class="dp-none">—</span>'}</td>`;
          }).join('')}
        </tr>`
      : '';

    return group + rows + brk;
  }).join('');

  const chips = [
    `<span class="dp-chip"><strong>${days.length}</strong> gün</span>`,
    `<span class="dp-chip"><strong>${totalDers}</strong> etüt</span>`,
    weekStart && weekEnd ? `<span class="dp-chip">${escapeHtml(weekStart)} – ${escapeHtml(weekEnd)}</span>` : '',
  ].filter(Boolean).join('');

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/>
<title>${escapeHtml(meta.title)}</title>
<style>
  :root {
    --theme: ${theme};
    --ink: #0f172a;
    --muted: #64748b;
    --line: #d7dfea;
    --line-strong: #b9c6d6;
    --fs: ${portrait ? '10' : '12.5'}px;
    --pad: ${portrait ? '5px 3px' : '8px 6px'};
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4 ${portrait ? 'portrait' : 'landscape'}; margin: ${portrait ? '8mm 7mm' : '6mm 8mm'}; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    color: var(--ink); background: #fff; font-size: var(--fs); line-height: 1.3;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    padding: ${portrait ? '8mm 7mm' : '6mm 8mm'};
  }

  .dp-head {
    display: flex; align-items: center; gap: ${portrait ? '10px' : '14px'};
    padding-bottom: ${portrait ? '7px' : '10px'}; margin-bottom: ${portrait ? '8px' : '11px'};
    border-bottom: 3px solid var(--theme);
  }
  .dp-logo { width: ${portrait ? '40px' : '50px'}; height: ${portrait ? '40px' : '50px'}; object-fit: contain; flex-shrink: 0; }
  .dp-titles { flex: 1; min-width: 0; }
  .dp-title {
    font-size: ${portrait ? '15px' : '19px'}; font-weight: 800;
    color: var(--theme); letter-spacing: -0.02em; line-height: 1.15;
  }
  .dp-kurum { font-size: ${portrait ? '10px' : '12px'}; font-weight: 700; color: #334155; margin-top: 2px; }
  .dp-prog { font-size: ${portrait ? '9px' : '10.5px'}; color: var(--muted); margin-top: 2px; }
  .dp-chips { display: flex; gap: 5px; flex-shrink: 0; }
  .dp-chip {
    font-size: ${portrait ? '8.5px' : '10px'}; font-weight: 700; color: #334155;
    padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line); background: #f8fafc;
    white-space: nowrap;
  }
  .dp-chip strong { color: var(--theme); }

  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid var(--line); }

  thead th {
    background: var(--theme); color: #fff; padding: var(--pad);
    border-color: color-mix(in srgb, var(--theme) 75%, #000);
    text-align: center; font-weight: 800;
  }
  .dp-corner {
    width: ${portrait ? '22%' : '16%'}; text-align: left;
    font-size: ${portrait ? '8.5px' : '10px'}; text-transform: uppercase; letter-spacing: 0.06em;
  }
  .dp-day-name { font-size: calc(var(--fs) * 1.02); letter-spacing: -0.01em; }

  .dp-group td {
    padding: ${portrait ? '4px 8px' : '6px 11px'};
    border-left-width: 3px; border-left-color: var(--acc);
    border-top: 1px solid var(--line-strong); border-bottom: 1px solid var(--line-strong);
  }
  .dp-group-name {
    font-weight: 800; color: var(--acc); text-transform: uppercase;
    letter-spacing: 0.05em; font-size: calc(var(--fs) * 0.9);
  }
  .dp-group-meta { font-size: calc(var(--fs) * 0.8); color: var(--muted); font-weight: 600; margin-left: 8px; }

  .dp-rowlabel {
    text-align: left; padding: var(--pad); background: #f6f8fb;
    font-weight: 700; color: #475569; font-size: calc(var(--fs) * 0.88);
    border-right: 2px solid var(--line-strong);
  }
  .dp-cell { text-align: center; padding: var(--pad); }
  .dp-alt .dp-cell { background: #fafbfd; }
  .dp-time { font-weight: 700; white-space: nowrap; letter-spacing: -0.01em; }
  .dp-time i { color: var(--muted); font-style: normal; margin: 0 2px; font-weight: 500; }
  .dp-none { color: #cbd5e1; }

  .dp-brk .dp-rowlabel,
  .dp-brk .dp-cell {
    background: #eef2f7;
    border-top: 1px dashed var(--line-strong); border-bottom: 1px dashed var(--line-strong);
  }
  .dp-brk .dp-rowlabel { text-transform: uppercase; font-size: calc(var(--fs) * 0.78); letter-spacing: 0.04em; }
  .dp-brk .dp-time { font-size: calc(var(--fs) * 0.88); color: #475569; }

  .dp-foot {
    display: flex; justify-content: space-between; align-items: center;
    margin-top: ${portrait ? '6px' : '9px'}; font-size: ${portrait ? '7.5px' : '9px'}; color: #94a3b8;
  }

  @media print {
    body { padding: 0; }
    tr, .dp-head { page-break-inside: avoid; break-inside: avoid; }
    thead { display: table-header-group; }
  }
</style></head><body>
  <header class="dp-head">
    <img class="dp-logo" src="${logo}" alt="${escapeHtml(kurumAd)}" onerror="this.style.display='none'"/>
    <div class="dp-titles">
      <div class="dp-title">${escapeHtml(meta.title)}</div>
      <div class="dp-kurum">${escapeHtml(kurumAd)}${meta.subeAdi ? ` · ${escapeHtml(meta.subeAdi)}` : ''}</div>
      <div class="dp-prog">${escapeHtml(programAd)}</div>
    </div>
    <div class="dp-chips">${chips}</div>
  </header>
  <table>
    <thead>${head}</thead>
    <tbody>${body}</tbody>
  </table>
  <div class="dp-foot">
    <span>Haftalık çalışma programı · 3K Kampüs LMS</span>
    <span>Yazdırma: ${printedAt}</span>
  </div>
</body></html>`;
}

export function buildSeatStudentListPrintHtml(options: {
  meta: KutuphanePrintMeta;
  rows: SeatStudentRow[];
  salonAdi: string;
}): string {
  const { meta, rows, salonAdi } = options;
  const sorted = [...rows].sort((a, b) => a.no.localeCompare(b.no, 'tr', { numeric: true }));

  const tableBody = sorted.length === 0
    ? '<tr><td colspan="6" class="left empty-row">Atanmış öğrenci bulunmuyor</td></tr>'
    : sorted.map((row, idx) => `<tr>
        <td>${idx + 1}</td>
        <td class="left"><strong>${escapeHtml(row.no)}</strong></td>
        <td class="left name-col">${escapeHtml(row.ogrenci)}</td>
        <td>${escapeHtml(row.tip || '—')}</td>
        <td>${escapeHtml(row.baslangic || '—')}</td>
        <td>${escapeHtml(row.durum || 'Aktif')}</td>
      </tr>`).join('');

  const bodyContent = `
  <div class="salon-banner">
    <div class="salon-label">Salon</div>
    <div class="salon-name">${escapeHtml(salonAdi)}</div>
  </div>
  <div class="meta-grid">
    <div class="meta-card"><div class="label">Atanan Öğrenci</div><div class="value">${sorted.length}</div></div>
    <div class="meta-card"><div class="label">Liste Türü</div><div class="value">Oturma Planı</div></div>
    <div class="meta-card"><div class="label">Tarih</div><div class="value">${new Date().toLocaleDateString('tr-TR')}</div></div>
  </div>
  <div class="section">
    <table>
      <thead><tr>
        <th style="width:36px">#</th>
        <th style="width:80px">Masa</th>
        <th class="left">Öğrenci</th>
        <th style="width:90px">Tip</th>
        <th style="width:100px">Başlangıç</th>
        <th style="width:80px">Durum</th>
      </tr></thead>
      <tbody>${tableBody}</tbody>
    </table>
  </div>`;

  return printShell({
    meta,
    bodyContent,
    extraStyles: `
      .salon-banner { margin-bottom: 14px; padding: 10px 14px; background: linear-gradient(180deg, #f8fafc, #fff); border: 1px solid #e2e8f0; border-radius: 10px; }
      .salon-label { font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
      .salon-name { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 4px; letter-spacing: -0.02em; }
      .name-col { font-weight: 600; }
      .empty-row { text-align: center; color: #94a3b8; padding: 20px !important; }
    `,
  });
}

export function buildLockerStudentListPrintHtml(options: {
  meta: KutuphanePrintMeta;
  rows: LockerStudentRow[];
}): string {
  const { meta, rows } = options;
  const sorted = [...rows].sort((a, b) => a.no.localeCompare(b.no, 'tr', { numeric: true }));

  const tableBody = sorted.length === 0
    ? '<tr><td colspan="7" class="left empty-row">Atanmış öğrenci bulunmuyor</td></tr>'
    : sorted.map((row, idx) => `<tr>
        <td>${idx + 1}</td>
        <td class="left"><strong>${escapeHtml(row.no)}</strong></td>
        <td class="left name-col">${escapeHtml(row.ogrenci)}</td>
        <td>${escapeHtml(row.atamaTipi || '—')}</td>
        <td>${escapeHtml(row.anahtar || '—')}</td>
        <td>${escapeHtml(row.baslangic || '—')}</td>
        <td>${escapeHtml(row.durum || 'Aktif')}</td>
      </tr>`).join('');

  const bodyContent = `
  <div class="meta-grid">
    <div class="meta-card"><div class="label">Atanan Öğrenci</div><div class="value">${sorted.length}</div></div>
    <div class="meta-card"><div class="label">Liste Türü</div><div class="value">Dolap Öğrenci Listesi</div></div>
    <div class="meta-card"><div class="label">Şube</div><div class="value">${escapeHtml(meta.subeAdi || '—')}</div></div>
  </div>
  <div class="section">
    <table>
      <thead><tr>
        <th style="width:36px">#</th>
        <th style="width:80px">Dolap</th>
        <th class="left">Öğrenci</th>
        <th style="width:90px">Atama Tipi</th>
        <th style="width:90px">Anahtar</th>
        <th style="width:100px">Başlangıç</th>
        <th style="width:80px">Durum</th>
      </tr></thead>
      <tbody>${tableBody}</tbody>
    </table>
  </div>`;

  return printShell({ meta, bodyContent, extraStyles: '.name-col { font-weight: 600; } .empty-row { text-align: center; color: #94a3b8; padding: 20px !important; }' });
}

export function openKutuphanePrintWindow(html: string): boolean {
  const w = window.open('', '_blank', 'width=1200,height=900');
  if (!w) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return false;
  }
  w.document.write(html);
  w.document.close();
  setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch {
      /* ignore */
    }
  }, 400);
  return true;
}
