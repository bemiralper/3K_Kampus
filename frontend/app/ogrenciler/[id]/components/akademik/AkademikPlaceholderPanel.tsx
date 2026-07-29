'use client';

type Props = {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
};

export default function AkademikPlaceholderPanel({
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: Props) {
  return (
    <div className="akd-placeholder">
      <div className="akd-placeholder-card">
        <div className="akd-placeholder-icon" aria-hidden>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5" />
            <path d="M12 16.2v.05" />
          </svg>
        </div>
        <h3>{title}</h3>
        <p>{description}</p>
        {actionLabel && actionHref && (
          <a className="akd-btn akd-btn-primary" href={actionHref}>
            {actionLabel}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
        )}
        {actionLabel && onAction && !actionHref && (
          <button type="button" className="akd-btn akd-btn-primary" onClick={onAction}>
            {actionLabel}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
