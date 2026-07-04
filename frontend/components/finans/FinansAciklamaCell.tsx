"use client";

/** Açıklama sütunu — boşsa hiçbir metin göstermez, sütun genişliği korunur. */
export default function FinansAciklamaCell({
  text,
  onClick,
}: {
  text?: string | null;
  onClick?: () => void;
}) {
  const trimmed = (text || "").trim();
  const title = trimmed || undefined;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="cell-desc cell-link finans-aciklama-cell"
        title={title}
      >
        {trimmed}
      </button>
    );
  }

  return (
    <span className="cell-desc finans-aciklama-cell" title={title}>
      {trimmed}
    </span>
  );
}
