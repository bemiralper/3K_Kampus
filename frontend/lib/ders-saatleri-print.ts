import {
  brandingFromSube,
  getSubePrintLogo,
  type SubeBrandingInput,
} from './kurum-branding';
import { lunchBreakColors } from './sube-theme-colors';
import type { ScheduleTemplateDetail, TimeSlot } from './academic-api';

export type DersSaatiPrintMeta = {
  /** Yalnızca şube markası — logo ve tema buradan gelir */
  sube: SubeBrandingInput;
  subeAdi?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function absoluteAssetUrl(path: string, origin: string): string {
  if (path.startsWith('http')) return path;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

const SLOT_PRINT_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  LESSON: { label: 'Normal Ders', color: '#1d4ed8', bg: '#eff6ff' },
  SHORT_BREAK: { label: 'Teneffüs', color: '#475569', bg: '#f1f5f9' },
  CUSTOM_BREAK: { label: 'Etüt', color: '#7c3aed', bg: '#f5f3ff' },
  EVENING_BREAK: { label: 'Serbest Saat', color: '#0f766e', bg: '#f0fdfa' },
};

function displaySlotName(name: string, slotType: string): string {
  if (slotType === 'SHORT_BREAK') return 'Teneffüs';
  if (slotType === 'LUNCH_BREAK') return 'Öğle Arası';
  if (slotType === 'EVENING_BREAK') return 'Serbest Saat';
  return name;
}

function slotStyle(slot: TimeSlot, themeHex: string) {
  if (slot.slot_type === 'LUNCH_BREAK') {
    const lunch = lunchBreakColors(themeHex);
    return { label: 'Öğle Arası', color: lunch.color, bg: lunch.bg, border: lunch.border };
  }
  return (
    SLOT_PRINT_STYLE[slot.slot_type] ?? {
      label: slot.slot_type_display,
      color: '#334155',
      bg: '#f8fafc',
      border: '#e2e8f0',
    }
  );
}

function formatDuration(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} dk`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m ? `${h} sa ${m} dk` : `${h} sa`;
}

export function buildDersSaatiSablonPrintHtml(
  template: ScheduleTemplateDetail,
  meta: DersSaatiPrintMeta,
): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const subeBrand = brandingFromSube(meta.sube);
  const theme = subeBrand.tema_rengi || '#0262a7';
  const displayName = subeBrand.gorunen_ad || meta.sube.ad;
  const subeLabel = meta.subeAdi || meta.sube.ad;
  const { src: logoPath, onDarkBackground: logoOnDark } = getSubePrintLogo(meta.sube);
  const logo = absoluteAssetUrl(logoPath, origin);
  const logoWrapBg = subeBrand.login_arkaplan_rengi || '#1e3a5f';
  const logoHtml = logoOnDark
    ? `<div class="logo-dark-wrap" style="background:linear-gradient(135deg,${logoWrapBg},${subeBrand.login_arkaplan_rengi_2 || logoWrapBg})"><img src="${logo}" alt="${escapeHtml(displayName)}"/></div>`
    : `<img src="${logo}" alt="${escapeHtml(displayName)}" onerror="this.style.display='none'"/>`;
  const printedAt = new Date().toLocaleString('tr-TR');
  const slots = [...template.time_slots].sort((a, b) => a.order - b.order);
  const lessons = slots.filter((s) => s.slot_type === 'LESSON');
  const first = slots[0];
  const last = slots[slots.length - 1];
  const totalSpan =
    first && last
      ? formatDuration(
          (parseInt(last.end_time_display.slice(0, 2), 10) * 60 +
            parseInt(last.end_time_display.slice(3, 5), 10)) -
            (parseInt(first.start_time_display.slice(0, 2), 10) * 60 +
              parseInt(first.start_time_display.slice(3, 5), 10)),
        )
      : '—';

  const tableRows = slots
    .map((s) => {
      const st = slotStyle(s, theme);
      const isLunch = s.slot_type === 'LUNCH_BREAK';
      const rowClass = isLunch ? 'row-lunch' : s.is_break ? 'row-break' : 'row-lesson';
      const rowStyle = isLunch ? ` style="background:${st.bg};color:${st.color}"` : '';
      const displayName = displaySlotName(s.name, s.slot_type);
      return `<tr class="${rowClass}"${rowStyle}>
        <td class="left name">${escapeHtml(displayName)}</td>
        <td><strong>${escapeHtml(s.start_time_display)}</strong></td>
        <td><strong>${escapeHtml(s.end_time_display)}</strong></td>
        <td>${s.duration} dk</td>
        <td><span class="type-badge" style="color:${st.color};background:${isLunch ? st.bg : st.bg};border-color:${'border' in st ? st.border : st.color + '22'}">${escapeHtml(st.label)}</span></td>
      </tr>`;
    })
    .join('');

  const timeline = slots
    .map((s) => {
      const st = slotStyle(s, theme);
      const displayName = displaySlotName(s.name, s.slot_type);
      return `<div class="tl-item">
        <span class="tl-time">${escapeHtml(s.start_time_display)}</span>
        <span class="tl-dot" style="background:${st.color}"></span>
        <span class="tl-label" style="color:${st.color}">${escapeHtml(displayName)}</span>
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/>
<title>${escapeHtml(template.name)} — Ders Saati Şablonu</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    color: #0f172a;
    font-size: 11px;
    padding: 10mm 12mm;
    background: #fff;
    line-height: 1.4;
  }
  .brand-header {
    display: flex;
    align-items: center;
    gap: 16px;
    border-bottom: 3px solid ${theme};
    padding-bottom: 12px;
    margin-bottom: 16px;
  }
  .brand-header img {
    width: 56px;
    height: 56px;
    object-fit: contain;
    flex-shrink: 0;
  }
  .logo-dark-wrap {
    width: 56px;
    height: 56px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    flex-shrink: 0;
  }
  .logo-dark-wrap img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .brand-text h1 {
    font-size: 20px;
    font-weight: 800;
    color: ${theme};
    letter-spacing: -0.02em;
    margin-bottom: 2px;
  }
  .brand-text .doc-type {
    font-size: 12px;
    font-weight: 600;
    color: #475569;
  }
  .brand-text .meta-line {
    font-size: 10px;
    color: #64748b;
    margin-top: 4px;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 18px;
  }
  .meta-card {
    background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 10px 12px;
  }
  .meta-card .label {
    font-size: 8px;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .meta-card .value {
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
    margin-top: 4px;
  }
  .section-title {
    font-size: 13px;
    font-weight: 800;
    color: ${theme};
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .section-title::before {
    content: '';
    width: 4px;
    height: 18px;
    background: ${theme};
    border-radius: 2px;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 18px;
  }
  th, td {
    border: 1px solid #cbd5e1;
    padding: 8px 10px;
    text-align: center;
    vertical-align: middle;
  }
  th {
    background: ${theme};
    color: #fff;
    font-weight: 700;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  td.left { text-align: left; }
  td.name { font-weight: 600; }
  tr.row-lesson td { background: #fafbff; }
  tr.row-break td { background: #fefefe; }
  tr.row-lunch td { font-weight: 600; }
  tr:nth-child(even).row-lesson td { background: #f1f5f9; }
  .type-badge {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 9px;
    font-weight: 700;
    border: 1px solid;
    white-space: nowrap;
  }
  .timeline {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    padding: 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    margin-bottom: 14px;
  }
  .tl-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 9px;
  }
  .tl-time { color: #64748b; font-weight: 600; min-width: 36px; }
  .tl-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .tl-label { font-weight: 700; }
  .footer {
    margin-top: 16px;
    padding-top: 10px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: #94a3b8;
  }
  .footer strong { color: #64748b; }
  @media print {
    body { padding: 8mm; }
    @page { size: A4 portrait; margin: 8mm; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    .timeline { page-break-inside: avoid; }
  }
</style></head><body>
  <header class="brand-header">
    ${logoHtml}
    <div class="brand-text">
      <h1>${escapeHtml(template.name)}</h1>
      <div class="doc-type">Ders Saati Şablonu</div>
      <div class="meta-line">
        ${escapeHtml(displayName)}${subeLabel && subeLabel !== displayName ? ` · ${escapeHtml(subeLabel)}` : ''}
        ${template.description ? ` · ${escapeHtml(template.description)}` : ''}
      </div>
    </div>
  </header>

  <div class="meta-grid">
    <div class="meta-card">
      <div class="label">Gün Yapısı</div>
      <div class="value">${escapeHtml(template.weekly_cycle_name || '—')}</div>
    </div>
    <div class="meta-card">
      <div class="label">Ders Sayısı</div>
      <div class="value">${lessons.length}</div>
    </div>
    <div class="meta-card">
      <div class="label">Gün Başı — Gün Sonu</div>
      <div class="value">${first ? escapeHtml(first.start_time_display) : '—'} – ${last ? escapeHtml(last.end_time_display) : '—'}</div>
    </div>
    <div class="meta-card">
      <div class="label">Toplam Süre</div>
      <div class="value">${escapeHtml(totalSpan)}</div>
    </div>
  </div>

  <div class="section-title">Günlük Zaman Çizelgesi</div>
  <div class="timeline">${timeline || '<span style="color:#94a3b8">Tanımlı slot yok</span>'}</div>

  <div class="section-title">Detaylı Liste</div>
  <table>
    <thead>
      <tr>
        <th style="width:32%">Ad</th>
        <th>Başlangıç</th>
        <th>Bitiş</th>
        <th>Süre</th>
        <th>Tip</th>
      </tr>
    </thead>
    <tbody>${tableRows || '<tr><td colspan="5">Kayıtlı ders saati yok</td></tr>'}</tbody>
  </table>

  <footer class="footer">
    <span><strong>3K Kampüs</strong> · Akademik Operasyon</span>
    <span>Yazdırma: ${escapeHtml(printedAt)}</span>
  </footer>
</body></html>`;
}

export function openDersSaatiSablonPrintWindow(html: string): void {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = () => {
    w.print();
  };
}
