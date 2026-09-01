"use client";

import { useMemo, useState } from "react";
import {
  AUDIENCE_TYPE_LABELS,
  CampaignPreviewRecipient,
  CampaignPreviewStats,
} from "@/lib/communication-api";
import { trIncludes } from "@/lib/text-format";

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

const TYPE_LABEL: Record<string, string> = {
  VELI: "Veli",
  OGRENCI: "Öğrenci",
  PERSONEL: "Personel",
};

function recipientKey(r: CampaignPreviewRecipient): string {
  if (r.personel_id) return `personel:${r.personel_id}`;
  if (r.ogrenci_id) return `ogrenci:${r.ogrenci_id}`;
  if (r.veli_id) return `veli:${r.veli_id}`;
  return `phone:${r.e164}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "?";
}

function typeClass(type: string): string {
  const t = (type || "").toUpperCase();
  if (t === "VELI") return "is-veli";
  if (t === "OGRENCI") return "is-ogrenci";
  if (t === "PERSONEL") return "is-personel";
  return "";
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
    const q = search.trim();
    return recipients.filter(
      (r) => trIncludes(r.display_name, q) || r.e164.includes(q),
    );
  }, [recipients, search]);

  const total = preview?.recipients_total ?? preview?.total_recipients ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const personelCount = preview?.personel_count ?? 0;

  return (
    <section className="comm-studio-recipients" aria-label="Alıcı listesi">
      <header className="comm-studio-recipients-head">
        <div>
          <h3>Alıcılar</h3>
          <p>{AUDIENCE_TYPE_LABELS[audienceType] || audienceType}</p>
        </div>
        {onRefresh && (
          <button
            type="button"
            className="comm-studio-icon-btn"
            onClick={onRefresh}
            disabled={loading}
            title="Yenile"
            aria-label="Alıcı listesini yenile"
          >
            ↻
          </button>
        )}
      </header>

      {preview && (
        <div className="comm-studio-stat-strip" aria-label="Alıcı özeti">
          <div className="is-total">
            <strong>{preview.total_recipients}</strong>
            <span>Toplam</span>
          </div>
          {preview.veli_count > 0 && (
            <div>
              <strong>{preview.veli_count}</strong>
              <span>Veli</span>
            </div>
          )}
          {preview.ogrenci_count > 0 && (
            <div>
              <strong>{preview.ogrenci_count}</strong>
              <span>Öğrenci</span>
            </div>
          )}
          {personelCount > 0 && (
            <div>
              <strong>{personelCount}</strong>
              <span>Personel</span>
            </div>
          )}
        </div>
      )}

      <div className="comm-studio-search-wrap">
        <input
          type="search"
          className="comm-studio-search"
          placeholder="Bu sayfada ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={!recipients.length}
        />
      </div>

      {loading ? (
        <p className="comm-studio-muted">Alıcılar yükleniyor…</p>
      ) : recipients.length === 0 ? (
        <p className="comm-studio-muted">Henüz alıcı yok.</p>
      ) : (
        <ul className="comm-studio-recipient-list">
          {filtered.map((r, i) => {
            const name = r.display_name || r.e164;
            const type = (r.recipient_type || "").toUpperCase();
            return (
              <li key={`${recipientKey(r)}-${i}`} className="comm-studio-recipient-row">
                <span className={`comm-studio-avatar ${typeClass(type)}`} aria-hidden="true">
                  {initials(name)}
                </span>
                <span className="comm-studio-recipient-text">
                  <strong>{name}</strong>
                  <small>
                    {TYPE_LABEL[type] || r.recipient_type || "Alıcı"}
                    {r.e164 ? ` · ${r.e164}` : ""}
                  </small>
                </span>
                {onExclude && (
                  <button
                    type="button"
                    className="comm-studio-exclude-btn"
                    title="Hariç tut"
                    aria-label={`${name} hariç tut`}
                    onClick={() => onExclude(r)}
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {onPageChange && total > pageSize && (
        <div className="comm-studio-pagination">
          <span>
            {page}/{totalPages}
          </span>
          <div>
            <button
              type="button"
              className="comm-studio-icon-btn"
              disabled={page <= 1 || loading}
              onClick={() => onPageChange(Math.max(1, page - 1))}
              aria-label="Önceki sayfa"
            >
              ‹
            </button>
            <button
              type="button"
              className="comm-studio-icon-btn"
              disabled={page >= totalPages || loading}
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              aria-label="Sonraki sayfa"
            >
              ›
            </button>
          </div>
        </div>
      )}

      {excludedEntries.length > 0 && (
        <div className="comm-studio-excluded">
          <p>Hariç ({excludedEntries.length})</p>
          <div className="comm-studio-excluded-chips">
            {excludedEntries.map((entry) => (
              <span key={entry.key} className="comm-studio-excluded-chip">
                {entry.label}
                {onUndoExclude && (
                  <button
                    type="button"
                    onClick={() => onUndoExclude(entry.key)}
                    title="Geri al"
                    aria-label={`${entry.label} geri al`}
                  >
                    ↩
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export { recipientKey };
