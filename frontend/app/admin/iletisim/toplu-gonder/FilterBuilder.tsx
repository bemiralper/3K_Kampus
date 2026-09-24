"use client";

import { useMemo, useRef, useState } from "react";

import AnchoredPopover from "@/components/bulk-send/AnchoredPopover";
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Seçililer üstte, sonra alfabetik; arama Türkçe duyarsız
  const filtered = useMemo(() => {
    const needle = q.trim();
    const list = needle ? options.filter((opt) => trIncludes(opt.label, needle)) : options;
    return [...list].sort((a, b) => {
      const sa = selectedSet.has(String(a.value)) ? 0 : 1;
      const sb = selectedSet.has(String(b.value)) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return a.label.localeCompare(b.label, "tr");
    });
  }, [options, q, selectedSet]);

  const close = () => {
    setOpen(false);
    setQ("");
  };

  const toggle = (raw: string) => {
    onChange(selectedSet.has(raw) ? selected.filter((item) => item !== raw) : [...selected, raw]);
  };

  const selectFiltered = () => {
    const next = new Set(selected);
    filtered.forEach((opt) => next.add(String(opt.value)));
    onChange(Array.from(next));
  };

  const allFilteredOn = filtered.length > 0 && filtered.every((opt) => selectedSet.has(String(opt.value)));

  const summary = selected.length
    ? selected
      .map((raw) => options.find((opt) => String(opt.value) === raw)?.label || raw)
      .slice(0, 3)
      .join(", ") + (selected.length > 3 ? ` +${selected.length - 3}` : "")
    : placeholder;

  return (
    <div className="tg-ms">
      <button
        ref={triggerRef}
        type="button"
        className={`tg-ms-trigger${open ? " is-open" : ""}${selected.length ? " has-value" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>{summary}</span>
        <em>{selected.length || ""}</em>
      </button>
      <AnchoredPopover open={open} anchorRef={triggerRef} onClose={close} width={340} maxHeight={420} ariaLabel={placeholder}>
        <div className="bs-pop-head">
          <strong>{placeholder}</strong>
          <span className="bs-muted">{selected.length ? `${selected.length} seçili` : `${options.length} seçenek`}</span>
        </div>
        <input
          className="bs-pop-search"
          autoFocus
          placeholder="Ara…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered.length === 1) {
              e.preventDefault();
              toggle(String(filtered[0].value));
              setQ("");
            }
          }}
        />
        <div className="bs-pop-list" role="listbox" aria-multiselectable="true">
          {filtered.length === 0 && <div className="tg-empty">Sonuç yok</div>}
          {filtered.map((opt, index) => {
            const raw = String(opt.value);
            const on = selectedSet.has(raw);
            const prevOn = index > 0 && selectedSet.has(String(filtered[index - 1].value));
            return (
              <div key={raw}>
                {!q && index > 0 && prevOn && !on && <div className="bs-pop-sep" />}
                <label className={`bs-pop-row${on ? " is-on" : ""}`} role="option" aria-selected={on}>
                  <input type="checkbox" checked={on} onChange={() => toggle(raw)} />
                  <span>{opt.label}</span>
                </label>
              </div>
            );
          })}
        </div>
        <div className="bs-pop-foot">
          <span style={{ display: "flex", gap: 10 }}>
            {filtered.length > 1 && !allFilteredOn && (
              <button type="button" className="bs-counter-link" onClick={selectFiltered}>
                {q ? "Bulunanları seç" : "Tümünü seç"} ({filtered.length})
              </button>
            )}
            {selected.length > 0 && (
              <button type="button" className="bs-counter-link" onClick={() => onChange([])}>Temizle</button>
            )}
          </span>
          <button type="button" className="bs-btn-primary bs-btn-sm" onClick={close}>Tamam</button>
        </div>
      </AnchoredPopover>
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
  const triggerRef = useRef<HTMLButtonElement>(null);
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

  const close = () => {
    setOpen(false);
    setQ("");
  };

  return (
    <div className="tg-picker">
      <button ref={triggerRef} type="button" className="tg-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        + Filtre ekle
      </button>
      <AnchoredPopover open={open} anchorRef={triggerRef} onClose={close} width={400} maxHeight={440} ariaLabel="Filtre ekle">
        <div className="bs-pop-head">
          <strong>Filtre ekle</strong>
          <button type="button" className="tg-icon-btn" aria-label="Kapat" onClick={close}>×</button>
        </div>
        <input
          className="bs-pop-search"
          autoFocus
          placeholder="Sınıf, şube, koç, paket…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="bs-pop-list">
          {fields.length === 0 && <div className="tg-empty">Bu kişi türü için filtre yok.</div>}
          {fields.length > 0 && grouped.size === 0 && <div className="tg-empty">Sonuç yok</div>}
          {Array.from(grouped.entries()).map(([cat, list]) => (
            <div key={cat}>
              <div className="bs-pop-cat">{cat}</div>
              {list.map((field) => (
                <button
                  key={field.key}
                  type="button"
                  className="bs-pop-opt"
                  onClick={() => {
                    onPick(field);
                    close();
                  }}
                >
                  <strong>{field.label}</strong>
                  <span>{field.options?.length ? `${field.options.length} seçenek` : "Serbest değer"}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </AnchoredPopover>
    </div>
  );
}

function coerce(raw: string): string | number {
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}
