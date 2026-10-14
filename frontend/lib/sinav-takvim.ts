import type { SinavTakvim } from '@/lib/website-api';

export type SinavTabId = 'yks' | 'sinif11' | 'lgs' | 'sinif7';

export type SinavTabConfig = {
  id: SinavTabId;
  label: string;
  hint: string;
  calendarLabel: string;
  listTitle: string;
  createTitle: string;
  addTitle: string;
  emptyMonth: string;
  emptyAdmin: string;
  types: { value: string; label: string }[];
};

export const SINAV_TABS: SinavTabConfig[] = [
  {
    id: 'yks',
    label: 'YKS',
    hint: 'TYT & AYT',
    calendarLabel: 'YKS Takvimi',
    listTitle: 'YKS Sınavları',
    createTitle: 'YKS',
    addTitle: 'YKS sınavı ekle',
    emptyMonth: 'YKS (TYT/AYT) sınavı bulunmuyor.',
    emptyAdmin: 'Henüz YKS sınavı yok. Takvimden bir güne tıklayarak ekleyin.',
    types: [
      { value: 'TYT', label: 'TYT' },
      { value: 'AYT', label: 'AYT' },
    ],
  },
  {
    id: 'sinif11',
    label: '11. Sınıf',
    hint: 'Denemeler',
    calendarLabel: '11. Sınıf Takvimi',
    listTitle: '11. Sınıf Sınavları',
    createTitle: '11. Sınıf',
    addTitle: '11. sınıf sınavı ekle',
    emptyMonth: '11. sınıf sınavı bulunmuyor.',
    emptyAdmin: 'Henüz 11. sınıf sınavı yok. Takvimden bir güne tıklayarak ekleyin.',
    types: [{ value: 'S11', label: '11. Sınıf' }],
  },
  {
    id: 'lgs',
    label: 'LGS',
    hint: 'Liseye Geçiş',
    calendarLabel: 'LGS Takvimi',
    listTitle: 'LGS Sınavları',
    createTitle: 'LGS',
    addTitle: 'LGS sınavı ekle',
    emptyMonth: 'LGS sınavı bulunmuyor.',
    emptyAdmin: 'Henüz LGS sınavı yok. Takvimden bir güne tıklayarak ekleyin.',
    types: [{ value: 'LGS', label: 'LGS' }],
  },
  {
    id: 'sinif7',
    label: '7. Sınıf',
    hint: 'Denemeler',
    calendarLabel: '7. Sınıf Takvimi',
    listTitle: '7. Sınıf Sınavları',
    createTitle: '7. Sınıf',
    addTitle: '7. sınıf sınavı ekle',
    emptyMonth: '7. sınıf sınavı bulunmuyor.',
    emptyAdmin: 'Henüz 7. sınıf sınavı yok. Takvimden bir güne tıklayarak ekleyin.',
    types: [{ value: 'S7', label: '7. Sınıf' }],
  },
];

export function sinavTabById(id: SinavTabId): SinavTabConfig {
  return SINAV_TABS.find(tab => tab.id === id) ?? SINAV_TABS[0];
}

export function filterSinavByTab<T extends Pick<SinavTakvim, 'tur'>>(list: T[], tab: SinavTabId): T[] {
  const types = new Set(sinavTabById(tab).types.map(item => item.value));
  return list.filter(item => types.has(item.tur));
}

export function defaultTurForTab(tab: SinavTabId): string {
  return sinavTabById(tab).types[0].value;
}
