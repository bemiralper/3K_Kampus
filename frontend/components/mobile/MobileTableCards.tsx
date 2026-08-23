"use client";

import { useEffect, useRef } from "react";
import "./mobile-table-cards.css";

/**
 * Telefon ve tablet dikeyde (<900px) veri tabloları kart listesine döner.
 * Kart görünümünde sütun başlığı `td::before` ile yazıldığı için her
 * hücrenin `data-label` değerine ihtiyaç var.
 *
 * Tablolar projede üç ayrı biçimde yazılmış (.table-modern, düz Tailwind
 * tabloları, Ant Design). Her dosyaya `data-label` eklemek yerine başlık
 * satırını hücrelere burada taşıyoruz: kabuğa bir kez bağlanır, sonradan
 * gelen satırlar için MutationObserver ile tekrar çalışır. Etiket
 * bulunamazsa hücreler yine dikey akar — düzen bozulmaz.
 *
 * Gözlem `document.body` üzerinde, çünkü AntD Drawer/Modal içerikleri
 * portal ile kabuğun dışına basılıyor.
 *
 * Kapsam: `.mobile-cards` sınıflı kapsayıcılar ve portal katmanları.
 * Kullanım: kapsayıcıya `mobile-cards` sınıfı ver, bir kez bu bileşeni mount et.
 */

const ACTION_LABELS = new Set([
  "işlem",
  "işlemler",
  "aksiyon",
  "aksiyonlar",
  "eylem",
  "eylemler",
]);

const SCOPES = ".mobile-cards, .ant-drawer-body, .ant-modal-body";

function labelOf(cell: Element): string {
  return (cell.textContent || "").replace(/\s+/g, " ").trim();
}

/** AntD'de başlık ve gövde ayrı <table>'larda olabilir (sticky header). */
function headRowFor(table: HTMLTableElement): HTMLTableRowElement | null {
  const own = table.querySelector<HTMLTableRowElement>("thead tr:last-of-type");
  if (own && own.children.length) return own;

  return (
    table
      .closest(".ant-table")
      ?.querySelector<HTMLTableRowElement>(
        ".ant-table-header thead tr:last-of-type",
      ) || null
  );
}

function bodyRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(
    table.querySelectorAll<HTMLTableRowElement>("tbody > tr"),
  ).filter(
    (row) =>
      !row.classList.contains("ant-table-measure-row") &&
      !row.classList.contains("ant-table-placeholder") &&
      !row.classList.contains("ant-table-expanded-row"),
  );
}

function decorate(root: ParentNode) {
  root.querySelectorAll<HTMLTableElement>("table").forEach((table) => {
    if (!table.closest(SCOPES)) return;

    const headRow = headRowFor(table);
    if (!headRow) return;

    const labels = Array.from(headRow.children)
      .filter((c) => c.tagName === "TH" || c.tagName === "TD")
      .map(labelOf);
    if (!labels.length) return;

    // Kartın başlığı ilk sütun değil, başlığı olan ilk veri sütunudur:
    // seçim onay kutusu / genişletme oku gibi sütunların başlığı boştur.
    const primaryIndex = labels.findIndex(
      (label) => !!label && !ACTION_LABELS.has(label.toLocaleLowerCase("tr")),
    );

    let decorated = false;

    bodyRows(table).forEach((row) => {
      const cells = Array.from(row.children).filter(
        (c) => c.tagName === "TD",
      ) as HTMLElement[];
      // "Kayıt bulunamadı" gibi colspan'lı satırları atla
      if (cells.length !== labels.length) return;
      decorated = true;

      cells.forEach((cell, i) => {
        const label = labels[i];
        if (cell.dataset.label !== label) cell.dataset.label = label;

        const hasButtons = !!cell.querySelector("button, a, [role='button']");
        const hasControl = hasButtons || !!cell.querySelector("input, select");
        // "İşlem" bazı tablolarda işlem *türü* sütunudur; buton/link
        // içermiyorsa normal veri satırı olarak kalmalı. Başlıksız ama
        // butonlu sütun da (çoğu tabloda son sütun) işlem sütunudur.
        const isActions =
          hasButtons &&
          (!label || ACTION_LABELS.has(label.toLocaleLowerCase("tr")));
        const isEmpty = !labelOf(cell) && !hasControl;

        const role =
          i === primaryIndex
            ? "primary"
            : isActions
              ? "actions"
              : isEmpty
                ? "void"
                : !label
                  ? "bare"
                  : "";
        if (role) {
          if (cell.dataset.role !== role) cell.dataset.role = role;
        } else if (cell.dataset.role) {
          delete cell.dataset.role;
        }
      });
    });

    if (!decorated) return;

    table.setAttribute("data-cards", "1");
    table.parentElement?.classList.add("mobile-cards-host");
    // Yatay kaydırma sarmalayıcısı tablonun doğrudan ebeveyni olmayabilir;
    // kart modunda kaydırmayı kapatmak için onu da işaretle.
    for (let el = table.parentElement, i = 0; el && i < 4; el = el.parentElement, i++) {
      const overflowX = getComputedStyle(el).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") {
        el.classList.add("mobile-cards-host");
        break;
      }
    }
    // AntD sarmalayıcıları kart modunda yatay kaydırmayı kapatmalı
    table.closest(".ant-table-wrapper")?.classList.add("mobile-antd-cards");
  });
}

export default function MobileTableCards() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // requestAnimationFrame kullanılamaz: sekme arka plandayken hiç
    // tetiklenmez ve tablolar etiketsiz kalır.
    const schedule = () => {
      if (timer.current !== null) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        decorate(document.body);
      }, 60);
    };

    schedule();

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, []);

  return null;
}
