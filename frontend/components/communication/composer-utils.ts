/** WhatsApp Cloud API plain-text body with markdown-style markers. */

export type PreviewFontSize = "small" | "normal" | "large";

export interface ComposerState {
  text: string;
  previewColor?: string;
  previewFontSize?: PreviewFontSize;
}

export const WHATSAPP_MAX_LENGTH = 4096;

export const TEMPLATE_VARIABLES = [
  { key: "veli_ad", label: "Veli adı", token: "{{veli_ad}}", group: "genel" },
  { key: "ogrenci_ad", label: "Öğrenci adı", token: "{{ogrenci_ad}}", group: "genel" },
  { key: "personel_ad", label: "Personel adı", token: "{{personel_ad}}", group: "genel" },
  { key: "sinif", label: "Sınıf", token: "{{sinif}}", group: "genel" },
  { key: "sube", label: "Şube", token: "{{sube}}", group: "genel" },
  { key: "kurum_ad", label: "Kurum adı", token: "{{kurum_ad}}", group: "genel" },
  { key: "tarih", label: "Tarih", token: "{{tarih}}", group: "genel" },
  { key: "saat", label: "Saat", token: "{{saat}}", group: "genel" },
  { key: "baslik", label: "Başlık", token: "{{baslik}}", group: "genel" },
  { key: "mesaj", label: "Mesaj", token: "{{mesaj}}", group: "genel" },
  { key: "aciklama", label: "Açıklama", token: "{{aciklama}}", group: "genel" },

  { key: "oturum_ad", label: "Oturum (Sabah/Öğle/Akşam)", token: "{{oturum_ad}}", group: "yoklama" },
  { key: "yoklama_tarihi", label: "Yoklama tarihi", token: "{{yoklama_tarihi}}", group: "yoklama" },
  { key: "giris_saati", label: "Giriş saati", token: "{{giris_saati}}", group: "yoklama" },
  { key: "cikis_saati", label: "Çıkış saati", token: "{{cikis_saati}}", group: "yoklama" },
  { key: "salon_ad", label: "Salon adı", token: "{{salon_ad}}", group: "yoklama" },
  { key: "ders_no", label: "Ders no", token: "{{ders_no}}", group: "yoklama" },
  { key: "ilk_etut_saati", label: "İlk etüt giriş saati (oturuma göre)", token: "{{ilk_etut_saati}}", group: "yoklama" },
  { key: "son_etut_cikis_saati", label: "Son etüt çıkış saati (oturuma göre)", token: "{{son_etut_cikis_saati}}", group: "yoklama" },

  { key: "taksit_tutar", label: "Taksit tutarı", token: "{{taksit_tutar}}", group: "finans" },
  { key: "vade_tarihi", label: "Vade tarihi", token: "{{vade_tarihi}}", group: "finans" },
  { key: "taksit_no", label: "Taksit no", token: "{{taksit_no}}", group: "finans" },
  { key: "kalan_tutar", label: "Kalan tutar", token: "{{kalan_tutar}}", group: "finans" },
  { key: "toplam_gecikmis_tutar", label: "Toplam gecikmiş tutar", token: "{{toplam_gecikmis_tutar}}", group: "finans" },
  { key: "taksit_detay_listesi", label: "Gecikmiş taksit listesi", token: "{{taksit_detay_listesi}}", group: "finans" },
  { key: "taksit_sayisi", label: "Gecikmiş taksit sayısı", token: "{{taksit_sayisi}}", group: "finans" },
  { key: "max_gecikme_gunu", label: "En uzun gecikme (gün)", token: "{{max_gecikme_gunu}}", group: "finans" },
  { key: "sozlesme_no", label: "Sözleşme no", token: "{{sozlesme_no}}", group: "finans" },
  { key: "gecikme_gunu", label: "Gecikme günü", token: "{{gecikme_gunu}}", group: "finans" },
  { key: "belge_turu", label: "Belge türü", token: "{{belge_turu}}", group: "finans" },
  { key: "toplam_tahsilat", label: "Toplam tahsilat", token: "{{toplam_tahsilat}}", group: "finans" },
  { key: "toplam_gider", label: "Toplam gider", token: "{{toplam_gider}}", group: "finans" },

  { key: "hafta_no", label: "Hafta numarası", token: "{{hafta_no}}", group: "odev" },
  { key: "hafta", label: "Hafta (örn. 4. Hafta)", token: "{{hafta}}", group: "odev" },
  { key: "odev_baslik", label: "Ödev başlığı", token: "{{odev_baslik}}", group: "odev" },
  { key: "pdf_baslik", label: "PDF başlığı", token: "{{pdf_baslik}}", group: "odev" },
  { key: "teslim_tarihi", label: "Teslim tarihi", token: "{{teslim_tarihi}}", group: "odev" },

  { key: "koc_ad", label: "Koç adı", token: "{{koc_ad}}", group: "gorusme" },
  { key: "konu", label: "Görüşme konusu", token: "{{konu}}", group: "gorusme" },

  { key: "sinav_ad", label: "Sınav adı", token: "{{sinav_ad}}", group: "sinav" },

  { key: "sinif_seviyesi", label: "Sınıf seviyesi", token: "{{sinif_seviyesi}}", group: "kayit" },
  { key: "egitim_paketleri", label: "Eğitim paketleri", token: "{{egitim_paketleri}}", group: "kayit" },
  { key: "kayit_tarihi", label: "Kayıt tarihi", token: "{{kayit_tarihi}}", group: "kayit" },
  { key: "kayit_yapan", label: "Kayıt yapan", token: "{{kayit_yapan}}", group: "kayit" },
] as const;

export const TEMPLATE_VARIABLE_GROUP_LABELS: Record<string, string> = {
  genel: "Genel / Veli",
  yoklama: "Yoklama",
  finans: "Finans & Taksit",
  odeme: "Finans & Taksit",
  odev: "Haftalık ödev",
  gorusme: "Görüşme",
  sinav: "Sınav",
  kayit: "Kayıt sözleşmesi",
};

/** Strip preview-only metadata; returns API-ready plain text. */
export function plainTextFromComposer(state: ComposerState | string): string {
  const text = typeof state === "string" ? state : state.text;
  return text.trim();
}

export function createComposerState(text = ""): ComposerState {
  return { text, previewFontSize: "normal" };
}

/** WhatsApp biçim kısayolu: Ctrl/⌘+B kalın, I italik, Shift+X üstü çizili, Shift+M mono. */
export function formatShortcutMarker(e: {
  code?: string;
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey?: boolean;
}): string | null {
  if (e.altKey) return null;
  if (!(e.metaKey || e.ctrlKey)) return null;
  const code = e.code || "";
  const key = e.key.toLowerCase();
  if ((code === "KeyB" || key === "b") && !e.shiftKey) return "*";
  if ((code === "KeyI" || key === "i") && !e.shiftKey) return "_";
  if ((code === "KeyX" || key === "x") && e.shiftKey) return "~";
  if ((code === "KeyM" || key === "m") && e.shiftKey) return "```";
  return null;
}

export const FORMAT_SHORTCUT_HINTS = {
  bold: "Ctrl/⌘+B",
  italic: "Ctrl/⌘+I",
  strike: "Ctrl/⌘+Shift+X",
  mono: "Ctrl/⌘+Shift+M",
} as const;

export function wrapSelection(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  marker: string,
): { text: string; cursor: number } {
  const selected = text.slice(selectionStart, selectionEnd);
  const before = text.slice(0, selectionStart);
  const after = text.slice(selectionEnd);
  const wrapped = `${marker}${selected || "metin"}${marker}`;
  const newText = before + wrapped + after;
  const cursor = before.length + wrapped.length;
  return { text: newText, cursor };
}

export function insertAtCursor(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  insert: string,
): { text: string; cursor: number } {
  const before = text.slice(0, selectionStart);
  const after = text.slice(selectionEnd);
  const newText = before + insert + after;
  return { text: newText, cursor: before.length + insert.length };
}

export interface WhatsAppSegment {
  type: "text" | "bold" | "italic" | "strike" | "mono" | "variable";
  content: string;
}

export function parseWhatsAppText(input: string): WhatsAppSegment[] {
  if (!input) return [];

  const segments: WhatsAppSegment[] = [];
  const regex =
    /(\{\{[^}]+\}\})|(\*[^*\n]+\*)|(_[^_\n]+_)|(~[^~\n]+~)|(```[^`\n]+```)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: input.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith("{{")) {
      segments.push({ type: "variable", content: raw });
    } else if (raw.startsWith("*")) {
      segments.push({ type: "bold", content: raw.slice(1, -1) });
    } else if (raw.startsWith("_")) {
      segments.push({ type: "italic", content: raw.slice(1, -1) });
    } else if (raw.startsWith("~")) {
      segments.push({ type: "strike", content: raw.slice(1, -1) });
    } else if (raw.startsWith("```")) {
      segments.push({ type: "mono", content: raw.slice(3, -3) });
    }
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < input.length) {
    segments.push({ type: "text", content: input.slice(lastIndex) });
  }

  return segments.length ? segments : [{ type: "text", content: input }];
}

/**
 * Demo preview context for template variables in the studio UI.
 * kurum_ad / sube canlı bağlamla override edilmeli (buildPreviewContext).
 */
export const SAMPLE_PREVIEW_CONTEXT: Record<string, string> = {
  veli_ad: "Ayşe Hanım",
  ogrenci_ad: "Mehmet Yılmaz",
  personel_ad: "Zeynep Kaya",
  sinif: "12-A",
  sube: "Örnek Şube",
  kurum_ad: "Örnek Kurum",
  tarih: "03.08.2026",
  saat: "14:30",
  baslik: "Veli Toplantısı",
  mesaj: "Bilgilendirme metni",
  aciklama: "Detaylı açıklama",
  oturum_ad: "Sabah",
  yoklama_tarihi: "03.08.2026",
  giris_saati: "08:45",
  cikis_saati: "16:10",
  salon_ad: "A Salonu",
  ders_no: "3",
  ilk_etut_saati: "08:30",
  son_etut_cikis_saati: "12:10",
  taksit_tutar: "2.500",
  vade_tarihi: "15.07.2026",
  taksit_no: "3",
  kalan_tutar: "2.500",
  toplam_gecikmis_tutar: "5.000",
  taksit_detay_listesi: "3. taksit: 2.500 TL (vade: 15.07.2026, 19 gün gecikme)",
  taksit_sayisi: "2",
  max_gecikme_gunu: "19",
  sozlesme_no: "SZ-2026-0142",
  gecikme_gunu: "19",
  belge_turu: "Ödeme planı",
  toplam_tahsilat: "125.000",
  toplam_gider: "18.500",
  hafta_no: "4",
  hafta: "4. Hafta",
  odev_baslik: "Haziran Ayı 4. Hafta Ödevi",
  pdf_baslik: "Ödev Planı",
  teslim_tarihi: "06.07.2026",
  koc_ad: "Elif Demir",
  konu: "Sınav hazırlığı",
  sinav_ad: "TYT Deneme 12",
  sinif_seviyesi: "9. Sınıf",
  egitim_paketleri: "Grup Ders, Koçluk",
  kayit_tarihi: "14.08.2026",
  kayit_yapan: "Ayşe Kayıt",
};

export type PreviewSampleContext = Partial<typeof SAMPLE_PREVIEW_CONTEXT>;

/** Örnek bağlam + canlı/override değerler (boş stringler yok sayılır). */
export function buildPreviewContext(
  overrides?: PreviewSampleContext | null,
): Record<string, string> {
  const merged: Record<string, string> = { ...SAMPLE_PREVIEW_CONTEXT };
  if (!overrides) return merged;
  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) continue;
    const trimmed = String(value).trim();
    if (!trimmed) continue;
    merged[key] = trimmed;
  }
  return merged;
}

/** Replace {{token}} placeholders for live preview (send-time resolution is server-side). */
export function resolvePreviewVariables(
  text: string,
  context?: PreviewSampleContext | null,
): string {
  // context verilirse üzerine yazar (boş string dahil). Canlı kurum/şube için
  // useLivePreviewContext / buildPreviewContext kullanın.
  const resolved: Record<string, string> = { ...SAMPLE_PREVIEW_CONTEXT };
  if (context) {
    for (const [key, value] of Object.entries(context)) {
      if (value == null) continue;
      resolved[key] = String(value);
    }
  }
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(resolved, key) ? resolved[key] : match,
  );
}

/** Inbox hazır yanıt — konuşma bağlamıyla değişken doldurma. */
export function resolveTemplateBodyForConversation(
  body: string,
  conversation?: {
    contact_name?: string;
    contact_phone?: string;
    contact_type?: string;
    veli_ad?: string;
    ogrenci_ad?: string;
    kurum_ad?: string;
    sube?: string;
    sinif?: string;
  } | null,
): string {
  const veliAd = conversation?.veli_ad?.trim() || "";
  const ogrenciAd = conversation?.ogrenci_ad?.trim() || "";
  const contactName = conversation?.contact_name?.trim() || "";

  const resolvedVeliAd =
    veliAd ||
    (conversation?.contact_type === "VELI" ? contactName : "") ||
    "";
  const resolvedOgrenciAd =
    ogrenciAd ||
    (conversation?.contact_type === "OGRENCI" ? contactName : "") ||
    "";

  return resolvePreviewVariables(body, {
    veli_ad: resolvedVeliAd,
    ogrenci_ad: resolvedOgrenciAd,
    sinif: conversation?.sinif?.trim() || "",
    sube: conversation?.sube?.trim() || "",
    kurum_ad: conversation?.kurum_ad?.trim() || "",
  });
}

/** Estimate SMS-style segments (160 chars for GSM, simplified). */
export function messageSegments(length: number): number {
  if (length === 0) return 0;
  return Math.ceil(length / 160);
}
