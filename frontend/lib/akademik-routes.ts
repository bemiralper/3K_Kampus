export const AKADEMIK_BASE = '/akademik-planlama';

export const AKADEMIK_MODULE_LABEL = 'Akademik Operasyon';

export type AkademikNavGroup =
  | 'Tanımlar'
  | 'Planlama'
  | 'Ders Operasyonları'
  | 'Görüntüleme'
  | 'Analiz';

export type AkademikTabItem = {
  segment: string;
  label: string;
};

export type AkademikGroupDef = {
  slug: string;
  label: AkademikNavGroup;
  tabs: AkademikTabItem[];
};

export const AKADEMIK_GROUPS: AkademikGroupDef[] = [
  {
    slug: 'tanimlar',
    label: 'Tanımlar',
    tabs: [
      { segment: 'ders-saatleri', label: 'Ders Saatleri' },
      { segment: 'haftalik-gun-yapilari', label: 'Çalışma Takvimi' },
      { segment: 'ogretmen-uygunluklari', label: 'Öğretmen Uygunlukları' },
      { segment: 'program-kurallari', label: 'Program Kuralları' },
    ],
  },
  {
    slug: 'planlama',
    label: 'Planlama',
    tabs: [
      { segment: 'sinif-ders-planlari', label: 'Sınıf Ders Planları' },
      { segment: 'ogretmen-atamalari', label: 'Öğretmen Atamaları' },
      { segment: 'ders-programi', label: 'Ders Programı' },
      { segment: 'otomatik-program-olusturucu', label: 'Otomatik Program Oluşturucu' },
      { segment: 'cakisma-merkezi', label: 'Çakışma Merkezi' },
    ],
  },
  {
    slug: 'ders-operasyonlari',
    label: 'Ders Operasyonları',
    tabs: [
      { segment: 'bugunku-dersler', label: 'Bugünkü Dersler' },
      { segment: 'ders-oturumlari', label: 'Ders Oturumları' },
      { segment: 'ogretmen-yoklamalari', label: 'Öğretmen Yoklamaları' },
      { segment: 'ogrenci-yoklamalari', label: 'Öğrenci Yoklamaları' },
      { segment: 'ozel-dersler', label: 'Özel Dersler' },
      { segment: 'telafi-dersleri', label: 'Telafi Dersleri' },
      { segment: 'ek-dersler', label: 'Ek Dersler' },
      { segment: 'ders-ucretleri', label: 'Ders Ücretleri' },
      { segment: 'program-revizyonlari', label: 'Program Revizyonları' },
    ],
  },
  {
    slug: 'goruntuleme',
    label: 'Görüntüleme',
    tabs: [
      { segment: 'sinif-programi', label: 'Sınıf Programı' },
      { segment: 'ogretmen-programi', label: 'Öğretmen Programı' },
      { segment: 'derslik-programi', label: 'Derslik Programı' },
      { segment: 'brans-programi', label: 'Branş Programı' },
      { segment: 'canli-ders-durumu', label: 'Canlı Ders Durumu' },
    ],
  },
  {
    slug: 'analiz',
    label: 'Analiz',
    tabs: [
      { segment: 'ders-yukleri', label: 'Ders Yükleri' },
      { segment: 'derslik-kullanimi', label: 'Derslik Kullanımı' },
      { segment: 'ogretmen-yogunlugu', label: 'Öğretmen Yoğunluğu' },
      { segment: 'devamsizlik-analizleri', label: 'Devamsızlık Analizleri' },
      { segment: 'ders-gerceklestirme-oranlari', label: 'Ders Gerçekleşme Oranları' },
      { segment: 'program-istatistikleri', label: 'Program İstatistikleri' },
    ],
  },
];

export function akademikGroupHref(groupSlug: string): string {
  return `${AKADEMIK_BASE}/${groupSlug.replace(/^\//, '')}`;
}

export function akademikTabHref(groupSlug: string, tabSegment: string): string {
  return `${akademikGroupHref(groupSlug)}/${tabSegment.replace(/^\//, '')}`;
}

export function findAkademikGroup(groupSlug: string): AkademikGroupDef | undefined {
  return AKADEMIK_GROUPS.find((group) => group.slug === groupSlug);
}

export function findAkademikTab(
  groupSlug: string,
  tabSegment: string,
): { group: AkademikGroupDef; tab: AkademikTabItem } | undefined {
  const group = findAkademikGroup(groupSlug);
  if (!group) return undefined;
  const tab = group.tabs.find((item) => item.segment === tabSegment);
  if (!tab) return undefined;
  return { group, tab };
}

export function akademikSidebarChildren() {
  return AKADEMIK_GROUPS.map((group) => ({
    label: group.label,
    href: akademikTabHref(group.slug, group.tabs[0].segment),
  }));
}

export function akademikBreadcrumbMap(): Record<string, string> {
  const map: Record<string, string> = {
    'akademik-planlama': AKADEMIK_MODULE_LABEL,
  };
  for (const group of AKADEMIK_GROUPS) {
    map[group.slug] = group.label;
    for (const tab of group.tabs) {
      map[tab.segment] = tab.label;
    }
  }
  return map;
}

export function akademikCommandPaletteItems() {
  const items: { label: string; href: string; section: string }[] = [];

  for (const group of AKADEMIK_GROUPS) {
    items.push({
      label: group.label,
      href: akademikTabHref(group.slug, group.tabs[0].segment),
      section: AKADEMIK_MODULE_LABEL,
    });
    for (const tab of group.tabs) {
      items.push({
        label: `${group.label} · ${tab.label}`,
        href: akademikTabHref(group.slug, tab.segment),
        section: AKADEMIK_MODULE_LABEL,
      });
    }
  }

  return items;
}
