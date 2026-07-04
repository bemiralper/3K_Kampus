'use client';

import type { ReactNode } from 'react';

type WamFieldProps = {
  label: string;
  hint?: string;
  children: ReactNode;
  full?: boolean;
};

export function WamField({ label, hint, children, full }: WamFieldProps) {
  return (
    <div className={`wam-field ${full ? 'wam-field-full' : ''}`}>
      <label className="wam-field-label">{label}</label>
      {children}
      {hint && <span className="wam-field-hint">{hint}</span>}
    </div>
  );
}

type WamInputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; full?: boolean };

export function WamInput({ label, hint, full, className, ...props }: WamInputProps) {
  return (
    <WamField label={label} hint={hint} full={full}>
      <input className={`wam-input ${className || ''}`} {...props} />
    </WamField>
  );
}

type WamTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; full?: boolean };

export function WamTextarea({ label, hint, full, className, ...props }: WamTextareaProps) {
  return (
    <WamField label={label} hint={hint} full={full}>
      <textarea className={`wam-textarea ${className || ''}`} {...props} />
    </WamField>
  );
}

type WamSelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  full?: boolean;
  options: Array<{ value: string; label: string }>;
};

export function WamSelect({ label, hint, full, options, className, ...props }: WamSelectProps) {
  return (
    <WamField label={label} hint={hint} full={full}>
      <select className={`wam-select ${className || ''}`} {...props}>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </WamField>
  );
}
