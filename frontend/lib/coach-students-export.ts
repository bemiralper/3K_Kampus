import type { CoachPortalStudent } from '@/lib/coach-api';
import { COACH_RISK_LABELS } from '@/lib/coach-constants';

function escapeCsv(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatDateExport(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('tr-TR');
}

export function exportCoachStudentsCsv(
  students: CoachPortalStudent[],
  filename = 'ogrencilerim.csv'
): void {
  const headers = [
    'Ad Soyad',
    'Sınıf',
    'Okul No',
    'Risk',
    'Risk Skoru',
    'Son Görüşme',
    'Geciken Ödev',
    'Bugün Görüşme',
    'Görüşme Gerekli',
    'Veli Telefon',
  ];

  const rows = students.map((s) =>
    [
      s.tam_ad,
      s.sinif ?? '',
      s.okul_no ?? '',
      s.risk_seviyesi ? COACH_RISK_LABELS[s.risk_seviyesi] : '',
      s.risk_score ?? '',
      formatDateExport(s.son_gorusme_tarihi),
      s.overdue_homework_count ?? 0,
      s.meeting_today_count ?? 0,
      s.needs_meeting ? 'Evet' : 'Hayır',
      s.veli_telefon ?? '',
    ]
      .map(escapeCsv)
      .join(',')
  );

  const csv = `\uFEFF${headers.join(',')}\n${rows.join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
