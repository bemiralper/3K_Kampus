import type { User } from "@/lib/contexts/AuthContext";

/** Oturum açmış kullanıcının görünen adı (form/rapor etiketleri için). */
export function formatUserDisplayName(user: User | null | undefined): string {
  if (!user) return "—";
  const full = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  return full || user.username || "—";
}
