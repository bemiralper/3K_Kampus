export interface VectorPrintHtmlOptions {
  title?: string;
  orientation?: "portrait" | "landscape";
  marginMm?: string;
  scrollSelector?: string;
  extraCss?: string;
  baseHref?: string;
  /** false ise rapor tipografisini küçültme (ekran ile birebir) */
  compactTypography?: boolean;
  /** true ise scroll genişletme atlanır (ön hazırlanmış clone için) */
  skipExpand?: boolean;
}

const REPORT_PRINT_HELPERS = `
  .page-break-avoid { page-break-inside: avoid; break-inside: avoid; }
  .ok-report-header { position: relative; overflow: hidden; }
  .ok-report-card { page-break-inside: avoid; }
  svg { max-width: 100%; height: auto; }
`;

let cachedOdevPrintCss: string | null = null;

async function fetchOdevPrintCss(): Promise<string> {
  if (cachedOdevPrintCss) return cachedOdevPrintCss;
  if (typeof window === "undefined") return "";
  try {
    const res = await fetch(`${window.location.origin}/css/odev-kontrol-print.css`, {
      credentials: "same-origin",
    });
    if (res.ok) {
      cachedOdevPrintCss = await res.text();
      return cachedOdevPrintCss;
    }
  } catch {
    /* fallback */
  }
  cachedOdevPrintCss = collectReportStyles();
  return cachedOdevPrintCss;
}

/** Yalnızca ödev/rapor ile ilgili stylesheet kuralları — layout.css dahil edilmez. */
export function collectReportStyles(): string {
  if (typeof document === "undefined") return "";
  const EXCLUDE_FRAGMENTS = [
    "layout.css",
    "sidebar",
    "architectui",
    "globals",
    "communication.css",
    "muhasebe",
    "coach.css",
  ];
  let css = "";
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const href = (sheet.href || "").toLowerCase();
      if (href && EXCLUDE_FRAGMENTS.some((frag) => href.includes(frag))) continue;

      let includeSheet = !href;
      const rules: string[] = [];
      for (const rule of Array.from(sheet.cssRules || [])) {
        const text = rule.cssText;
        rules.push(text);
        if (
          text.includes(".ok-")
          || text.includes("ok-report")
          || text.includes("@page")
          || text.includes("@font-face")
        ) {
          includeSheet = true;
        }
      }
      if (includeSheet) css += `${rules.join("\n")}\n`;
    } catch {
      /* cross-origin */
    }
  }
  return css;
}

export function collectAccessibleStyles(): string {
  return collectReportStyles();
}

export function expandScrollAreas(el: HTMLElement, selector: string) {
  const scrollEls = el.querySelectorAll<HTMLElement>(selector);
  const origStyles: Array<{
    maxHeight: string;
    overflowY: string;
    overflow: string;
    height: string;
  }> = [];

  scrollEls.forEach((scrollEl) => {
    origStyles.push({
      maxHeight: scrollEl.style.maxHeight,
      overflowY: scrollEl.style.overflowY,
      overflow: scrollEl.style.overflow,
      height: scrollEl.style.height,
    });
    scrollEl.style.maxHeight = "none";
    scrollEl.style.overflowY = "visible";
    scrollEl.style.overflow = "visible";
    scrollEl.style.height = "auto";
  });

  return () => {
    scrollEls.forEach((scrollEl, i) => {
      const orig = origStyles[i];
      scrollEl.style.maxHeight = orig.maxHeight;
      scrollEl.style.overflowY = orig.overflowY;
      scrollEl.style.overflow = orig.overflow;
      scrollEl.style.height = orig.height;
    });
  };
}

async function embedImagesInElement(root: HTMLElement): Promise<void> {
  const imgs = root.querySelectorAll<HTMLImageElement>("img[src]");
  await Promise.all(
    Array.from(imgs).map(async (img) => {
      const src = img.getAttribute("src");
      if (!src || src.startsWith("data:")) return;
      try {
        const absolute = src.startsWith("http")
          ? src
          : `${window.location.origin}${src.startsWith("/") ? src : `/${src}`}`;
        const res = await fetch(absolute, { credentials: "include" });
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        img.setAttribute("src", dataUrl);
      } catch {
        /* görsel yüklenemezse orijinal src kalır */
      }
    }),
  );
}

/** Elemanın kendi inline stilini (padding, maxWidth vb.) korur. */
function wrapWithElementStyle(el: HTMLElement, innerHtml: string): string {
  const inlineStyle = el.getAttribute("style") || "";
  // PDF tam genişlik kullansın; ekrandaki ortalama/maxWidth kısıtını gevşet
  const pdfStyle = `${inlineStyle}; max-width: 100% !important; width: 100% !important; margin: 0 auto !important;`;
  return `<div style="${pdfStyle.replace(/"/g, "&quot;")}">${innerHtml}</div>`;
}

/** Yazdırma / PDF için tam HTML belgesi (vektörel çıktı ile uyumlu). */
export function buildVectorPrintHtml(
  el: HTMLElement,
  options: VectorPrintHtmlOptions = {},
  inheritedStyles = "",
): string {
  const {
    title = "Belge",
    orientation = "portrait",
    marginMm = "10mm 12mm",
    scrollSelector = "[data-pdf-expand]",
    extraCss = "",
    baseHref = typeof window !== "undefined" ? `${window.location.origin}/` : "/",
    compactTypography = true,
    skipExpand = false,
  } = options;

  let innerHtml: string;
  if (skipExpand) {
    innerHtml = el.innerHTML;
  } else {
    const restoreScroll = expandScrollAreas(el, scrollSelector);
    innerHtml = el.innerHTML;
    restoreScroll();
  }

  if (!innerHtml.trim()) {
    throw new Error("Rapor içeriği boş — sayfayı yenileyip tekrar deneyin.");
  }

  const htmlContent = wrapWithElementStyle(el, innerHtml);

  const pageSize = orientation === "landscape" ? "A4 landscape" : "A4 portrait";
  const bodyTypography = compactTypography
    ? `font-size: 10px;
    line-height: 1.5;
    color: #334155;`
    : `font-size: 14px;
    line-height: 1.4;
    color: #172b4c;`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<base href="${baseHref.replace(/"/g, "&quot;")}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet" />
<title>${title.replace(/</g, "&lt;")}</title>
<style>
  @page {
    size: ${pageSize};
    margin: ${marginMm};
  }
  * { box-sizing: border-box; }
  html, body {
    width: 100%;
    min-height: 100%;
    margin: 0;
    padding: 0;
    background: #fff !important;
    visibility: visible !important;
    opacity: 1 !important;
    display: block !important;
  }
  body {
    font-family: 'Poppins', 'Segoe UI', system-ui, -apple-system, sans-serif;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
    ${bodyTypography}
  }
  body * {
    visibility: visible !important;
  }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; }
  @media print {
    body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
  ${REPORT_PRINT_HELPERS}
  ${inheritedStyles}
  ${extraCss}
</style>
</head>
<body>${htmlContent}</body>
</html>`;
}

/** Sunucu tarafı PDF için görselleri gömer, ekrandaki raporla birebir HTML üretir. */
export async function buildVectorPrintHtmlAsync(
  el: HTMLElement,
  options: VectorPrintHtmlOptions = {},
): Promise<string> {
  if (!el.innerHTML.trim()) {
    throw new Error("Rapor alanı boş — içerik yüklenene kadar bekleyin.");
  }

  const scrollSelector = options.scrollSelector ?? "[data-pdf-expand]";

  // Scroll alanlarını canlı DOM'da genişlet, klonla, sonra geri al.
  const restoreScroll = expandScrollAreas(el, scrollSelector);
  // Düz klon: inline stiller + SVG bozulmadan korunur (computed-style enjekte etmiyoruz).
  const clone = el.cloneNode(true) as HTMLElement;
  restoreScroll();

  clone.querySelectorAll("[data-pdf-hide]").forEach((node) => node.remove());

  await embedImagesInElement(clone);
  const odevCss = await fetchOdevPrintCss();

  // Klonun kendi inline stilini koruyarak, gerçek odev-kontrol CSS'i ile derle.
  return buildVectorPrintHtml(clone, {
    ...options,
    skipExpand: true,
  }, odevCss);
}

export async function validatePdfBlob(blob: Blob): Promise<void> {
  if (blob.size < 2500) {
    throw new Error(`PDF oluşturulamadı (dosya çok küçük: ${blob.size} byte — muhtemelen boş sayfa).`);
  }
  const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  const signature = String.fromCharCode(...header);
  if (!signature.startsWith("%PDF")) {
    throw new Error("PDF oluşturulamadı — sunucu geçersiz yanıt döndü.");
  }
}
