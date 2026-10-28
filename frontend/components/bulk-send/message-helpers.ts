import {
  campaignVariableFields,
  fillTemplateVariables,
} from "@/app/admin/iletisim/toplu-gonder/campaign-template-catalog";
import { headerTypeOf } from "@/components/communication/MetaTemplateSelect";
import type { CampaignAttachmentItem, WhatsAppMetaTemplateItem } from "@/lib/communication-api";

const MEDIA_HEADERS = ["IMAGE", "DOCUMENT", "VIDEO"];

/** Sağ kolondaki önizleme kartı; dar ekranda içerik altına düşer, düğmeyle oraya inilir. */
export const PREVIEW_ANCHOR_ID = "bss-preview";

/** Velilere/öğrencilere rahatsız edici saat (yerel saat). */
const QUIET_START_HOUR = 21;
const QUIET_END_HOUR = 9;

export function isQuietHour(at: Date): boolean {
  const hour = at.getHours();
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

export const QUIET_HOURS_LABEL = `${QUIET_START_HOUR}:00–0${QUIET_END_HOUR}:00`;

/** En erken zamanlama: şimdiden 5 dk sonrası (cron 1–5 dk aralıkla çalışır). */
export const MIN_SCHEDULE_LEAD_MS = 5 * 60 * 1000;

/** `datetime-local` değeri (yerel saat, saniyesiz). */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function scheduleError(value: string): string | null {
  if (!value) return "Tarih ve saat seçin.";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "Geçersiz tarih.";
  if (at.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) return "En az 5 dakika sonrası seçilmeli.";
  return null;
}

export function isApprovedTemplate(tpl: WhatsAppMetaTemplateItem | null): boolean {
  return String(tpl?.status || "").toUpperCase() === "APPROVED";
}

/** Şablonun başlığı medya bekliyorsa ek zorunludur. */
export function needsAttachment(tpl: WhatsAppMetaTemplateItem | null): boolean {
  return MEDIA_HEADERS.includes(headerTypeOf(tpl));
}

export function attachmentMismatch(
  attachments: CampaignAttachmentItem[],
  tpl: WhatsAppMetaTemplateItem | null,
): string | null {
  if (!tpl) return null;
  const htype = headerTypeOf(tpl);
  if (!MEDIA_HEADERS.includes(htype)) return null;
  if (!attachments.length) {
    if (htype === "IMAGE") return "Bu şablon görsel bekliyor.";
    if (htype === "VIDEO") return "Bu şablon video bekliyor.";
    return "Bu şablon PDF / belge bekliyor.";
  }
  const mime = (attachments[0].mime_type || "").toLowerCase();
  if (htype === "IMAGE" && !mime.startsWith("image/")) return "Görsel şablon için resim ekleyin.";
  if (htype === "VIDEO" && !mime.startsWith("video/")) return "Video şablon için video ekleyin.";
  if (htype === "DOCUMENT" && mime.startsWith("image/")) return "Belge şablonu için PDF ekleyin.";
  return null;
}

export function composePreview(
  tpl: WhatsAppMetaTemplateItem | null,
  values: Record<string, string>,
): string {
  if (!tpl) return "";
  const header = tpl.header_json?.type === "TEXT" ? (tpl.header_json.text || "").trim() : "";
  const body = fillTemplateVariables(tpl.body_named || "", values, tpl.variable_map_json);
  const footer = (tpl.footer_text || "").trim();
  return [header, body, footer].filter(Boolean).join("\n\n");
}

/** Doldurulması kullanıcıya kalan, hâlâ boş olan değişkenler. */
export function missingVariableFields(
  tpl: WhatsAppMetaTemplateItem | null,
  values: Record<string, string>,
): string[] {
  if (!tpl) return [];
  return campaignVariableFields(tpl.body_named || "", tpl.variable_map_json)
    .filter((field) => !field.auto && !(values[field.key] || values[field.canonical] || "").trim())
    .map((field) => field.label);
}

export function campaignMessageReady(
  tpl: WhatsAppMetaTemplateItem | null,
  values: Record<string, string>,
  attachments: CampaignAttachmentItem[],
): boolean {
  if (!tpl || !isApprovedTemplate(tpl)) return false;
  if (missingVariableFields(tpl, values).length) return false;
  if (needsAttachment(tpl) && attachments.length === 0) return false;
  return attachmentMismatch(attachments, tpl) == null;
}

export function writeVariableValue(
  values: Record<string, string>,
  field: { key: string; canonical: string },
  next: string,
): Record<string, string> {
  const updated = { ...values, [field.key]: next };
  if (field.canonical !== field.key) updated[field.canonical] = next;
  return updated;
}

export function templateStatusLabel(status?: string): string {
  const raw = String(status || "").toUpperCase();
  if (raw === "APPROVED") return "Onaylı";
  if (raw === "PENDING") return "İnceleniyor";
  if (raw === "SUBMITTED") return "Meta'da";
  if (raw === "DRAFT") return "Taslak";
  if (raw === "REJECTED") return "Reddedildi";
  return raw || "Yok";
}

export function bodySnippet(body: string, max = 120): string {
  const clean = (body || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}
