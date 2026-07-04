"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function FSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="fd-section">
      <h3 className="fd-section-title">{title}</h3>
      {children}
    </div>
  );
}

export function FField({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="fd-field">
      <label className="fd-label">
        {label}
        {required && <em> *</em>}
      </label>
      {hint && <span className="fd-hint">{hint}</span>}
      {children}
      {error && <p className="fd-field-error">{error}</p>}
    </div>
  );
}

export function FInput({
  error,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return (
    <input
      className={`fd-input${error ? " fd-input--error" : ""} ${className}`.trim()}
      {...props}
    />
  );
}

export function FSelect({
  error,
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }) {
  return (
    <select
      className={`fd-select${error ? " fd-select--error" : ""} ${className}`.trim()}
      {...props}
    >
      {children}
    </select>
  );
}

export function FTextarea({
  error,
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  return (
    <textarea
      className={`fd-textarea${error ? " fd-textarea--error" : ""} ${className}`.trim()}
      {...props}
    />
  );
}

export function FAmountHero({
  variant,
  label,
  value,
  onChange,
  error,
}: {
  variant: "gelir" | "gider";
  label: string;
  value: number | string;
  onChange: (v: number) => void;
  error?: string;
}) {
  return (
    <div className={`fd-amount-block fd-amount-block--${variant}`}>
      <p className="fd-amount-label">{label}</p>
      <div className="fd-amount-input-wrap">
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          className={`fd-amount-input${error ? " fd-input--error" : ""}`}
          value={value || ""}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          placeholder="0"
        />
        <span className="fd-amount-currency">₺</span>
      </div>
      {error && <p className="fd-field-error" style={{ marginTop: 12 }}>{error}</p>}
    </div>
  );
}

export function FSummaryCard({ children }: { children: ReactNode }) {
  return <div className="fd-summary-card">{children}</div>;
}

export function FReviewRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="fd-summary-row">
      <span className="fd-summary-label">{label}</span>
      <span className={`fd-summary-value${muted ? " fd-summary-value--muted" : ""}`}>{value}</span>
    </div>
  );
}

export function FKpiRow({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="fd-section" style={{ paddingTop: 14, paddingBottom: 14 }}>
      <div className="fd-kpi-row">
        {items.map((item) => (
          <div key={item.label} className="fd-kpi">
            <div className="fd-kpi-label">{item.label}</div>
            <div className="fd-kpi-value">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
