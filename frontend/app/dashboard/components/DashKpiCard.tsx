'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  icon?: ReactNode;
  tone?: 'blue' | 'green' | 'amber' | 'slate' | 'violet';
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
      <div className="adm-kpi__top">
        {icon && <span className="adm-kpi__icon">{icon}</span>}
        <span className="adm-kpi__label">{label}</span>
      </div>
      <div className="adm-kpi__value">{value}</div>
      {hint && <div className="adm-kpi__hint">{hint}</div>}
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
