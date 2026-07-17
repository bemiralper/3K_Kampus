/**
 * Django media / backend dosya yollarını istemcide erişilebilir URL'ye çevirir.
 *
 * Docker'da NEXT_PUBLIC_BACKEND_URL=http://backend:8000 olabilir — bu hostname
 * tarayıcıda çözülmez. /media/ yolları same-origin bırakılır (next.config rewrite).
 */
export function resolveMediaUrl(path?: string | null): string | null {
  if (!path) return null;

  if (path.startsWith("http://") || path.startsWith("https://")) {
    const mediaIdx = path.indexOf("/media/");
    if (mediaIdx >= 0) {
      // Docker internal host veya mutlak backend URL → same-origin /media/
      if (typeof window !== "undefined") {
        return path.slice(mediaIdx);
      }
    }
    try {
      const parsed = new URL(path);
      if (parsed.hostname === "backend" || parsed.hostname === "localhost") {
        if (typeof window !== "undefined") {
          if (mediaIdx >= 0) return path.slice(mediaIdx);
          return parsed.pathname + parsed.search;
        }
      }
    } catch {
      /* fall through */
    }
    return path;
  }

  const normalized = path.startsWith("/") ? path : `/${path}`;

  // /media/ → Next rewrite ile same-origin (Docker + prod)
  if (typeof window !== "undefined" && normalized.startsWith("/media/")) {
    return normalized;
  }

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (envUrl) {
      try {
        const parsed = new URL(envUrl);
        // Container hostname tarayıcıda işe yaramaz
        if (parsed.hostname === "backend") {
          return `http://${hostname}:8000${normalized}`;
        }
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
  if (backend.includes("://backend")) {
    return normalized;
  }
  return `${backend.replace(/\/$/, "")}${normalized}`;
}
