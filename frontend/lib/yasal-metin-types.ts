/** Yasal metin sayfaları (KVKK, Gizlilik vb.) — ortak tipler */

export type YasalMetinMeta = {
  brand: string;
  title: string;
  lastUpdated: string;
  intro: string;
};

export type YasalSection = {
  id: string;
  number: number;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  categories?: { title: string; items: string[]; note?: string }[];
  afterBullets?: string[];
  inlineLinks?: { text: string; href: string; label: string }[];
};

export function buildYasalNav(sections: YasalSection[]) {
  return sections.map(s => ({
    id: s.id,
    label: `${s.number}. ${s.title}`,
  }));
}
