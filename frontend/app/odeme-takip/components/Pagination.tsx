"use client";

const KURUM_COLOR = "#0262a7";

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

export default function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [15, 25, 50, 100],
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Sayfa numaralarını hesapla — maks 7 buton göster
  const getPageNumbers = (): (number | "...")[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | "...")[] = [1];

    if (currentPage > 3) pages.push("...");

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 2) pages.push("...");

    pages.push(totalPages);

    return pages;
  };

  if (totalItems === 0) return null;

  const btnBase: React.CSSProperties = {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid #d1d5db",
    background: "#fff",
    fontSize: 13,
    cursor: "pointer",
    color: "#374151",
    minWidth: 34,
    textAlign: "center",
    transition: "all .15s",
    lineHeight: "1.2",
  };

  const btnActive: React.CSSProperties = {
    ...btnBase,
    background: KURUM_COLOR,
    color: "#fff",
    borderColor: KURUM_COLOR,
    fontWeight: 600,
  };

  const btnDisabled: React.CSSProperties = {
    ...btnBase,
    opacity: 0.4,
    cursor: "not-allowed",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 0",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      {/* Sol — Bilgi + Sayfa boyutu */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>
          {totalItems} kayıttan {startItem}-{endItem} arası gösteriliyor
        </span>
        <select
          value={pageSize}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value));
            onPageChange(1); // sayfa boyutu değişince 1. sayfaya dön
          }}
          style={{
            padding: "5px 8px",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            fontSize: 13,
            color: "#374151",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size} / sayfa
            </option>
          ))}
        </select>
      </div>

      {/* Sağ — Sayfa butonları */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {/* Önceki */}
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            style={currentPage <= 1 ? btnDisabled : btnBase}
            title="Önceki sayfa"
          >
            ‹
          </button>

          {/* Sayfa numaraları */}
          {getPageNumbers().map((page, idx) =>
            page === "..." ? (
              <span key={`dot-${idx}`} style={{ padding: "0 4px", color: "#9ca3af", fontSize: 13 }}>
                ⋯
              </span>
            ) : (
              <button
                key={page}
                onClick={() => onPageChange(page as number)}
                style={page === currentPage ? btnActive : btnBase}
              >
                {page}
              </button>
            )
          )}

          {/* Sonraki */}
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            style={currentPage >= totalPages ? btnDisabled : btnBase}
            title="Sonraki sayfa"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}

/** Helper: Listeyi sayfalama — slice döner */
export function paginateList<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
