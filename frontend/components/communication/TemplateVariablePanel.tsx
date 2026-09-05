"use client";

import {
  TEMPLATE_VARIABLES,
  TEMPLATE_VARIABLE_GROUP_LABELS,
} from "./composer-utils";

interface TemplateVariablePanelProps {
  onInsert: (token: string) => void;
  /** Kategori slug — haftalik_odev için ödev grubu öne alınır */
  category?: string;
  /** Verilirse yalnızca bu değişkenler listelenir */
  allowedKeys?: string[];
}

export default function TemplateVariablePanel({
  onInsert,
  category,
  allowedKeys,
}: TemplateVariablePanelProps) {
  const groups: string[] = Array.from(
    new Set(TEMPLATE_VARIABLES.map((v) => v.group || "genel")),
  );
  const defaultOrder = [
    "genel",
    "ozel_ders",
    "yoklama",
    "odev",
    "finans",
    "odeme",
    "sinav",
    "kayit",
    "gorusme",
  ];
  const pinned =
    category === "haftalik_odev" || category === "odev"
      ? ["odev"]
      : category === "odeme_gecikme" || category === "odeme" || category === "finans"
        ? ["finans", "odeme"]
        : category === "ozel_ders"
          ? ["ozel_ders"]
          : category === "sinav"
            ? ["sinav"]
            : category === "kayit"
              ? ["kayit"]
              : category === "gorusme"
                ? ["gorusme"]
                : category === "yoklama" || (category || "").startsWith("yoklama")
                  ? ["yoklama"]
                  : [];
  const orderedGroups = [
    ...pinned,
    ...defaultOrder.filter((g) => !pinned.includes(g)),
    ...groups.filter((g) => !pinned.includes(g) && !defaultOrder.includes(g)),
  ].filter((g) => groups.includes(g));

  return (
    <div className="comm-sablon-var-panel">
      <div className="comm-sablon-var-panel-title">Değişken ekle</div>
      {orderedGroups.map((group) => {
        const items = TEMPLATE_VARIABLES.filter((v) => {
          if ((v.group || "genel") !== group) return false;
          if (allowedKeys?.length) return allowedKeys.includes(v.key);
          return true;
        });
        if (!items.length) return null;
        return (
          <div key={group} className="comm-sablon-var-group">
            <div className="comm-sablon-var-group-label">
              {TEMPLATE_VARIABLE_GROUP_LABELS[group] || group}
            </div>
            <div className="comm-sablon-var-grid">
              {items.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  className="comm-sablon-var-chip"
                  onClick={() => onInsert(v.token)}
                  title={`${v.label} — ${v.token}`}
                >
                  <span className="comm-sablon-var-chip-label">{v.label}</span>
                  <code className="comm-sablon-var-chip-token">{v.token}</code>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
