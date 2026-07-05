"use client";

import { useCallback, useRef, type RefObject } from "react";

export interface PdfPrintOptions {
  /** PDF dosya adı (uzantısız) */
  fileName?: string;
  /** Sayfa yönü: portrait veya landscape */
  orientation?: "portrait" | "landscape";
  /** Çıktı davranışı: 'open' yeni sekmede açar, 'download' indirir */
  mode?: "open" | "download";
  /** Extra üst-alt margin mm cinsinden */
  marginMm?: number;
  /** Kalite (1-4 arası, büyük = net ama büyük dosya) */
  scale?: number;
  /** Dışarıdan ref verilebilir — aynı element'i birden çok hook'ta kullanmak için */
  externalRef?: RefObject<HTMLDivElement>;
  /**
   * PDF render öncesi geçici olarak scroll container'ları genişletmek için CSS selector.
   * Varsayılan: "[data-pdf-expand]" — istediğiniz elemente data-pdf-expand ekleyin.
   */
  scrollSelector?: string;
}

/**
 * HTML elementini pixel-perfect PDF'e çeviren hook.
 * html2canvas ile ekran görüntüsü alıp jsPDF ile sayfalara böler.
 * Önizleme ile çıktı birebir aynı olur.
 *
 * Kullanım:
 * ```tsx
 * const { contentRef, generatePdf } = usePdfPrint({ fileName: "makbuz" });
 * <div ref={contentRef}>...içerik...</div>
 * <button onClick={generatePdf}>PDF Oluştur</button>
 * ```
 */
export function usePdfPrint(options: PdfPrintOptions = {}) {
  const internalRef = useRef<HTMLDivElement>(null);
  const contentRef = options.externalRef || internalRef;

  const generatePdf = useCallback(async () => {
    const el = contentRef.current;
    if (!el) return;

    const {
      fileName = "belge",
      orientation = "portrait",
      mode = "open",
      marginMm = 10,
      scale = 2,
      scrollSelector = "[data-pdf-expand]",
    } = options;

    // Dinamik import — bundle size'ı küçük tutmak için
    const [html2canvasModule, jsPDFModule] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);
    const html2canvas = html2canvasModule.default;
    const { jsPDF } = jsPDFModule;

    // Scroll container'ları yazdırma için geçici olarak genişlet
    const scrollEls = el.querySelectorAll<HTMLElement>(scrollSelector);
    const origStyles: { maxHeight: string; overflowY: string; overflow: string; border: string }[] = [];
    scrollEls.forEach((scrollEl) => {
      origStyles.push({
        maxHeight: scrollEl.style.maxHeight,
        overflowY: scrollEl.style.overflowY,
        overflow: scrollEl.style.overflow,
        border: scrollEl.style.border,
      });
      scrollEl.style.maxHeight = "none";
      scrollEl.style.overflowY = "visible";
      scrollEl.style.overflow = "visible";
    });

    // PDF/print dışı aksiyonları geçici gizle (WhatsApp hatırlatma vb.)
    const hideEls = el.querySelectorAll<HTMLElement>(".pdf-export-hide");
    const hideOrigDisplay: string[] = [];
    hideEls.forEach((node) => {
      hideOrigDisplay.push(node.style.display);
      node.style.display = "none";
    });

    // html2canvas ile yüksek kalitede render
    const canvas = await html2canvas(el, {
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: el.scrollWidth,
      windowHeight: el.scrollHeight,
    });

    // Scroll'ları ve gizlenen aksiyonları geri al
    scrollEls.forEach((scrollEl, i) => {
      scrollEl.style.maxHeight = origStyles[i].maxHeight;
      scrollEl.style.overflowY = origStyles[i].overflowY;
      scrollEl.style.overflow = origStyles[i].overflow;
      scrollEl.style.border = origStyles[i].border;
    });
    hideEls.forEach((node, i) => {
      node.style.display = hideOrigDisplay[i] || "";
    });

    const imgData = canvas.toDataURL("image/png");
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;

    // A4 boyutu mm cinsinden
    const pageW = orientation === "portrait" ? 210 : 297;
    const pageH = orientation === "portrait" ? 297 : 210;

    const margin = marginMm;
    const contentW = pageW - margin * 2;
    const contentH = pageH - margin * 2;

    // Görüntünün kaç mm genişliğinde render edileceği
    const ratio = contentW / imgWidth;
    const scaledHeight = imgHeight * ratio;

    const pdf = new jsPDF({
      orientation,
      unit: "mm",
      format: "a4",
    });

    if (scaledHeight <= contentH) {
      // Tek sayfaya sığıyor
      pdf.addImage(imgData, "PNG", margin, margin, contentW, scaledHeight);
    } else {
      // Çok sayfalı — görüntüyü dilimle
      let yOffset = 0;
      let page = 0;

      while (yOffset < imgHeight) {
        if (page > 0) {
          pdf.addPage();
        }

        // Bu sayfaya düşen pixel yüksekliği
        const sliceH = Math.min(contentH / ratio, imgHeight - yOffset);

        // Geçici canvas ile dilimle
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = imgWidth;
        sliceCanvas.height = Math.ceil(sliceH);
        const ctx = sliceCanvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(
            canvas,
            0, yOffset,
            imgWidth, sliceH,
            0, 0,
            imgWidth, sliceH
          );
        }

        const sliceData = sliceCanvas.toDataURL("image/png");
        const sliceMmH = sliceH * ratio;

        pdf.addImage(sliceData, "PNG", margin, margin, contentW, sliceMmH);

        yOffset += sliceH;
        page++;
      }
    }

    if (mode === "download") {
      pdf.save(`${fileName}.pdf`);
    } else {
      // Yeni sekmede aç — kullanıcı oradan yazdırabilir/indirebilir
      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }, [options, contentRef]);

  return { contentRef, generatePdf };
}
