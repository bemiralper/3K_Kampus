/** Finans rapor sayfası sekmeleri (?tab=). */

export const FINANS_REPORT_ITEMS = [
  { tab: "virman", label: "Virman" },
  { tab: "gun-sonu", label: "Gün Sonu" },
  { tab: "gecikmis", label: "Gecikmiş Ödemeler" },
  { tab: "vadesi-gelenler", label: "Vadesi Gelenler" },
  { tab: "donem", label: "Dönem Tahsilat" },
  { tab: "mali-analiz", label: "Mali Analiz" },
] as const;

export type FinansReportTab = (typeof FINANS_REPORT_ITEMS)[number]["tab"];

const VALID_TABS = new Set<string>(FINANS_REPORT_ITEMS.map((i) => i.tab));

export function resolveFinansReportTab(raw: string | null): FinansReportTab {
  if (raw === "raporlar") return "mali-analiz";
  if (raw && VALID_TABS.has(raw)) return raw as FinansReportTab;
  return "virman";
}
