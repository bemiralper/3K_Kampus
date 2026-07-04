/**
 * Django media / backend dosya yollarını istemcide erişilebilir URL'ye çevirir.
 * Telefon/tablet localhost:8000'e erişemez — hostname üzerinden backend kullanılır.
 */
export function resolveMediaUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  const normalized = path.startsWith("/") ? path : `/${path}`;

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (envUrl) {
      try {
        const parsed = new URL(envUrl);
        if (parsed.hostname === "localhost" && hostname !== "localhost") {
          return `http://${hostname}:8000${normalized}`;
        }
        return `${envUrl.replace(/\/$/, "")}${normalized}`;
      } catch {
        /* fall through */
      }
    }
    if (hostname !== "localhost") {
      return `http://${hostname}:8000${normalized}`;
    }
    return `http://localhost:8000${normalized}`;
  }

  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
  return `${backend.replace(/\/$/, "")}${normalized}`;
}
