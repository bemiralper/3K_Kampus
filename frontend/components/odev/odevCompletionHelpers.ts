import type { ContentTaskHistoryItem } from "@/app/admin/odev/ver/types";

export function isIncompleteHistory(
  hist?: ContentTaskHistoryItem | null,
): hist is ContentTaskHistoryItem {
  return Boolean(
    hist && (hist.completion_status === "PARTIAL" || hist.completion_status === "NOT_DONE"),
  );
}

/** Görev notu — eksik / yapılmadı tekrar ödevi için */
export function buildCompletionNote(hist: ContentTaskHistoryItem): string {
  const prev = hist.assignment_title?.trim();
  if (hist.completion_status === "PARTIAL") {
    const pct = hist.task_completion_percent ?? 0;
    return prev
      ? `Eksik tamamlama — önceki: “${prev}” (%${pct})`
      : `Eksik tamamlama — önceki: %${pct}`;
  }
  return prev
    ? `Yapılmayan içerik — tekrar — önceki: “${prev}”`
    : "Yapılmayan içerik — tekrar";
}

export function withCompletionTitleSuffix(title: string, hasCompletion: boolean): string {
  if (!hasCompletion) return title;
  const t = (title || "").trim();
  if (/eksik\s*tamamlama/i.test(t)) return t;
  return t ? `${t} (Eksik Tamamlama)` : "Eksik Tamamlama";
}

export function completionBadgeLabel(hist: ContentTaskHistoryItem): string {
  if (hist.completion_status === "PARTIAL") {
    return `⚠️ EKSİK %${hist.task_completion_percent ?? 0}`;
  }
  return "❌ YAPILMADI";
}

/** Otomatik üretilen eksik/tekrar notu — PDF’de ayrı satırda tekrarlanmasın */
export function isAutoCompletionNote(note?: string | null): boolean {
  if (!note?.trim()) return false;
  return /eksik\s*tamamlama|yapılmayan\s+içerik\s*[—\-–]\s*tekrar/i.test(note);
}
