"use client";

import { CampaignPreviewStats } from "@/lib/communication-api";
import WhatsAppPhonePreview from "./WhatsAppPhonePreview";
import type { PreviewAttachment } from "./WhatsAppPhonePreview";

interface SendConfirmModalProps {
  open: boolean;
  preview: CampaignPreviewStats | null;
  title: string;
  body: string;
  attachments: PreviewAttachment[];
  aiUsed: boolean;
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
  submitting = false,
  error = null,
  onConfirm,
  onCancel,
}: SendConfirmModalProps) {
  if (!open || !preview) return null;

  const pdfCount = attachments.filter((a) => a.mime_type.includes("pdf")).length;
  const imageCount = attachments.filter((a) => a.mime_type.startsWith("image/")).length;
  const cost = preview.estimated_cost_usd ?? "0";

  return (
    <div className="comm-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="comm-modal comm-confirm-modal">
        <h2 id="confirm-title">Gönderim Onayı</h2>

        <table className="comm-confirm-table">
          <tbody>
            <tr><th>Toplam alıcı</th><td>{preview.total_recipients}</td></tr>
            <tr><th>Öğrenci</th><td>{preview.ogrenci_count}</td></tr>
            <tr><th>Veli</th><td>{preview.veli_count}</td></tr>
            <tr><th>PDF</th><td>{pdfCount}</td></tr>
            <tr><th>Resim</th><td>{imageCount}</td></tr>
            <tr><th>Tahmini mesaj</th><td>{preview.estimated_messages}</td></tr>
            <tr><th>AI kullanımı</th><td>{aiUsed ? "Öneri alındı (gönderilmedi)" : "Yok"}</td></tr>
            <tr><th>Tahmini maliyet</th><td>${cost} USD</td></tr>
            {title && <tr><th>Başlık</th><td>{title}</td></tr>}
          </tbody>
        </table>

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
