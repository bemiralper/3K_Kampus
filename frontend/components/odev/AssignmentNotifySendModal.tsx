"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  previewAssignmentNotify,
  sendAssignmentNotify,
  type AssignmentNotifyRecipient,
  type AssignmentNotifyType,
} from "@/lib/resources-api";

const TYPE_LABELS: Record<AssignmentNotifyType, string> = {
  plan: "Ödev planı",
  report: "Ödev kontrol raporu",
};

interface AssignmentNotifySendModalProps {
  assignmentId: number;
  notifyType: AssignmentNotifyType;
  studentName?: string;
  /** Rapor gönderiminde sunucu PDF yönü */
  reportOrientation?: "portrait" | "landscape";
  onClose: () => void;
  onSent?: (sent: number, details?: NotifySentDetail[]) => void;
}

export interface NotifySentDetail {
  recipient_type: string;
  display_name: string;
  telefon: string;
  message_status: string;
}

export function formatNotifySentToast(sent: number, details?: NotifySentDetail[]): string {
  if (!details?.length) {
    return `${sent} kişiye WhatsApp ile gönderildi. Mesajlar işletme hattından iletilir.`;
  }
  const targets = details.map((d) => `${d.display_name} (${d.telefon})`).join(" · ");
  return `${sent} kişiye gönderildi: ${targets}. WhatsApp uygulamasında işletme sohbetini kontrol edin.`;
}

function recipientKey(r: AssignmentNotifyRecipient): string {
  if (r.recipient_type === "ogrenci") return `ogrenci:${r.ogrenci_id}`;
  return `veli:${r.ogrenci_id}:${r.veli_id}`;
}

function formatSendHistory(r: AssignmentNotifyRecipient): string | null {
  const count = r.send_count ?? 0;
  if (count <= 0) return null;
  const last = r.last_sent_at ? `Son: ${r.last_sent_at}` : "";
  return `${count} kez gönderildi${last ? ` · ${last}` : ""}`;
}

export default function AssignmentNotifySendModal({
  assignmentId,
  notifyType,
  studentName,
  reportOrientation,
  onClose,
  onSent,
}: AssignmentNotifySendModalProps) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendPhase, setSendPhase] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [previewTitle, setPreviewTitle] = useState("");
  const [recipients, setRecipients] = useState<AssignmentNotifyRecipient[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await previewAssignmentNotify(assignmentId, notifyType);
        if (!res.success || !res.data) {
          throw new Error((res as { error?: string }).error || "Önizleme yüklenemedi");
        }
        if (!cancelled) {
          setPreviewTitle(res.data.assignment_title || "");
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
  }, [assignmentId, notifyType]);

  const sendable = useMemo(
    () => recipients.filter((r) => {
      if (r.skip_reason) return false;
      return !excluded.has(recipientKey(r));
    }),
    [recipients, excluded],
  );

  const toggle = useCallback((r: AssignmentNotifyRecipient) => {
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
      const res = await sendAssignmentNotify(assignmentId, {
        notify_type: notifyType,
        veli_ids: veliIds,
        include_student: includeStudent,
        orientation: notifyType === "report" ? reportOrientation : "portrait",
      });

      if (!res.success) {
        throw new Error((res as { error?: string }).error || "Gönderim başarısız");
      }

      const warning = (res as { warning?: string }).warning;
      const sentCount = res.data?.sent ?? 0;
      const skipped = res.data?.skipped ?? 0;
      const extraErrors = res.data?.errors ?? [];

      if (sentCount === 0) {
        throw new Error(extraErrors[0] || warning || "Hiçbir alıcıya gönderilemedi.");
      }

      onSent?.(sentCount, res.data?.sent_details);

      if (warning || (skipped > 0 && extraErrors.length > 0)) {
        setSuccessMsg(`${formatNotifySentToast(sentCount, res.data?.sent_details)} ${warning || extraErrors[0] || ""}`.trim());
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
              {studentName || previewTitle} · {sendable.length} alıcı seçili · sunucuda PDF oluşturulacak
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={sending} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "#64748b" }}>×</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Alıcılar yükleniyor…</div>
        ) : successMsg ? (
          <div style={{ padding: 24 }}>
            <div style={{ color: "#059669", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{successMsg}</div>
            <button type="button" onClick={onClose} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", cursor: "pointer" }}>
              Tamam
            </button>
          </div>
        ) : error ? (
          <div style={{ padding: 24, color: "#dc2626", fontSize: 13 }}>{error}</div>
        ) : (
          <div style={{ overflowY: "auto", padding: "12px 16px", flex: 1 }}>
            {recipients.map((r) => {
              const key = recipientKey(r);
              const blocked = Boolean(r.skip_reason);
              const checked = !blocked && !excluded.has(key);
              const typeLabel = r.recipient_type === "ogrenci" ? "Öğrenci" : "Veli";
              const historyLabel = formatSendHistory(r);
              return (
                <div
                  key={key}
                  style={{
                    display: "grid", gridTemplateColumns: "28px 1fr", gap: 10,
                    padding: "10px 8px", borderBottom: "1px solid #f1f5f9",
                    opacity: blocked ? 0.55 : 1,
                  }}
                >
                  <label style={{ display: "flex", alignItems: "flex-start", paddingTop: 2 }}>
                    {!blocked && (
                      <input type="checkbox" checked={checked} onChange={() => toggle(r)} />
                    )}
                  </label>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                      {typeLabel}: {r.display_name || "—"}
                      {r.telefon ? ` · ${r.telefon}` : ""}
                    </div>
                    {r.skip_reason && (
                      <div style={{ fontSize: 11, color: "#b45309", marginTop: 2 }}>{r.skip_reason}</div>
                    )}
                    {historyLabel && (
                      <div style={{ fontSize: 11, color: "#0369a1", marginTop: 2, fontWeight: 500 }}>
                        📤 {historyLabel}
                      </div>
                    )}
                    {(r.send_history?.length ?? 0) > 0 && (
                      <details style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
                        <summary style={{ cursor: "pointer" }}>Gönderim geçmişi</summary>
                        <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                          {r.send_history!.map((h, i) => (
                            <li key={i}>{h.sent_at} · {h.status}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <div style={{
                      fontSize: 11, color: "#64748b", marginTop: 6, whiteSpace: "pre-wrap",
                      maxHeight: 60, overflow: "hidden", lineHeight: 1.4,
                    }}>
                      {r.body}
                    </div>
                  </div>
                </div>
              );
            })}
            {recipients.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: "#64748b" }}>Gönderilecek alıcı bulunamadı.</div>
            )}
          </div>
        )}

        {!successMsg && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={onClose} disabled={sending} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer" }}>
              Vazgeç
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || loading || sendable.length === 0 || Boolean(successMsg)}
              style={{
                padding: "8px 16px", borderRadius: 8, border: "none",
                background: sendable.length ? "#059669" : "#94a3b8",
                color: "#fff", fontWeight: 600, cursor: sendable.length ? "pointer" : "not-allowed",
              }}
            >
              {sendButtonLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
