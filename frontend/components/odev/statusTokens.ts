export type StatusColor = { bg: string; text: string; icon: string };

export const NON_SUBMISSION_LABELS: Record<string, string> = {
  NOT_BROUGHT: "Ödev getirilmedi",
  NOT_DONE: "Ödev yapılmadı",
  CONTROL_NOT_POSSIBLE: "Kontrol yapılamadı",
  OTHER: "Diğer",
};

export function getStatusColor(status: string): StatusColor {
  switch (status) {
    case "DRAFT":
      return { bg: "#f1f5f9", text: "#64748b", icon: "📝" };
    case "ASSIGNED":
      return { bg: "#dbeafe", text: "#2563eb", icon: "📤" };
    case "IN_PROGRESS":
      return { bg: "#fef3c7", text: "#d97706", icon: "⏳" };
    case "COMPLETED":
      return { bg: "#dcfce7", text: "#16a34a", icon: "✅" };
    case "OVERDUE":
      return { bg: "#fee2e2", text: "#dc2626", icon: "⚠️" };
    case "CANCELLED":
      return { bg: "#f1f5f9", text: "#94a3b8", icon: "🚫" };
    default:
      return { bg: "#f1f5f9", text: "#64748b", icon: "📋" };
  }
}

export function getRiskColor(risk: string): StatusColor {
  switch (risk) {
    case "ON_TRACK":
      return { bg: "#dcfce7", text: "#16a34a", icon: "✅" };
    case "AT_RISK":
      return { bg: "#fee2e2", text: "#dc2626", icon: "🔴" };
    case "BEHIND":
      return { bg: "#fef3c7", text: "#d97706", icon: "🟡" };
    case "PENDING_START":
      return { bg: "#dbeafe", text: "#2563eb", icon: "⏰" };
    default:
      return { bg: "#f1f5f9", text: "#64748b", icon: "⚪" };
  }
}

/** Gecikme teslim tarihinden bir gün sonra başlar (aynı gün gecikme sayılmaz). */
export function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === "COMPLETED" || status === "CANCELLED") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

export function isDueToday(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === "COMPLETED" || status === "CANCELLED" || status === "DRAFT") {
    return false;
  }
  const today = new Date();
  const due = new Date(dueDate);
  return (
    due.getFullYear() === today.getFullYear() &&
    due.getMonth() === today.getMonth() &&
    due.getDate() === today.getDate()
  );
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "green";
    case "OVERDUE":
      return "red";
    case "IN_PROGRESS":
    case "ASSIGNED":
      return "blue";
    case "DRAFT":
      return "gray";
    default:
      return "gray";
  }
}
