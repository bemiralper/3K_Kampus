"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchLocalMetaTemplates,
  MetaTemplateUsage,
  WhatsAppMetaTemplateItem,
} from "@/lib/communication-api";
import WhatsAppPreviewBubble from "./WhatsAppPreviewBubble";
import { resolvePreviewVariables } from "./composer-utils";
import { useLivePreviewContext } from "./useLivePreviewContext";

/** header_json.type; yoksa components_json HEADER.format (Meta sync sonrası boş header için). */
export function headerTypeOf(tpl: WhatsAppMetaTemplateItem | null | undefined): string {
  const fromJson = ((tpl?.header_json as { type?: string } | undefined)?.type || "")
    .trim()
    .toUpperCase();
  if (fromJson) return fromJson;
  const comps = tpl?.components_json;
  if (Array.isArray(comps)) {
    for (const raw of comps) {
      const comp = raw as { type?: string; format?: string };
      if ((comp?.type || "").toUpperCase() === "HEADER") {
        const fmt = (comp.format || "TEXT").toUpperCase();
        return fmt || "NONE";
      }
    }
  }
  return "NONE";
}

interface MetaTemplateSelectProps {
  value: string;
  onChange: (name: string, language?: string, template?: WhatsAppMetaTemplateItem | null) => void;
  id?: string;
  label?: string;
  disabled?: boolean;
  accountId?: string;
  usage?: MetaTemplateUsage;
  hidePreview?: boolean;
  /** Boşsa tümü; doluysa yalnızca bu header türleri listelenir (örn. IMAGE, TEXT+NONE). */
  requiredHeaderTypes?: string[];
  /** Filtrelenmiş liste değişince üst bileşene bildir (otomatik seçim için). */
  onTemplatesLoaded?: (templates: WhatsAppMetaTemplateItem[]) => void;
  /** compact: uzun filtre metni yerine kısa rozet */
  variant?: "default" | "compact";
}

function headerFilterBadge(types: string[] | undefined): string | null {
  if (!types?.length) return null;
  const set = new Set(types.map((t) => t.toUpperCase()));
  if (set.has("IMAGE")) return "Görsel";
  if (set.has("DOCUMENT") || set.has("VIDEO")) return "Belge";
  if (set.has("TEXT") || set.has("NONE")) return "Metin";
  return null;
}

export default function MetaTemplateSelect({
  value,
  onChange,
  id = "meta-template-select",
  label = "Meta şablonu (onaylı)",
  disabled = false,
  accountId,
  usage,
  hidePreview = false,
  requiredHeaderTypes,
  onTemplatesLoaded,
  variant = "default",
}: MetaTemplateSelectProps) {
  const [templates, setTemplates] = useState<WhatsAppMetaTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const livePreviewContext = useLivePreviewContext();

  const requiredKey = (requiredHeaderTypes || []).map((t) => t.toUpperCase()).sort().join(",");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLocalMetaTemplates({
        account_id: accountId,
        approved_only: true,
        usage,
      });
      setTemplates(data.templates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Şablon listesi alınamadı");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, usage]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!requiredHeaderTypes?.length) return templates;
    const allowed = new Set(requiredHeaderTypes.map((t) => t.toUpperCase()));
    return templates.filter((tpl) => allowed.has(headerTypeOf(tpl)));
  }, [templates, requiredKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onTemplatesLoaded?.(filtered);
  }, [filtered, onTemplatesLoaded]);

  const selected = useMemo(
    () => filtered.find((t) => t.name === value) || null,
    [filtered, value],
  );

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    const tpl = filtered.find((t) => t.name === name) || null;
    onChange(name, tpl?.language, tpl);
  };

  const filterBadge = useMemo(
    () => headerFilterBadge(requiredHeaderTypes),
    [requiredKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const compact = variant === "compact";

  return (
    <div className={`comm-form-field${compact ? " comm-meta-select--compact" : ""}`}>
      <label htmlFor={id} className={compact ? "comm-meta-select-label" : undefined}>
        <span>{label}</span>
        {compact && filterBadge && (
          <span className="comm-meta-select-badge" title="Eke göre süzülmüş şablonlar">
            {filterBadge}
          </span>
        )}
      </label>
      {loading ? (
        <p className="comm-studio-muted" style={{ margin: 0, fontSize: "0.875rem" }}>
          Şablonlar yükleniyor…
        </p>
      ) : (
        <>
          <select
            id={id}
            value={selected ? value : ""}
            onChange={handleSelect}
            disabled={disabled || filtered.length === 0}
          >
            <option value="">Şablon seçin</option>
            {filtered.map((tpl) => (
              <option key={tpl.id} value={tpl.name}>
                {tpl.name}
              </option>
            ))}
          </select>
          {!compact && filterBadge && (
            <p className="comm-form-hint">
              Listede yalnızca {filterBadge.toLowerCase()} şablonları var (ek tipine göre).
            </p>
          )}
          {!loading && filtered.length === 0 && !error && (
            <p className="comm-form-hint">
              Bu ek tipine uygun onaylı şablon yok.
            </p>
          )}
          {error && (
            <p className="comm-form-hint" style={{ color: "#c0392b" }}>
              {error}
            </p>
          )}
          {!hidePreview && selected?.body_named && (
            <div style={{ marginTop: "0.75rem" }}>
              <WhatsAppPreviewBubble
                text={resolvePreviewVariables(selected.body_named, livePreviewContext)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
