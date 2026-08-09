"use client";

import { useEffect } from "react";
import { CampaignPreviewStats, renderSampleMessage } from "@/lib/communication-api";
import { resolvePreviewVariables } from "./composer-utils";
import WhatsAppPhonePreview from "./WhatsAppPhonePreview";
import type { PreviewAttachment } from "./WhatsAppPhonePreview";
import { useLivePreviewContext } from "./useLivePreviewContext";

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

const TYPE_LABEL: Record<string, string> = {
  VELI: "Veli",
  OGRENCI: "Öğrenci",
  PERSONEL: "Personel",
};

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
  const livePreviewContext = useLivePreviewContext();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onCancel]);

  if (!open || !preview) return null;

  const pdfCount = attachments.filter((a) => a.mime_type.includes("pdf")).length;
  const imageCount = attachments.filter((a) => a.mime_type.startsWith("image/")).length;
  const samples = (preview.recipients || []).slice(0, 4);
  const personelCount = preview.personel_count ?? 0;
  const invalidPhones = preview.invalid_phones ?? 0;
  const messageCount = preview.estimated_messages ?? preview.total_recipients;

  const chips: { label: string; value: string }[] = [];
  if (accountLabel) chips.push({ label: "Hesap", value: accountLabel });
  if (title.trim()) chips.push({ label: "Başlık", value: title.trim() });
  if (pdfCount) chips.push({ label: "PDF", value: String(pdfCount) });
  if (imageCount) chips.push({ label: "Görsel", value: String(imageCount) });
  if (aiUsed) chips.push({ label: "AI", value: "Öneri kullanıldı" });

  return (
    <div
      className="comm-modal-overlay"
      role="presentation"
      onClick={() => {
        if (!submitting) onCancel();
      }}
    >
      <div
        className="comm-confirm-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="comm-confirm-sheet-head">
          <div>
            <p className="comm-confirm-sheet-kicker">Toplu WhatsApp gönderimi</p>
            <h2 id="confirm-title">Gönderimi onayla</h2>
            <p className="comm-confirm-sheet-lead">
              Mesaj kuyruğa alınır; alıcılar WhatsApp üzerinden bilgilendirilir.
            </p>
          </div>
          <button
            type="button"
            className="comm-confirm-sheet-close"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Kapat"
          >
            ×
          </button>
        </header>

        <div className="comm-confirm-sheet-body">
          <div className="comm-confirm-sheet-main">
            <div className="comm-confirm-stats" aria-label="Alıcı özeti">
              <div className="comm-confirm-stat is-primary">
                <strong>{preview.total_recipients}</strong>
                <span>Toplam alıcı</span>
              </div>
              <div className="comm-confirm-stat">
                <strong>{preview.veli_count}</strong>
                <span>Veli</span>
              </div>
              <div className="comm-confirm-stat">
                <strong>{preview.ogrenci_count}</strong>
                <span>Öğrenci</span>
              </div>
              {personelCount > 0 && (
                <div className="comm-confirm-stat">
                  <strong>{personelCount}</strong>
                  <span>Personel</span>
                </div>
              )}
              <div className="comm-confirm-stat">
                <strong>{messageCount}</strong>
                <span>Tahmini mesaj</span>
              </div>
            </div>

            {chips.length > 0 && (
              <ul className="comm-confirm-chips">
                {chips.map((c) => (
                  <li key={`${c.label}-${c.value}`}>
                    <span>{c.label}</span>
                    <strong>{c.value}</strong>
                  </li>
                ))}
              </ul>
            )}

            {invalidPhones > 0 && (
              <div className="comm-confirm-warn" role="status">
                {invalidPhones} geçersiz telefon numarası atlanacak.
              </div>
            )}

            {samples.length > 0 && body ? (
              <section className="comm-confirm-samples" aria-label="Örnek alıcılar">
                <div className="comm-confirm-section-label">
                  Örnek alıcılar
                  <span>{samples.length} / {preview.total_recipients}</span>
                </div>
                <ul className="comm-confirm-sample-list">
                  {samples.map((r, i) => {
                    const typeKey = (r.recipient_type || "").toUpperCase();
                    return (
                      <li key={`${r.e164}-${i}`}>
                        <div className="comm-confirm-sample-meta">
                          <strong>{r.display_name || r.e164}</strong>
                          <span className="comm-confirm-type-pill">
                            {TYPE_LABEL[typeKey] || r.recipient_type || "Alıcı"}
                          </span>
                        </div>
                        <p>
                          {resolvePreviewVariables(
                            renderSampleMessage(body, r),
                            livePreviewContext,
                          )}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : body ? (
              <section className="comm-confirm-samples">
                <div className="comm-confirm-section-label">Mesaj özeti</div>
                <p className="comm-confirm-body-snippet">
                  {resolvePreviewVariables(body, livePreviewContext)}
                </p>
              </section>
            ) : null}

            {error && <div className="comm-alert comm-alert-danger">{error}</div>}
          </div>

          {body && (
            <aside className="comm-confirm-sheet-aside" aria-label="WhatsApp önizleme">
              <div className="comm-confirm-section-label">Önizleme</div>
              <div className="comm-confirm-preview">
                <WhatsAppPhonePreview text={body} attachments={attachments} />
              </div>
            </aside>
          )}
        </div>

        <footer className="comm-confirm-sheet-foot">
          <p className="comm-confirm-foot-hint">
            Onay sonrası gönderim arka planda işlenir; iptal etmek kuyruk ekranından yapılır.
          </p>
          <div className="comm-confirm-sheet-actions">
            <button
              type="button"
              className="comm-btn-secondary"
              onClick={onCancel}
              disabled={submitting}
            >
              Vazgeç
            </button>
            <button
              type="button"
              className="comm-btn-primary"
              onClick={onConfirm}
              disabled={submitting || preview.total_recipients < 1}
            >
              {submitting
                ? "Gönderiliyor…"
                : `${preview.total_recipients} kişiye gönder`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
