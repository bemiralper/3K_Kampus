"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchLocalMetaTemplates,
  MetaTemplateUsage,
  WhatsAppMetaTemplateItem,
} from "@/lib/communication-api";
import WhatsAppPreviewBubble from "./WhatsAppPreviewBubble";
import { resolvePreviewVariables } from "./composer-utils";

interface MetaTemplateSelectProps {
  value: string;
  onChange: (name: string, language?: string, template?: WhatsAppMetaTemplateItem | null) => void;
  id?: string;
  label?: string;
  disabled?: boolean;
  accountId?: string;
  usage?: MetaTemplateUsage;
  hidePreview?: boolean;
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
}: MetaTemplateSelectProps) {
  const [templates, setTemplates] = useState<WhatsAppMetaTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const selected = useMemo(
    () => templates.find((t) => t.name === value) || null,
    [templates, value],
  );

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    const tpl = templates.find((t) => t.name === name) || null;
    onChange(name, tpl?.language, tpl);
  };

  return (
    <div className="comm-form-field">
      <label htmlFor={id}>{label}</label>
      {loading ? (
        <p className="comm-studio-muted" style={{ margin: 0, fontSize: "0.875rem" }}>
          Onaylı Meta şablonları yükleniyor…
        </p>
      ) : (
        <>
          <select
            id={id}
            value={value}
            onChange={handleSelect}
            disabled={disabled || templates.length === 0}
          >
            <option value="">— Onaylı şablon seçin —</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.name}>
                {tpl.name} ({tpl.language || "?"})
              </option>
            ))}
          </select>
          {!loading && templates.length === 0 && !error && (
            <p className="comm-studio-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem" }}>
              Onaylı Meta şablonu yok — Meta Şablonları sayfasından oluşturun veya senkronize edin.
            </p>
          )}
          {error && (
            <p className="comm-studio-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "#c0392b" }}>
              {error}
            </p>
          )}
          {!hidePreview && selected?.body_named && (
            <div style={{ marginTop: "0.75rem" }}>
              <WhatsAppPreviewBubble text={resolvePreviewVariables(selected.body_named)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
