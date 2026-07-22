"use client";

import { useMemo, useState } from "react";
import { AUDIENCE_TYPE_LABELS, CampaignPreviewStats } from "@/lib/communication-api";

interface RecipientsSummaryPanelProps {
  preview: CampaignPreviewStats | null;
  audienceType: string;
  loading?: boolean;
  onRefresh?: () => void;
}

export default function RecipientsSummaryPanel({
  preview,
  audienceType,
  loading = false,
  onRefresh,
}: RecipientsSummaryPanelProps) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const recipients = preview?.recipients ?? [];
    if (!search.trim()) return recipients;
    const q = search.toLowerCase();
    return recipients.filter(
      (r) => r.display_name?.toLowerCase().includes(q) || r.e164.includes(q),
    );
  }, [preview?.recipients, search]);

  const visible = showAll ? filtered : filtered.slice(0, 10);
  const remaining = filtered.length - visible.length;
  const recipientCount = preview?.recipients?.length ?? 0;

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
        placeholder="Alıcı ara…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        disabled={!recipientCount}
      />

      {loading ? (
        <p className="comm-studio-muted">Yükleniyor…</p>
      ) : recipientCount === 0 ? (
        <p className="comm-studio-muted">Alıcı listesi önizlemede gösterilir.</p>
      ) : (
        <ul className="comm-recipient-chips">
          {visible.map((r, i) => (
            <li key={`${r.e164}-${i}`} className="comm-recipient-chip">
              <span className="comm-recipient-chip-name">{r.display_name || r.e164}</span>
              <span className="comm-recipient-chip-type">{r.recipient_type}</span>
            </li>
          ))}
        </ul>
      )}

      {remaining > 0 && (
        <button type="button" className="comm-link-btn" onClick={() => setShowAll(true)}>
          +{remaining} daha
        </button>
      )}
      {showAll && filtered.length > 10 && (
        <button type="button" className="comm-link-btn" onClick={() => setShowAll(false)}>
          Daha az göster
        </button>
      )}

      {onRefresh && (
        <button type="button" className="comm-btn-secondary comm-studio-refresh" onClick={onRefresh} disabled={loading}>
          Yenile
        </button>
      )}
    </aside>
  );
}
