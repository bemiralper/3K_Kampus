"use client";

import { useEffect, useMemo, useState } from "react";
import {
  previewAttendanceNotify,
  sendAttendanceNotify,
  type AttendanceNotifyEventType,
  type AttendanceNotifyPreviewResponse,
  type AttendanceNotifyRecipientPreview,
} from "@/lib/kutuphane-api";
import "./yoklama-notify.css";
import YoklamaModalPortal from "./YoklamaModalPortal";

const EVENT_LABELS: Record<AttendanceNotifyEventType, string> = {
  ABSENT: "Gelmeyenler",
  LATE: "Geç kalanlar",
  EXIT: "Çıkış yapanlar",
};

interface AttendanceNotifyPreviewModalProps {
  libraryId: string;
  sessionId: string;
  eventType: AttendanceNotifyEventType;
  ogrenciIds?: number[];
  sessionTitle?: string;
  onClose: () => void;
  onSent: (sent: number) => void;
}

export default function AttendanceNotifyPreviewModal({
  libraryId,
  sessionId,
  eventType,
  ogrenciIds,
  sessionTitle,
  onClose,
  onSent,
}: AttendanceNotifyPreviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<AttendanceNotifyPreviewResponse | null>(null);
  const [error, setError] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await previewAttendanceNotify(libraryId, sessionId, eventType, ogrenciIds);
        if (!res.success || !res.data) {
          throw new Error((res as { error?: string }).error || "Önizleme yüklenemedi");
        }
        if (!cancelled) setPreview(res.data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Hata");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [libraryId, sessionId, eventType, ogrenciIds]);

  const sendable = useMemo(() => {
    if (!preview) return [];
    return preview.recipients.filter((r) => {
      if (!r.veli_id || r.skip_reason) return false;
      const key = `${r.ogrenci_id}:${r.veli_id}`;
      return !excluded.has(key);
    });
  }, [preview, excluded]);

  const toggleExclude = (r: AttendanceNotifyRecipientPreview) => {
    const key = `${r.ogrenci_id}:${r.veli_id}`;
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSend = async () => {
    if (!preview || sendable.length === 0) return;
    setSending(true);
    setError("");
    try {
      const excludeVeliIds = preview.recipients
        .filter((r) => {
          const key = `${r.ogrenci_id}:${r.veli_id}`;
          return r.veli_id && excluded.has(key);
        })
        .map((r) => r.veli_id);

      const res = await sendAttendanceNotify(libraryId, sessionId, {
        event_type: eventType,
        ogrenci_ids: ogrenciIds,
        exclude_veli_ids: excludeVeliIds.length ? excludeVeliIds : undefined,
      });

      if (!res.success) {
        throw new Error((res as { error?: string }).error || "Gönderim başarısız");
      }
      onSent(res.data?.sent ?? 0);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gönderim hatası");
    } finally {
      setSending(false);
    }
  };

  return (
    <YoklamaModalPortal>
      <div className="yok-preview-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="yok-preview-modal" onClick={(e) => e.stopPropagation()}>
          <div className="yok-preview-header">
            <div>
              <h3>Veli bildirimi — {EVENT_LABELS[eventType]}</h3>
              <p>{sessionTitle || "Yoklama oturumu"} · {sendable.length} alıcı gönderilecek</p>
            </div>
            <button type="button" className="yok-notify-btn ghost" onClick={onClose}>✕</button>
          </div>

          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: "#64748b" }}>Önizleme yükleniyor…</div>
          ) : error ? (
            <div style={{ padding: 24, color: "#dc2626", fontSize: 13 }}>{error}</div>
          ) : (
            <div className="yok-preview-list">
              {(preview?.recipients ?? []).map((r) => {
                const key = `${r.ogrenci_id}:${r.veli_id}`;
                const skipped = Boolean(r.skip_reason) || !r.veli_id;
                return (
                  <div key={key} className={`yok-preview-row${skipped ? " skipped" : ""}`}>
                    <label>
                      {!skipped && (
                        <input
                          type="checkbox"
                          checked={!excluded.has(key)}
                          onChange={() => toggleExclude(r)}
                        />
                      )}
                    </label>
                    <div className="yok-preview-recipient">
                      <strong>{r.ogrenci_ad}</strong>
                      <span>
                        {r.veli_ad || "Veli yok"} {r.telefon ? `· ${r.telefon}` : ""}
                        {r.skip_reason ? ` · ${r.skip_reason}` : ""}
                      </span>
                    </div>
                    <div className="yok-preview-message">{r.body || "—"}</div>
                  </div>
                );
              })}
              {preview && preview.recipients.length === 0 && (
                <div style={{ padding: 32, textAlign: "center", color: "#64748b" }}>
                  Bu kriterde bildirilecek öğrenci bulunamadı.
                </div>
              )}
            </div>
          )}

          <div className="yok-preview-footer">
            <button type="button" className="yok-notify-btn ghost" onClick={onClose} disabled={sending}>
              Vazgeç
            </button>
            <button
              type="button"
              className="yok-notify-btn primary"
              onClick={handleSend}
              disabled={sending || loading || sendable.length === 0}
            >
              {sending ? "Gönderiliyor…" : `${sendable.length} veliye gönder`}
            </button>
          </div>
        </div>
      </div>
    </YoklamaModalPortal>
  );
}

export { EVENT_LABELS };
