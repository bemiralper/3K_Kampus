"use client";

import {
  TEMPLATE_VARIABLES,
  TEMPLATE_VARIABLE_GROUP_LABELS,
} from "./composer-utils";

interface TemplateVariablePanelProps {
  onInsert: (token: string) => void;
  /** Kategori slug — haftalik_odev için ödev grubu öne alınır */
  category?: string;
}

export default function TemplateVariablePanel({
  onInsert,
  category,
}: TemplateVariablePanelProps) {
  const groups: string[] = Array.from(
    new Set(TEMPLATE_VARIABLES.map((v) => v.group || "genel")),
  );
  const orderedGroups = category === "haftalik_odev"
    ? ["odev", "genel", "yoklama", "odeme"].filter((g) => groups.includes(g))
    : ["genel", "odev", "yoklama", "odeme"].filter((g) => groups.includes(g));

  return (
    <div className="comm-sablon-var-panel">
      <div className="comm-sablon-var-panel-title">Değişken ekle</div>
      {orderedGroups.map((group) => {
        const items = TEMPLATE_VARIABLES.filter((v) => (v.group || "genel") === group);
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
