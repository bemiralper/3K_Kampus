'use client';

import { useEffect, useMemo, useState } from 'react';
import { analysisApi, type KarneBulkStudentRow } from '../api';
import { ALAN_LABELS } from '../pdfExport';
import type { StudentAnalysis } from '../types';

interface Props {
  examId: number;
  examName: string;
  examType: string;
  students: StudentAnalysis[];
  uniqueSiniflar: string[];
  rankingYear?: number;
  onClose: () => void;
}

export default function KarneBulkNotifyModal({
  examId, examName, examType, students, uniqueSiniflar, rankingYear, onClose,
}: Props) {
  const [alanFilter, setAlanFilter] = useState<string | null>(null);
  const [sinifFilter, setSinifFilter] = useState<string | null>(null);
  const [includeVeli, setIncludeVeli] = useState(true);
  const [includeStudent, setIncludeStudent] = useState(true);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [rows, setRows] = useState<KarneBulkStudentRow[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  const filtered = useMemo(() => {
    let list = [...students];
    if (alanFilter) list = list.filter(st => st.alan === alanFilter);
    if (sinifFilter) list = list.filter(st => st.sinif === sinifFilter);
    return list;
  }, [students, alanFilter, sinifFilter]);

  const filteredIds = useMemo(() => filtered.map(st => st.answer_id).join(','), [filtered]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!filtered.length) {
        setRows([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const res = await analysisApi.karneNotifyBulkPreview(examId, filtered.map(st => st.answer_id));
        if (!res.success || !res.data) throw new Error(res.error || 'Önizleme yüklenemedi');
        if (!cancelled) {
          setRows(res.data.students || []);
          const next = new Set<number>();
          for (const r of res.data.students || []) {
            if (r.skip_reason) next.add(r.answer_id);
          }
          setExcluded(next);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Hata');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [examId, filteredIds]);

  const sendable = rows.filter(r => !r.skip_reason && !excluded.has(r.answer_id));

  const toggle = (id: number) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (!sendable.length || (!includeVeli && !includeStudent)) return;
    setSending(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await analysisApi.karneNotifyBulkSend(
        examId,
        {
          answer_ids: sendable.map(r => r.answer_id),
          include_veli: includeVeli,
          include_student: includeStudent,
        },
        rankingYear,
      );
      if (!res.success) throw new Error(res.error || 'Gönderim başarısız');
      const sent = res.data?.sent ?? 0;
      if (sent === 0) {
        throw new Error(res.data?.errors?.[0] || 'Hiçbir alıcıya gönderilemedi.');
      }
      setSuccessMsg(`${sent} mesaj kuyruğa alındı (${sendable.length} öğrenci).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gönderim hatası');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 3100,
        background: 'rgba(15,23,42,0.55)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        style={{
          background: '#fff', borderRadius: 14, width: '100%', maxWidth: 680,
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              WhatsApp — Toplu karne
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
              {examName} · {sendable.length} öğrenci seçili
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={sending} style={{
            border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: '#64748b',
          }}>×</button>
        </div>

        <div style={{ padding: '12px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderBottom: '1px solid #f1f5f9' }}>
          {examType === 'YKS_AYT' && (
            <label style={{ fontSize: 12, color: '#475569' }}>
              Alan
              <select value={alanFilter || ''} onChange={e => setAlanFilter(e.target.value || null)} style={selectStyle}>
                <option value="">Tümü</option>
                {Object.entries(ALAN_LABELS).map(([kod, label]) => (
                  <option key={kod} value={kod}>{label}</option>
                ))}
              </select>
            </label>
          )}
          <label style={{ fontSize: 12, color: '#475569' }}>
            Sınıf
            <select value={sinifFilter || ''} onChange={e => setSinifFilter(e.target.value || null)} style={selectStyle}>
              <option value="">Tümü</option>
              {uniqueSiniflar.map(sn => <option key={sn} value={sn}>{sn}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={includeVeli} onChange={e => setIncludeVeli(e.target.checked)} />
            Velilere gönder
          </label>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={includeStudent} onChange={e => setIncludeStudent(e.target.checked)} />
            Öğrencilere gönder
          </label>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Alıcılar yükleniyor…</div>
        ) : successMsg ? (
          <div style={{ padding: 24 }}>
            <div style={{ color: '#059669', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{successMsg}</div>
            <button type="button" onClick={onClose} style={{
              padding: '8px 14px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', cursor: 'pointer',
            }}>Kapat</button>
          </div>
        ) : error ? (
          <div style={{ padding: 24 }}>
            <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>
            <button type="button" onClick={() => setError('')} style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
            }}>Geri dön</button>
          </div>
        ) : (
          <>
            <div style={{ overflowY: 'auto', padding: '12px 16px', flex: 1 }}>
              {rows.map(r => {
                const blocked = Boolean(r.skip_reason);
                const checked = !blocked && !excluded.has(r.answer_id);
                return (
                  <label key={r.answer_id} style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    padding: '10px 12px', borderRadius: 10, marginBottom: 8,
                    border: '1px solid #e2e8f0',
                    background: blocked ? '#f8fafc' : checked ? '#f0f9ff' : '#fff',
                    opacity: blocked ? 0.7 : 1,
                    cursor: blocked ? 'not-allowed' : 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={blocked || sending}
                      onChange={() => toggle(r.answer_id)}
                      style={{ marginTop: 3 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{r.student_name}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {r.veli_count} veli{r.has_student ? ' · öğrenci telefonu var' : ''}
                      </div>
                      {r.skip_reason && (
                        <div style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>{r.skip_reason}</div>
                      )}
                    </div>
                  </label>
                );
              })}
              {!rows.length && (
                <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                  Seçilen filtrelere uyan öğrenci yok.
                </div>
              )}
            </div>
            <div style={{
              padding: '12px 16px', borderTop: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'flex-end', gap: 8,
            }}>
              <button type="button" onClick={onClose} disabled={sending} style={{
                padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
              }}>İptal</button>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || sendable.length === 0 || (!includeVeli && !includeStudent)}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: 'none',
                  background: sending || sendable.length === 0 ? '#93c5fd' : '#0061a6',
                  color: '#fff', fontWeight: 600,
                  cursor: sending || sendable.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {sending ? 'Gönderiliyor…' : `${sendable.length} öğrenciye gönder`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 4,
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  fontSize: 12,
  background: '#fff',
};
