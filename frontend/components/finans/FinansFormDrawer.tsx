"use client";

import type { FormEvent, ReactNode } from "react";
import "./finans-drawer.css";

export type FinansDrawerVariant = "gelir" | "gider" | "neutral";

export interface FinansFormDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  variant?: FinansDrawerVariant;
  error?: string | null;
  footer?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  embeddedForm?: boolean;
  formId?: string;
  onSubmit?: (e: FormEvent) => void;
  /** Rozetin yanında gösterilecek gradyanlı ikon rozeti (opsiyonel). */
  headerIcon?: ReactNode;
  /** Başlığın altına yerleştirilecek adım göstergesi (opsiyonel, wizard akışları için). */
  stepper?: ReactNode;
}

const BADGE: Record<Exclude<FinansDrawerVariant, "neutral">, string> = {
  gelir: "Gelir",
  gider: "Gider",
};

export default function FinansFormDrawer({
  open,
  onClose,
  title,
  subtitle,
  variant = "neutral",
  error,
  footer,
  children,
  wide = false,
  embeddedForm = false,
  formId,
  onSubmit,
  headerIcon,
  stepper,
}: FinansFormDrawerProps) {
  if (!open) return null;

  const panelClass = [
    "fd-panel",
    wide && "fd-panel--wide",
    variant === "gelir" && "fd-panel--gelir",
    variant === "gider" && "fd-panel--gider",
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      <header className="fd-header">
        <div className="fd-header-row">
          {headerIcon ? (
            <div className="fd-header-identity">
              <span className={`fd-header-icon${variant !== "neutral" ? ` fd-header-icon--${variant}` : ""}`}>
                {headerIcon}
              </span>
              {variant !== "neutral" && (
                <span className={`fd-badge fd-badge--${variant}`}>{BADGE[variant]}</span>
              )}
            </div>
          ) : variant !== "neutral" ? (
            <span className={`fd-badge fd-badge--${variant}`}>{BADGE[variant]}</span>
          ) : (
            <span />
          )}
          <button type="button" className="fd-close" onClick={onClose} aria-label="Kapat">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <h2 id="finans-drawer-title" className="fd-title">{title}</h2>
        {subtitle && <p className="fd-subtitle">{subtitle}</p>}
        {stepper}
      </header>

      {error && (
        <div className="fd-alert" role="alert">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20" style={{ flexShrink: 0, marginTop: 2 }}>
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {embeddedForm ? children : <div className="fd-body">{children}</div>}

      {footer && <footer className="fd-footer">{footer}</footer>}
    </>
  );

  return (
    <>
      <div className="fd-overlay" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-labelledby="finans-drawer-title" className={panelClass}>
        {embeddedForm && formId ? (
          <form id={formId} onSubmit={onSubmit} noValidate className="fd-form-embedded">
            {inner}
          </form>
        ) : (
          inner
        )}
      </div>
    </>
  );
}

export function FinansDrawerButton({
  variant = "primary",
  tone = "emerald",
  className = "",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
  tone?: "emerald" | "rose";
}) {
  const cls =
    variant === "ghost"
      ? "fd-btn fd-btn--ghost"
      : `fd-btn fd-btn--${tone}`;

  return <button type={type} className={`${cls} ${className}`.trim()} {...props} />;
}
