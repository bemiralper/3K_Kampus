import type { KimlikResolveResponse, KimlikRol } from '@/lib/kimlik-api';
import type { TcCheckResponse, VeliTcCheckResponse } from '@/app/ogrenciler/yeni-kayit/types';

export const KIMLIK_APPLY_LABELS: Record<'personel' | 'ogrenci' | 'veli', string> = {
  personel: 'Mevcut Personeli Kullan',
  ogrenci: 'Mevcut Öğrenciyi Kullan',
  veli: 'Mevcut Veliyi Kullan',
};

/** Telefon alanından sadece rakamları al (resolve API için). */
export function digitsOnlyPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Otomatik doldurulan alanları kısa süre vurgula. */
export function flashHighlightedFields(
  fields: string[],
  setter: (fields: Set<string>) => void,
  durationMs = 3000,
): void {
  setter(new Set(fields));
  window.setTimeout(() => setter(new Set()), durationMs);
}

export function kimlikFieldClass(base: string, field: string, highlighted: Set<string>): string {
  const extra = highlighted.has(field) ? ' kimlik-prefilled' : '';
  return `${base}${extra}`.trim();
}

export function tcReadonlyClass(locked: boolean): string {
  return locked ? ' kimlik-readonly-tc' : '';
}

/** Resolve yanıtından ortak alan ön-doldurma haritası. */
export function extractOrtakPrefill(result: KimlikResolveResponse | null): Record<string, string> {
  if (!result) return {};
  return { ...(result.ortak_alanlar || {}) };
}

export function formatKimlikPhone(phone?: string | null): string {
  if (!phone) return '—';
  const d = digitsOnlyPhone(phone);
  if (d.length === 11 && d.startsWith('0')) {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
  }
  return phone;
}

/** tc-check yanıtından modal için kimlik özeti (resolve boş dönerse). */
export function mergeKimlikForOgrenci(
  kimlik: KimlikResolveResponse | null | undefined,
  tcCheck: TcCheckResponse | null | undefined,
): KimlikResolveResponse | null {
  if (kimlik?.found) return kimlik;
  if (!tcCheck?.found || !tcCheck.ogrenci) return null;
  const o = tcCheck.ogrenci;
  const roller: KimlikRol[] =
    tcCheck.kimlik_roller?.length
      ? tcCheck.kimlik_roller
      : [
          {
            tip: 'ogrenci',
            id: o.id,
            ad: o.ad,
            soyad: o.soyad,
            tam_ad: `${o.ad} ${o.soyad}`.trim(),
            aktif_mi: o.aktif_mi,
          },
        ];
  return {
    found: true,
    eslesme: 'tc',
    kisi: {
      id: o.kisi_id || 0,
      ad: o.ad,
      soyad: o.soyad,
      tam_ad: `${o.ad} ${o.soyad}`.trim(),
      tc_kimlik_no: o.tc_kimlik_no,
      telefon: o.telefon,
      email: o.email,
      aktif_mi: o.aktif_mi,
    },
    roller,
    uyarilar: tcCheck.kimlik_uyarilari,
  };
}

export function mergeKimlikForVeli(
  kimlik: KimlikResolveResponse | null | undefined,
  veliCheck: VeliTcCheckResponse | null | undefined,
): KimlikResolveResponse | null {
  if (kimlik?.found) return kimlik;
  if (!veliCheck?.found || !veliCheck.veli) return null;
  const v = veliCheck.veli;
  return {
    found: true,
    eslesme: 'tc',
    kisi: {
      id: v.kisi_id || 0,
      ad: v.ad,
      soyad: v.soyad,
      tam_ad: `${v.ad} ${v.soyad}`.trim(),
      tc_kimlik_no: v.tc_kimlik_no,
      telefon: v.telefon,
      email: v.email,
    },
    roller: veliCheck.kimlik_roller?.length
      ? veliCheck.kimlik_roller
      : [
          {
            tip: 'veli',
            id: 0,
            ad: v.ad,
            soyad: v.soyad,
            tam_ad: `${v.ad} ${v.soyad}`.trim(),
            meslek: v.meslek,
            veli_turu_display: v.veli_turu_display,
            bagli_ogrenciler: veliCheck.bagli_ogrenciler?.map((o) => ({
              id: o.id,
              ad: o.ad,
              soyad: o.soyad,
              yakinlik: o.yakinlik,
            })),
          },
        ],
    uyarilar: veliCheck.kimlik_uyarilari,
  };
}
