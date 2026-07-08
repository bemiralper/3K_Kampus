/** Finans rapor sayfası sekmeleri (?tab=). */

export const FINANS_REPORT_ITEMS = [
  { tab: "gun-sonu", label: "Gün Sonu" },
  { tab: "gecikmis", label: "Gecikmiş Ödemeler" },
  { tab: "vadesi-gelenler", label: "Vadesi Gelenler" },
  { tab: "donem", label: "Dönem Tahsilat" },
  { tab: "gelir-gider", label: "Gelir / Gider" },
  { tab: "mali-analiz", label: "Mali Analiz" },
] as const;

export type FinansReportTab = (typeof FINANS_REPORT_ITEMS)[number]["tab"];

const VALID_TABS = new Set<string>(FINANS_REPORT_ITEMS.map((i) => i.tab));

export function resolveFinansReportTab(raw: string | null): FinansReportTab {
  if (raw === "raporlar") return "mali-analiz";
  // Geriye dönük uyumluluk: Virman art\u0131k ayr\u0131 sayfa; eski ?tab=virman \u2192 G\u00fcn Sonu.
  if (raw === "virman") return "gun-sonu";
  if (raw && VALID_TABS.has(raw)) return raw as FinansReportTab;
  return "gun-sonu";
}
