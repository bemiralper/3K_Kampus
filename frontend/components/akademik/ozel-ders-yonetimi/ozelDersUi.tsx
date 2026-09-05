'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconChevronDown, IconClose, IconInbox } from './icons';

/* -------------------------------------------------------------------------
   Page header (title + description + primary actions)
   ------------------------------------------------------------------------- */
export function PageHeader({
  icon,
  title,
  description,
  actions,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="od-head">
      <div>
        <h2 className="od-head-title">
          {icon && <span className="od-head-icon">{icon}</span>}
          {title}
        </h2>
        {description && <p className="od-head-desc">{description}</p>}
      </div>
      {actions && <div className="od-head-actions">{actions}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Filter bar (toolbar wrapper for date/segmented/search rows)
   ------------------------------------------------------------------------- */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="od-toolbar">{children}</div>;
}

export function FilterField({
  label,
  children,
  style,
}: {
  label: string;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className="od-filter-field" style={style}>
      <label>{label}</label>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Collapsible panel (ör. daraltılabilir ayarlar bölümü)
   ------------------------------------------------------------------------- */
export function Collapsible({
  icon,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`od-collapsible${open ? ' is-open' : ''}`}>
      <button type="button" className="od-collapsible-head" onClick={() => setOpen((v) => !v)}>
        {icon && <span className="od-collapsible-icon">{icon}</span>}
        <span className="od-collapsible-title">{title}</span>
        {!open && summary && <span className="od-collapsible-summary">{summary}</span>}
        <IconChevronDown size={16} className="od-collapsible-chevron" />
      </button>
      {open && <div className="od-collapsible-body">{children}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Mini progress (ör. kota/slot doluluk göstergesi)
   ------------------------------------------------------------------------- */
export function MiniProgress({
  value,
  max,
  tone = 'blue',
}: {
  value: number;
  max: number;
  tone?: StatTone;
}) {
  const pct = max > 0 ? Math.min(Math.max((value / max) * 100, 0), 100) : 0;
  return (
    <div className="od-mini-progress">
      <div className="od-mini-progress-track">
        <i className={tone} style={{ width: `${pct}%` }} />
      </div>
      <span className="od-mini-progress-label">
        {value}/{max}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Stat cards
   ------------------------------------------------------------------------- */
export type StatTone = 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'teal' | 'pink' | 'slate';

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="od-stats">{children}</div>;
}

export function StatCard({
  icon,
  tone = 'blue',
  value,
  label,
  onClick,
}: {
  icon: ReactNode;
  tone?: StatTone;
  value: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`od-stat${onClick ? ' is-clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className={`od-stat-icon ${tone}`}>{icon}</div>
      <div className="od-stat-info">
        <span className="od-stat-value">{value}</span>
        <span className="od-stat-label">{label}</span>
      </div>
    </div>
  );
}

export function StatSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="od-stats">
      {Array.from({ length: count }).map((_, i) => (
        <div className="od-stat" key={i}>
          <div className="od-skeleton" style={{ width: 40, height: 40, borderRadius: 11 }} />
          <div style={{ flex: 1 }}>
            <div className="od-skeleton od-skeleton-text" style={{ width: '60%', marginBottom: 6 }} />
            <div className="od-skeleton od-skeleton-text" style={{ width: '85%', height: 9 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Empty state
   ------------------------------------------------------------------------- */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="od-empty">
      <div className="od-empty-icon">{icon ?? <IconInbox size={24} />}</div>
      <h4>{title}</h4>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Skeletons
   ------------------------------------------------------------------------- */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div className="od-skeleton-row" key={i}>
          <div className="od-skeleton" style={{ width: 30, height: 30, borderRadius: '50%' }} />
          <div className="od-skeleton od-skeleton-text" style={{ width: 110 }} />
          <div className="od-skeleton od-skeleton-text" style={{ width: 80 }} />
          <div className="od-skeleton od-skeleton-text" style={{ width: 140 }} />
          <div className="od-skeleton od-skeleton-text" style={{ width: 60, marginLeft: 'auto' }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="od-grid-cards">
      {Array.from({ length: count }).map((_, i) => (
        <div className="od-entity-card" key={i} style={{ cursor: 'default' }}>
          <div className="od-entity-card-top">
            <div className="od-skeleton" style={{ width: 34, height: 34, borderRadius: '50%' }} />
            <div style={{ flex: 1 }}>
              <div className="od-skeleton od-skeleton-text" style={{ width: '70%' }} />
              <div className="od-skeleton od-skeleton-text" style={{ width: '45%', height: 9 }} />
            </div>
          </div>
          <div className="od-skeleton od-skeleton-text" style={{ width: '100%', height: 24 }} />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Drawer
   ------------------------------------------------------------------------- */
let bodyLockCount = 0;
let bodyOverflowBackup = '';
const closeStack: Array<() => void> = [];
let escapeBound = false;

function onDocumentEscape(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  closeStack[closeStack.length - 1]?.();
}

function lockBodyScroll(close: () => void) {
  if (typeof document === 'undefined') return;
  if (bodyLockCount === 0) {
    bodyOverflowBackup = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  bodyLockCount += 1;
  closeStack.push(close);
  if (!escapeBound) {
    document.addEventListener('keydown', onDocumentEscape);
    escapeBound = true;
  }
}

function unlockBodyScroll(close: () => void) {
  if (typeof document === 'undefined') return;
  const idx = closeStack.lastIndexOf(close);
  if (idx >= 0) closeStack.splice(idx, 1);
  bodyLockCount = Math.max(0, bodyLockCount - 1);
  if (bodyLockCount === 0) {
    document.body.style.overflow = bodyOverflowBackup;
    bodyOverflowBackup = '';
    if (escapeBound) {
      document.removeEventListener('keydown', onDocumentEscape);
      escapeBound = false;
    }
  }
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  wide,
  layer = 0,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  wide?: boolean;
  layer?: number;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const close = () => onCloseRef.current();
    lockBodyScroll(close);
    return () => unlockBodyScroll(close);
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="od-drawer-overlay"
      style={layer ? { zIndex: 2400 + layer } : undefined}
      onClick={onClose}
    >
      <div
        className={`od-drawer${wide ? ' od-drawer-wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="od-drawer-header">
          <div>
            <h3>{title}</h3>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="od-drawer-close" onClick={onClose} aria-label="Kapat">
            <IconClose size={16} />
          </button>
        </div>
        <div className="od-drawer-body">{children}</div>
        {footer && <div className="od-drawer-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------
   Segmented control (view switcher)
   ------------------------------------------------------------------------- */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="od-segmented">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={value === opt.value ? 'active' : ''}
          onClick={() => onChange(opt.value)}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Badge
   ------------------------------------------------------------------------- */
export type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'primary' | 'purple' | 'secondary';

export function Badge({ tone = 'secondary', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`od-badge ${tone}`}>{children}</span>;
}

/* -------------------------------------------------------------------------
   Domain helpers — durum / hakediş görselleştirme
   (Yalnızca frontend etiketleme; iş kuralı / veri değişmez.)
   ------------------------------------------------------------------------- */
export function oturumDurumTone(durum: string): BadgeTone {
  switch (durum) {
    case 'ISLENDI':
      return 'success';
    case 'ONLINE':
      return 'info';
    case 'IPTAL':
      return 'danger';
    case 'OGRENCI_GELMEDI':
      return 'purple';
    case 'OGRETMEN_GELMEDI':
      return 'danger';
    default:
      return 'secondary';
  }
}

export function telafiDurumTone(telafiDurumu: string): BadgeTone {
  switch (telafiDurumu) {
    case 'BEKLENIYOR':
      return 'warning';
    case 'PLANLANDI':
      return 'info';
    case 'EDILDI':
      return 'success';
    case 'GEREKMIYOR':
      return 'secondary';
    default:
      return 'secondary';
  }
}

export function hakedisDurumTone(durum: string): BadgeTone {
  switch (durum) {
    case 'ONAYLANDI':
      return 'success';
    case 'BORDOYA_ISLENDI':
      return 'purple';
    case 'IPTAL':
      return 'danger';
    default:
      return 'info';
  }
}

export function feeStatus(oturum: {
  durum: string;
  telafi_durumu?: string;
  has_hakedis: boolean;
}): { tone: BadgeTone; label: string } {
  if (['IPTAL', 'OGRENCI_GELMEDI', 'OGRETMEN_GELMEDI'].includes(oturum.durum)) {
    return { tone: 'secondary', label: 'Ücret Oluşmaz' };
  }
  if (oturum.telafi_durumu === 'BEKLENIYOR') {
    return { tone: 'warning', label: 'Telafi Bekliyor' };
  }
  if (oturum.durum === 'PLANLANDI') {
    return { tone: 'secondary', label: 'Planlandı' };
  }
  if (oturum.has_hakedis) {
    return { tone: 'success', label: 'Hakediş Oluştu' };
  }
  return { tone: 'info', label: 'Ücretsiz / Mesai İçi' };
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #0262a7, #667eea)',
  'linear-gradient(135deg, #7c3aed, #c084fc)',
  'linear-gradient(135deg, #059669, #34d399)',
  'linear-gradient(135deg, #ea580c, #fb923c)',
  'linear-gradient(135deg, #db2777, #f472b6)',
  'linear-gradient(135deg, #0d9488, #2dd4bf)',
];

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarGradient(seed: number | string): string {
  const n = typeof seed === 'number' ? seed : seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[n % AVATAR_GRADIENTS.length];
}

const WEEK_BLOCK_COLORS = [
  '#0262a7',
  '#7c3aed',
  '#059669',
  '#ea580c',
  '#db2777',
  '#0d9488',
  '#4f46e5',
  '#ca8a04',
];

export function weekBlockColor(seed: number | string): string {
  const n = typeof seed === 'number' ? seed : seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return WEEK_BLOCK_COLORS[n % WEEK_BLOCK_COLORS.length];
}

export function formatCurrency(value: number): string {
  return `${value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺`;
}
