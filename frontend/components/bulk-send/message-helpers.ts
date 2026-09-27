import {
  campaignVariableFields,
  fillTemplateVariables,
} from "@/app/admin/iletisim/toplu-gonder/campaign-template-catalog";
import { headerTypeOf } from "@/components/communication/MetaTemplateSelect";
import type { CampaignAttachmentItem, WhatsAppMetaTemplateItem } from "@/lib/communication-api";

const MEDIA_HEADERS = ["IMAGE", "DOCUMENT", "VIDEO"];

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
