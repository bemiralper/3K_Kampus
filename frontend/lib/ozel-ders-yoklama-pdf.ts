/**
 * Özel ders günlük yoklama listesi — öğrenci listesiyle aynı kurumsal PDF.
 */
import {
  exportGroupedOgrenciListPdf,
  exportOgrenciListPdf,
  type OgrenciListPdfBranding,
} from '@/app/ogrenciler/lib/ogrenciListPdfExport';
import { resolveDersLabel, type BirebirOturum } from '@/lib/ozel-ders-api';

export const YOKLAMA_PDF_COLUMN_KEYS = [
  'saat',
  'ogrenci',
  'ders',
  'ogretmen',
  'oda',
  'islendi',
  'ogretmen_gelmedi',
  'ogrenci_gelmedi',
  'iptal',
] as const;

export const YOKLAMA_PDF_COLUMN_LABELS = [
  'Saat',
  'Öğrenci',
  'Ders',
  'Öğretmen',
  'Oda',
  'İşlendi',
  'Öğrt. gelmedi',
  'Öğr. gelmedi',
  'İptal',
];

export const YOKLAMA_PDF_CHECKBOX_KEYS = [
  'islendi',
  'ogretmen_gelmedi',
  'ogrenci_gelmedi',
  'iptal',
] as const;

function checkboxMark(oturum: BirebirOturum, key: (typeof YOKLAMA_PDF_CHECKBOX_KEYS)[number]): string {
  const durum = oturum.durum || '';
  if (key === 'islendi' && (durum === 'ISLENDI' || durum === 'ONLINE')) return '1';
  if (key === 'ogretmen_gelmedi' && durum === 'OGRETMEN_GELMEDI') return '1';
  if (key === 'ogrenci_gelmedi' && durum === 'OGRENCI_GELMEDI') return '1';
  if (key === 'iptal' && durum === 'IPTAL') return '1';
  return '';
}

const DAY_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTH_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

export function formatYoklamaGunBaslik(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return `${d} ${MONTH_TR[m - 1] || ''} ${y} ${DAY_TR[date.getDay()] || ''}`.trim();
}

function timeRange(oturum: BirebirOturum): string {
  const start = (oturum.start_time || '').slice(0, 5);
  const end = (oturum.end_time || '').slice(0, 5);
  return start && end ? `${start}–${end}` : start || '—';
}

function dersCell(oturum: BirebirOturum, useKisaAd: boolean): string {
  const ad = resolveDersLabel(oturum, useKisaAd) || oturum.ders_ad || '—';
  if (oturum.oturum_turu === 'TELAFI') return `${ad} (Telafi)`;
  if (oturum.oturum_turu === 'EK') return `${ad} (Ek)`;
  return ad;
}

export function oturumToYoklamaPdfRow(
  oturum: BirebirOturum,
  useKisaAd = false,
): Record<string, string> {
  return {
    saat: timeRange(oturum),
    ogrenci: oturum.ogrenci_ad || '—',
    ders: dersCell(oturum, useKisaAd),
    ogretmen: oturum.ogretmen_ad || '—',
    oda: oturum.oda_ad || '—',
    islendi: checkboxMark(oturum, 'islendi'),
    ogretmen_gelmedi: checkboxMark(oturum, 'ogretmen_gelmedi'),
    ogrenci_gelmedi: checkboxMark(oturum, 'ogrenci_gelmedi'),
    iptal: checkboxMark(oturum, 'iptal'),
  };
}

function sortOturumlar(rows: BirebirOturum[]): BirebirOturum[] {
  return [...rows].sort((a, b) => {
    const dateCmp = (a.session_date || '').localeCompare(b.session_date || '');
    if (dateCmp !== 0) return dateCmp;
    return (a.start_time || '').localeCompare(b.start_time || '');
  });
}

function groupByDate(rows: BirebirOturum[]): { date: string; rows: BirebirOturum[] }[] {
  const map = new Map<string, BirebirOturum[]>();
  for (const row of sortOturumlar(rows)) {
    const key = row.session_date?.slice(0, 10) || '';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return [...map.entries()].map(([date, dayRows]) => ({ date, rows: dayRows }));
}

export async function exportOzelDersYoklamaPdf(options: {
  sessions: BirebirOturum[];
  branding: OgrenciListPdfBranding;
  useKisaAd?: boolean;
}): Promise<void> {
  const sessions = options.sessions;
  if (sessions.length === 0) {
    throw new Error('Yoklama listesi için oturum bulunamadı.');
  }

  const groups = groupByDate(sessions);
  const useKisaAd = Boolean(options.useKisaAd);
  const first = groups[0]?.date || '';
  const last = groups[groups.length - 1]?.date || first;
  const fileName =
    first && last && first !== last
      ? `ozel_ders_yoklama_${first}_${last}.pdf`
      : `ozel_ders_yoklama_${first || 'liste'}.pdf`;

  const common = {
    columnKeys: [...YOKLAMA_PDF_COLUMN_KEYS],
    columnLabels: [...YOKLAMA_PDF_COLUMN_LABELS],
    checkboxKeys: [...YOKLAMA_PDF_CHECKBOX_KEYS],
    branding: options.branding,
    orientation: 'landscape' as const,
    fileName,
  };

  if (groups.length === 1) {
    await exportOgrenciListPdf({
      ...common,
      rows: groups[0].rows.map((row) => oturumToYoklamaPdfRow(row, useKisaAd)),
      documentTitle: 'Özel Ders Yoklama Listesi',
      filterSummary: formatYoklamaGunBaslik(groups[0].date),
    });
    return;
  }

  await exportGroupedOgrenciListPdf({
    ...common,
    sections: groups.map((group) => ({
      title: formatYoklamaGunBaslik(group.date),
      rows: group.rows.map((row) => oturumToYoklamaPdfRow(row, useKisaAd)),
    })),
    documentTitle: 'Özel Ders Yoklama Listesi',
    filterSummary: `${formatYoklamaGunBaslik(first)} — ${formatYoklamaGunBaslik(last)}`,
    pageBreakBetweenSections: true,
  });
}
