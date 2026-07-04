/** Görev tipine göre drawer aksiyonları */

export type GorevActionId = 'complete' | 'not_complete' | 'meeting_planned' | 'open_related';

export type GorevAction = {
  id: GorevActionId;
  label: string;
  primary?: boolean;
};

const GORUSME_TIPLERI = new Set([
  'TAKIP',
  'OGRENCI_GORUSME',
  'HAFTALIK_GORUSME',
  'VELI_GORUSME',
  'TELEFON',
]);

const ODEME_TIPLERI = new Set([
  'GECIKEN_ODEME',
  'TAKSIT_GUNU',
  'SENET_TARIHI',
  'FATURA',
  'MAKBUZ',
  'BANKA_TAHSILAT',
]);

const INCOMPLETE_ACTION: GorevAction = { id: 'not_complete', label: 'Tamamlanamadı' };

export function getGorevActions(tipKod: string | undefined, hasAksiyonUrl: boolean): GorevAction[] {
  const kod = tipKod || '';

  if (GORUSME_TIPLERI.has(kod)) {
    return [
      { id: 'meeting_planned', label: 'Görüşme planlandı', primary: true },
      { id: 'complete', label: 'Tamamlandı' },
      INCOMPLETE_ACTION,
    ];
  }

  if (ODEME_TIPLERI.has(kod) && hasAksiyonUrl) {
    return [
      { id: 'open_related', label: 'İlgili ekranı aç', primary: true },
      { id: 'complete', label: 'Tamamlandı' },
      INCOMPLETE_ACTION,
    ];
  }

  return [
    { id: 'complete', label: 'Tamamlandı', primary: true },
    INCOMPLETE_ACTION,
  ];
}

export const PERSONAL_GOREV_TIP_KODLARI = [
  'HATIRLATMA',
  'YAPILACAK',
  'TELEFON',
  'TOPLANTI',
  'KONTROL',
] as const;
