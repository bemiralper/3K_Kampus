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
  { key: "sinif", label: "Sınıf", token: "{{sinif}}", group: "genel" },
  { key: "sube", label: "Şube", token: "{{sube}}", group: "genel" },
  { key: "kurum_ad", label: "Kurum adı", token: "{{kurum_ad}}", group: "genel" },
  { key: "oturum_ad", label: "Oturum (Sabah/Öğle/Akşam)", token: "{{oturum_ad}}", group: "yoklama" },
  { key: "yoklama_tarihi", label: "Yoklama tarihi", token: "{{yoklama_tarihi}}", group: "yoklama" },
  { key: "giris_saati", label: "Giriş saati", token: "{{giris_saati}}", group: "yoklama" },
  { key: "cikis_saati", label: "Çıkış saati", token: "{{cikis_saati}}", group: "yoklama" },
  { key: "salon_ad", label: "Salon adı", token: "{{salon_ad}}", group: "yoklama" },
  { key: "ders_no", label: "Ders no", token: "{{ders_no}}", group: "yoklama" },
  { key: "taksit_tutar", label: "Taksit tutarı", token: "{{taksit_tutar}}", group: "finans" },
  { key: "vade_tarihi", label: "Vade tarihi", token: "{{vade_tarihi}}", group: "finans" },
  { key: "taksit_no", label: "Taksit no", token: "{{taksit_no}}", group: "finans" },
  { key: "kalan_tutar", label: "Kalan tutar", token: "{{kalan_tutar}}", group: "finans" },
  { key: "toplam_gecikmis_tutar", label: "Toplam gecikmiş tutar", token: "{{toplam_gecikmis_tutar}}", group: "finans" },
  { key: "taksit_detay_listesi", label: "Gecikmiş taksit listesi", token: "{{taksit_detay_listesi}}", group: "finans" },
  { key: "sozlesme_no", label: "Sözleşme no", token: "{{sozlesme_no}}", group: "finans" },
  { key: "gecikme_gunu", label: "Gecikme günü", token: "{{gecikme_gunu}}", group: "finans" },
  { key: "hafta_no", label: "Hafta numarası", token: "{{hafta_no}}", group: "odev" },
  { key: "hafta", label: "Hafta (örn. 4. Hafta)", token: "{{hafta}}", group: "odev" },
  { key: "odev_baslik", label: "Ödev başlığı", token: "{{odev_baslik}}", group: "odev" },
  { key: "pdf_baslik", label: "PDF başlığı", token: "{{pdf_baslik}}", group: "odev" },
  { key: "teslim_tarihi", label: "Teslim tarihi", token: "{{teslim_tarihi}}", group: "odev" },
] as const;

export const TEMPLATE_VARIABLE_GROUP_LABELS: Record<string, string> = {
  genel: "Genel / Veli",
  yoklama: "Yoklama",
  finans: "Finans & Taksit",
  odeme: "Finans & Taksit",
  odev: "Haftalık ödev",
};

/** Strip preview-only metadata; returns API-ready plain text. */
export function plainTextFromComposer(state: ComposerState | string): string {
  const text = typeof state === "string" ? state : state.text;
  return text.trim();
}

export function createComposerState(text = ""): ComposerState {
  return { text, previewFontSize: "normal" };
}

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

/** Demo preview context for template variables in the studio UI. */
export const SAMPLE_PREVIEW_CONTEXT: Record<string, string> = {
  veli_ad: "Ayşe Hanım",
  ogrenci_ad: "Mehmet Yılmaz",
  sinif: "12-A",
  sube: "Merkez Kampüs",
  taksit_tutar: "2.500 ₺",
  vade_tarihi: "15.07.2026",
  hafta_no: "4",
  hafta: "4. Hafta",
  odev_baslik: "Haziran Ayı 4. Hafta Ödevi",
  pdf_baslik: "Ödev Planı",
  teslim_tarihi: "06.07.2026",
  kurum_ad: "3K Kampüs",
};

export type PreviewSampleContext = Partial<typeof SAMPLE_PREVIEW_CONTEXT>;

/** Replace {{token}} placeholders for live preview (send-time resolution is server-side). */
export function resolvePreviewVariables(
  text: string,
  context: PreviewSampleContext = SAMPLE_PREVIEW_CONTEXT,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => context[key] ?? match);
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
    sinif: "",
    sube: conversation?.sube?.trim() || "",
    taksit_tutar: "",
    vade_tarihi: "",
    kurum_ad: conversation?.kurum_ad?.trim() || "",
  });
}

/** Estimate SMS-style segments (160 chars for GSM, simplified). */
export function messageSegments(length: number): number {
  if (length === 0) return 0;
  return Math.ceil(length / 160);
}
