"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMetaWhatsAppTemplates, MetaWhatsAppTemplate } from "@/lib/communication-api";

interface MetaTemplateSelectProps {
  value: string;
  onChange: (name: string, language?: string) => void;
  id?: string;
  label?: string;
  disabled?: boolean;
}

export default function MetaTemplateSelect({
  value,
  onChange,
  id = "meta-template-select",
  label = "Meta şablon adı (isteğe bağlı)",
  disabled = false,
}: MetaTemplateSelectProps) {
  const [templates, setTemplates] = useState<MetaWhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMetaWhatsAppTemplates();
      setTemplates(data.templates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Şablon listesi alınamadı");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approved = templates.filter((t) => t.status === "APPROVED");

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    const tpl = approved.find((t) => t.name === name);
    onChange(name, tpl?.language);
  };

  return (
    <div className="comm-form-field">
      <label htmlFor={id}>{label}</label>
      {loading ? (
        <p className="comm-studio-muted" style={{ margin: 0, fontSize: "0.875rem" }}>
          Meta şablonları yükleniyor…
        </p>
      ) : (
        <>
          <select
            id={id}
            value={value}
            onChange={handleSelect}
            disabled={disabled || approved.length === 0}
          >
            <option value="">— Şablon seçin veya boş bırakın —</option>
            {approved.map((tpl) => (
              <option key={`${tpl.name}-${tpl.language}`} value={tpl.name}>
                {tpl.name} ({tpl.language || "?"})
              </option>
            ))}
          </select>
          {!loading && approved.length === 0 && !error && (
            <p className="comm-studio-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem" }}>
              Onaylı Meta şablonu bulunamadı — WABA yapılandırmasını kontrol edin.
            </p>
          )}
          {error && (
            <p className="comm-studio-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "#c0392b" }}>
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
