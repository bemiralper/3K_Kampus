import { apiFetch, getContextHeaders, resolveApiUrl } from '@/lib/api';

const BASE = '/api/ozel-ders';

export type PaketDersi = {
  id: number;
  ad: string;
  kisa_ad?: string;
  haftalik_adet?: number;
  varsayilan_sure_dk?: number;
};

export type BirebirProgram = {
  id: number;
  kurum: number;
  sube: number;
  egitim_yili: number;
  term: number | null;
  ogrenci: number;
  ogrenci_ad: string;
  ogrenci_egitim_paketi: number | null;
  premium_paket: number | null;
  premium_paket_ad: string | null;
  ozel_ders_paket: number | null;
  ozel_ders_paket_ad: string | null;
  baslangic_tarihi: string;
  bitis_tarihi: string | null;
  zaman_baslangic?: string;
  zaman_sure_dk?: number;
  zaman_ara_dk?: number;
  zaman_ders_adet?: number;
  durum: string;
  durum_display: string;
  notlar: string;
  slot_count: number;
  paket_dersleri?: PaketDersi[];
};

export type BirebirSlot = {
  id: number;
  program: number;
  gun: number;
  baslangic: string;
  bitis: string;
  sure_dk: number;
  ders: number;
  ders_ad: string;
  ders_kisa_ad?: string;
  ogretmen: number;
  ogretmen_ad: string;
  oda: number | null;
  oda_ad: string | null;
  aktif: boolean;
  baslangic_tarihi?: string | null;
  bitis_tarihi?: string | null;
  hedef_dakika?: number | null;
};

export type OturumLinkOzet = {
  id: number;
  session_date: string;
  start_time: string;
  end_time: string;
  ders_ad: string;
  ogretmen_ad: string;
  durum: string;
  durum_display: string;
  telafi_durumu: string;
  telafi_durumu_display: string;
  oturum_turu: string;
};

export type OturumBildirim = {
  id: number;
  event_key: string;
  event_label: string;
  veli_id: number;
  gonderim_tarihi: string | null;
  status: string;
  status_display: string;
  provider_message_id: string;
  failed_reason: string;
  gonderildi: boolean;
};

export type BirebirOturum = {
  id: number;
  program: number | null;
  session_date: string;
  start_time: string;
  end_time: string;
  sure_dk: number;
  ogrenci: number;
  ogrenci_ad: string;
  ders: number;
  ders_ad: string;
  ders_kisa_ad?: string;
  ogretmen: number;
  ogretmen_ad: string;
  oda: number | null;
  oda_ad: string | null;
  oturum_turu: string;
  oturum_turu_display: string;
  durum: string;
  durum_display: string;
  telafi_durumu: string;
  telafi_durumu_display: string;
  sebep_kodu: string;
  sebep_aciklama: string;
  sebep_display: string;
  replaces_oturum: number | null;
  kaynak_oturum?: OturumLinkOzet | null;
  telafi_oturum?: OturumLinkOzet | null;
  bildirimler?: OturumBildirim[];
  notes: string;
  has_hakedis: boolean;
};

export type SetOturumDurumPayload = {
  durum: string;
  notes?: string;
  sebep_kodu?: string;
  sebep_aciklama?: string;
  telafi_durumu?: string;
  send_whatsapp?: boolean;
};

export type BirebirHakedis = {
  id: number;
  oturum: number;
  ogretmen: number;
  ogretmen_ad: string;
  ders: number;
  ders_ad: string;
  ders_kisa_ad?: string;
  tarih: string;
  sure_dk: number;
  birim_ucret: number;
  tutar: number;
  aciklama: string;
  durum: string;
  durum_display: string;
  aylik_hakedis: number | null;
  start_time?: string;
  ogrenci?: number;
};

export type PremiumKota = {
  id: number;
  premium_paket: number;
  ders: number;
  ders_ad: string;
  haftalik_adet: number;
  varsayilan_sure_dk: number;
};

export type OzelDersTatil = {
  date: string;
  title: string;
  bitis: string;
  holiday_key?: string;
  source?: 'resmi' | 'manuel' | string;
  ozel_ders_aktif?: boolean;
};

export type ResmiTatilGun = {
  date: string;
  title: string;
  holiday_key: string;
  year: number;
  synced: boolean;
  ozel_ders_aktif: boolean;
  mode: 'tatil' | 'devam' | string;
};

export type ResmiTatilYearData = {
  year: number;
  available_years: number[];
  synced_count: number;
  source?: 'google' | 'fallback' | string;
  days: ResmiTatilGun[];
};

export type MaterializeResult = {
  created: number;
  skipped_holiday: number;
  skipped_existing: number;
  skipped_conflict: number;
  holiday_dates: string[];
  warnings?: unknown[];
};

async function unwrap<T>(res: { success?: boolean; data?: T; error?: string }): Promise<T> {
  if (!res || res.success === false) {
    throw new Error(res?.error || 'İstek başarısız');
  }
  return res.data as T;
}

function withQuery(path: string, params?: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') qs.set(k, String(v));
    });
  }
  const q = qs.toString();
  return q ? `${path}?${q}` : path;
}

export type OzelDersMeta = {
  teachers: { id: number; name: string }[];
  dersler: { id: number; ad: string; kod: string; kisa_ad?: string }[];
};

export async function fetchOzelDersMeta() {
  const res = await apiFetch<OzelDersMeta>(`${BASE}/meta/`);
  return unwrap(res);
}

export async function fetchProgramlar(params?: Record<string, string | number | undefined>) {
  const res = await apiFetch<BirebirProgram[]>(withQuery(`${BASE}/programlar/`, params));
  return unwrap(res);
}

export async function createProgram(body: Record<string, unknown>) {
  const res = await apiFetch<BirebirProgram>(`${BASE}/programlar/`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function syncProgramlar(egitim_yili_id?: number | null) {
  const res = await apiFetch<{ created: number; updated: number; skipped: number; noop: number }>(
    `${BASE}/programlar/sync/`,
    {
      method: 'POST',
      body: JSON.stringify({ egitim_yili_id: egitim_yili_id || undefined }),
    },
  );
  return unwrap(res);
}

/**
 * Kısa ad: Eğitim Tanımları’ndaki kisa_ad varsa onu kullan;
 * yoksa Fizik-1 / Fizik 2 / Matematik_1 → Fizik / Matematik gibi türet.
 */
export function deriveKisaAd(fullName: string): string {
  const full = (fullName || '').trim();
  if (!full) return '';
  const m = full.match(/^(.*?)[\s\-_/]+(?:\d+|[ivxlcdm]+)$/i);
  if (m?.[1]?.trim()) return m[1].trim();
  return full;
}

export function resolveDersLabel(
  item: { ders_ad?: string; ders_kisa_ad?: string; ad?: string; kisa_ad?: string },
  useKisaAd: boolean,
): string {
  const full = (item.ders_ad || item.ad || '').trim();
  const explicit = (item.ders_kisa_ad || item.kisa_ad || '').trim();
  if (useKisaAd) return explicit || deriveKisaAd(full) || full || '—';
  return full || explicit || '—';
}

export async function updateProgram(id: number, body: Record<string, unknown>) {
  const res = await apiFetch<BirebirProgram>(`${BASE}/programlar/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function fetchSlots(programId: number) {
  const res = await apiFetch<BirebirSlot[]>(`${BASE}/programlar/${programId}/slots/`);
  return unwrap(res);
}

export async function createSlot(programId: number, body: Record<string, unknown>) {
  const res = await apiFetch<BirebirSlot>(`${BASE}/programlar/${programId}/slots/`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function updateSlot(slotId: number, body: Record<string, unknown>) {
  const res = await apiFetch<BirebirSlot>(`${BASE}/slots/${slotId}/`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function swapSlots(slotAId: number, slotBId: number) {
  const res = await apiFetch<BirebirSlot[]>(`${BASE}/slots/swap/`, {
    method: 'POST',
    body: JSON.stringify({ slot_a_id: slotAId, slot_b_id: slotBId }),
  });
  return unwrap(res);
}

export async function deleteSlot(slotId: number) {
  const res = await apiFetch<unknown>(`${BASE}/slots/${slotId}/`, { method: 'DELETE' });
  if (!res.success) throw new Error(res.error || 'Silinemedi');
}

export async function endSlotEarly(slotId: number, bitis_tarihi?: string) {
  const res = await apiFetch<BirebirSlot>(`${BASE}/slots/${slotId}/erken-bitir/`, {
    method: 'POST',
    body: JSON.stringify(bitis_tarihi ? { bitis_tarihi } : {}),
  });
  return unwrap(res);
}

export async function materializeProgram(
  programId: number,
  start_date: string,
  end_date: string,
): Promise<MaterializeResult> {
  const res = await apiFetch<MaterializeResult>(
    `${BASE}/programlar/${programId}/materialize/`,
    { method: 'POST', body: JSON.stringify({ start_date, end_date }) },
  );
  return unwrap(res);
}

export async function fetchTatiller(start_date: string, end_date: string) {
  const res = await apiFetch<OzelDersTatil[]>(
    withQuery(`${BASE}/tatiller/`, { start_date, end_date }),
  );
  return unwrap(res);
}

/** @deprecated Takvim API kullanın — `/takvim/api/resmi-tatiller/` */
export async function fetchResmiTatiller(year: number) {
  const res = await apiFetch<ResmiTatilYearData>(
    withQuery('/takvim/api/resmi-tatiller/', { year }),
  );
  return unwrap(res);
}

/** @deprecated Takvim API kullanın — `/takvim/api/resmi-tatiller/` */
export async function syncResmiTatiller(year?: number) {
  const res = await apiFetch<{
    created: number;
    updated: number;
    restored: number;
    years: number[];
    source?: string;
  }>('/takvim/api/resmi-tatiller/', {
    method: 'POST',
    body: JSON.stringify({ year: year || undefined }),
  });
  return unwrap(res);
}

/** @deprecated Takvim API kullanın — `/takvim/api/resmi-tatiller/karar/` */
export async function setResmiTatilKarar(body: {
  holiday_key: string;
  date: string;
  ozel_ders_aktif: boolean;
}) {
  const res = await apiFetch<ResmiTatilGun>('/takvim/api/resmi-tatiller/karar/', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function fetchOturumlar(params?: Record<string, string | number | undefined>) {
  const res = await apiFetch<BirebirOturum[]>(withQuery(`${BASE}/oturumlar/`, params));
  return unwrap(res);
}

export async function fetchOgrenciOzelDersOzet(
  ogrenciId: number,
  params?: { egitim_yili_id?: number },
) {
  const res = await apiFetch<Record<string, unknown>>(
    withQuery(`${BASE}/ogrenci/${ogrenciId}/ozet/`, params),
  );
  return unwrap(res);
}

export type DersOzetKirilimi = {
  ders_id: number;
  ders_ad: string;
  ders_kisa_ad?: string;
  planlanan_ders: number;
  islenen_ders: number;
  kalan_ders: number;
  telafi_ders: number;
  ek_ders: number;
  iptal_ders: number;
  hedef_dakika?: number | null;
  kullanilan_dakika?: number | null;
  kalan_dakika?: number | null;
};

export type OgrenciPaketOzeti = { id: number; ad: string };

export type OgrenciDonemOzeti = {
  ogrenci_id: number;
  ogrenci_ad: string;
  sinif_ad: string | null;
  donem: { baslangic: string; bitis: string };
  program_ids: number[];
  ozet: {
    /** Ders adedi — dakika/saat değil. 1 oturum/1 şablon tekrarı = 1 ders. */
    planlanan_ders: number;
    islenen_ders: number;
    kalan_ders: number;
    telafi_ders: number;
    ek_ders: number;
    iptal_ders: number;
    tatil_gun_sayisi: number;
    tatilden_dusulen_ders: number;
  };
  /** Bir öğrencinin birden fazla dersi/paketi olabilir — ders bazında kırılım. */
  dersler: DersOzetKirilimi[];
  tatiller?: DonemTatilGun[];
  tatil_carpmalari?: TatilCarpma[];
  /** Öğrencinin bu dönemdeki tüm aktif paket/programları (tek bir ad değil). */
  paketler: OgrenciPaketOzeti[];
  paket: { program_sayisi: number };
  zaman: {
    baslangic: string;
    sure_dk: number;
    ara_dk: number;
    ders_adet: number;
  };
};

async function downloadPdfFrom(path: string, fallbackName: string) {
  const res = await fetch(resolveApiUrl(path), {
    credentials: 'include',
    headers: getContextHeaders(),
  });
  if (!res.ok) {
    let message = 'PDF indirilemedi';
    try {
      const data = await res.json();
      if (data?.error) message = String(data.error);
    } catch {
      /* binary */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const match = /filename="?([^"]+)"?/.exec(cd);
  const filename = match?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadHaftalikProgramPdf(ogrenciId: number) {
  await downloadPdfFrom(
    `${BASE}/ogrenci/${ogrenciId}/haftalik-program/pdf/`,
    `ozel-ders-program-${ogrenciId}.pdf`,
  );
}

export async function downloadDersOzetiPdf(
  ogrenciId: number,
  startDate?: string,
  endDate?: string,
) {
  await downloadPdfFrom(
    withQuery(`${BASE}/ogrenci/${ogrenciId}/ders-ozeti/pdf/`, {
      start_date: startDate,
      end_date: endDate,
    }),
    `ders-ozeti-${ogrenciId}.pdf`,
  );
}

export async function downloadDersGecmisPdf(
  ogrenciId: number,
  dersId: number,
  startDate?: string,
  endDate?: string,
) {
  await downloadPdfFrom(
    withQuery(`${BASE}/ogrenci/${ogrenciId}/ders/${dersId}/gecmis/pdf/`, {
      start_date: startDate,
      end_date: endDate,
    }),
    `ders-gecmis-${ogrenciId}-${dersId}.pdf`,
  );
}

export type HaftalikProgramRecipient = {
  recipient_type: 'veli' | 'ogrenci' | string;
  ogrenci_id: number;
  veli_id: number | null;
  display_name: string;
  telefon: string;
  body: string;
  skip_reason: string;
};

export type HaftalikProgramTemplateInfo = {
  recipient_type: string;
  meta_name: string;
  meta_status: string;
  meta_usable: boolean;
  app_template: string;
  has_catalog_body: boolean;
};

export type HaftalikProgramPreview = {
  ogrenci_id: number;
  ogrenci_ad: string;
  pdf_baslik: string;
  slot_count: number;
  paketler: string[];
  recipients: HaftalikProgramRecipient[];
  templates: {
    veli: HaftalikProgramTemplateInfo;
    ogrenci: HaftalikProgramTemplateInfo;
  };
  send_mode: 'meta_template' | 'document' | string;
  has_template: boolean;
  event_key: string;
  event_label: string;
};

export type HaftalikProgramSendResult = {
  veli_sent: number;
  ogrenci_sent: number;
  skipped: number;
  errors: string[];
  filename: string;
};

export async function previewHaftalikProgramWhatsApp(ogrenciId: number) {
  const res = await apiFetch<HaftalikProgramPreview>(
    `${BASE}/ogrenci/${ogrenciId}/haftalik-program/onizleme/`,
  );
  return unwrap(res);
}

export async function sendHaftalikProgramWhatsApp(
  ogrenciId: number,
  opts?: {
    send_veli?: boolean;
    send_ogrenci?: boolean;
    veli_ids?: number[];
    include_student?: boolean;
  },
) {
  const res = await apiFetch<HaftalikProgramSendResult>(
    `${BASE}/ogrenci/${ogrenciId}/haftalik-program/gonder/`,
    {
      method: 'POST',
      body: JSON.stringify({
        send_veli: opts?.send_veli !== false,
        send_ogrenci: opts?.send_ogrenci !== false,
        veli_ids: opts?.veli_ids,
        include_student: opts?.include_student,
      }),
    },
  );
  return unwrap(res);
}

export async function previewDersOzetWhatsApp(
  ogrenciId: number,
  startDate?: string,
  endDate?: string,
) {
  const res = await apiFetch<HaftalikProgramPreview>(
    withQuery(`${BASE}/ogrenci/${ogrenciId}/ders-ozeti/onizleme/`, {
      start_date: startDate,
      end_date: endDate,
    }),
  );
  return unwrap(res);
}

export async function sendDersOzetWhatsApp(
  ogrenciId: number,
  opts?: {
    send_veli?: boolean;
    send_ogrenci?: boolean;
    veli_ids?: number[];
    include_student?: boolean;
    start_date?: string;
    end_date?: string;
  },
) {
  const res = await apiFetch<HaftalikProgramSendResult>(
    `${BASE}/ogrenci/${ogrenciId}/ders-ozeti/gonder/`,
    {
      method: 'POST',
      body: JSON.stringify({
        send_veli: opts?.send_veli !== false,
        send_ogrenci: opts?.send_ogrenci !== false,
        veli_ids: opts?.veli_ids,
        include_student: opts?.include_student,
        start_date: opts?.start_date,
        end_date: opts?.end_date,
      }),
    },
  );
  return unwrap(res);
}

export type DonemTatilGun = {
  date: string;
  title: string;
  bitis?: string;
  holiday_key: string;
  source: string;
  ozel_ders_aktif?: boolean;
};

export type TatilCarpma = {
  slot_id: number;
  ders_id: number;
  ders_ad: string;
  tarih: string;
  tarih_label: string;
  saat: string;
  ogretmen_ad: string;
  tatil_baslik: string;
  holiday_key: string;
  tatil_source: string;
  tatil_mode: 'tatil' | 'devam' | string;
  oturum_id: number | null;
  can_toggle_tatil: boolean;
};

export type DersGecmisKayit = {
  id: number | string;
  tarih: string;
  tarih_label: string;
  saat: string;
  durum: string;
  durum_kod: string;
  tur: string;
  tur_kod: string;
  ogretmen_ad: string;
  oda_ad: string;
  telafi_durumu: string;
  sebep: string;
  notlar: string;
  aciklama: string;
  tatil_gun?: boolean;
  tatil_baslik?: string;
  holiday_key?: string;
  tatil_mode?: 'tatil' | 'devam' | string;
  can_toggle_tatil?: boolean;
  virtual?: boolean;
  slot_id?: number | null;
};

export type DersGecmisPayload = {
  ogrenci_id: number;
  ogrenci_ad: string;
  ders_id: number;
  ders_ad: string;
  donem: { baslangic: string; bitis: string };
  donem_label: string;
  ders_ozet: DersOzetKirilimi;
  kayitlar: DersGecmisKayit[];
};

export async function previewDersGecmisWhatsApp(
  ogrenciId: number,
  dersId: number,
  startDate?: string,
  endDate?: string,
) {
  const res = await apiFetch<HaftalikProgramPreview>(
    withQuery(`${BASE}/ogrenci/${ogrenciId}/ders/${dersId}/gecmis/onizleme/`, {
      start_date: startDate,
      end_date: endDate,
    }),
  );
  return unwrap(res);
}

export async function sendDersGecmisWhatsApp(
  ogrenciId: number,
  dersId: number,
  opts?: {
    send_veli?: boolean;
    send_ogrenci?: boolean;
    veli_ids?: number[];
    include_student?: boolean;
    start_date?: string;
    end_date?: string;
  },
) {
  const res = await apiFetch<HaftalikProgramSendResult>(
    `${BASE}/ogrenci/${ogrenciId}/ders/${dersId}/gecmis/gonder/`,
    {
      method: 'POST',
      body: JSON.stringify({
        send_veli: opts?.send_veli !== false,
        send_ogrenci: opts?.send_ogrenci !== false,
        veli_ids: opts?.veli_ids,
        include_student: opts?.include_student,
        start_date: opts?.start_date,
        end_date: opts?.end_date,
      }),
    },
  );
  return unwrap(res);
}

export async function setDersTatilKarar(
  ogrenciId: number,
  dersId: number,
  opts: { date: string; mode: 'tatil' | 'devam' },
) {
  const res = await apiFetch<{
    date: string;
    ders_id: number;
    mode: string;
    message: string;
  }>(`${BASE}/ogrenci/${ogrenciId}/ders/${dersId}/gecmis/tatil/`, {
    method: 'POST',
    body: JSON.stringify(opts),
  });
  return unwrap(res);
}

export async function fetchDersGecmis(
  ogrenciId: number,
  dersId: number,
  startDate?: string,
  endDate?: string,
) {
  const res = await apiFetch<DersGecmisPayload>(
    withQuery(`${BASE}/ogrenci/${ogrenciId}/ders/${dersId}/gecmis/`, {
      start_date: startDate,
      end_date: endDate,
    }),
  );
  return unwrap(res);
}

export async function fetchOgrenciDonemOzeti(
  ogrenciId: number,
  start_date?: string,
  end_date?: string,
) {
  const res = await apiFetch<OgrenciDonemOzeti>(
    withQuery(`${BASE}/ogrenci/${ogrenciId}/ozet-donem/`, {
      start_date,
      end_date,
    }),
  );
  return unwrap(res);
}

export async function createOturum(body: Record<string, unknown>) {
  const res = await apiFetch<BirebirOturum>(`${BASE}/oturumlar/`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function setOturumDurum(
  id: number,
  durumOrPayload: string | SetOturumDurumPayload,
  notes?: string,
) {
  const body: SetOturumDurumPayload =
    typeof durumOrPayload === 'string'
      ? { durum: durumOrPayload, notes }
      : durumOrPayload;
  const res = await apiFetch<BirebirOturum>(`${BASE}/oturumlar/${id}/durum/`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function changeOturumOgretmen(id: number, ogretmen_id: number) {
  const res = await apiFetch<BirebirOturum>(`${BASE}/oturumlar/${id}/ogretmen/`, {
    method: 'POST',
    body: JSON.stringify({ ogretmen_id }),
  });
  return unwrap(res);
}

export async function createTelafi(id: number, body: Record<string, unknown>) {
  const res = await apiFetch<BirebirOturum>(`${BASE}/oturumlar/${id}/telafi/`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function fetchHakedis(params?: Record<string, string | number | undefined>) {
  const res = await apiFetch<BirebirHakedis[]>(withQuery(`${BASE}/hakedis/`, params));
  return unwrap(res);
}

export async function approveHakedis(id: number) {
  const res = await apiFetch<BirebirHakedis>(`${BASE}/hakedis/${id}/onayla/`, {
    method: 'POST',
    body: '{}',
  });
  return unwrap(res);
}

export async function cancelHakedis(id: number) {
  const res = await apiFetch<BirebirHakedis>(`${BASE}/hakedis/${id}/iptal/`, {
    method: 'POST',
    body: '{}',
  });
  return unwrap(res);
}

export async function bordroAktar(yil: number, ay: number, ogretmen_id?: number) {
  const res = await apiFetch<Record<string, unknown>>(`${BASE}/hakedis/bordro-aktar/`, {
    method: 'POST',
    body: JSON.stringify({ yil, ay, ogretmen_id }),
  });
  return unwrap(res);
}

export async function fetchHakedisForBordro(aylikHakedisId: number) {
  const res = await apiFetch<BirebirHakedis[]>(`${BASE}/hakedis/bordro/${aylikHakedisId}/`);
  return unwrap(res);
}

export async function fetchPremiumKota(premiumPaketId: number) {
  const res = await apiFetch<PremiumKota[]>(`${BASE}/premium-paketler/${premiumPaketId}/kota/`);
  return unwrap(res);
}

export async function setPremiumKota(
  premiumPaketId: number,
  kotalar: { ders_id: number; haftalik_adet: number; varsayilan_sure_dk: number }[],
) {
  const res = await apiFetch<PremiumKota[]>(`${BASE}/premium-paketler/${premiumPaketId}/kota/`, {
    method: 'PUT',
    body: JSON.stringify({ kotalar }),
  });
  return unwrap(res);
}

export async function suggestPremiumSlots(premiumPaketId: number) {
  const res = await apiFetch<Record<string, unknown>[]>(
    `${BASE}/premium-paketler/${premiumPaketId}/kota/suggest/`,
  );
  return unwrap(res);
}

export async function seedUcretKurallari(scope: 'global' | 'kurum' | 'sube' = 'global') {
  const res = await apiFetch<{ created: number }>(`${BASE}/ucret-kurallari/seed/`, {
    method: 'POST',
    body: JSON.stringify({ scope }),
  });
  return unwrap(res);
}

export const OTURUM_DURUMLARI = [
  { value: 'PLANLANDI', label: 'Planlandı', color: '#64748b' },
  { value: 'ISLENDI', label: 'İşlendi', color: '#16a34a' },
  { value: 'ONLINE', label: 'Online', color: '#2563eb' },
  { value: 'OGRETMEN_GELMEDI', label: 'Öğretmen Gelmedi', color: '#db2777' },
  { value: 'OGRENCI_GELMEDI', label: 'Öğrenci Gelmedi', color: '#ca8a04' },
  { value: 'IPTAL', label: 'İptal', color: '#dc2626' },
] as const;

export const TELAFI_DURUMLARI = [
  { value: 'GEREKMIYOR', label: 'Telafi Gerekmiyor', color: '#64748b' },
  { value: 'BEKLENIYOR', label: 'Telafi Bekleniyor', color: '#ea580c' },
  { value: 'PLANLANDI', label: 'Telafi Planlandı', color: '#2563eb' },
  { value: 'EDILDI', label: 'Telafi Edildi', color: '#16a34a' },
] as const;

export const GUN_LABELS = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
