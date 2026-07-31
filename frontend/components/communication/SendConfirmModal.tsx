"use client";

import { CampaignPreviewStats, renderSampleMessage } from "@/lib/communication-api";
import { resolvePreviewVariables } from "./composer-utils";
import WhatsAppPhonePreview from "./WhatsAppPhonePreview";
import type { PreviewAttachment } from "./WhatsAppPhonePreview";

interface SendConfirmModalProps {
  open: boolean;
  preview: CampaignPreviewStats | null;
  title: string;
  body: string;
  attachments: PreviewAttachment[];
  aiUsed: boolean;
  accountLabel?: string;
  submitting?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SendConfirmModal({
  open,
  preview,
  title,
  body,
  attachments,
  aiUsed,
  accountLabel,
  submitting = false,
  error = null,
  onConfirm,
  onCancel,
}: SendConfirmModalProps) {
  if (!open || !preview) return null;

  const pdfCount = attachments.filter((a) => a.mime_type.includes("pdf")).length;
  const imageCount = attachments.filter((a) => a.mime_type.startsWith("image/")).length;
  const cost = preview.estimated_cost_usd ?? "0";
  const samples = (preview.recipients || []).slice(0, 3);

  return (
    <div className="comm-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="comm-modal comm-confirm-modal">
        <h2 id="confirm-title">Gönderim Onayı</h2>

        <div className="comm-breakdown-grid">
          <div className="comm-breakdown-item">
            <strong>{preview.total_recipients}</strong>
            <span>Toplam alıcı</span>
          </div>
          <div className="comm-breakdown-item">
            <strong>{preview.ogrenci_count}</strong>
            <span>Öğrenci</span>
          </div>
          <div className="comm-breakdown-item">
            <strong>{preview.veli_count}</strong>
            <span>Veli</span>
          </div>
        </div>

        <table className="comm-confirm-table">
          <tbody>
            {accountLabel && <tr><th>Gönderim hesabı</th><td>{accountLabel}</td></tr>}
            <tr><th>PDF</th><td>{pdfCount}</td></tr>
            <tr><th>Resim</th><td>{imageCount}</td></tr>
            <tr><th>Tahmini mesaj</th><td>{preview.estimated_messages}</td></tr>
            <tr><th>AI kullanımı</th><td>{aiUsed ? "Öneri alındı (gönderilmedi)" : "Yok"}</td></tr>
            <tr><th>Tahmini maliyet</th><td>${cost} USD</td></tr>
            {title && <tr><th>Başlık</th><td>{title}</td></tr>}
          </tbody>
        </table>

        {samples.length > 0 && body && (
          <div>
            <p className="comm-drawer-subtitle" style={{ marginBottom: "0.35rem" }}>
              Örnek mesajlar ({samples.length})
            </p>
            <div className="comm-sample-messages">
              {samples.map((r, i) => (
                <div key={`${r.e164}-${i}`} className="comm-sample-message">
                  <strong>{r.display_name || r.e164} ({r.recipient_type})</strong>
                  {resolvePreviewVariables(renderSampleMessage(body, r))}
                </div>
              ))}
            </div>
          </div>
        )}

        {body && (
          <div className="comm-confirm-preview">
            <WhatsAppPhonePreview text={body} attachments={attachments} />
          </div>
        )}

        {error && <div className="comm-alert comm-alert-danger">{error}</div>}

        <div className="comm-modal-actions">
          <button type="button" className="comm-btn-secondary" onClick={onCancel} disabled={submitting}>
            İptal
          </button>
          <button type="button" className="comm-btn-primary" onClick={onConfirm} disabled={submitting}>
            {submitting ? "Gönderiliyor…" : "Onayla ve Gönder"}
          </button>
        </div>
      </div>
    </div>
  );
}
