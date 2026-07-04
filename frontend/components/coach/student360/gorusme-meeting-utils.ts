import type { GorusmeKaydiListItem } from '@/app/admin/coaching/meetings/types';
import { GORUSME_DURUMLARI } from '@/app/admin/coaching/meetings/types';

export function gorusmeDurumBadgeClass(durum: string): string {
  if (durum === 'tamamlandi') return 'green';
  if (durum === 'planlandi') return 'blue';
  if (durum === 'iptal') return 'red';
  if (durum === 'ertelendi') return 'amber';
  return 'gray';
}

export function gorusmeYontemMeta(yontem: string) {
  switch (yontem) {
    case 'yuz_yuze':
      return {
        stripeClass: 'is-yuz-yuze',
        chipClass: 'is-yuz-yuze',
        icon: '🤝',
      };
    case 'telefon':
      return {
        stripeClass: 'is-telefon',
        chipClass: 'is-telefon',
        icon: '📞',
      };
    case 'online':
      return {
        stripeClass: 'is-online',
        chipClass: 'is-online',
        icon: '💻',
      };
    default:
      return {
        stripeClass: 'is-yuz-yuze',
        chipClass: 'is-yuz-yuze',
        icon: '💬',
      };
  }
}

export function gorusmeDurumLabel(durum: string, durumDisplay?: string): string {
  if (durumDisplay) return durumDisplay;
  return GORUSME_DURUMLARI.find((d) => d.value === durum)?.label ?? durum;
}

export function filterVeliMeetings(list: GorusmeKaydiListItem[]): GorusmeKaydiListItem[] {
  return list.filter((g) => g.gorusme_turu === 'veli' || g.veli_ile_paylasilsin);
}

export function fmtGorusmeDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function fmtGorusmeTime(t?: string | null): string {
  if (!t) return '';
  return t.slice(0, 5);
}
