"use client";

import { useMemo, useState } from "react";
import { AUDIENCE_TYPE_LABELS, CampaignPreviewRecipient, CampaignPreviewStats } from "@/lib/communication-api";

export interface ExcludedEntry {
  key: string;
  label: string;
}

interface RecipientsSummaryPanelProps {
  preview: CampaignPreviewStats | null;
  audienceType: string;
  loading?: boolean;
  onRefresh?: () => void;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onExclude?: (recipient: CampaignPreviewRecipient) => void;
  excludedEntries?: ExcludedEntry[];
  onUndoExclude?: (key: string) => void;
}

function recipientKey(r: CampaignPreviewRecipient): string {
  if (r.ogrenci_id) return `ogrenci:${r.ogrenci_id}`;
  if (r.veli_id) return `veli:${r.veli_id}`;
  return `phone:${r.e164}`;
}

export default function RecipientsSummaryPanel({
  preview,
  audienceType,
  loading = false,
  onRefresh,
  page = 1,
  pageSize = 20,
  onPageChange,
  onExclude,
  excludedEntries = [],
  onUndoExclude,
}: RecipientsSummaryPanelProps) {
  const [search, setSearch] = useState("");

  const recipients = useMemo(() => preview?.recipients ?? [], [preview]);
  const filtered = useMemo(() => {
    if (!search.trim()) return recipients;
    const q = search.toLowerCase();
    return recipients.filter(
      (r) => r.display_name?.toLowerCase().includes(q) || r.e164.includes(q),
    );
  }, [recipients, search]);

  const total = preview?.recipients_total ?? preview?.total_recipients ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <aside className="comm-studio-left">
      <h3 className="comm-studio-panel-title">Alıcı Özeti</h3>

      {preview && (
        <div className="comm-studio-mini-stats">
          <div><strong>{preview.total_recipients}</strong><span>Toplam</span></div>
          <div><strong>{preview.veli_count}</strong><span>Veli</span></div>
          <div><strong>{preview.ogrenci_count}</strong><span>Öğrenci</span></div>
        </div>
      )}

      <p className="comm-studio-audience-label">
        {AUDIENCE_TYPE_LABELS[audienceType] || audienceType}
      </p>

      <input
        type="search"
        className="comm-studio-search"
        placeholder="Bu sayfada ara…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        disabled={!recipients.length}
      />

      {loading ? (
        <p className="comm-studio-muted">Yükleniyor…</p>
      ) : recipients.length === 0 ? (
        <p className="comm-studio-muted">Alıcı listesi önizlemede gösterilir.</p>
      ) : (
        <ul className="comm-recipient-chips">
          {filtered.map((r, i) => (
            <li key={`${r.e164}-${i}`} className="comm-recipient-chip">
              <span className="comm-recipient-chip-name">{r.display_name || r.e164}</span>
              <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span className="comm-recipient-chip-type">{r.recipient_type}</span>
                {onExclude && (
                  <button
                    type="button"
                    className="comm-link-btn"
                    title="Bu alıcıyı hariç tut"
                    onClick={() => onExclude(r)}
                  >
                    ✕
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {onPageChange && total > pageSize && (
        <div className="comm-pagination">
          <span>
            Sayfa {page}/{totalPages} ({total.toLocaleString("tr-TR")})
          </span>
          <div style={{ display: "flex", gap: "0.35rem" }}>
            <button
              type="button"
              className="comm-btn-secondary"
              style={{ padding: "2px 8px", fontSize: "0.75rem" }}
              disabled={page <= 1 || loading}
              onClick={() => onPageChange(Math.max(1, page - 1))}
            >
              ‹
            </button>
            <button
              type="button"
              className="comm-btn-secondary"
              style={{ padding: "2px 8px", fontSize: "0.75rem" }}
              disabled={page >= totalPages || loading}
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            >
              ›
            </button>
          </div>
        </div>
      )}

      {excludedEntries.length > 0 && (
        <div className="comm-excluded-list">
          <p className="comm-studio-muted" style={{ marginBottom: "0.35rem" }}>
            Hariç tutulanlar ({excludedEntries.length})
          </p>
          {excludedEntries.map((entry) => (
            <span key={entry.key} className="comm-excluded-chip">
              {entry.label}
              {onUndoExclude && (
                <button type="button" onClick={() => onUndoExclude(entry.key)} title="Geri al">
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {onRefresh && (
        <button type="button" className="comm-btn-secondary comm-studio-refresh" onClick={onRefresh} disabled={loading}>
          Yenile
        </button>
      )}
    </aside>
  );
}

export { recipientKey };
