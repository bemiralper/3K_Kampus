import type { DaireAlan, DaireBelge, DaireTur, FmtKaydi, KutuDilimi, KutuYonu, MetinKutusu, SolIz, VeriKaynagi } from './types';
import { DAIRE_SURUM } from './types';

export const TUR_ETIKETLERI: { id: DaireTur; label: string }[] = [
  { id: 'daire_dizisi', label: 'Daire dizisi' },
  { id: 'sayisal_kodlama', label: 'Sayısal kodlama' },
  { id: 'tc_kimlik', label: 'T.C. kimlik numarası' },
  { id: 'ogrenci_numarasi', label: 'Öğrenci numarası' },
  { id: 'sinav_numarasi', label: 'Sınav numarası' },
  { id: 'tek_secim', label: 'Tek seçim' },
  { id: 'coklu_secim', label: 'Çoklu seçim' },
  { id: 'kitapcik_turu', label: 'Kitapçık türü' },
  { id: 'cevap_bloku', label: 'Cevap bloğu' },
  { id: 'metin', label: 'Metin alanı' },
];

export const VERI_KAYNAKLARI: VeriKaynagi[] = [
  { kod: 'ad', etiket: 'Öğrenci adı', kaynak: 'ogrenci.ad' },
  { kod: 'soyad', etiket: 'Öğrenci soyadı', kaynak: 'ogrenci.soyad' },
  { kod: 'ad_soyad', etiket: 'Ad soyad', kaynak: 'ogrenci.ad + ogrenci.soyad' },
  { kod: 'tc', etiket: 'T.C. kimlik numarası', kaynak: 'ogrenci.tc_kimlik_no' },
  { kod: 'ogrenci_no', etiket: 'Öğrenci numarası', kaynak: 'ogrenci_kayit.okul_no' },
  { kod: 'numara', etiket: 'Öğrenci numarası', kaynak: 'ogrenci_kayit.okul_no' },
  { kod: 'sinif', etiket: 'Sınıf', kaynak: 'ogrenci_kayit.sinif' },
  { kod: 'sube', etiket: 'Şube', kaynak: 'ogrenci_kayit.sinif' },
  { kod: 'sinif_sube', etiket: 'Sınıf / şube', kaynak: 'ogrenci_kayit.sinif' },
  { kod: 'okul', etiket: 'Okul', kaynak: 'ogrenci kaydı / kurum' },
  { kod: 'il', etiket: 'İl', kaynak: 'kurum.il' },
  { kod: 'ilce', etiket: 'İlçe', kaynak: 'kurum.ilce' },
  { kod: 'il_ilce', etiket: 'İl / ilçe', kaynak: 'kurum.il + kurum.ilce' },
  { kod: 'telefon', etiket: 'Öğrenci telefonu', kaynak: 'ogrenci.telefon' },
  { kod: 'email', etiket: 'Öğrenci e-posta', kaynak: 'ogrenci.email' },
  { kod: 'veli_ad_soyad', etiket: 'Veli ad soyad', kaynak: 'ogrenci.veli_ad_soyad' },
  { kod: 'veli_telefon', etiket: 'Veli telefon', kaynak: 'ogrenci.veli_telefon' },
  { kod: 'salon', etiket: 'Salon ve sıra', kaynak: 'sınav katılımcısı' },
  { kod: 'sira', etiket: 'Sıra', kaynak: 'sınav katılımcısı' },
  { kod: 'oturum', etiket: 'Oturum', kaynak: 'sınav oturumu' },
  { kod: 'deneme_adi', etiket: 'Sınav adı', kaynak: 'exam.name' },
  { kod: 'sinav_no', etiket: 'Sınav numarası', kaynak: 'exam.id' },
  { kod: 'kurum', etiket: 'Kurum', kaynak: 'kurum.ad' },
  { kod: 'kitapcik', etiket: 'Kitapçık türü', kaynak: 'sabit değer' },
];

export const ORNEK_DEGERLER: Record<string, string> = {
  ad: 'Ayşe',
  soyad: 'Yılmaz',
  ad_soyad: 'Ayşe Yılmaz',
  tc: '10000000146',
  ogrenci_no: '1042',
  numara: '1042',
  sinif: '11',
  sube: 'A',
  sinif_sube: '11 / A',
  okul: '3K Kampüs',
  il: 'Ankara',
  ilce: 'Çankaya',
  il_ilce: 'Ankara / Çankaya',
  telefon: '5550000000',
  email: 'ayse@3kkampus.example',
  veli_ad_soyad: 'Mehmet Yılmaz',
  veli_telefon: '5551112233',
  salon: 'Salon 1 / 12',
  sira: '12',
  oturum: '1. Oturum',
  deneme_adi: 'TYT Deneme 3',
  sinav_no: '129',
  kurum: '3K Kampüs',
  kitapcik: 'A',
};

const SAYISAL = new Set(['sayisal_kodlama', 'ogrenci_numarasi', 'tc_kimlik', 'sinav_numarasi']);
const RAKAMLAR = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const HARFLER = [...'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'];
const AD_KAYNAKLARI = new Set(['ad', 'soyad', 'ad_soyad']);

export function trUpper(text: string) {
  return (text || '').replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
}

export function sigdirAdSoyad(text: string, kapasite: number) {
  const raw = (text || '').trim();
  if (kapasite <= 0 || trUpper(raw).length <= kapasite) return raw;
  const parts = raw.split(/\s+/);
  if (parts.length < 2 || parts[0].length < 2) return raw;
  const short = `${trUpper(parts[0][0])} ${parts.slice(1).join(' ')}`;
  if (trUpper(short).length >= trUpper(raw).length) return raw;
  return short;
}

export function metinKapasite(genislikMm: number, punto: number, karakterAraligi: number) {
  const harf = punto * 25.4 / 72 * 0.55 + Math.max(karakterAraligi, 0);
  if (harf <= 0) return 1;
  return Math.max(1, Math.floor(genislikMm / harf));
}

export function karakterSayisi(alan: DaireAlan) {
  return alan.kodlama_yonu === 'sutun_karakter' ? alan.sutun : alan.satir;
}

export function sembolSayisi(alan: DaireAlan) {
  return alan.kodlama_yonu === 'sutun_karakter' ? alan.satir : alan.sutun;
}

export function etiketler(alan: DaireAlan): string[] {
  const cleaned = (alan.etiketler || []).map(item => item.trim()).filter(Boolean);
  if (cleaned.length) return cleaned;
  if (SAYISAL.has(alan.tur)) return RAKAMLAR;
  if (alan.tur === 'kitapcik_turu') return ['A', 'B', 'C', 'D'];
  if (alan.tur === 'cevap_bloku') return alan.cevap_bloku?.secenekler || ['A', 'B', 'C', 'D', 'E'];
  return [];
}

export function kodEtiketleri(alan: DaireAlan): string[] {
  const labels = etiketler(alan);
  const nSym = sembolSayisi(alan);
  const tek = labels.length === nSym && labels.every(item => trUpper(item).length === 1);
  if (tek) return labels;
  if (alan.tur === 'daire_dizisi' && AD_KAYNAKLARI.has(alan.veri_kaynagi) && nSym === HARFLER.length) return [...HARFLER];
  return labels;
}

export function alanUyarilari(alan: DaireAlan): string[] {
  if (!alan.aktif || alan.tur === 'metin') return [];
  if (alan.tur === 'daire_dizisi') return [];
  const labels = etiketler(alan);
  const nChar = karakterSayisi(alan);
  const nSym = sembolSayisi(alan);
  const errors: string[] = [];
  if (nSym !== labels.length) {
    errors.push(`Seçenek sayısı (${labels.length}) sembol ekseniyle (${nSym}) aynı olmalı.`);
  }
  if (alan.tur === 'tc_kimlik') {
    if (alan.veri_kaynagi && alan.veri_kaynagi !== 'tc') errors.push('T.C. alanı T.C. kimlik kaynağına bağlanmalıdır.');
    if (nChar !== 11) errors.push('T.C. kimlik numarası 11 karakter sırası ister.');
    if (labels.join('') !== '0123456789') errors.push('T.C. sembolleri 0-9 olmalıdır.');
  } else if (SAYISAL.has(alan.tur)) {
    if (alan.tur === 'ogrenci_numarasi' && alan.veri_kaynagi && !['ogrenci_no', 'numara'].includes(alan.veri_kaynagi)) errors.push('Öğrenci numarası kaynağını seçin.');
    if (alan.tur === 'sinav_numarasi' && alan.veri_kaynagi && alan.veri_kaynagi !== 'sinav_no') errors.push('Sınav numarası kaynağını seçin.');
    if (labels.some(item => item.length !== 1 || !'0123456789'.includes(item))) {
      errors.push('Sayısal seçenekler tek rakam olmalıdır.');
    }
  } else if (alan.tur === 'kitapcik_turu' || alan.tur === 'tek_secim' || alan.tur === 'coklu_secim') {
    if (alan.tur === 'kitapcik_turu' && alan.veri_kaynagi && alan.veri_kaynagi !== 'kitapcik') errors.push('Kitapçık kaynağını seçin.');
    if (nChar !== 1) errors.push('Seçim alanı tek sıra olmalıdır.');
    if (!labels.length) errors.push('Seçenek etiketleri gerekir.');
  } else if (alan.tur === 'cevap_bloku') {
    if (alan.cevap_bloku?.soru_sayisi !== nChar) errors.push('Soru sayısı karakter ekseniyle aynı olmalıdır.');
    if (!labels.length) errors.push('Cevap seçenekleri gerekir.');
  }
  return errors;
}

function esles(raw: string, labels: string[]) {
  const key = trUpper(raw.trim());
  return labels.find(label => trUpper(label) === key) || null;
}

function kodlaHarf(alan: DaireAlan, text: string, labels: string[], slots: number) {
  const kaynak = alan.veri_kaynagi === 'ad_soyad' ? sigdirAdSoyad(text, slots) : text;
  const chars = [...trUpper(kaynak)].slice(0, slots);
  const cells = chars.map(ch => (ch.trim() ? esles(ch, labels) || '' : ''));
  const pad = Array(Math.max(slots - cells.length, 0)).fill('');
  const lined = alan.kod_hizasi === 'sag' ? [...pad, ...cells] : [...cells, ...pad];
  return lined.some(Boolean) ? lined : null;
}

export function kodla(alan: DaireAlan, raw: string | null | undefined): string[] | null {
  if (alan.tur === 'metin') return null;
  const stripped = raw == null ? '' : String(raw).trim();
  const labels = kodEtiketleri(alan);
  const slots = karakterSayisi(alan);
  if (!stripped) return null;
  if (alan.tur === 'daire_dizisi') {
    if (!AD_KAYNAKLARI.has(alan.veri_kaynagi)) return null;
    return kodlaHarf(alan, stripped, labels, slots);
  }
  if (SAYISAL.has(alan.tur)) {
    if ([...stripped].some(ch => !'0123456789'.includes(ch))) return null;
    if (alan.tur === 'tc_kimlik' && stripped.length !== slots) return null;
    if (stripped.length > slots) return null;
    if ([...stripped].some(ch => !labels.includes(ch))) return null;
    const cells = [...stripped];
    const pad = Array(slots - cells.length).fill('');
    return alan.kod_hizasi === 'sag' ? [...pad, ...cells] : [...cells, ...pad];
  }
  if (alan.tur === 'tek_secim' || alan.tur === 'kitapcik_turu') {
    const found = esles(stripped, labels);
    return found ? [found] : null;
  }
  if (alan.tur === 'coklu_secim') {
    let parts: string[];
    if (stripped.includes(',')) parts = stripped.split(',').map(part => part.trim()).filter(Boolean);
    else if (labels.some(label => label.length > 1)) parts = [stripped];
    else parts = [...trUpper(stripped)].filter(ch => ch.trim());
    const chosen: string[] = [];
    for (const part of parts) {
      const found = esles(part, labels);
      if (!found) return null;
      if (!chosen.includes(found)) chosen.push(found);
    }
    return chosen.length ? chosen : null;
  }
  return null;
}

export function isaretMerkezleri(alan: DaireAlan, raw: string): { x: number; y: number }[] {
  const encoded = kodla(alan, raw);
  if (!encoded) return [];
  const labels = kodEtiketleri(alan);
  const yer = (charIndex: number, symIndex: number) => {
    if (alan.kodlama_yonu === 'sutun_karakter') {
      return { x: alan.x_mm + charIndex * alan.aralik_x_mm, y: alan.y_mm + symIndex * alan.aralik_y_mm };
    }
    return { x: alan.x_mm + symIndex * alan.aralik_x_mm, y: alan.y_mm + charIndex * alan.aralik_y_mm };
  };
  if (alan.tur === 'tek_secim' || alan.tur === 'coklu_secim' || alan.tur === 'kitapcik_turu') {
    return encoded.map(label => yer(0, labels.indexOf(label)));
  }
  return encoded.flatMap((label, index) => (label ? [yer(index, labels.indexOf(label))] : []));
}

export function alanDegeri(alan: { veri_kaynagi: string; sabit_deger: string }, values: Record<string, string>) {
  if (alan.veri_kaynagi) return values[alan.veri_kaynagi] || '';
  return alan.sabit_deger || '';
}

export function kutuMetni(alan: DaireAlan, values: Record<string, string>) {
  const kutu = alan.metin_kutusu;
  if (!kutu?.aktif) return '';
  const kendi = Boolean(kutu.veri_kaynagi || kutu.sabit_deger.trim());
  const kaynak = kendi ? kutu.veri_kaynagi : alan.veri_kaynagi;
  const text = alanDegeri(kendi ? kutu : alan, values);
  const slots = kutu.yon === 'sol' || kutu.yon === 'sag' ? alan.satir : alan.sutun;
  if (kaynak === 'ad_soyad') return sigdirAdSoyad(text, slots);
  const raw = text.trim();
  const karakterEkseni = kutu.yon === 'ust' || kutu.yon === 'alt'
    ? alan.kodlama_yonu === 'sutun_karakter'
    : alan.kodlama_yonu !== 'sutun_karakter';
  if (SAYISAL.has(alan.tur) && /^\d+$/.test(raw) && karakterEkseni && raw.length <= slots) {
    const pad = ' '.repeat(slots - raw.length);
    return alan.kod_hizasi === 'sag' ? pad + raw : raw + pad;
  }
  return text;
}

export function varsayilanMetinKutusu(alan: DaireAlan): MetinKutusu {
  return {
    aktif: true,
    yon: 'ust',
    olcu_mm: 5,
    bosluk_mm: 0,
    punto: 8,
    hizalama: 'orta',
    karakter_araligi: 0,
    veri_kaynagi: alan.veri_kaynagi || '',
    sabit_deger: '',
  };
}

function metinKutusu(raw: MetinKutusu | null | undefined): MetinKutusu | null {
  if (!raw) return null;
  const yon = raw.yon === 'alt' || raw.yon === 'sol' || raw.yon === 'sag' || raw.yon === 'ust' ? raw.yon : 'ust';
  return {
    aktif: Boolean(raw.aktif),
    yon,
    olcu_mm: Number(raw.olcu_mm) || 5,
    bosluk_mm: Number.isFinite(Number(raw.bosluk_mm)) ? Number(raw.bosluk_mm) : 0,
    punto: Number(raw.punto) || 8,
    hizalama: raw.hizalama || 'orta',
    karakter_araligi: Number(raw.karakter_araligi) || 0,
    veri_kaynagi: raw.veri_kaynagi || '',
    sabit_deger: raw.sabit_deger || '',
  };
}

export function kutuYonu(alan: DaireAlan, mmx: number, mmy: number): KutuYonu {
  const cx = alan.x_mm + ((alan.sutun - 1) * alan.aralik_x_mm) / 2;
  const cy = alan.y_mm + ((alan.satir - 1) * alan.aralik_y_mm) / 2;
  const dx = mmx - cx;
  const dy = mmy - cy;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'sol' : 'sag';
  return dy < 0 ? 'ust' : 'alt';
}

export function kutuDilimleri(alan: DaireAlan, text: string): KutuDilimi[] {
  const kutu = alan.metin_kutusu;
  if (!kutu?.aktif || alan.cap_mm <= 0) return [];
  const chars = [...trUpper(text || '')];
  const cap = alan.cap_mm;
  const olcu = kutu.olcu_mm;
  const bosluk = kutu.bosluk_mm;
  const dilimler: KutuDilimi[] = [];
  if (kutu.yon === 'ust' || kutu.yon === 'alt') {
    const pitch = alan.aralik_x_mm;
    for (let col = 0; col < alan.sutun; col += 1) {
      const cx = alan.x_mm + col * alan.aralik_x_mm;
      const top = kutu.yon === 'ust'
        ? alan.y_mm - cap / 2 - bosluk - olcu
        : alan.y_mm + (alan.satir - 1) * alan.aralik_y_mm + cap / 2 + bosluk;
      dilimler.push({
        x_mm: cx - pitch / 2,
        y_mm: top,
        genislik_mm: pitch,
        yukseklik_mm: olcu,
        metin: chars[col] || '',
      });
    }
    return dilimler;
  }
  const pitch = alan.aralik_y_mm;
  for (let row = 0; row < alan.satir; row += 1) {
    const cy = alan.y_mm + row * alan.aralik_y_mm;
    const left = kutu.yon === 'sol'
      ? alan.x_mm - cap / 2 - bosluk - olcu
      : alan.x_mm + (alan.sutun - 1) * alan.aralik_x_mm + cap / 2 + bosluk;
    dilimler.push({
      x_mm: left,
      y_mm: cy - pitch / 2,
      genislik_mm: olcu,
      yukseklik_mm: pitch,
      metin: chars[row] || '',
    });
  }
  return dilimler;
}

export function yeniId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `a${Math.random().toString(16).slice(2, 10)}`;
}

export function bosAlan(partial: Partial<DaireAlan> & Pick<DaireAlan, 'tur' | 'x_mm' | 'y_mm'>): DaireAlan {
  return {
    id: yeniId(),
    ad: partial.tur === 'metin' ? 'Metin alanı' : 'Daire dizisi',
    veri_kaynagi: '',
    sabit_deger: '',
    aktif: true,
    satir: 1,
    sutun: 1,
    cap_mm: 3.2,
    isaret_cap_mm: Math.round(Math.min(Number(partial.cap_mm) || 3.2, (Number(partial.cap_mm) || 3.2) * 0.68) * 100) / 100,
    aralik_x_mm: 4.5,
    aralik_y_mm: 4.5,
    kodlama_yonu: 'satir_karakter',
    kod_hizasi: 'sol',
    etiketler: [],
    punto: 8,
    hizalama: 'sol',
    genislik_mm: 45,
    yukseklik_mm: 8,
    karakter_araligi: 0,
    iz_id: '',
    iz_satirlar: [],
    sayfa_no: 1,
    cevap_bloku: partial.tur === 'cevap_bloku' ? {
      bolum_id: '',
      soru_baslangic: 1,
      soru_sayisi: partial.satir || 1,
      secenekler: partial.etiketler?.length ? partial.etiketler : ['A', 'B', 'C', 'D', 'E'],
      fiziksel_sira: [],
      coklu_isaret: false,
    } : null,
    ...partial,
    metin_kutusu: partial.tur === 'metin' ? null : metinKutusu(partial.metin_kutusu),
  };
}

function izSatirlari(iz: SolIz): number[] {
  if (iz.satirlar_mm && iz.satirlar_mm.length === iz.adet) return iz.satirlar_mm;
  return Array.from({ length: iz.adet }, (_, index) => iz.y0_mm + index * iz.aralik_mm);
}

export function izdenHizala(alanlar: DaireAlan[], iz: SolIz): DaireAlan[] {
  const ys = izSatirlari(iz);
  const daireler = alanlar.filter(alan => alan.tur !== 'metin');
  const hizali = alanlar.map(alan => {
    if (alan.tur === 'metin') return alan;
    const adim = ys.reduce((best, value, index) => (
      Math.abs(value - alan.y_mm) < Math.abs(ys[best] - alan.y_mm) ? index : best
    ), 0);
    return { ...alan, y_mm: Math.round(ys[adim] * 100) / 100, aralik_y_mm: iz.aralik_mm, iz_satir: adim };
  });
  return hizali.map(alan => {
    if (alan.tur !== 'metin') return alan;
    const yakin = daireler.reduce<DaireAlan | null>((best, item) => {
      if (!best || Math.abs(item.y_mm - alan.y_mm) < Math.abs(best.y_mm - alan.y_mm)) return item;
      return best;
    }, null);
    if (!yakin) return alan;
    const yeni = hizali.find(item => item.id === yakin.id) || yakin;
    const oran = yakin.aralik_y_mm ? iz.aralik_mm / yakin.aralik_y_mm : 1;
    const y = yeni.y_mm + (alan.y_mm - yakin.y_mm) * oran;
    return { ...alan, y_mm: Math.round(y * 100) / 100 };
  });
}

export function izKaydir(alanlar: DaireAlan[], onceki: SolIz, sonraki: SolIz): DaireAlan[] {
  const dx = sonraki.x_mm - onceki.x_mm;
  return alanlar.map(alan => {
    const y = sonraki.y0_mm + ((alan.y_mm - onceki.y0_mm) / onceki.aralik_mm) * sonraki.aralik_mm;
    const next = {
      ...alan,
      x_mm: Math.round((alan.x_mm + dx) * 100) / 100,
      y_mm: Math.round(y * 100) / 100,
    };
    if (alan.tur !== 'metin') next.aralik_y_mm = sonraki.aralik_mm;
    return next;
  });
}

function solIz(raw?: Partial<SolIz> | null): SolIz | null {
  if (!raw || !raw.aralik_mm || !raw.adet) return null;
  const satirlar = Array.isArray(raw.satirlar_mm)
    ? raw.satirlar_mm.map(value => Number(value)).filter(value => Number.isFinite(value))
    : [];
  return {
    x_mm: Number(raw.x_mm) || 0,
    genislik_mm: Number(raw.genislik_mm) || 0,
    y0_mm: Number(raw.y0_mm) || 0,
    aralik_mm: Number(raw.aralik_mm),
    adet: Number(raw.adet),
    satirlar_mm: satirlar.length === Number(raw.adet) ? satirlar : undefined,
  };
}

function fmtKaydi(raw?: Partial<FmtKaydi> | null): FmtKaydi | undefined {
  if (!raw || !Number(raw.satir) || !Number(raw.sutun)) return undefined;
  return {
    dosya: raw.dosya || '',
    satir: Number(raw.satir),
    sutun: Number(raw.sutun),
    x0_mm: Number(raw.x0_mm) || 0,
    y0_mm: Number(raw.y0_mm) || 0,
    aralik_x_mm: Number(raw.aralik_x_mm) || 4.3,
    aralik_y_mm: Number(raw.aralik_y_mm) || 4.3,
    cap_mm: Number(raw.cap_mm) || 3.2,
    bagli: raw.bagli || '',
    metin: raw.metin || undefined,
  };
}

export function hazirlaBelge(raw?: Partial<DaireBelge> | null): DaireBelge {
  const kalibrasyon = raw?.kalibrasyon;
  const olcek = Number(kalibrasyon?.olcek) || 1;
  const fmt = fmtKaydi(raw?.fmt);
  return {
    surum: DAIRE_SURUM,
    kalibrasyon: {
      ofset_x_mm: Number(kalibrasyon?.ofset_x_mm) || 0,
      ofset_y_mm: Number(kalibrasyon?.ofset_y_mm) || 0,
      olcek,
      olcek_y: Number(kalibrasyon?.olcek_y) || olcek,
    },
    iz: solIz(raw?.iz),
    izler: (raw?.izler || []).map(item => solIz(item)).filter((item): item is SolIz => Boolean(item)),
    ...(fmt ? { fmt } : {}),
    sayfalar: raw?.sayfalar || [],
    alanlar: (raw?.alanlar || []).map(alan => bosAlan({
      ...alan,
      tur: alan.tur,
      x_mm: Number(alan.x_mm) || 0,
      y_mm: Number(alan.y_mm) || 0,
    })),
  };
}
