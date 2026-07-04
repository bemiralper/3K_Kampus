import { brandingFromKurum, getAppLogo, DEFAULT_BRANDING, type KurumBranding } from './kurum-branding';

export type WeekDayColumn = {
  id: string;
  label?: string;
  periyot?: string;
  ders_no?: number | null;
  durum?: string;
  empty?: boolean;
  kapali?: boolean;
};

export type WeekDayBlock = {
  tarih: string;
  gunAdi: string;
  columns: WeekDayColumn[];
  kapali?: boolean;
};

export type SheetStudent = {
  ogrenci_id: number;
  ogrenci_adi: string;
  masa_no?: string;
  yoklamalar: Record<string, {
    durum?: string | null;
    izinli_mi?: boolean;
    giris_saati?: string | null;
  }>;
};

export type YoklamaPrintMeta = {
  mode: 'daily' | 'weekly';
  salonAdi: string;
  subeAdi?: string;
  tarihLabel: string;
  kurumBranding?: KurumBranding | null;
  orientation?: 'portrait' | 'landscape';
};

const PERIYOT_SHORT: Record<string, string> = {
  MORNING: 'S',
  AFTERNOON: 'Ö',
  EVENING: 'A',
  CUSTOM: 'Öz',
};

const DAY_ABBR: Record<string, string> = {
  pazartesi: 'Pzt',
  salı: 'Sal',
  sali: 'Sal',
  çarşamba: 'Çar',
  carsamba: 'Çar',
  perşembe: 'Per',
  persembe: 'Per',
  cuma: 'Cum',
  cumartesi: 'Cmt',
  pazar: 'Paz',
};

export function abbreviateDayName(gunAdi: string): string {
  return DAY_ABBR[gunAdi.toLowerCase()] || gunAdi.slice(0, 3);
}

export function countWeeklyPeriodCols(weekDays: WeekDayBlock[]): number {
  return weekDays.reduce((sum, day) => sum + Math.max(day.columns.length, 1), 0);
}

export function weeklyTableMinWidth(weekDays: WeekDayBlock[]): number {
  const fixed = 26 + 108 + 34; // # + name + desk
  return fixed + countWeeklyPeriodCols(weekDays) * 24;
}

const STATUS_MARK: Record<string, string> = {
  PRESENT: '✓',
  ABSENT: 'Y',
  LATE: 'G',
  EXCUSED: 'İ',
  NOT_AT_DESK: 'M',
};

/** Pazartesi–Pazar (7 gün) tarih aralığı */
export function getWeekRange(selectedDate: string): { monday: Date; sunday: Date; days: Date[] } {
  const today = new Date(selectedDate + 'T12:00:00');
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  const sunday = days[6];
  return { monday, sunday, days };
}

export function formatWeekRangeLabel(monday: Date, sunday: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
  return `${monday.toLocaleDateString('tr-TR', opts)} – ${sunday.toLocaleDateString('tr-TR', opts)}`;
}

function logoSrc(branding?: KurumBranding | null, origin?: string): string {
  const b = branding ? brandingFromKurum(branding as Parameters<typeof brandingFromKurum>[0]) : null;
  const path = getAppLogo(b ?? DEFAULT_BRANDING);
  if (path.startsWith('http')) return path;
  return `${origin || (typeof window !== 'undefined' ? window.location.origin : '')}${path}`;
}

function renderCell(
  col: WeekDayColumn,
  yk?: SheetStudent['yoklamalar'][string],
): string {
  if (col.empty || col.kapali) {
    return '<td class="cell cell-muted">—</td>';
  }
  if (yk?.izinli_mi) {
    return '<td class="cell"><span class="mark mark-excused">İ</span></td>';
  }
  const isClosed = col.durum === 'CLOSED';
  if (isClosed && yk?.durum && yk.durum !== 'PRESENT') {
    const m = STATUS_MARK[yk.durum] || yk.durum.charAt(0);
    return `<td class="cell"><span class="mark mark-${yk.durum.toLowerCase()}">${m}</span></td>`;
  }
  return '<td class="cell"><span class="check-box"></span></td>';
}

export function buildYoklamaPrintHtml(options: {
  meta: YoklamaPrintMeta;
  students: SheetStudent[];
  columns?: WeekDayColumn[];
  weekDays?: WeekDayBlock[];
  sortStudents: (students: SheetStudent[]) => SheetStudent[];
}): string {
  const { meta, students, columns = [], weekDays = [], sortStudents } = options;
  const branding = meta.kurumBranding;
  const theme = branding?.tema_rengi || '#0262a7';
  const kurumAd = branding?.gorunen_ad || branding?.ad || '3K Kampüs';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const logo = logoSrc(branding, origin);
  const orient = meta.orientation || 'landscape';
  const sorted = sortStudents(students);
  const isWeekly = meta.mode === 'weekly';

  let tableHead = '';
  let tableBody = '';

  if (isWeekly && weekDays.length > 0) {
    const dayHeaders = weekDays.map((day) => {
      const span = Math.max(day.columns.length, 1);
      const shortDate = new Date(day.tarih + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
      const kapali = day.kapali || day.columns.length === 0;
      const dayLabel = abbreviateDayName(day.gunAdi);
      return `<th colspan="${span}" class="day-head${kapali ? ' day-closed' : ''}">
        ${dayLabel}<span class="day-date">${shortDate}</span>
        ${kapali ? '<span class="day-closed-tag">—</span>' : ''}
      </th>`;
    }).join('');

    const periodHeaders = weekDays.map((day) => {
      if (day.kapali || day.columns.length === 0) {
        return '<th class="period-head period-muted">—</th>';
      }
      return day.columns.map((col) => {
        const lbl = PERIYOT_SHORT[col.periyot || ''] || (col.label || '').slice(0, 1);
        const ders = col.ders_no ? `<span class="ders-no">${col.ders_no}</span>` : '';
        return `<th class="period-head">${lbl}${ders}</th>`;
      }).join('');
    }).join('');

    tableHead = `<thead>
      <tr>
        <th rowspan="2" class="sticky-col num-col">#</th>
        <th rowspan="2" class="sticky-col name-col">Öğrenci</th>
        <th rowspan="2" class="desk-col">Masa</th>
        ${dayHeaders}
      </tr>
      <tr>${periodHeaders}</tr>
    </thead>`;

    tableBody = sorted.map((stu, idx) => {
      const cells = weekDays.map((day) => {
        if (day.kapali || day.columns.length === 0) {
          return '<td class="cell cell-muted">—</td>';
        }
        return day.columns.map((col) => renderCell(col, stu.yoklamalar[col.id])).join('');
      }).join('');
      return `<tr>
        <td class="sticky-col num-col">${idx + 1}</td>
        <td class="sticky-col name-col">${escapeHtml(stu.ogrenci_adi)}</td>
        <td class="desk-col">${escapeHtml(stu.masa_no || '—')}</td>
        ${cells}
      </tr>`;
    }).join('');
  } else {
    tableHead = `<thead><tr>
      <th class="num-col">#</th>
      <th class="name-col">Öğrenci</th>
      <th class="desk-col">Masa</th>
      ${columns.map((col) => `<th class="period-head">${escapeHtml(col.label || '')}</th>`).join('')}
    </tr></thead>`;

    tableBody = sorted.map((stu, idx) => {
      const cells = columns.map((col) => renderCell(col, stu.yoklamalar[col.id])).join('');
      return `<tr>
        <td class="num-col">${idx + 1}</td>
        <td class="name-col">${escapeHtml(stu.ogrenci_adi)}</td>
        <td class="desk-col">${escapeHtml(stu.masa_no || '—')}</td>
        ${cells}
      </tr>`;
    }).join('');
  }

  const title = isWeekly ? 'Haftalık Yoklama Listesi' : 'Günlük Yoklama Listesi';
  const printedAt = new Date().toLocaleString('tr-TR');

  const periodColCount = isWeekly ? countWeeklyPeriodCols(weekDays) : columns.length;
  const tableMinW = isWeekly ? weeklyTableMinWidth(weekDays) : Math.max(400, 168 + periodColCount * 40);

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/>
<title>${title} — ${escapeHtml(meta.salonAdi)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #0f172a; font-size: 9px; padding: 8mm; }
  .brand-header { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid ${theme}; padding-bottom: 10px; margin-bottom: 10px; }
  .brand-header img { width: 48px; height: 48px; object-fit: contain; flex-shrink: 0; }
  .brand-text h1 { font-size: 15px; font-weight: 800; color: ${theme}; letter-spacing: -0.02em; }
  .brand-text .kurum { font-size: 10px; font-weight: 600; color: #334155; margin-top: 2px; }
  .brand-text .meta-line { font-size: 9px; color: #64748b; margin-top: 4px; }
  .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 10px; }
  .meta-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 8px; }
  .meta-card .label { font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
  .meta-card .value { font-size: 10px; font-weight: 700; color: #0f172a; margin-top: 2px; }
  .table-wrap { overflow-x: auto; }
  table { border-collapse: collapse; table-layout: fixed; width: ${tableMinW}px; max-width: none; }
  th, td { border: 1px solid #cbd5e1; padding: 2px 1px; text-align: center; vertical-align: middle; overflow: hidden; }
  th { background: #f1f5f9; font-weight: 700; font-size: 8px; line-height: 1.15; }
  .sticky-col { background: #fff; }
  .name-col { text-align: left !important; width: 108px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 8px; }
  .num-col { width: 26px; color: #94a3b8; }
  .desk-col { width: 34px; font-family: ui-monospace, monospace; font-size: 8px; }
  .day-head { background: #e2e8f0 !important; font-size: 8px; font-weight: 800; }
  .day-date { display: block; font-size: 7px; font-weight: 500; color: #64748b; margin-top: 1px; }
  .day-closed { background: #f1f5f9 !important; color: #94a3b8; }
  .day-closed-tag { display: block; font-size: 7px; color: #94a3b8; font-weight: 500; }
  .period-head { font-size: 7px; width: 24px; min-width: 24px; max-width: 24px; font-weight: 800; }
  .period-muted { color: #cbd5e1; width: 24px; }
  .ders-no { display: block; font-size: 6px; color: #94a3b8; font-weight: 600; line-height: 1; }
  tr:nth-child(even) td { background: #fafbfc; }
  .check-box { display: inline-block; width: 12px; height: 12px; border: 1.2px solid #94a3b8; border-radius: 2px; }
  .mark { display: inline-flex; align-items: center; justify-content: center; width: 12px; height: 12px; border-radius: 2px; font-size: 7px; font-weight: 800; }
  .mark-excused { background: #e0e7ff; border: 1.2px solid #6366f1; color: #4338ca; }
  .mark-absent { background: #fee2e2; border: 1.2px solid #ef4444; color: #b91c1c; }
  .mark-late { background: #fef3c7; border: 1.2px solid #f59e0b; color: #b45309; }
  .mark-not_at_desk { background: #fce7f3; border: 1.2px solid #ec4899; color: #be185d; }
  .cell-muted { color: #cbd5e1; }
  .legend { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 10px; font-size: 8px; color: #64748b; align-items: center; }
  .legend-item { display: flex; align-items: center; gap: 4px; }
  .footer { margin-top: 8px; font-size: 7px; color: #94a3b8; text-align: right; }
  @media print {
    body { padding: 5mm; }
    @page { size: ${orient}; margin: 5mm; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    ${isWeekly ? `table { width: 100% !important; font-size: 7px; } .period-head { width: auto; min-width: 0; max-width: none; }` : ''}
  }
</style></head><body>
  <div class="brand-header">
    <img src="${logo}" alt="${escapeHtml(kurumAd)}" onerror="this.style.display='none'"/>
    <div class="brand-text">
      <h1>${title}</h1>
      <div class="kurum">${escapeHtml(kurumAd)}</div>
      <div class="meta-line">${escapeHtml(meta.salonAdi)}${meta.subeAdi ? ` · ${escapeHtml(meta.subeAdi)}` : ''}</div>
    </div>
  </div>
  <div class="meta-grid">
    <div class="meta-card"><div class="label">Dönem</div><div class="value">${escapeHtml(meta.tarihLabel)}</div></div>
    <div class="meta-card"><div class="label">Öğrenci</div><div class="value">${sorted.length}</div></div>
    <div class="meta-card"><div class="label">Liste türü</div><div class="value">${isWeekly ? '7 günlük' : 'Günlük'}</div></div>
  </div>
  <div class="table-wrap">
  <table>${tableHead}<tbody>${tableBody}</tbody></table>
  </div>
  <div class="legend">
    <strong>Lejant:</strong>
    <span class="legend-item"><span class="check-box"></span> Var (boş işaretle)</span>
    <span class="legend-item"><span class="mark mark-excused">İ</span> İzinli</span>
    <span class="legend-item"><span class="mark mark-absent">Y</span> Yok</span>
    <span class="legend-item"><span class="mark mark-late">G</span> Geç</span>
    <span class="legend-item"><span class="mark mark-not_at_desk">M</span> Masada yok</span>
  </div>
  <div class="footer">Yazdırma: ${printedAt} · 3K Kampüs LMS</div>
</body></html>`;
}

export function openYoklamaPrintWindow(html: string): void {
  const w = window.open('', '_blank', 'width=1200,height=900');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
