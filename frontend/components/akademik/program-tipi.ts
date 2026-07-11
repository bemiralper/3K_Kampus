export type ProgramTipi = 'GRUP' | 'BIREBIR' | 'GENEL';

export const PROGRAM_TIPI_OPTIONS: { value: ProgramTipi; label: string; hint: string }[] = [
  {
    value: 'GRUP',
    label: 'Grup Dersleri',
    hint: 'Sınıf / grup programı saat yapısı (hafta içi, hafta sonu grup vb.)',
  },
  {
    value: 'BIREBIR',
    label: 'Birebir / Özel Ders',
    hint: 'Bireysel ders slotları (genelde akşam veya esnek saatler)',
  },
  {
    value: 'GENEL',
    label: 'Genel / Karma',
    hint: 'Her iki formatı kapsayan veya karışık program',
  },
];

export const PROGRAM_TIPI_META: Record<
  ProgramTipi,
  { label: string; color: string; bg: string; border: string }
> = {
  GRUP: { label: 'Grup', color: '#0369a1', bg: '#e0f2fe', border: '#7dd3fc' },
  BIREBIR: { label: 'Birebir', color: '#7c3aed', bg: '#ede9fe', border: '#c4b5fd' },
  GENEL: { label: 'Genel', color: '#475569', bg: '#f1f5f9', border: '#cbd5e1' },
};

export function programTipiLabel(tipi: ProgramTipi | string | undefined | null): string {
  if (!tipi) return PROGRAM_TIPI_META.GENEL.label;
  return PROGRAM_TIPI_META[tipi as ProgramTipi]?.label ?? String(tipi);
}

export function programTipiMeta(tipi: ProgramTipi | string | undefined | null) {
  if (!tipi || !(tipi in PROGRAM_TIPI_META)) return PROGRAM_TIPI_META.GENEL;
  return PROGRAM_TIPI_META[tipi as ProgramTipi];
}

/** Grup → Birebir → Genel sıralama */
export const PROGRAM_TIPI_ORDER: ProgramTipi[] = ['GRUP', 'BIREBIR', 'GENEL'];

export function groupByProgramTipi<T extends { program_tipi?: ProgramTipi | string }>(
  items: T[],
): Record<ProgramTipi, T[]> {
  const groups: Record<ProgramTipi, T[]> = { GRUP: [], BIREBIR: [], GENEL: [] };
  items.forEach((item) => {
    const key = (item.program_tipi as ProgramTipi) || 'GENEL';
    if (groups[key]) groups[key].push(item);
    else groups.GENEL.push(item);
  });
  return groups;
}
