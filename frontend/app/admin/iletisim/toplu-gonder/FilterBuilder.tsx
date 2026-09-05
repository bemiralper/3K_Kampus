"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AudienceCatalog,
  AudienceCatalogField,
  AudienceFilter,
  AudiencePersonType,
} from "@/lib/communication-api";
import { trIncludes } from "@/lib/text-format";
import {
  addFilterToGroup,
  addGroup,
  formatFilterValue,
  removeFilter,
  removeGroup,
} from "./audience-utils";

interface FilterBuilderProps {
  query: AudienceFilter;
  catalog: AudienceCatalog | null;
  personTypes: AudiencePersonType[];
  onChange: (query: AudienceFilter) => void;
}

export default function FilterBuilder({
  query,
  catalog,
  personTypes,
  onChange,
}: FilterBuilderProps) {
  const groups = query.tree?.groups?.length
    ? query.tree.groups
    : [{ join: "and" as const, filters: [] }];
  const fields = (catalog?.fields || []).filter((f) =>
    f.person_types.some((t) => personTypes.includes(t)),
  );

  return (
    <div className="tg-groups">
      {groups.map((group, gi) => (
        <div key={`g-${gi}`}>
          {gi > 0 && <div className="tg-or">VEYA</div>}
          <div className="tg-group">
            <div className="tg-group-head">
              <strong>{gi === 0 ? "Tüm bu koşullar" : `Grup ${gi + 1}`}</strong>
              {groups.length > 1 && (
                <button type="button" className="tg-btn-ghost" onClick={() => onChange(removeGroup(query, gi))}>
                  Grubu kaldır
                </button>
              )}
            </div>
            <div className="tg-filters">
              {(group.filters || []).map((node) => {
                const field = fields.find((f) => f.key === node.field);
                return (
                  <FilterRow
                    key={`${gi}-${node.field}`}
                    field={field}
                    fallbackLabel={node.field}
                    value={node.value}
                    onChange={(value) => onChange(addFilterToGroup(query, gi, { ...node, value }))}
                    onRemove={() => onChange(removeFilter(query, gi, node.field))}
                  />
                );
              })}
            </div>
            <div className="tg-actions-row">
              <AddFilterPicker
                fields={fields.filter((f) => !(group.filters || []).some((n) => n.field === f.key))}
                onPick={(field) => onChange(addFilterToGroup(query, gi, { field: field.key, op: "in", value: [] }))}
              />
            </div>
          </div>
        </div>
      ))}
      <button type="button" className="tg-btn" onClick={() => onChange(addGroup(query))}>
        + Koşul grubu ekle
      </button>
    </div>
  );
}

function FilterRow({
  field,
  fallbackLabel,
  value,
  onChange,
  onRemove,
}: {
  field?: AudienceCatalogField;
  fallbackLabel: string;
  value: unknown;
  onChange: (value: unknown) => void;
  onRemove: () => void;
}) {
  const selected = Array.isArray(value) ? value.map(String) : value == null || value === "" ? [] : [String(value)];
  return (
    <div className="tg-filter">
      <label>{field?.label || fallbackLabel}</label>
      <div>
        {field?.options?.length ? (
          <CheckboxMultiSelect
            options={field.options}
            selected={selected}
            onChange={(next) => onChange(next.map(coerce))}
            placeholder={`${field.label} seçin`}
          />
        ) : (
          <input
            className="tg-search"
            value={formatFilterValue(value)}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Değer"
          />
        )}
      </div>
      <button type="button" className="tg-icon-btn" aria-label="Kaldır" onClick={onRemove}>×</button>
    </div>
  );
}

function CheckboxMultiSelect({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: Array<{ value: string | number; label: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const filtered = useMemo(() => {
    const needle = q.trim();
    if (!needle) return options;
    return options.filter((opt) => trIncludes(opt.label, needle));
  }, [options, q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQ("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (raw: string) => {
    onChange(selectedSet.has(raw) ? selected.filter((item) => item !== raw) : [...selected, raw]);
  };

  const summary = selected.length
    ? selected
      .map((raw) => options.find((opt) => String(opt.value) === raw)?.label || raw)
      .slice(0, 3)
      .join(", ") + (selected.length > 3 ? ` +${selected.length - 3}` : "")
    : placeholder;

  return (
    <div className="tg-ms" ref={rootRef}>
      <button
        type="button"
        className={`tg-ms-trigger${open ? " is-open" : ""}${selected.length ? " has-value" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{summary}</span>
        <em>{selected.length || ""}</em>
      </button>
      {open && (
        <div className="tg-ms-menu" role="listbox" aria-multiselectable="true">
          <input
            className="tg-search"
            autoFocus
            placeholder="Ara"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="tg-ms-list">
            {filtered.length === 0 && <div className="tg-empty">Sonuç yok</div>}
            {filtered.map((opt) => {
              const raw = String(opt.value);
              const on = selectedSet.has(raw);
              return (
                <label key={raw} className={`tg-check-row${on ? " is-on" : ""}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(raw)} />
                  <span>{opt.label}</span>
                </label>
              );
            })}
          </div>
          {selected.length > 0 && (
            <button type="button" className="tg-btn-ghost" onClick={() => onChange([])}>
              Seçimi temizle
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AddFilterPicker({
  fields,
  onPick,
}: {
  fields: AudienceCatalogField[];
  onPick: (field: AudienceCatalogField) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const grouped = useMemo(() => {
    const needle = q.trim();
    const map = new Map<string, AudienceCatalogField[]>();
    for (const field of fields) {
      if (needle && !trIncludes(`${field.label} ${field.category_label}`, needle)) {
        continue;
      }
      const list = map.get(field.category_label) || [];
      list.push(field);
      map.set(field.category_label, list);
    }
    return map;
  }, [fields, q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQ("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="tg-picker" ref={rootRef}>
      <button type="button" className="tg-btn" onClick={() => setOpen((v) => !v)}>
        + Filtre ekle
      </button>
      {open && (
        <div className="tg-popover tg-popover-lg">
          <div className="tg-popover-head">
            <strong>Filtre ekle</strong>
            <button type="button" className="tg-icon-btn" aria-label="Kapat" onClick={() => setOpen(false)}>×</button>
          </div>
          <input
            className="tg-search"
            autoFocus
            placeholder="Sınıf, şube, koç, paket…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="tg-popover-body">
            {fields.length === 0 && <div className="tg-empty">Bu kişi türü için filtre yok.</div>}
            {Array.from(grouped.entries()).map(([cat, list]) => (
              <div key={cat} className="tg-popover-cat">
                <div className="tg-cat">{cat}</div>
                {list.map((field) => (
                  <button
                    key={field.key}
                    type="button"
                    className="tg-opt tg-opt-card"
                    onClick={() => {
                      onPick(field);
                      setOpen(false);
                      setQ("");
                    }}
                  >
                    <strong>{field.label}</strong>
                    <span>{field.options?.length ? `${field.options.length} seçenek` : "Serbest değer"}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function coerce(raw: string): string | number {
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}
