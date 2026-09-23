import type { WhatsAppMetaTemplateItem } from "@/lib/communication-api";

/** header_json.type; yoksa components_json HEADER.format (Meta sync sonrası boş header için). */
export function headerTypeOf(tpl: WhatsAppMetaTemplateItem | null | undefined): string {
  const fromJson = ((tpl?.header_json as { type?: string } | undefined)?.type || "")
    .trim()
    .toUpperCase();
  if (fromJson) return fromJson;
  const comps = tpl?.components_json;
  if (Array.isArray(comps)) {
    for (const raw of comps) {
      const comp = raw as { type?: string; format?: string };
      if ((comp?.type || "").toUpperCase() === "HEADER") {
        const fmt = (comp.format || "TEXT").toUpperCase();
        return fmt || "NONE";
      }
    }
  }
  return "NONE";
}
