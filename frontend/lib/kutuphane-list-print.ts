import { brandingFromKurum, getAppLogo, DEFAULT_BRANDING } from './kurum-branding';
import type { DaySchedule, GunAktiflik, PeriyotDersler, DaySessionCode } from './kutuphane-api';
import {
  DAY_DEFS,
  PERIOD_DEFS,
  deriveGunAktiflik,
  normalizeGunlukDersSaatleri,
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

const DAYS = DAY_DEFS.map((d) => ({ key: d.key, short: d.short, label: d.label }));
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

  const dayColumns = DAYS.map((d) => {
    const dayInfo = gunAktiflik[d.key];
    if (!dayInfo?.aktif) {
      return `<td class="dp-day closed"><span class="dp-closed-label">Kapalı</span></td>`;
    }

    const daySchedule = gunluk[d.key];
    const sessionBlocks = PERIODS.map((p) => {
      const pd = daySchedule?.[p.code];
      if (!pd?.dersler?.length) return '';
      const lines = pd.dersler.map((ders: { ders_no: number; baslangic: string; bitis: string }) => {
        const start = (ders.baslangic || '').slice(0, 5);
        const end = (ders.bitis || '').slice(0, 5);
        return `<div class="dp-slot">
          <span class="dp-slot-no">${ders.ders_no}. Etüt</span>
          <span class="dp-slot-time">${escapeHtml(start)} – ${escapeHtml(end)}</span>
        </div>`;
      }).join('');
      const icon = p.code === 'MORNING' ? '☀' : p.code === 'AFTERNOON' ? '◐' : '☾';
      return `<div class="dp-session" style="--session-color:${p.color}">
        <div class="dp-session-head">${icon} ${escapeHtml(p.label)}</div>
        ${lines}
      </div>`;
    }).filter(Boolean).join('');

    if (!sessionBlocks) {
      return `<td class="dp-day closed"><span class="dp-closed-label">Kapalı</span></td>`;
    }

    return `<td class="dp-day">${sessionBlocks}</td>`;
  }).join('');

  const activeDayCount = DAYS.filter((d) => gunAktiflik[d.key]?.aktif).length;
  const totalDers = Object.values(gunluk).reduce(
    (s, day) => s + PERIODS.reduce((ps, p) => ps + (day[p.code]?.dersler?.length || 0), 0),
    0,
  );

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/>
<title>${escapeHtml(meta.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;0,9..40,700;0,9..40,800;1,9..40,400&display=swap" rel="stylesheet"/>
<style>
  :root { --theme: ${theme}; --ink: #0f172a; --muted: #64748b; --line: #dbe3ef; --soft: #f8fafc; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4 landscape; margin: 6mm; }
  body {
    font-family: 'DM Sans', 'Segoe UI', system-ui, sans-serif;
    color: var(--ink); background: #fff; font-size: 10px; line-height: 1.35;
    padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .dp-wrap { width: 100%; max-width: 285mm; margin: 0 auto; }
  .dp-header {
    display: grid; grid-template-columns: auto 1fr auto; gap: 14px; align-items: center;
    padding: 10px 14px; border: 1px solid var(--line); border-radius: 12px;
    background: linear-gradient(135deg, #ffffff 0%, var(--soft) 100%);
    margin-bottom: 8px;
  }
  .dp-logo {
    width: 52px; height: 52px; object-fit: contain; border-radius: 10px;
    border: 1px solid var(--line); background: #fff; padding: 4px;
  }
  .dp-title { font-size: 20px; font-weight: 800; color: var(--theme); letter-spacing: -0.03em; }
  .dp-sub { font-size: 11px; font-weight: 600; color: #334155; margin-top: 2px; }
  .dp-meta { font-size: 9px; color: var(--muted); margin-top: 4px; }
  .dp-badges { display: flex; flex-direction: column; gap: 5px; align-items: flex-end; }
  .dp-badge {
    font-size: 9px; font-weight: 700; padding: 4px 10px; border-radius: 999px;
    border: 1px solid var(--line); background: #fff; color: #334155; white-space: nowrap;
  }
  .dp-badge strong { color: var(--theme); }
  .dp-table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
  .dp-table thead th {
    font-size: 11px; font-weight: 800; color: #fff; background: var(--theme);
    padding: 8px 4px; border: 1px solid color-mix(in srgb, var(--theme) 80%, #000);
    text-align: center; vertical-align: middle;
  }
  .dp-table thead th .dp-day-full {
    display: block; font-size: 8px; font-weight: 600; opacity: 0.9; margin-top: 1px;
  }
  .dp-table tbody td.dp-day {
    vertical-align: top; border: 1px solid var(--line); background: #fff;
    padding: 6px 5px; min-height: 72px;
  }
  .dp-table tbody td.dp-day.closed { background: #f1f5f9; }
  .dp-closed-label { display: block; text-align: center; color: #94a3b8; font-style: italic; font-weight: 600; padding: 16px 2px; }
  .dp-session {
    margin-bottom: 6px; padding: 5px 6px; border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--session-color) 25%, var(--line));
    background: color-mix(in srgb, var(--session-color) 6%, #fff);
  }
  .dp-session:last-child { margin-bottom: 0; }
  .dp-session-head {
    font-size: 9.5px; font-weight: 800; color: var(--session-color);
    margin-bottom: 4px; letter-spacing: 0.01em;
  }
  .dp-slot {
    display: flex; justify-content: space-between; align-items: baseline; gap: 4px;
    padding: 3px 0; border-bottom: 1px dashed #e8edf3;
  }
  .dp-slot:last-child { border-bottom: none; padding-bottom: 0; }
  .dp-slot-no { font-size: 9px; font-weight: 700; color: #475569; }
  .dp-slot-time {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 10px; font-weight: 700; color: var(--ink); white-space: nowrap;
  }
  .dp-footer {
    margin-top: 6px; display: flex; justify-content: space-between; align-items: center;
    font-size: 8px; color: #94a3b8; padding: 0 2px;
  }
  @media print {
    body { padding: 0; }
    .dp-wrap { max-width: none; }
    .dp-header, .dp-table { page-break-inside: avoid; break-inside: avoid; }
    .dp-table tbody tr { page-break-inside: avoid; break-inside: avoid; }
  }
</style></head><body>
  <div class="dp-wrap">
    <header class="dp-header">
      <img class="dp-logo" src="${logo}" alt="${escapeHtml(kurumAd)}" onerror="this.style.display='none'"/>
      <div>
        <div class="dp-title">${escapeHtml(meta.title)}</div>
        <div class="dp-sub">${escapeHtml(kurumAd)}${meta.subeAdi ? ` · ${escapeHtml(meta.subeAdi)}` : ''}</div>
        <div class="dp-meta">${escapeHtml(programAd)}${meta.subtitle ? ` · ${escapeHtml(meta.subtitle)}` : ''}</div>
      </div>
      <div class="dp-badges">
        <span class="dp-badge"><strong>${activeDayCount}</strong> aktif gün</span>
        <span class="dp-badge"><strong>${totalDers}</strong> etüt</span>
      </div>
    </header>
    <table class="dp-table">
      <thead><tr>${DAYS.map((d) => `<th>${escapeHtml(d.short)}<span class="dp-day-full">${escapeHtml(d.label)}</span></th>`).join('')}</tr></thead>
      <tbody><tr>${dayColumns}</tr></tbody>
    </table>
    <div class="dp-footer">
      <span>Haftalık çalışma programı</span>
      <span>Yazdırma: ${printedAt}</span>
    </div>
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
