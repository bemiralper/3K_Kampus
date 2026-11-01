'use client';

import type { ReactNode } from 'react';
import a from './analysis.module.css';

export function LoadState({ loading, error, onRetry, hasData, children }: {
  loading: boolean;
  error: string;
  onRetry: () => void;
  hasData: boolean;
  children: ReactNode;
}) {
  if (error && !hasData) {
    return (
      <div className={a.alertErr} role="alert">
        <span>{error}</span>
        <button type="button" className={a.btnSmall} onClick={onRetry}>Tekrar dene</button>
      </div>
    );
  }
  if (!hasData) {
    return <div className={a.loading}>Yükleniyor…</div>;
  }
  return (
    <div className={`${a.group} ${loading ? a.stale : ''}`} aria-busy={loading}>
      {error && (
        <div className={a.alertErr} role="alert">
          <span>{error}</span>
          <button type="button" className={a.btnSmall} onClick={onRetry}>Tekrar dene</button>
        </div>
      )}
      {children}
    </div>
  );
}

export type SortDir = 'asc' | 'desc';

export function SortTh<K extends string>({ k, sortKey, sortDir, onSort, children, className, title }: {
  k: K;
  sortKey: K;
  sortDir: SortDir;
  onSort: (k: K) => void;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  const on = sortKey === k;
  return (
    <th
      className={`${a.sortTh} ${className ?? ''}`}
      onClick={() => onSort(k)}
      aria-sort={on ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      title={title}
    >
      {children}
      <span className={on ? a.sortOn : a.sortOff}>{on && sortDir === 'asc' ? '▲' : '▼'}</span>
    </th>
  );
}

/** 0–1 arası oranı yatay çubuk olarak gösterir. */
export function RatioBar({ value, tone }: { value: number; tone?: 'good' | 'mid' | 'bad' }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const t = tone ?? (value >= 0.6 ? 'good' : value >= 0.35 ? 'mid' : 'bad');
  return (
    <span className={a.ratio} aria-hidden>
      <i className={t === 'good' ? a.ratioGood : t === 'mid' ? a.ratioMid : a.ratioBad} style={{ width: `${pct}%` }} />
    </span>
  );
}