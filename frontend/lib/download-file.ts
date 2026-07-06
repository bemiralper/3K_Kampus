/**
 * Tarayıcı / mobil uyumlu dosya indirme.
 * jsPDF doc.save() mobilde yeni sekmede açılabilir; blob + anchor kullanılır.
 */

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();

  window.setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 500);
}

/** PDF blob indir — mobil WebView / iOS için share fallback */
export async function downloadPdfBlob(blob: Blob, filename: string): Promise<void> {
  const safeName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

  if (typeof navigator !== 'undefined' && 'share' in navigator && isMobileDevice()) {
    try {
      const file = new File([blob], safeName, { type: 'application/pdf' });
      const canShareFiles =
        typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
      if (canShareFiles) {
        await navigator.share({ files: [file], title: safeName });
        return;
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
    }
  }

  if (isIosSafari()) {
    // iOS Safari download attribute desteklemez; yeni sekme yerine blob URL ile aç
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, '_blank');
    if (!opened) {
      downloadBlob(blob, safeName);
    } else {
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
    return;
  }

  downloadBlob(blob, safeName);
}

/** jsPDF belgesini indir */
export async function downloadJsPdf(doc: { output(type: 'blob'): Blob }, filename: string): Promise<void> {
  const blob = doc.output('blob');
  await downloadPdfBlob(blob, filename);
}
