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
  { key: "rapor_ad", label: "Rapor türü", token: "{{rapor_ad}}", group: "finans" },
  { key: "toplam_giren", label: "Kuruma giren", token: "{{toplam_giren}}", group: "finans" },
  { key: "toplam_cikan", label: "Kurumdan çıkan", token: "{{toplam_cikan}}", group: "finans" },

  { key: "hafta_no", label: "Hafta numarası", token: "{{hafta_no}}", group: "odev" },
  { key: "hafta", label: "Hafta (örn. 4. Hafta)", token: "{{hafta}}", group: "odev" },
  { key: "odev_baslik", label: "Ödev başlığı", token: "{{odev_baslik}}", group: "odev" },
  { key: "pdf_baslik", label: "PDF başlığı", token: "{{pdf_baslik}}", group: "odev" },
  { key: "teslim_tarihi", label: "Teslim tarihi", token: "{{teslim_tarihi}}", group: "odev" },

  { key: "koc_ad", label: "Koç adı", token: "{{koc_ad}}", group: "gorusme" },
  { key: "konu", label: "Görüşme konusu", token: "{{konu}}", group: "gorusme" },

  { key: "sinav_ad", label: "Sınav adı (eski)", token: "{{sinav_ad}}", group: "sinav" },
  { key: "sinav_adi", label: "Sınav adı", token: "{{sinav_adi}}", group: "sinav" },
  { key: "sinav_tarihi", label: "Sınav tarihi", token: "{{sinav_tarihi}}", group: "sinav" },
  { key: "baslama_saati", label: "Başlama saati", token: "{{baslama_saati}}", group: "sinav" },
  { key: "bitis_saati", label: "Bitiş saati", token: "{{bitis_saati}}", group: "sinav" },
  { key: "sinav_salonu", label: "Sınav salonu", token: "{{sinav_salonu}}", group: "sinav" },
  { key: "sira_no", label: "Sıra no", token: "{{sira_no}}", group: "sinav" },
  { key: "sira", label: "Sıra no (eski)", token: "{{sira}}", group: "sinav" },

  { key: "sinif_seviyesi", label: "Sınıf seviyesi", token: "{{sinif_seviyesi}}", group: "kayit" },
  { key: "egitim_paketleri", label: "Eğitim paketleri", token: "{{egitim_paketleri}}", group: "kayit" },
  { key: "kayit_tarihi", label: "Kayıt tarihi", token: "{{kayit_tarihi}}", group: "kayit" },
  { key: "kayit_yapan", label: "Kayıt yapan", token: "{{kayit_yapan}}", group: "kayit" },

  { key: "ders_tarihi", label: "Ders tarihi", token: "{{ders_tarihi}}", group: "ozel_ders" },
  { key: "ders_saati", label: "Ders saati", token: "{{ders_saati}}", group: "ozel_ders" },
  { key: "ders_adi", label: "Ders adı", token: "{{ders_adi}}", group: "ozel_ders" },
  { key: "ders_ad", label: "Ders adı (ders geçmişi)", token: "{{ders_ad}}", group: "ozel_ders" },
  { key: "ogretmen_ad", label: "Öğretmen adı", token: "{{ogretmen_ad}}", group: "ozel_ders" },
  { key: "ders_durumu", label: "Ders durumu", token: "{{ders_durumu}}", group: "ozel_ders" },
  { key: "sebep", label: "İptal / yoklama nedeni", token: "{{sebep}}", group: "ozel_ders" },
  { key: "ek_bilgi", label: "Ek bilgi", token: "{{ek_bilgi}}", group: "ozel_ders" },
  { key: "telafi_notu", label: "Telafi notu (gerekirse)", token: "{{telafi_notu}}", group: "ozel_ders" },
  { key: "telafi_tarihi", label: "Telafi tarihi", token: "{{telafi_tarihi}}", group: "ozel_ders" },
  { key: "telafi_saati", label: "Telafi saati", token: "{{telafi_saati}}", group: "ozel_ders" },
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
  ozel_ders: "Özel ders",
};

/** Strip preview-only metadata; returns API-ready plain text. */
export function plainTextFromComposer(state: ComposerState | string): string {
  const text = typeof state === "string" ? state : state.text;
  return text.trim();
}

export function createComposerState(text = ""): ComposerState {
  return { text, previewFontSize: "normal" };
}

export type WhatsAppLineStyle = "quote" | "bullet" | "number";

export type WhatsAppFormatAction =
  | { kind: "wrap"; marker: string }
  | { kind: "prefix"; style: WhatsAppLineStyle };

/** WhatsApp biçim kısayolu — kalın / italik / çizili / mono / kod / alıntı / liste. */
export function formatShortcutAction(e: {
  code?: string;
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey?: boolean;
}): WhatsAppFormatAction | null {
  if (e.altKey) return null;
  if (!(e.metaKey || e.ctrlKey)) return null;
  const code = e.code || "";
  const key = e.key.toLowerCase();
  if ((code === "KeyB" || key === "b") && !e.shiftKey) return { kind: "wrap", marker: "*" };
  if ((code === "KeyI" || key === "i") && !e.shiftKey) return { kind: "wrap", marker: "_" };
  if ((code === "KeyX" || key === "x") && e.shiftKey) return { kind: "wrap", marker: "~" };
  if ((code === "KeyM" || key === "m") && e.shiftKey) return { kind: "wrap", marker: "```" };
  if ((code === "KeyE" || key === "e") && !e.shiftKey) return { kind: "wrap", marker: "`" };
  if ((code === "KeyQ" || key === "q") && e.shiftKey) return { kind: "prefix", style: "quote" };
  if ((code === "Digit8" || code === "Numpad8" || key === "8") && e.shiftKey) {
    return { kind: "prefix", style: "bullet" };
  }
  if ((code === "Digit7" || code === "Numpad7" || key === "7") && e.shiftKey) {
    return { kind: "prefix", style: "number" };
  }
  return null;
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
  const action = formatShortcutAction(e);
  return action?.kind === "wrap" ? action.marker : null;
}

export const FORMAT_SHORTCUT_HINTS = {
  bold: "Ctrl/⌘+B",
  italic: "Ctrl/⌘+I",
  strike: "Ctrl/⌘+Shift+X",
  mono: "Ctrl/⌘+Shift+M",
  code: "Ctrl/⌘+E",
  quote: "Ctrl/⌘+Shift+Q",
  bullet: "Ctrl/⌘+Shift+8",
  number: "Ctrl/⌘+Shift+7",
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

function stripLinePrefix(line: string): string {
  return line
    .replace(/^>\s?/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+\.\s+/, "");
}

export function prefixSelectedLines(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  style: WhatsAppLineStyle,
): { text: string; cursor: number } {
  const lineStart = text.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const nl = text.indexOf("\n", selectionEnd);
  const lineEnd = nl === -1 ? text.length : nl;
  const block = text.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const allQuoted = lines.every((line) => /^>\s?/.test(line));
  const allBullets = lines.every((line) => /^[-*]\s+/.test(line));
  const allNumbered = lines.every((line) => /^\d+\.\s+/.test(line));
  const mapped = lines.map((line, index) => {
    const stripped = stripLinePrefix(line);
    if (style === "quote") return allQuoted ? stripped : `> ${stripped}`;
    if (style === "bullet") return allBullets ? stripped : `- ${stripped}`;
    return allNumbered ? stripped : `${index + 1}. ${stripped}`;
  });
  const next = mapped.join("\n");
  return {
    text: text.slice(0, lineStart) + next + text.slice(lineEnd),
    cursor: lineStart + next.length,
  };
}

export function applyWhatsAppFormat(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  action: WhatsAppFormatAction,
): { text: string; cursor: number } {
  if (action.kind === "prefix") {
    return prefixSelectedLines(text, selectionStart, selectionEnd, action.style);
  }
  return wrapSelection(text, selectionStart, selectionEnd, action.marker);
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
  type: "text" | "bold" | "italic" | "strike" | "mono" | "code" | "variable";
  content: string;
}

export function parseWhatsAppText(input: string): WhatsAppSegment[] {
  if (!input) return [];

  const segments: WhatsAppSegment[] = [];
  const regex =
    /(\{\{[^}]+\}\})|(\*[^*\n]+\*)|(_[^_\n]+_)|(~[^~\n]+~)|(```[^`\n]+```)|(`[^`\n]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: input.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith("{{")) {
      segments.push({ type: "variable", content: raw });
    } else if (raw.startsWith("```")) {
      segments.push({ type: "mono", content: raw.slice(3, -3) });
    } else if (raw.startsWith("`")) {
      segments.push({ type: "code", content: raw.slice(1, -1) });
    } else if (raw.startsWith("*")) {
      segments.push({ type: "bold", content: raw.slice(1, -1) });
    } else if (raw.startsWith("_")) {
      segments.push({ type: "italic", content: raw.slice(1, -1) });
    } else if (raw.startsWith("~")) {
      segments.push({ type: "strike", content: raw.slice(1, -1) });
    }
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < input.length) {
    segments.push({ type: "text", content: input.slice(lastIndex) });
  }

  return segments.length ? segments : [{ type: "text", content: input }];
}

export type WhatsAppPreviewLine = {
  block: "none" | "quote" | "bullet" | "number";
  marker: string;
  segments: WhatsAppSegment[];
};

export function parseWhatsAppPreviewLines(input: string): WhatsAppPreviewLine[] {
  return (input || "").split("\n").map((line) => {
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      return { block: "quote" as const, marker: "", segments: parseWhatsAppText(quote[1]) };
    }
    const numbered = line.match(/^(\d+\.)\s+(.*)$/);
    if (numbered) {
      return {
        block: "number" as const,
        marker: numbered[1],
        segments: parseWhatsAppText(numbered[2]),
      };
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      return { block: "bullet" as const, marker: "•", segments: parseWhatsAppText(bullet[1]) };
    }
    return { block: "none" as const, marker: "", segments: parseWhatsAppText(line) };
  });
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
  mesaj: "Haftalık deneme sınavı sonuçları öğrenci paneline yüklenmiştir. Değerlendirme toplantısı çarşamba saat 18.00’de yapılacaktır.",
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
  rapor_ad: "Gün Sonu Raporu",
  toplam_giren: "1.500",
  toplam_cikan: "250",
  hafta_no: "4",
  hafta: "4. Hafta",
  odev_baslik: "Haziran Ayı 4. Hafta Ödevi",
  pdf_baslik: "Ödev Planı",
  teslim_tarihi: "06.07.2026",
  koc_ad: "Elif Demir",
  konu: "Sınav hazırlığı",
  sinav_ad: "TYT Deneme 12",
  sinav_adi: "TYT Deneme 12",
  sinav_tarihi: "12.04.2026",
  baslama_saati: "10:00",
  bitis_saati: "12:45",
  sinav_salonu: "A Salonu",
  sira_no: "14",
  sira: "14",
  sinif_seviyesi: "9. Sınıf",
  egitim_paketleri: "Grup Ders, Koçluk",
  kayit_tarihi: "14.08.2026",
  kayit_yapan: "Ayşe Kayıt",
  ders_tarihi: "15 Ocak 2026 Pazartesi",
  ders_saati: "15.00",
  ders_adi: "Matematik",
  ders_ad: "Matematik",
  ogretmen_ad: "Tuba Demir",
  ders_durumu: "Öğretmen Gelmedi",
  sebep: "Hastalık",
  ek_bilgi: "Ek not",
  telafi_notu:
    "Ders telafi edilecektir. Telafi tarihi ve saati kesinleştiğinde tarafınıza ayrıca bilgi verilecektir.",
  telafi_tarihi: "18 Ocak 2026 Pazar",
  telafi_saati: "14.00",
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

/** Meta parameters[].text — satır sonu / tab / ardışık boşluk tek satıra. Gövde metnine uygulanmaz. */
export function sanitizeTemplateParamText(value: string): string {
  return (value || "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
}

export function hasVisibleWhatsAppText(text: string): boolean {
  return /[^\s\u00a0]/.test(text || "");
}

/** Replace {{token}} placeholders for live preview (send-time resolution is server-side). */
export function resolvePreviewVariables(
  text: string,
  context?: PreviewSampleContext | null,
  options?: { normalizeParamValues?: boolean },
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
  if (options?.normalizeParamValues) {
    for (const key of Object.keys(resolved)) {
      resolved[key] = sanitizeTemplateParamText(resolved[key]);
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
