'use client';

import { CONTENT_PRIORITY_META, type ContentPriority } from '@/lib/content-labels';

type Props = { priority?: string; className?: string };

export default function ContentBadge({ priority = 'normal', className = '' }: Props) {
  const key = (priority in CONTENT_PRIORITY_META ? priority : 'normal') as ContentPriority;
  const meta = CONTENT_PRIORITY_META[key];
  return (
    <span className={`wc-badge wc-badge--${key} ${className}`.trim()}>
      <span aria-hidden>{meta.icon}</span>
      {meta.label}
    </span>
  );
}
