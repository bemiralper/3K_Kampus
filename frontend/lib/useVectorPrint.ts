"use client";

import { useCallback, useRef, type RefObject } from "react";
import { buildVectorPrintHtml } from "./vectorPrintHtml";

export interface VectorPrintOptions {
  /** Belge başlığı (yazdırma penceresi) */
  title?: string;
  /** Sayfa yönü */
  orientation?: "portrait" | "landscape";
  /** @page margin — örn. "10mm 12mm" */
  marginMm?: string;
  /** Yazdırmadan önce scroll alanlarını genişlet */
  scrollSelector?: string;
  /** Ek CSS kuralları */
  extraCss?: string;
  /** Dışarıdan ref */
  externalRef?: RefObject<HTMLDivElement>;
}

/**
 * HTML içeriğini vektörel yazdırır (iframe + window.print).
 * Tarayıcı PDF olarak kaydedebilir — metin seçilebilir, bulanıklık yok.
 */
export async function printVectorHtml(
  el: HTMLElement,
  options: VectorPrintOptions = {},
): Promise<void> {
  const {
    title = "Belge",
    orientation = "portrait",
    marginMm = "10mm 12mm",
    scrollSelector = "[data-pdf-expand]",
    extraCss = "",
  } = options;

  const fullHtml = buildVectorPrintHtml(el, {
    title,
    orientation,
    marginMm,
    scrollSelector,
    extraCss,
  });

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-9999px";
  iframe.style.top = "-9999px";
  iframe.style.width = orientation === "landscape" ? "297mm" : "210mm";
  iframe.style.height = orientation === "landscape" ? "210mm" : "297mm";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(fullHtml);
  doc.close();

  const images = doc.querySelectorAll("img");
  await Promise.all(
    Array.from(images).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );

  await new Promise<void>((resolve) => {
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
        resolve();
      }, 1000);
    }, 300);
  });
}

/**
 * Vektörel yazdırma hook'u — sözleşme belgeleriyle aynı yaklaşım.
 */
export function useVectorPrint(options: VectorPrintOptions = {}) {
  const internalRef = useRef<HTMLDivElement>(null);
  const contentRef = options.externalRef || internalRef;

  const print = useCallback(async () => {
    const el = contentRef.current;
    if (!el) return;
    await printVectorHtml(el, {
      title: options.title,
      orientation: options.orientation,
      marginMm: options.marginMm,
      scrollSelector: options.scrollSelector,
      extraCss: options.extraCss,
    });
  }, [
    contentRef,
    options.title,
    options.orientation,
    options.marginMm,
    options.scrollSelector,
    options.extraCss,
  ]);

  return { contentRef, print };
}
