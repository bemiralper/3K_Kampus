"use client";

// ─── Dashboard v2 — paylaşılan ikon seti (stroke, emoji yok) ────────
// Hero / card başlıkları ve hızlı işlemler için tutarlı SVG ikonlar.

type IconProps = { className?: string };

const base = "none";

export function IconWallet({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1" />
      <path d="M21 12v3a1 1 0 0 1-1 1h-3.5a2.5 2.5 0 0 1 0-5H20a1 1 0 0 1 1 1Z" />
    </svg>
  );
}

export function IconArrowDownCircle({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v7M8.5 12 12 15.5 15.5 12" />
    </svg>
  );
}

export function IconArrowUpCircle({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16V9M8.5 12.5 12 9l3.5 3.5" />
    </svg>
  );
}

export function IconScale({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18M7 21h10" />
      <path d="M4 8l3-4 3 4M4 8a3 3 0 0 0 6 0M14 8l3-4 3 4M14 8a3 3 0 0 0 6 0" />
    </svg>
  );
}

export function IconCalendarDays({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M8 3v3M16 3v3" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" />
    </svg>
  );
}

export function IconBank({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 10.5V19M9.5 10.5V19M14.5 10.5V19M19 10.5V19" />
      <path d="M3 19h18" />
    </svg>
  );
}

export function IconCash({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.75" />
      <path d="M6 9v.01M18 15v.01" />
    </svg>
  );
}

export function IconClock({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export function IconCalendarClock({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M8 3v3M16 3v3" />
      <circle cx="15.5" cy="15" r="4" />
      <path d="M15.5 13v2l1.4 1" />
    </svg>
  );
}

export function IconAlertTriangle({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 9.5v4.25M12 17h.01" />
    </svg>
  );
}

export function IconPieChart({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  );
}

export function IconLineChart({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19V5M4 19h16" />
      <path d="M7.5 15 11 10.5l3 2.5 4-6" />
    </svg>
  );
}

export function IconRefresh({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 12a8.5 8.5 0 0 1 14.6-5.9L20 8" />
      <path d="M20 4v4h-4" />
      <path d="M20.5 12a8.5 8.5 0 0 1-14.6 5.9L4 16" />
      <path d="M4 20v-4h4" />
    </svg>
  );
}

export function IconPlusCircle({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

export function IconReceipt({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V3Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

export function IconUsers({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V21" />
      <circle cx="10" cy="7.5" r="3.5" />
      <path d="M18.5 21v-1.5a3.5 3.5 0 0 0-2.2-3.25M15 4.13a3.5 3.5 0 0 1 0 6.74" />
    </svg>
  );
}

export function IconLayers({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="M3 12l9 5 9-5M3 16l9 5 9-5" />
    </svg>
  );
}

export function IconArrowRight({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconInbox({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h4l2 3h4l2-3h4" />
      <path d="M5.5 5h13l2.5 7v6.5A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5V12L5.5 5Z" />
    </svg>
  );
}

export function IconPhone({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 4h3.2l1.3 4.2-2 1.7a13 13 0 0 0 6.1 6.1l1.7-2 4.2 1.3v3.2a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3 5.6 1.5 1.5 0 0 1 4.5 4Z" />
    </svg>
  );
}

export function IconFileSignature({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
      <path d="M8 14.5s.8-1 1.7-1 1 1 1.9 1 1.4-1.3 2.2-1.3 1.2.9 2.2.5" />
    </svg>
  );
}

export function IconSparkles({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l2 2M16.5 16.5l2 2M18.5 5.5l-2 2M7.5 16.5l-2 2" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconCheckCircle({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.4 2.4L16 10" />
    </svg>
  );
}
