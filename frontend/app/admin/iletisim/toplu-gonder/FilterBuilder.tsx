"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import AnchoredPopover from "@/components/bulk-send/AnchoredPopover";
import type {
  AudienceCatalog,
  AudienceCatalogField,
  AudienceFilter,
  AudienceFilterGroup,
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

/** Sık kullanılan alanlar her zaman düğme olarak durur. */
const PINNED = [
  "sube_id",
  "sinif_seviyesi_id",
  "sinif_id",
  "coach_id",
  "paket",
  "ek_hizmet_turu",
  "personel_rol_id",
  "calisma_durumu",
];

function valuesOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter((item) => item !== "");
  if (value == null || value === "") return [];
  return [String(value)];
}

function optionLabel(field: AudienceCatalogField | undefined, raw: string): string {
  return field?.options?.find((opt) => String(opt.value) === raw)?.label || raw;
}

export default function FilterBuilder({
  query,
  catalog,
  personTypes,
  onChange,
}: FilterBuilderProps) {
  const fields = (catalog?.fields || []).filter((field) =>
    field.person_types.some((type) => personTypes.includes(type)),
  );
  const stored = query.tree?.groups || [];
  const groups: AudienceFilterGroup[] = stored.length
    ? stored
    : [{ join: "and", filters: [] }];
  const hasValue = stored.some((group) =>
    (group.filters || []).some((node) => valuesOf(node.value).length > 0),
  );

  return (
    <div className="bs-filters">
      {groups.map((group, gi) => (
        <div key={`g-${gi}`}>
          {gi > 0 && <div className="bs-filter-or">VEYA</div>}
          <FilterGroup
            query={query}
            group={group}
            groupIndex={gi}
            fields={fields}
            showHead={stored.length > 1}
            onChange={onChange}
          />
        </div>
      ))}
      {hasValue && (
        <button type="button" className="bs-filter-more" onClick={() => onChange(addGroup(query))}>
          VEYA ile başka bir grup
        </button>
      )}
    </div>
  );
}

function FilterGroup({
  query,
  group,
  groupIndex,
  fields,
  showHead,
  onChange,
}: {
  query: AudienceFilter;
  group: AudienceFilterGroup;
  groupIndex: number;
  fields: AudienceCatalogField[];
  showHead: boolean;
  onChange: (query: AudienceFilter) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const nodes = group.filters || [];
  const emptyKey = nodes.find((node) => valuesOf(node.value).length === 0)?.field ?? "";

  useEffect(() => {
    if (emptyKey) setOpenKey(emptyKey);
  }, [emptyKey]);
  const activeKeys = new Set(nodes.map((node) => node.field));
  const visible = fields.filter((field) => PINNED.includes(field.key) || activeKeys.has(field.key));
  const rest = fields.filter((field) => !visible.some((item) => item.key === field.key));

  const setValues = (fieldKey: string, next: string[]) => {
    if (!next.length) {
      onChange(removeFilter(query, groupIndex, fieldKey));
      return;
    }
    onChange(addFilterToGroup(query, groupIndex, {
      field: fieldKey,
      op: "in",
      value: next.map(coerce),
    }));
  };

  const closeField = (field: AudienceCatalogField) => {
    setOpenKey(null);
    const node = nodes.find((item) => item.field === field.key);
    if (node && valuesOf(node.value).length === 0) {
      onChange(removeFilter(query, groupIndex, field.key));
    }
  };

  return (
    <div className="bs-filter-group">
      {showHead && (
        <div className="bs-filter-head">
          <span>{groupIndex === 0 ? "Bu koşulların hepsi" : `Grup ${groupIndex + 1}`}</span>
          <button type="button" onClick={() => onChange(removeGroup(query, groupIndex))}>Grubu kaldır</button>
        </div>
      )}
      <div className="bs-filter-picks">
        {visible.map((field) => {
          const node = nodes.find((item) => item.field === field.key);
          const selected = valuesOf(node?.value);
          return (
            <CheckboxMultiSelect
              key={field.key}
              label={field.label}
              options={field.options || []}
              selected={selected}
              open={openKey === field.key}
              empty={Boolean(node) && selected.length === 0}
              onOpenChange={(next) => (next ? setOpenKey(field.key) : closeField(field))}
              onChange={(next) => setValues(field.key, next)}
            />
          );
        })}
        {rest.length > 0 && (
          <AddFilterPicker
            fields={rest}
            onPick={(field) => {
              onChange(addFilterToGroup(query, groupIndex, { field: field.key, op: "in", value: [] }));
              setOpenKey(field.key);
            }}
          />
        )}
      </div>
      {nodes.some((node) => valuesOf(node.value).length > 0) && (
        <div className="bs-who-added">
          {nodes.flatMap((node) => {
            const field = fields.find((item) => item.key === node.field);
            return valuesOf(node.value).map((raw) => (
              <span key={`${node.field}-${raw}`} className="bs-pill is-filter">
                <small>{field?.label || node.field}</small>
                <b>{optionLabel(field, raw)}</b>
                <button
                  type="button"
                  aria-label="Kaldır"
                  onClick={() => setValues(node.field, valuesOf(node.value).filter((item) => item !== raw))}
                >
                  ×
                </button>
              </span>
            ));
          })}
        </div>
      )}
      {nodes.filter((node) => {
        const field = fields.find((item) => item.key === node.field);
        return field && !field.options?.length;
      }).map((node) => (
        <input
          key={node.field}
          className="bs-input"
          value={formatFilterValue(node.value)}
          placeholder="Değer"
          onChange={(event) => onChange(addFilterToGroup(query, groupIndex, { ...node, value: event.target.value }))}
        />
      ))}
    </div>
  );
}

function CheckboxMultiSelect({
  label,
  options,
  selected,
  open,
  empty,
  onOpenChange,
  onChange,
}: {
  label: string;
  options: Array<{ value: string | number; label: string }>;
  selected: string[];
  open: boolean;
  empty: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (next: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

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
    setQ("");
    onOpenChange(false);
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
  const showFoot = (filtered.length > 1 && !allFilteredOn) || selected.length > 0;

  if (!options.length) return null;

  return (
    <div className="bs-filter-slot">
      <button
        ref={triggerRef}
        type="button"
        className={`bs-filter-field${selected.length ? " is-on" : ""}${empty ? " is-empty" : ""}${open ? " is-open" : ""}`}
        onClick={() => (open ? close() : onOpenChange(true))}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {label}
        {selected.length > 0 ? <em>{selected.length}</em> : empty ? <em>seçin</em> : null}
      </button>
      <AnchoredPopover open={open} anchorRef={triggerRef} onClose={close} width={340} maxHeight={420} ariaLabel={label}>
        <div className="bs-pop-head">
          <strong>{label}</strong>
          <span className="bs-pop-head-end">
            <span className="bs-muted">{selected.length ? `${selected.length} seçili` : `${options.length} seçenek`}</span>
            <button type="button" className="bs-filter-x" aria-label="Kapat" onClick={close}>×</button>
          </span>
        </div>
        {options.length > 8 && (
          <input
            className="bs-pop-search"
            autoFocus
            placeholder="Ara…"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && filtered.length === 1) {
                event.preventDefault();
                toggle(String(filtered[0].value));
                setQ("");
              }
            }}
          />
        )}
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
                  {on && <em>Seçili</em>}
                </label>
              </div>
            );
          })}
        </div>
        {showFoot && (
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
          </div>
        )}
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
      if (needle && !trIncludes(`${field.label} ${field.category_label}`, needle)) continue;
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
    <div className="bs-filter-slot">
      <button
        ref={triggerRef}
        type="button"
        className={`bs-filter-field${open ? " is-open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        Diğer
      </button>
      <AnchoredPopover open={open} anchorRef={triggerRef} onClose={close} width={360} maxHeight={440} ariaLabel="Diğer filtreler">
        <div className="bs-pop-head">
          <strong>Diğer filtreler</strong>
          <button type="button" className="bs-filter-x" aria-label="Kapat" onClick={close}>×</button>
        </div>
        <input
          className="bs-pop-search"
          autoFocus
          placeholder="Ara…"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <div className="bs-pop-list">
          {grouped.size === 0 && <div className="tg-empty">Sonuç yok</div>}
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
