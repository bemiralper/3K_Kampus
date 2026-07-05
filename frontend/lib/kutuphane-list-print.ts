import { brandingFromKurum, getAppLogo, DEFAULT_BRANDING } from './kurum-branding';
import type { GunAktiflik, PeriyotDersler, SessionCode } from './kutuphane-api';

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

const DAYS = [
  { key: '0', short: 'Pzt', label: 'Pazartesi' },
  { key: '1', short: 'Sal', label: 'Salı' },
  { key: '2', short: 'Çar', label: 'Çarşamba' },
  { key: '3', short: 'Per', label: 'Perşembe' },
  { key: '4', short: 'Cum', label: 'Cuma' },
  { key: '5', short: 'Cmt', label: 'Cumartesi' },
  { key: '6', short: 'Paz', label: 'Pazar' },
];

const PERIODS: { code: SessionCode; label: string; color: string }[] = [
  { code: 'MORNING', label: 'Sabah', color: '#d97706' },
  { code: 'AFTERNOON', label: 'Öğle', color: '#2563eb' },
  { code: 'EVENING', label: 'Akşam', color: '#4f46e5' },
];

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
}): string {
  const { meta, bodyContent, extraStyles = '' } = options;
  const branding = meta.kurumBranding;
  const theme = branding?.tema_rengi || '#0262a7';
  const kurumAd = branding?.gorunen_ad || branding?.ad || '3K Kampüs';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const logo = logoSrc(branding, origin);
  const orient = meta.orientation || 'landscape';
  const printedAt = new Date().toLocaleString('tr-TR');

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
  ${extraStyles}
  @media print {
    body { padding: 5mm; }
    @page { size: ${orient}; margin: 5mm; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
</style></head><body>
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
  dersSaatleri: Record<string, PeriyotDersler>;
  gunAktiflik: Record<string, GunAktiflik>;
}): string {
  const { meta, programAd, dersSaatleri, gunAktiflik } = options;

  const weekMatrixHead = DAYS.map((d) => `<th>${d.short}</th>`).join('');
  const weekMatrixBody = PERIODS.map((p) => {
    const cells = DAYS.map((d) => {
      const day = gunAktiflik[d.key];
      const active = day?.aktif && day.periyotlar.includes(p.code);
      return `<td class="${active ? 'active-cell' : 'inactive-cell'}">${active ? '✓' : '—'}</td>`;
    }).join('');
    return `<tr><td class="left period-label" style="color:${p.color}">${escapeHtml(p.label)}</td>${cells}</tr>`;
  }).join('');

  const periodSections = PERIODS.map((p) => {
    const pd = dersSaatleri[p.code];
    if (!pd?.dersler?.length) return '';
    const rows = pd.dersler.map((ders, idx) => {
      const mola = idx < pd.dersler.length - 1 && pd.molalar[idx]
        ? `${pd.molalar[idx].sure_dk} dk`
        : '—';
      const start = ders.baslangic?.slice(0, 5) || '';
      const end = ders.bitis?.slice(0, 5) || '';
      return `<tr>
        <td><strong>${ders.ders_no}</strong></td>
        <td class="left time-cell">${escapeHtml(start)} – ${escapeHtml(end)}</td>
        <td>${pd.ders_suresi_dk} dk</td>
        <td>${mola}</td>
      </tr>`;
    }).join('');

    return `<div class="section period-block">
      <div class="section-title" style="color:${p.color}">${escapeHtml(p.label)} Periyodu · ${pd.dersler.length} ders · ${pd.ders_suresi_dk} dk</div>
      <table class="period-table">
        <thead><tr><th>#</th><th class="left">Ders Saati</th><th>Süre</th><th>Mola</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');

  const activeDayCount = DAYS.filter((d) => gunAktiflik[d.key]?.aktif).length;
  const totalPeriods = Object.values(gunAktiflik).reduce(
    (s, g) => s + (g.aktif ? g.periyotlar.length : 0),
    0,
  );

  const bodyContent = `
  <div class="meta-grid">
    <div class="meta-card"><div class="label">Program</div><div class="value">${escapeHtml(programAd)}</div></div>
    <div class="meta-card"><div class="label">Aktif Gün</div><div class="value">${activeDayCount} / 7</div></div>
    <div class="meta-card"><div class="label">Haftalık Periyot</div><div class="value">${totalPeriods}</div></div>
  </div>
  <div class="section">
    <div class="section-title">Haftalık Aktiflik Matrisi</div>
    <table class="week-matrix">
      <thead><tr><th class="left">Periyot</th>${weekMatrixHead}</tr></thead>
      <tbody>${weekMatrixBody}</tbody>
    </table>
  </div>
  <div class="periods-row">${periodSections}</div>`;

  return printShell({
    meta: { ...meta, orientation: 'landscape' },
    bodyContent,
    extraStyles: `
      .week-matrix .active-cell { background: #ecfdf5; color: #059669; font-weight: 800; font-size: 12px; }
      .week-matrix .inactive-cell { background: #f8fafc; color: #cbd5e1; }
      .week-matrix .period-label { font-weight: 700; background: #fff !important; }
      .periods-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
      .period-block { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; background: #fafbfc; }
      .period-table th, .period-table td { font-size: 9px; padding: 5px 6px; }
      .time-cell { font-family: ui-monospace, monospace; font-weight: 700; color: #1e293b; }
      @media print { .periods-row { grid-template-columns: repeat(3, 1fr); } }
    `,
  });
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
  <div class="meta-grid">
    <div class="meta-card"><div class="label">Salon</div><div class="value">${escapeHtml(salonAdi)}</div></div>
    <div class="meta-card"><div class="label">Atanan Öğrenci</div><div class="value">${sorted.length}</div></div>
    <div class="meta-card"><div class="label">Liste Türü</div><div class="value">Masa Öğrenci Listesi</div></div>
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
