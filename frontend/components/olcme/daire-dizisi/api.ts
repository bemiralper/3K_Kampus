import { getContextHeaders } from '@/lib/api';
import { downloadPdfBlob } from '@/lib/download-file';
import type { AlgilamaSonucu, DaireBelge, DaireLayout, DaireSablonDetay, DaireSablonOzet, FmtSonucu, TaramaKalibrasyonu, VeriKaynagi, YaziciProfili } from './types';

const BASE = '/api/coaching/olcme-degerlendirme/optik-daire-sablonlar';
const EXAMS = '/api/coaching/olcme-degerlendirme/exams';

async function failMessage(res: Response, fallback: string) {
  const err = await res.json().catch(() => ({}));
  return (err as { error?: string }).error || fallback;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...getContextHeaders(), ...options.headers },
    ...options,
  });
  if (!res.ok) throw new Error(await failMessage(res, `HTTP ${res.status}`));
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function filenameFromDisposition(header: string | null, fallback: string) {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try { return decodeURIComponent(star[1]); } catch { return fallback; }
  }
  const plain = /filename="([^"]+)"/i.exec(header);
  return plain?.[1] || fallback;
}

async function downloadPdf(url: string, body: unknown, fallback: string) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...getContextHeaders() },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(await failMessage(res, 'PDF indirilemedi.'));
  const blob = await res.blob();
  const name = filenameFromDisposition(res.headers.get('content-disposition'), fallback);
  await downloadPdfBlob(blob, name);
  const encoded = res.headers.get('X-Optik-Uyarilar');
  if (!encoded) return [];
  try { return decodeURIComponent(encoded).split(' | ').filter(Boolean); } catch { return []; }
}

export const daireSablonApi = {
  list: () => request<DaireSablonOzet[]>(`${BASE}/`),

  detail: (id: number) => request<DaireSablonDetay>(`${BASE}/${id}/`),

  veriKaynaklari: () => request<{ kaynaklar: VeriKaynagi[] }>(`${BASE}/veri-kaynaklari/`),

  create: async (ad: string, dosya: File) => {
    const form = new FormData();
    form.append('ad', ad);
    form.append('kaynak', dosya);
    const res = await fetch(`${BASE}/`, {
      method: 'POST',
      credentials: 'include',
      headers: getContextHeaders(),
      body: form,
    });
    if (!res.ok) throw new Error(await failMessage(res, 'Şablon kaydedilemedi.'));
    return res.json() as Promise<DaireSablonDetay>;
  },

  update: (id: number, data: { ad?: string; aktif?: boolean; sayfa_no?: number; yazici_profili_id?: number | null }) =>
    request<DaireSablonDetay>(`${BASE}/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),

  replaceSource: async (id: number, dosya: File, sayfaNo = 1) => {
    const form = new FormData();
    form.append('kaynak', dosya);
    form.append('sayfa_no', String(sayfaNo));
    const res = await fetch(`${BASE}/${id}/`, {
      method: 'PATCH',
      credentials: 'include',
      headers: getContextHeaders(),
      body: form,
    });
    if (!res.ok) throw new Error(await failMessage(res, 'Kaynak form yenilenemedi.'));
    return res.json() as Promise<DaireSablonDetay>;
  },

  saveBelge: (id: number, belge: DaireBelge) =>
    request<DaireSablonDetay>(`${BASE}/${id}/belge/`, { method: 'PUT', body: JSON.stringify({ belge }) }),

  layout: (id: number, belge: DaireBelge, formUzayi = false) =>
    request<DaireLayout>(`${BASE}/${id}/layout/`, {
      method: 'POST',
      body: JSON.stringify({ belge, form_uzayi: formUzayi }),
    }),

  remove: (id: number) => request<void>(`${BASE}/${id}/`, { method: 'DELETE' }),

  kopyala: (id: number, ad?: string) =>
    request<DaireSablonDetay>(`${BASE}/${id}/kopyala/`, {
      method: 'POST',
      body: JSON.stringify(ad ? { ad } : {}),
    }),

  sayfa: async (id: number, no: number) => {
    const res = await fetch(`${BASE}/${id}/sayfa/?no=${no}`, {
      credentials: 'include',
      headers: getContextHeaders(),
    });
    if (!res.ok) throw new Error(await failMessage(res, 'Form görüntüsü alınamadı.'));
    const encoded = res.headers.get('X-Raster-Uyari');
    let uyari = '';
    if (encoded) {
      try { uyari = decodeURIComponent(encoded); } catch { uyari = encoded; }
    }
    const blob = await res.blob();
    return { url: URL.createObjectURL(blob), uyari };
  },

  fmt: async (id: number, dosya: File) => {
    const form = new FormData();
    form.append('dosya', dosya);
    const res = await fetch(`${BASE}/${id}/fmt/`, {
      method: 'POST',
      credentials: 'include',
      headers: getContextHeaders(),
      body: form,
    });
    if (!res.ok) throw new Error(await failMessage(res, 'FMT okunamadı.'));
    return res.json() as Promise<FmtSonucu>;
  },

  algila: (id: number, sayfaNo: number, sadeceIz = false) =>
    request<AlgilamaSonucu>(`${BASE}/${id}/algila/`, {
      method: 'POST',
      body: JSON.stringify({ sayfa_no: sayfaNo, sadece_iz: sadeceIz }),
    }),

  taramaKalibrasyon: async (id: number, dosya: File) => {
    const form = new FormData();
    form.append('tarama', dosya);
    const res = await fetch(`${BASE}/${id}/tarama-kalibrasyon/`, {
      method: 'POST',
      credentials: 'include',
      headers: getContextHeaders(),
      body: form,
    });
    if (!res.ok) throw new Error(await failMessage(res, 'Tarama ölçülemedi.'));
    return res.json() as Promise<TaramaKalibrasyonu>;
  },

  onizleme: (id: number) => downloadPdf(`${BASE}/${id}/onizleme/`, {}, 'daire-onizleme.pdf'),

  testBaski: (id: number) => downloadPdf(`${BASE}/${id}/test-baski/`, {}, 'daire-test.pdf'),

  yazdir: (
    examId: number,
    sablonId: number,
    participantIds: number[],
    bookletMode: 'none' | 'fixed' | 'alternating_ab' = 'none',
    booklet: 'A' | 'B' | 'C' | 'D' = 'A',
  ) =>
    downloadPdf(`${EXAMS}/${examId}/optik-daire-yazdir/`, {
      sablon_id: sablonId,
      participant_ids: participantIds,
      booklet_mode: bookletMode,
      booklet,
    }, 'optik-daire.pdf'),
};

const PROFILE_BASE = '/api/coaching/olcme-degerlendirme/optik-yazici-profilleri';

export const yaziciProfiliApi = {
  list: () => request<YaziciProfili[]>(`${PROFILE_BASE}/`),
  create: (data: Pick<YaziciProfili, 'ad' | 'kalibrasyon'> & { varsayilan?: boolean; son_kalite?: Record<string, unknown> }) =>
    request<YaziciProfili>(`${PROFILE_BASE}/`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<YaziciProfili>) =>
    request<YaziciProfili>(`${PROFILE_BASE}/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: number) => request<void>(`${PROFILE_BASE}/${id}/`, { method: 'DELETE' }),
};
