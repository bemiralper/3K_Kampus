'use client';

import { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { IconAlertTriangle, IconCheckCircle, IconClose } from './icons';

export type OzelDersToastType = 'success' | 'error' | 'info';

type Props = {
  message: string;
  type?: OzelDersToastType;
  onClose: () => void;
};

const STYLES: Record<OzelDersToastType, { bg: string; border: string; color: string }> = {
  success: { bg: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '#86efac', color: '#166534' },
  error: { bg: 'linear-gradient(135deg, #fef2f2, #fee2e2)', border: '#fca5a5', color: '#991b1b' },
  info: { bg: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '#93c5fd', color: '#1e40af' },
};

export default function OzelDersToast({ message, type = 'success', onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => setVisible(true), 10);
    return () => window.clearTimeout(t);
  }, [message]);

  useEffect(() => {
    if (!message) return;
    const ms = type === 'error' ? 5500 : 3200;
    const t = window.setTimeout(onClose, ms);
    return () => window.clearTimeout(t);
  }, [message, type, onClose]);

  if (!mounted || !message) return null;
  const s = STYLES[type];

  return ReactDOM.createPortal(
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 18,
        right: 18,
        zIndex: 10050,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        maxWidth: 'min(420px, calc(100vw - 32px))',
        padding: '13px 15px',
        borderRadius: 13,
        fontSize: 13.5,
        fontWeight: 500,
        lineHeight: 1.4,
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.16)',
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-8px)',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex' }}>
        {type === 'error' ? <IconAlertTriangle size={17} /> : <IconCheckCircle size={17} />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Kapat"
        style={{
          flexShrink: 0,
          display: 'flex',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'inherit',
          opacity: 0.7,
          padding: 0,
        }}
      >
        <IconClose size={15} />
      </button>
    </div>,
    document.body,
  );
}

export function useOzelDersToast() {
  const [toast, setToast] = useState<{ message: string; type: OzelDersToastType } | null>(null);

  const hide = useCallback(() => setToast(null), []);
  const show = useCallback((message: string, type: OzelDersToastType = 'success') => {
    setToast({ message, type });
  }, []);

  const node = toast ? <OzelDersToast message={toast.message} type={toast.type} onClose={hide} /> : null;
  return { show, hide, node };
}
