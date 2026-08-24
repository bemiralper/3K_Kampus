'use client';

/**
 * Akademik Page Kit — Akademik Operasyon modülünün ortak arayüz bileşenleri.
 *
 * Grup layout'u (AkademikGroupLayout) sayfa başlığını ve sekmeleri zaten
 * render eder; bu yüzden `PageHead` ikincil seviyededir.
 */
import type { ReactNode } from 'react';
import { IconAlertTriangle, IconInbox } from './icons';
import './akademik-ui.css';

/* -------------------------------------------------------------------------
   Sayfa kabuğu
   ------------------------------------------------------------------------- */
export function PageShell({
  children,
  tight,
}: {
  children: ReactNode;
  tight?: boolean;
}) {
  return (
    <div className={`ak-scope ak-stack${tight ? ' ak-stack-tight' : ''}`}>{children}</div>
  );
}

export function PageHead({
  icon,
  title,
  description,
  actions,
}: {
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  if (!title && !description && !actions) return null;
  return (
    <div className="ak-head">
      <div className="ak-head-main">
        {title && (
          <h2 className="ak-head-title">
            {icon && <span className="ak-head-icon">{icon}</span>}
            {title}
          </h2>
        )}
        {description && <p className="ak-head-desc">{description}</p>}
      </div>
      {actions && <div className="ak-head-actions">{actions}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Panel
   ------------------------------------------------------------------------- */
export function Panel({
  title,
  count,
  actions,
  flush,
  children,
  className,
}: {
  title?: ReactNode;
  /** Başlığın yanında gösterilecek kayıt sayısı */
  count?: number | string;
  actions?: ReactNode;
  /** Tablo/ızgara gibi kendi kenar boşluğunu yöneten içerikler için */
  flush?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const classes = ['ak-panel'];
  if (flush) classes.push('ak-panel-flush');
  if (className) classes.push(className);
  return (
    <section className={classes.join(' ')}>
      {(title || actions) && (
        <div className="ak-panel-head">
          {title && (
            <h3 className="ak-panel-title">
              {title}
              {count !== undefined && <span className="ak-panel-count">{count}</span>}
            </h3>
          )}
          {actions && <div className="ak-panel-actions">{actions}</div>}
        </div>
      )}
      <div className="ak-panel-body">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------
   Filtre çubuğu
   ------------------------------------------------------------------------- */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="ak-toolbar">{children}</div>;
}

export function Field({
  label,
  children,
  grow,
  width,
}: {
  label: string;
  children: ReactNode;
  grow?: boolean;
  width?: number;
}) {
  return (
    <div
      className={`ak-field${grow ? ' ak-field-grow' : ''}`}
      style={width ? { width } : undefined}
    >
      <label>{label}</label>
      {children}
    </div>
  );
}

export function ToolbarActions({ children }: { children: ReactNode }) {
  return <div className="ak-toolbar-actions">{children}</div>;
}

/* -------------------------------------------------------------------------
   KPI kartları
   ------------------------------------------------------------------------- */
export type StatTone = 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'slate';

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="ak-stats">{children}</div>;
}

export function StatCard({
  icon,
  tone = 'blue',
  value,
  label,
  onClick,
  active,
}: {
  icon?: ReactNode;
  tone?: StatTone;
  value: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const classes = ['ak-stat'];
  if (onClick) classes.push('is-clickable');
  if (active) classes.push('is-active');
  return (
    <div
      className={classes.join(' ')}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {icon && <div className={`ak-stat-icon ${tone}`}>{icon}</div>}
      <div className="ak-stat-info">
        <span className="ak-stat-value">{value}</span>
        <span className="ak-stat-label" title={label}>
          {label}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Boş durum / yükleniyor / hata
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
    <div className="ak-empty">
      <div className="ak-empty-icon">{icon ?? <IconInbox size={22} />}</div>
      <h4>{title}</h4>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function LoadingState({ label = 'Yükleniyor…' }: { label?: string }) {
  return (
    <div className="ak-loading" role="status" aria-live="polite">
      <div className="ak-spinner" />
      <p>{label}</p>
    </div>
  );
}

/**
 * Hata durumu. Denetimde çıkan "sessiz hata yutma" sorununu çözmek için:
 * bir istek başarısız olduğunda boş liste değil bu bileşen gösterilir.
 */
export function ErrorState({
  title = 'Veriler yüklenemedi',
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="ak-empty" role="alert">
      <div className="ak-empty-icon" style={{ background: 'var(--ak-danger-soft)', color: 'var(--ak-danger)' }}>
        <IconAlertTriangle size={22} />
      </div>
      <h4>{title}</h4>
      {description && <p>{description}</p>}
      {onRetry && (
        <button type="button" className="ak-badge info" style={{ cursor: 'pointer', border: 0, padding: '4px 12px' }} onClick={onRetry}>
          Tekrar dene
        </button>
      )}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="ak-skeleton-row" key={i}>
          <div className="ak-skeleton" style={{ width: 28, height: 28, borderRadius: '50%' }} />
          <div className="ak-skeleton ak-skeleton-text" style={{ width: 120 }} />
          <div className="ak-skeleton ak-skeleton-text" style={{ width: 80 }} />
          <div className="ak-skeleton ak-skeleton-text" style={{ width: 150 }} />
          <div className="ak-skeleton ak-skeleton-text" style={{ width: 60, marginLeft: 'auto' }} />
        </div>
      ))}
    </div>
  );
}

export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="ak-stats" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div className="ak-stat" key={i}>
          <div className="ak-skeleton" style={{ width: 38, height: 38, borderRadius: 11 }} />
          <div style={{ flex: 1 }}>
            <div className="ak-skeleton ak-skeleton-text" style={{ width: '55%', marginBottom: 6 }} />
            <div className="ak-skeleton ak-skeleton-text" style={{ width: '80%', height: 9 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Segmentli görünüm değiştirici
   ------------------------------------------------------------------------- */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="ak-segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
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
   Rozet
   ------------------------------------------------------------------------- */
export type BadgeTone =
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple'
  | 'secondary';

export function Badge({ tone = 'secondary', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`ak-badge ${tone}`}>{children}</span>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="ak-hint">{children}</p>;
}

/**
 * Kurum/şube seçilmediğinde tüm akademik sekmelerinin gösterdiği ortak uyarı.
 * Denetimde "bağlam seçilmemişse boş ekran" sorunu buradan kapanıyor.
 */
export function ContextRequired({ what = 'kurum ve şube' }: { what?: string }) {
  return (
    <EmptyState
      title="Önce bağlam seçin"
      description={`Bu ekranı görüntülemek için üst çubuktan ${what} seçmeniz gerekiyor.`}
    />
  );
}
