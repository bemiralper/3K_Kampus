"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import WhatsAppPreviewBubble from "./WhatsAppPreviewBubble";
import {
  categoryLabelMap,
  fetchTemplateCategories,
  fetchTemplates,
  MessageTemplateItem,
  TEMPLATE_AUDIENCE_LABELS,
  TemplateCategoryItem,
} from "@/lib/communication-api";

interface TemplatePickerDrawerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (template: MessageTemplateItem) => void;
  readOnly?: boolean;
  inboxMode?: boolean;
}

export default function TemplatePickerDrawer({
  open,
  onClose,
  onSelect,
  readOnly = false,
  inboxMode = false,
}: TemplatePickerDrawerProps) {
  const [templates, setTemplates] = useState<MessageTemplateItem[]>([]);
  const [categories, setCategories] = useState<TemplateCategoryItem[]>([]);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchTemplates(category || undefined),
      fetchTemplateCategories(true),
    ])
      .then(([tplRes, catRes]) => {
        setTemplates(tplRes.templates);
        setCategories(catRes.categories);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Şablonlar yüklenemedi"))
      .finally(() => setLoading(false));
  }, [open, category]);

  const labels = useMemo(() => categoryLabelMap(categories), [categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q) ||
        (labels[t.category] || "").toLowerCase().includes(q),
    );
  }, [templates, search, labels]);

  if (!open) return null;

  return (
    <div className="comm-drawer-overlay" onClick={onClose} role="presentation">
      <aside
        className={`comm-drawer comm-drawer-templates-v2${inboxMode ? " comm-drawer--inbox-templates" : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Hazır yanıt seç"
      >
        <header className="comm-drawer-header">
          <div>
            <h2>{readOnly ? "Hazır Yanıtlar" : "Şablon Seç"}</h2>
            {inboxMode && (
              <p className="comm-drawer-subtitle">Kayıtlı metinlerden birini seçin</p>
            )}
          </div>
          <button type="button" className="comm-drawer-close" onClick={onClose} aria-label="Kapat">×</button>
        </header>

        <div className="comm-drawer-filters comm-drawer-filters-v2">
          <input
            type="search"
            className="comm-inbox-search comm-drawer-search"
            placeholder="Ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Şablon ara"
          />
          <div className="comm-template-chip-row" role="tablist" aria-label="Kategori filtresi">
            <button
              type="button"
              role="tab"
              aria-selected={category === ""}
              className={`comm-template-chip${category === "" ? " active" : ""}`}
              onClick={() => setCategory("")}
            >
              Tümü
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={category === cat.slug}
                className={`comm-template-chip${category === cat.slug ? " active" : ""}`}
                onClick={() => setCategory(cat.slug)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {loading && <p className="comm-studio-muted comm-drawer-status">Yükleniyor…</p>}
        {error && <p className="comm-attachment-error comm-drawer-status">{error}</p>}

        <div className="comm-template-card-list">
          {!loading && filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              className="comm-template-card"
              onClick={() => {
                onSelect(t);
                onClose();
              }}
            >
              <div className="comm-template-card-head">
                <strong>{t.name}</strong>
                <span className="comm-template-card-badges">
                  <span className="comm-template-item-category">
                    {t.category_label || labels[t.category] || t.category}
                  </span>
                  <span className="comm-template-audience-badge">
                    {TEMPLATE_AUDIENCE_LABELS[t.audience_scope || "genel"] || t.audience_scope}
                  </span>
                </span>
              </div>
              <div className="comm-template-card-preview">
                <WhatsAppPreviewBubble text={t.body.slice(0, 280)} className="comm-template-preview-bubble" />
              </div>
              <span className="comm-template-meta">{t.usage_count} kullanım</span>
            </button>
          ))}
          {!loading && filtered.length === 0 && (
            <p className="comm-studio-muted comm-drawer-empty">
              {inboxMode
                ? "Henüz hazır yanıt yok. Admin panelinden şablon ekleyebilirsiniz."
                : "Henüz şablon yok."}
            </p>
          )}
        </div>

        {inboxMode && (
          <footer className="comm-drawer-footer">
            <Link href="/admin/iletisim/sablonlar" className="comm-btn-secondary" onClick={onClose}>
              Şablonları yönet
            </Link>
          </footer>
        )}
      </aside>
    </div>
  );
}
