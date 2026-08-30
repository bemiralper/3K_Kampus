import { headerTypeOf } from "@/components/communication/MetaTemplateSelect";
import { TEMPLATE_VARIABLES } from "@/components/communication/composer-utils";
import type { AudiencePersonType, WhatsAppMetaTemplateItem } from "@/lib/communication-api";

export type CampaignAudience = "veli" | "ogrenci" | "personel" | "genel";
export type CampaignMedia = "metin" | "gorsel" | "pdf" | "video";

export const CAMPAIGN_AUDIENCE_LABELS: Record<CampaignAudience, string> = {
  veli: "Veli",
  ogrenci: "Öğrenci",
  personel: "Personel",
  genel: "Genel (tüm kitleler)",
};

export const CAMPAIGN_MEDIA_OPTIONS: Array<{
  key: CampaignMedia;
  label: string;
  headers: string[];
}> = [
  { key: "metin", label: "Metin", headers: ["TEXT", "NONE", ""] },
  { key: "gorsel", label: "Görsel", headers: ["IMAGE"] },
  { key: "pdf", label: "Belge / PDF", headers: ["DOCUMENT"] },
  { key: "video", label: "Video", headers: ["VIDEO"] },
];

/** Alıcı başına sunucuda çözülen değişkenler — boş bırakılırsa otomatik dolar. */
export const AUTO_RESOLVED_VARIABLES = new Set([
  "veli_ad",
  "ogrenci_ad",
  "sinif",
  "sube",
  "kurum_ad",
  "personel_ad",
]);

const VARIABLE_LABELS: Record<string, string> = Object.fromEntries(
  TEMPLATE_VARIABLES.map((item) => [item.key, item.label]),
);

export interface ClassifiedCampaignTemplate {
  tpl: WhatsAppMetaTemplateItem;
  eligible: boolean;
  audience: string;
  media: CampaignMedia;
  audienceLabel: string;
  mediaLabel: string;
}

export function inferCampaignAudience(name: string): CampaignAudience {
  const n = (name || "").toLowerCase();
  if (n.includes("ogretmen") || n.includes("öğretmen") || n.includes("_personel") || n.startsWith("personel")) {
    return "personel";
  }
  if (n.includes("ogrenci") || n.includes("öğrenci")) return "ogrenci";
  if (n.includes("veli")) return "veli";
  if (
    n.startsWith("duyuru_")
    || n.startsWith("hatirlatma_")
    || n.startsWith("bilgilendirme_")
    || n === "toplu_duyuru"
  ) {
    return "veli";
  }
  return "genel";
}

export function inferCampaignMedia(tpl: WhatsAppMetaTemplateItem): CampaignMedia {
  if (tpl.campaign_media === "metin" || tpl.campaign_media === "gorsel" || tpl.campaign_media === "pdf" || tpl.campaign_media === "video") {
    return tpl.campaign_media;
  }
  const htype = headerTypeOf(tpl);
  if (htype === "IMAGE") return "gorsel";
  if (htype === "VIDEO") return "video";
  if (htype === "DOCUMENT") return "pdf";
  return "metin";
}

export function classifyCampaignTemplate(tpl: WhatsAppMetaTemplateItem): ClassifiedCampaignTemplate {
  const audience = (tpl.campaign_audience || inferCampaignAudience(tpl.name)) as CampaignAudience;
  const media = inferCampaignMedia(tpl);
  const usage = String(tpl.usage_scope || "ALL").toUpperCase();
  return {
    tpl,
    eligible: tpl.campaign_eligible ?? usage === "CAMPAIGN",
    audience,
    media,
    audienceLabel: tpl.campaign_audience_label || CAMPAIGN_AUDIENCE_LABELS[audience] || audience,
    mediaLabel: tpl.campaign_media_label || CAMPAIGN_MEDIA_OPTIONS.find((item) => item.key === media)?.label || media,
  };
}

export function listCampaignTemplates(
  templates: WhatsAppMetaTemplateItem[],
): ClassifiedCampaignTemplate[] {
  return templates.map(classifyCampaignTemplate).filter((item) => item.eligible);
}

export function neededCampaignAudience(audiences: AudiencePersonType[]): CampaignAudience | "" {
  const unique = Array.from(new Set(audiences.filter(Boolean)));
  if (!unique.length) return "";
  if (unique.length > 1) return "genel";
  return unique[0] as CampaignAudience;
}

export function audienceMatches(templateAudience: string, needed: string): boolean {
  if (!needed) return true;
  const audience = templateAudience || "genel";
  if (audience === "genel") return true;
  return audience === needed;
}

export function filterCampaignTemplates(
  items: ClassifiedCampaignTemplate[],
  {
    audiences,
    media,
  }: {
    audiences: AudiencePersonType[];
    media: CampaignMedia | "";
  },
): ClassifiedCampaignTemplate[] {
  const needed = neededCampaignAudience(audiences);
  return items.filter((item) => {
    if (!audienceMatches(item.audience, needed)) return false;
    if (media && item.media !== media) return false;
    return true;
  });
}

export function templateVariableKeys(body: string): string[] {
  const found: string[] = [];
  for (const match of body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

export function canonicalVarName(key: string, map?: Record<string, string> | null): string {
  if (!map) return key;
  const direct = map[key];
  if (direct && !/^\d+$/.test(direct)) return direct;
  const reverse = Object.entries(map).find(([, value]) => value === key)?.[0];
  if (reverse && !/^\d+$/.test(reverse)) return reverse;
  if (direct) return direct;
  return key;
}

/** Meta {{1}} eşlemesi yoksa tek numaralı alanı kampanya mesajı say. */
export function canonicalCampaignVar(
  key: string,
  bodyKeys: string[],
  map?: Record<string, string> | null,
): string {
  const mapped = canonicalVarName(key, map);
  if (!/^\d+$/.test(mapped)) return mapped;
  const unmapped = bodyKeys.filter((item) => /^\d+$/.test(canonicalVarName(item, map)));
  return unmapped.length === 1 ? "mesaj" : mapped;
}

export interface CampaignVariableField {
  key: string;
  canonical: string;
  label: string;
  auto: boolean;
  long: boolean;
}

export function campaignVariableFields(
  body: string,
  map?: Record<string, string> | null,
): CampaignVariableField[] {
  const keys = templateVariableKeys(body);
  return keys.map((key) => {
    const canonical = canonicalCampaignVar(key, keys, map);
    const label =
      VARIABLE_LABELS[canonical]
      || VARIABLE_LABELS[key]
      || (/^\d+$/.test(canonical) ? `Alan ${canonical}` : canonical.replace(/_/g, " "));
    const auto = AUTO_RESOLVED_VARIABLES.has(canonical) || AUTO_RESOLVED_VARIABLES.has(key);
    const long = !auto && (canonical === "mesaj" || canonical === "aciklama" || /^\d+$/.test(key));
    return { key, canonical, label, auto, long };
  });
}

export function variableFieldLabel(key: string, map?: Record<string, string> | null): string {
  const canonical = canonicalVarName(key, map);
  if (VARIABLE_LABELS[canonical]) return VARIABLE_LABELS[canonical];
  if (VARIABLE_LABELS[key]) return VARIABLE_LABELS[key];
  if (/^\d+$/.test(key)) return `Alan ${key}`;
  return canonical.replace(/_/g, " ");
}

export function isAutoResolvedVariable(key: string, map?: Record<string, string> | null): boolean {
  const canonical = canonicalVarName(key, map);
  return AUTO_RESOLVED_VARIABLES.has(key) || AUTO_RESOLVED_VARIABLES.has(canonical);
}

export function fillTemplateVariables(
  body: string,
  values: Record<string, string>,
  map?: Record<string, string> | null,
): string {
  const keys = templateVariableKeys(body);
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const canonical = canonicalCampaignVar(key, keys, map);
    const value = (values[key] || values[canonical] || "").trim();
    return value || match;
  });
}
