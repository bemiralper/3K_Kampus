"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  previewMakbuzNotify,
  previewOdemeNotify,
  sendMakbuzNotify,
  sendOdemeNotify,
  type OdemeNotifyRecipient,
  type OdemeNotifyType,
} from "@/lib/odeme-notify-api";

const TYPE_LABELS: Record<OdemeNotifyType, string> = {
  plan: "Ödeme Planı",
  makbuz: "Tahsilat Makbuzu",
  sozlesme: "Sözleşme Belgesi",
};

interface OdemeNotifySendModalProps {
  notifyType: OdemeNotifyType;
  sozlesmeId?: number;
  tahsilatId?: number;
  studentName?: string;
  onClose: () => void;
  onSent?: (sent: number, details?: NotifySentDetail[]) => void;
}

export interface NotifySentDetail {
  recipient_type?: string;
  display_name: string;
  telefon: string;
  message_status?: string;
}

export function formatNotifySentToast(sent: number, details?: NotifySentDetail[]): string {
  if (!details?.length) {
    return `${sent} kişiye WhatsApp ile gönderildi. Mesajlar işletme hattından iletilir.`;
  }
  const targets = details.map((d) => `${d.display_name} (${d.telefon})`).join(" · ");
  return `${sent} kişiye gönderildi: ${targets}. WhatsApp uygulamasında işletme sohbetini kontrol edin.`;
}

function recipientKey(r: OdemeNotifyRecipient): string {
  if (r.recipient_type === "ogrenci") return `ogrenci:${r.ogrenci_id}`;
  return `veli:${r.ogrenci_id}:${r.veli_id}`;
}

function formatSendHistory(r: OdemeNotifyRecipient): string | null {
  const count = r.send_count ?? 0;
  if (count <= 0) return null;
  const last = r.last_sent_at ? `Son: ${r.last_sent_at}` : "";
  return `${count} kez gönderildi${last ? ` · ${last}` : ""}`;
}

export default function OdemeNotifySendModal({
  notifyType,
  sozlesmeId,
  tahsilatId,
  studentName,
  onClose,
  onSent,
}: OdemeNotifySendModalProps) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendPhase, setSendPhase] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [previewTitle, setPreviewTitle] = useState("");
  const [recipients, setRecipients] = useState<OdemeNotifyRecipient[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res =
          notifyType === "makbuz" && tahsilatId
            ? await previewMakbuzNotify(tahsilatId)
            : sozlesmeId
              ? await previewOdemeNotify(sozlesmeId, notifyType === "sozlesme" ? "sozlesme" : "plan")
              : null;

        if (!res?.success || !res.data) {
          throw new Error((res as { error?: string })?.error || "Önizleme yüklenemedi");
        }
        if (!cancelled) {
          setPreviewTitle(res.data.sozlesme_no || "");
          setRecipients(res.data.recipients || []);
          const initialExcluded = new Set<string>();
          for (const r of res.data.recipients || []) {
            if (r.skip_reason) initialExcluded.add(recipientKey(r));
          }
          setExcluded(initialExcluded);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Hata");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [notifyType, sozlesmeId, tahsilatId]);

  const sendable = useMemo(
    () => recipients.filter((r) => {
      if (r.skip_reason) return false;
      return !excluded.has(recipientKey(r));
    }),
    [recipients, excluded],
  );

  const toggle = useCallback((r: OdemeNotifyRecipient) => {
    const key = recipientKey(r);
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSend = async () => {
    if (sendable.length === 0) return;
    setSending(true);
    setError("");
    setSuccessMsg("");
    try {
      const veliIds = sendable
        .filter((r) => r.recipient_type === "veli" && r.veli_id)
        .map((r) => r.veli_id as number);
      const includeStudent = sendable.some((r) => r.recipient_type === "ogrenci");

      setSendPhase("PDF hazırlanıyor…");

      const res =
        notifyType === "makbuz" && tahsilatId
          ? await sendMakbuzNotify(tahsilatId, { veli_ids: veliIds, include_student: includeStudent })
          : sozlesmeId
            ? await sendOdemeNotify(sozlesmeId, {
                notify_type: notifyType === "sozlesme" ? "sozlesme" : "plan",
                veli_ids: veliIds,
                include_student: includeStudent,
              })
            : null;

      if (!res?.success) {
        throw new Error((res as { error?: string })?.error || "Gönderim başarısız");
      }

      const sentCount = res.data?.sent ?? 0;
      const skipped = res.data?.skipped ?? 0;
      const extraErrors = res.data?.errors ?? [];

      if (sentCount === 0) {
        throw new Error(extraErrors[0] || "Hiçbir alıcıya gönderilemedi.");
      }

      onSent?.(sentCount, res.data?.sent_details);

      if (skipped > 0 && extraErrors.length > 0) {
        setSuccessMsg(`${formatNotifySentToast(sentCount, res.data?.sent_details)} ${extraErrors[0] || ""}`.trim());
        return;
      }

      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gönderim hatası");
    } finally {
      setSending(false);
      setSendPhase("");
    }
  };

  const sendButtonLabel = sending
    ? (sendPhase || "Gönderiliyor…")
    : `${sendable.length} kişiye gönder`;

  const displayName = studentName || previewTitle;

  return (
    <div
      className="odev-notify-overlay"
      onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 3000,
        background: "rgba(15,23,42,0.55)", display: "flex",
        alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff", borderRadius: 14, width: "100%", maxWidth: 640,
          maxHeight: "88vh", display: "flex", flexDirection: "column",
          boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
              WhatsApp — {TYPE_LABELS[notifyType]}
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
              {displayName} · {sendable.length} alıcı seçili · sunucuda PDF oluşturulacak
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "#94a3b8" }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
          {loading && <p style={{ color: "#64748b", fontSize: 13 }}>Alıcılar yükleniyor…</p>}
          {error && (
            <div style={{ padding: 10, background: "#fef2f2", borderRadius: 8, color: "#b91c1c", fontSize: 13, marginBottom: 8 }}>
              {error}
            </div>
          )}
          {successMsg && (
            <div style={{ padding: 10, background: "#ecfdf5", borderRadius: 8, color: "#047857", fontSize: 13, marginBottom: 8 }}>
              {successMsg}
            </div>
          )}
          {!loading && recipients.map((r) => {
            const key = recipientKey(r);
            const checked = !excluded.has(key);
            const history = formatSendHistory(r);
            return (
              <label
                key={key}
                style={{
                  display: "flex", gap: 12, padding: "10px 0",
                  borderBottom: "1px solid #f1f5f9", cursor: r.skip_reason ? "not-allowed" : "pointer",
                  opacity: r.skip_reason ? 0.55 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked && !r.skip_reason}
                  disabled={!!r.skip_reason || sending}
                  onChange={() => toggle(r)}
                  style={{ marginTop: 4 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>
                    {r.recipient_type === "veli" ? "Veli" : "Öğrenci"} — {r.display_name || "—"}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{r.telefon || "Telefon yok"}</div>
                  {r.skip_reason && (
                    <div style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>{r.skip_reason}</div>
                  )}
                  {history && (
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{history}</div>
                  )}
                  <pre style={{
                    marginTop: 6, fontSize: 10, color: "#475569", whiteSpace: "pre-wrap",
                    background: "#f8fafc", padding: 8, borderRadius: 6, fontFamily: "inherit",
                  }}>
                    {r.body}
                  </pre>
                </div>
              </label>
            );
          })}
        </div>

        <div style={{ padding: "14px 20px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer" }}
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || loading || sendable.length === 0}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none",
              background: sending || sendable.length === 0 ? "#93c5fd" : "#25D366",
              color: "#fff", fontWeight: 600, cursor: sending ? "wait" : "pointer",
            }}
          >
            {sendButtonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
