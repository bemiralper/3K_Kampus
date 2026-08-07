/** Kitap / yayınevi değişince Analizler sekmesini anlık yenilemek için. */
export const RESOURCES_CHANGED_EVENT = "3k:resources-changed";

const CHANNEL_NAME = "3k-resources-changed";

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}

export function notifyResourcesChanged(detail?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const payload = detail || {};
  window.dispatchEvent(new CustomEvent(RESOURCES_CHANGED_EVENT, { detail: payload }));
  const ch = getChannel();
  if (ch) {
    try {
      ch.postMessage(payload);
    } catch {
      /* ignore */
    } finally {
      ch.close();
    }
  }
}

/** Aynı veya diğer sekmeden gelen değişiklikleri dinle. */
export function subscribeResourcesChanged(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onLocal = () => handler();
  window.addEventListener(RESOURCES_CHANGED_EVENT, onLocal);
  let ch: BroadcastChannel | null = null;
  try {
    ch = new BroadcastChannel(CHANNEL_NAME);
    ch.onmessage = () => handler();
  } catch {
    ch = null;
  }
  return () => {
    window.removeEventListener(RESOURCES_CHANGED_EVENT, onLocal);
    ch?.close();
  };
}
