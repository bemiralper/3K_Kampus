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
  const prev = stripCompletionTitleSuffix(hist.assignment_title || "").trim();
  if (hist.completion_status === "PARTIAL") {
    const pct = hist.task_completion_percent ?? 0;
    return prev
      ? `Önceki ödevden kalan — “${prev}” (%${pct})`
      : `Önceki ödevden kalan — %${pct}`;
  }
  return prev
    ? `Yapılmayan içerik — tekrar — önceki: “${prev}”`
    : "Yapılmayan içerik — tekrar";
}

/** Eski kayıtlardaki “(Eksik Tamamlama)” başlık ekini temizler. */
export function stripCompletionTitleSuffix(title: string | null | undefined): string {
  return (title || "")
    .replace(/\s*\(\s*Eksik\s+Tamamlama\s*\)\s*$/i, "")
    .trim();
}

/** Başlığa artık ek eklenmez; eski çağrıları kırmaz. */
export function withCompletionTitleSuffix(title: string, _hasCompletion?: boolean): string {
  return stripCompletionTitleSuffix(title);
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
  return /eksik\s*tamamlama|önceki\s+ödevden\s+kalan|yapılmayan\s+içerik\s*[—\-–]\s*tekrar/i.test(note);
}
