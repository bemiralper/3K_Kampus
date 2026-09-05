"use client";

import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

import { IconClose } from "./icons";

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  onClose: () => void;
}

export function ChatDialog({
  open,
  title,
  description,
  children,
  footer,
  width = 420,
  onClose,
}: DialogProps) {
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
    <div className="chat-dialog-backdrop" onMouseDown={onClose}>
      <div
        className="chat-dialog"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="chat-dialog-head">
          <div>
            <h3>{title}</h3>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className="chat-icon-btn" onClick={onClose} aria-label="Kapat">
            <IconClose size={18} />
          </button>
        </div>
        {children ? <div className="chat-dialog-body">{children}</div> : null}
        {footer ? <div className="chat-dialog-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmState {
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

/** Geri alınamayan işlemler için onay penceresi. */
export function ChatConfirmDialog({
  state,
  onClose,
}: {
  state: ConfirmState | null;
  onClose: () => void;
}) {
  return (
    <ChatDialog
      open={!!state}
      title={state?.title ?? ""}
      description={state?.description}
      onClose={onClose}
      width={380}
      footer={
        <>
          <button type="button" className="chat-btn chat-btn--ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button
            type="button"
            className={`chat-btn ${state?.danger ? "chat-btn--danger" : "chat-btn--primary"}`}
            onClick={() => {
              state?.onConfirm();
              onClose();
            }}
          >
            {state?.confirmLabel ?? "Onayla"}
          </button>
        </>
      }
    />
  );
}
