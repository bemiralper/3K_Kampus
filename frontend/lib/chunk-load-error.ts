const RELOAD_KEY = "lms_chunk_reload";

export function isChunkLoadError(message = "", stack = ""): boolean {
  const combined = `${message} ${stack}`;
  return (
    combined.includes("ChunkLoadError") ||
    combined.includes("Loading chunk") ||
    combined.includes("Cannot find module") ||
    combined.includes("Failed to fetch dynamically imported module") ||
    combined.includes("originalFactory.call") ||
    combined.includes("parallelRoutes") ||
    combined.includes("newCache") ||
    (combined.includes("null is not an object") && combined.includes("evaluating"))
  );
}

/** Deploy sonrası stale chunk — oturumda bir kez tam yenileme (cache-bust) */
export function reloadAfterChunkError(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return false;
    sessionStorage.setItem(RELOAD_KEY, "1");
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_r", Date.now().toString());
  window.location.replace(url.toString());
  return true;
}

export function clearChunkReloadFlag(delayMs = 5000): void {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    try {
      sessionStorage.removeItem(RELOAD_KEY);
    } catch {
      /* ignore */
    }
  }, delayMs);
}
