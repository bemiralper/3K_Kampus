import { downloadBlob } from "@/lib/download-file";

const DEFAULT_EXPORT_TIMEOUT_MS = 120_000;

export type ExportRunState = {
  busy: boolean;
  error: string | null;
};

/** Blob indirme — revoke gecikmeli, merkezi. */
export function triggerFileDownload(blob: Blob, filename: string): void {
  downloadBlob(blob, filename);
}

function exportTimeoutMessage(signal: AbortSignal): string {
  if (signal.reason instanceof Error && signal.reason.message) {
    return signal.reason.message;
  }
  return "Dışa aktarma zaman aşımına uğradı. Lütfen tekrar deneyin.";
}

/**
 * Export işlemini timeout + hata yakalama ile çalıştırır.
 * Her durumda busy=false ve toast temizliği için finally kullanın.
 */
export async function runFinansExport<T>(
  task: (signal: AbortSignal) => Promise<T>,
  opts?: {
    timeoutMs?: number;
    onError?: (message: string) => void;
  },
): Promise<T | null> {
  const controller = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_EXPORT_TIMEOUT_MS;
  const timer = window.setTimeout(() => {
    controller.abort(new Error(exportTimeoutMessage(controller.signal)));
  }, timeoutMs);

  try {
    return await task(controller.signal);
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? exportTimeoutMessage(controller.signal)
          : err.message
        : "Dışa aktarma başarısız.";
    opts?.onError?.(message);
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}
