"use client";

import { useMemo, useState } from "react";

export interface TemplateBindingOption {
  id: string;
  name: string;
  meta?: string;
  groupKey?: string;
  groupLabel?: string;
  status?: string;
  recommended?: boolean;
}

interface TemplateBindingSelectProps {
  id: string;
  label: string;
  value: string;
  emptyLabel: string;
  options: TemplateBindingOption[];
  eventGroup: string;
  disabled?: boolean;
  hint?: string;
  onChange: (id: string) => void;
}

export default function TemplateBindingSelect({
  id,
  label,
  value,
  emptyLabel,
  options,
  eventGroup,
  disabled,
  hint,
  onChange,
}: TemplateBindingSelectProps) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("tr");
    return options.filter((opt) => {
      const inGroup =
        showAll
        || !eventGroup
        || opt.recommended
        || opt.id === value
        || (opt.groupKey || "") === eventGroup;
      if (!inGroup) return false;
      if (!term) return true;
      const hay = [opt.name, opt.meta, opt.groupLabel, opt.status]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr");
      return hay.includes(term);
    });
  }, [options, query, showAll, eventGroup, value]);

  const hiddenCount = options.length - filtered.length;

  return (
    <div className="nbx-field">
      <label className="nbx-field-label" htmlFor={id}>
        {label}
      </label>
      <input
        type="search"
        className="nbx-select"
        value={query}
        placeholder="Şablon ara…"
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={`${label} ara`}
      />
      <select
        id={id}
        className="nbx-select"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        size={Math.min(8, Math.max(4, filtered.length + 1))}
      >
        <option value="">{emptyLabel}</option>
        {filtered.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.recommended ? "★ " : ""}
            {opt.name}
            {opt.meta ? ` ${opt.meta}` : ""}
            {opt.groupLabel ? ` · ${opt.groupLabel}` : ""}
          </option>
        ))}
      </select>
      <div className="nbx-field-links">
        <button
          type="button"
          className="nbx-inline-link"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Yalnızca bu grubu göster" : "Tüm şablonları göster"}
        </button>
        {!showAll && hiddenCount > 0 && (
          <span className="nbx-hint" style={{ margin: 0 }}>
            {hiddenCount} şablon gizlendi
          </span>
        )}
      </div>
      {hint && <p className="nbx-hint">{hint}</p>}
    </div>
  );
}
