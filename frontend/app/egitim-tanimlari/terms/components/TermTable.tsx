/**
 * Term Table Component
 */

'use client';

import React from 'react';
import { Term, TERM_TYPE_LABELS } from '../types';

interface TermTableProps {
  terms: Term[];
  loading: boolean;
  onEdit: (term: Term) => void;
}

const styles = {
  container: {
    overflowX: 'auto' as const,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '14px',
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left' as const,
    fontWeight: 600,
    color: '#374151',
    backgroundColor: '#f9fafb',
    borderBottom: '2px solid #e5e7eb',
  },
  td: {
    padding: '12px 16px',
    borderBottom: '1px solid #e5e7eb',
    color: '#4b5563',
  },
  badge: {
    base: {
      padding: '2px 8px',
      borderRadius: '9999px',
      fontSize: '12px',
      fontWeight: 500,
      display: 'inline-block',
    },
    active: {
      backgroundColor: '#d1fae5',
      color: '#047857',
    },
    inactive: {
      backgroundColor: '#fee2e2',
      color: '#dc2626',
    },
  },
  typeBadge: {
    backgroundColor: '#e0e7ff',
    color: '#4338ca',
    padding: '2px 8px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: 500,
  },
  editBtn: {
    padding: '6px 12px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '48px 16px',
    color: '#6b7280',
  },
  loadingState: {
    textAlign: 'center' as const,
    padding: '48px 16px',
    color: '#6b7280',
  },
};

export default function TermTable({ terms, loading, onEdit }: TermTableProps) {
  if (loading) {
    return (
      <div style={styles.loadingState}>
        <p>Dönemler yükleniyor...</p>
      </div>
    );
  }

  if (terms.length === 0) {
    return (
      <div style={styles.emptyState}>
        <p>Henüz dönem tanımlanmamış.</p>
        <p style={{ marginTop: '8px', fontSize: '13px' }}>
          Yeni dönem eklemek için sağ üstteki butonu kullanın.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Dönem Adı</th>
            <th style={styles.th}>Kod</th>
            <th style={styles.th}>Başlangıç</th>
            <th style={styles.th}>Bitiş</th>
            <th style={styles.th}>Tür</th>
            <th style={styles.th}>Aktif</th>
            <th style={styles.th}>İşlemler</th>
          </tr>
        </thead>
        <tbody>
          {terms.map((term) => (
            <tr key={term.id}>
              <td style={styles.td}>{term.name}</td>
              <td style={styles.td}>{term.code}</td>
              <td style={styles.td}>{formatDate(term.start_date)}</td>
              <td style={styles.td}>{formatDate(term.end_date)}</td>
              <td style={styles.td}>
                <span style={styles.typeBadge}>
                  {TERM_TYPE_LABELS[term.term_type]}
                </span>
              </td>
              <td style={styles.td}>
                <span
                  style={{
                    ...styles.badge.base,
                    ...(term.is_active ? styles.badge.active : styles.badge.inactive),
                  }}
                >
                  {term.is_active ? 'Aktif' : 'Pasif'}
                </span>
              </td>
              <td style={styles.td}>
                <button
                  style={styles.editBtn}
                  onClick={() => onEdit(term)}
                >
                  Düzenle
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(dateString: string): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('tr-TR');
}
