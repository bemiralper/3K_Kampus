'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  icon?: ReactNode;
  tone?: 'blue' | 'green' | 'amber' | 'slate' | 'violet' | 'rose';
};

export default function DashKpiCard({
  label,
  value,
  hint,
  href,
  icon,
  tone = 'blue',
}: Props) {
  const inner = (
    <>
      <span className="adm-kpi__icon" aria-hidden="true">
        {icon || '•'}
      </span>
      <span className="adm-kpi__text">
        <span className="adm-kpi__label">{label}</span>
        <span className="adm-kpi__value">{value}</span>
        {hint && <span className="adm-kpi__hint">{hint}</span>}
      </span>
      {href && (
        <span className="adm-kpi__chev" aria-hidden="true">
          ›
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`adm-kpi adm-kpi--${tone} adm-kpi--link`}>
        {inner}
      </Link>
    );
  }

  return <div className={`adm-kpi adm-kpi--${tone}`}>{inner}</div>;
}
