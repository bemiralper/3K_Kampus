"use client";

import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * İletişim sayfaları için onay / bilgi penceresi.
 * `components/chat/ChatDialog` ile aynı davranış (portal, Escape, backdrop);
 * `chat-*` değişkenleri yalnız `.chat-workspace` içinde tanımlı olduğu için
 * burada `comm-*` sınıfları kullanılır.
 */
interface CommDialogProps {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  onClose: () => void;
}

export function CommDialog({
  open,
  title,
  description,
  children,
  footer,
  width = 440,
  onClose,
}: CommDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="comm-dialog-backdrop" onMouseDown={onClose}>
      <div
        className="comm-dialog"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="comm-dialog-head">
          <div>
            <h3>{title}</h3>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className="comm-dialog-close" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </div>
        {children ? <div className="comm-dialog-body">{children}</div> : null}
        {footer ? <div className="comm-dialog-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export interface CommConfirmState {
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

/** Geri alınamayan işlemler için onay penceresi (Vazgeç / Onayla). */
export function CommConfirmDialog({
  state,
  busy = false,
  onClose,
}: {
  state: CommConfirmState | null;
  busy?: boolean;
  onClose: () => void;
}) {
  return (
    <CommDialog
      open={!!state}
      title={state?.title ?? ""}
      description={state?.description}
      onClose={onClose}
      width={400}
      footer={
        <>
          <button type="button" className="comm-btn-secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button
            type="button"
            className={state?.danger ? "comm-btn-secondary comm-btn-danger" : "comm-btn-primary"}
            disabled={busy}
            onClick={() => {
              const result = state?.onConfirm();
              onClose();
              void result;
            }}
          >
            {busy ? "…" : state?.confirmLabel ?? "Onayla"}
          </button>
        </>
      }
    />
  );
}
