'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  fetchCoachRiskReports,
  patchCoachRiskReport,
  type CoachRiskReport,
} from '@/lib/coaching-api';

type StatusFilter = '' | 'pending' | 'in_progress' | 'completed' | 'cancelled';
type SourceFilter = '' | 'manual' | 'auto';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Beklemede',
  in_progress: 'İnceleniyor',
  completed: 'Kapatıldı',
  cancelled: 'İptal',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#fef2f2', color: '#b91c1c' },
  in_progress: { bg: '#fffbeb', color: '#b45309' },
  completed: { bg: '#ecfdf5', color: '#047857' },
  cancelled: { bg: '#f3f4f6', color: '#6b7280' },
};

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function RiskCenterInner() {
  const searchParams = useSearchParams();
  const highlightId = Number(searchParams.get('event') || 0) || null;

  const [items, setItems] = useState<CoachRiskReport[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchCoachRiskReports({
        status: statusFilter || undefined,
        source: sourceFilter || undefined,
      });
      if (res.success && res.data) {
        setItems(res.data);
        setPendingCount(Number(res.kpi?.pending ?? 0));
      } else {
        setError(res.error || 'Risk listesi yüklenemedi.');
        setItems([]);
      }
    } catch {
      setError('Risk listesi yüklenemedi.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sourceFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!highlightId || loading) return;
    const el = document.getElementById(`risk-event-${highlightId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightId, loading, items]);

  const stats = useMemo(
    () => ({
      pending: pendingCount,
      shown: items.length,
    }),
    [pendingCount, items.length],
  );

  const updateStatus = async (id: number, status: string) => {
    setUpdatingId(id);
    try {
      const res = await patchCoachRiskReport(id, status);
      if (res.success) {
        await load();
      } else {
        alert(res.error || 'Durum güncellenemedi.');
      }
    } catch {
      alert('Durum güncellenemedi.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '28px 24px 48px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: '#0f172a' }}>Risk Merkezi</h1>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 14 }}>
                Koçların bildirdiği riskli öğrenciler — takip ve durum yönetimi
              </p>
            </div>
            <button
              type="button"
              onClick={load}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: '1px solid #e2e8f0',
                background: '#fff',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Yenile
            </button>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
            <div style={statCardStyle}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Bekleyen</span>
              <strong style={{ fontSize: 28, color: '#b91c1c' }}>{stats.pending}</strong>
            </div>
            <div style={statCardStyle}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Listelenen</span>
              <strong style={{ fontSize: 28, color: '#0f172a' }}>{stats.shown}</strong>
            </div>
          </div>
        </header>

        <div
          style={{
            display: 'flex',
            gap: 12,
            marginBottom: 16,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            style={selectStyle}
          >
            <option value="">Tüm durumlar</option>
            <option value="pending">Beklemede</option>
            <option value="in_progress">İnceleniyor</option>
            <option value="completed">Kapatıldı</option>
            <option value="cancelled">İptal</option>
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
            style={selectStyle}
          >
            <option value="">Tüm kaynaklar</option>
            <option value="manual">Koç bildirimi</option>
            <option value="auto">Otomatik</option>
          </select>
        </div>

        {error && (
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              background: '#fef2f2',
              color: '#b91c1c',
              marginBottom: 16,
              border: '1px solid #fecaca',
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Yükleniyor…</div>
        ) : items.length === 0 ? (
          <div
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              padding: 40,
              textAlign: 'center',
              color: '#64748b',
            }}
          >
            Bu filtrelerle risk kaydı yok.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((row) => {
              const tone = STATUS_COLORS[row.status] || STATUS_COLORS.pending;
              const highlighted = highlightId === row.id;
              return (
                <article
                  key={row.id}
                  id={`risk-event-${row.id}`}
                  style={{
                    background: '#fff',
                    border: highlighted ? '2px solid #ef4444' : '1px solid #e2e8f0',
                    borderRadius: 14,
                    padding: '18px 20px',
                    boxShadow: highlighted ? '0 0 0 4px rgba(239,68,68,0.12)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <h2 style={{ margin: 0, fontWeight: 700, fontSize: 17, color: '#0f172a' }}>
                          {row.student_name}
                        </h2>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: 999,
                            background: tone.bg,
                            color: tone.color,
                          }}
                        >
                          {STATUS_LABELS[row.status] || row.status}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: 999,
                            background: row.event_source === 'risk_report' ? '#eff6ff' : '#f5f3ff',
                            color: row.event_source === 'risk_report' ? '#1d4ed8' : '#6d28d9',
                          }}
                        >
                          {row.event_source === 'risk_report' ? 'Koç bildirimi' : 'Otomatik'}
                        </span>
                      </div>
                      <p style={{ margin: '8px 0 0', color: '#334155', fontSize: 14 }}>
                        <strong>Neden:</strong> {row.reason || row.title}
                      </p>
                      {row.notes ? (
                        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>{row.notes}</p>
                      ) : null}
                      <p style={{ margin: '10px 0 0', color: '#94a3b8', fontSize: 12 }}>
                        Koç: {row.coach_name || '—'} · {formatDate(row.event_date)}
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      {row.status === 'pending' && (
                        <button
                          type="button"
                          disabled={updatingId === row.id}
                          onClick={() => updateStatus(row.id, 'in_progress')}
                          style={actionBtn('#fff7ed', '#c2410c')}
                        >
                          İncelemeye al
                        </button>
                      )}
                      {(row.status === 'pending' || row.status === 'in_progress') && (
                        <button
                          type="button"
                          disabled={updatingId === row.id}
                          onClick={() => updateStatus(row.id, 'completed')}
                          style={actionBtn('#ecfdf5', '#047857')}
                        >
                          Kapat
                        </button>
                      )}
                      {row.status !== 'cancelled' && row.status !== 'completed' && (
                        <button
                          type="button"
                          disabled={updatingId === row.id}
                          onClick={() => updateStatus(row.id, 'cancelled')}
                          style={actionBtn('#f8fafc', '#64748b')}
                        >
                          İptal
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RiskPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: '#64748b' }}>Yükleniyor…</div>}>
      <RiskCenterInner />
    </Suspense>
  );
}

const statCardStyle: CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: '14px 18px',
  minWidth: 120,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const selectStyle: CSSProperties = {
  padding: '9px 12px',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  background: '#fff',
  fontSize: 13,
  minWidth: 160,
};

function actionBtn(bg: string, color: string): CSSProperties {
  return {
    padding: '8px 12px',
    borderRadius: 9,
    border: '1px solid transparent',
    background: bg,
    color,
    fontWeight: 600,
    fontSize: 12,
    cursor: 'pointer',
  };
}
