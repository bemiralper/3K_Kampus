'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
  const [rows, setRows] = useState<KarneBulkStudentRow[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    sent: number;
    skipped: number;
    currentName: string;
    campaignId: string | null;
  } | null>(null);
  const [done, setDone] = useState<{
    sent: number;
    skipped: number;
    errors: string[];
    campaignId: string | null;
    partial: boolean;
  } | null>(null);

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
  const veliSelected = includeVeli ? sendable.reduce((n, r) => n + (r.veli_count || 0), 0) : 0;
  const ogrenciSelected = includeStudent ? sendable.filter(r => r.has_student).length : 0;
  const kisiSelected = veliSelected + ogrenciSelected;

  const toggle = (id: number) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (!sendable.length || (!includeVeli && !includeStudent) || kisiSelected === 0) return;
    setSending(true);
    setError('');
    setDone(null);
    const payloadBase = {
      include_veli: includeVeli,
      include_student: includeStudent,
      expected_recipients: kisiSelected,
    };
    let campaignId: string | null = null;
    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];
    setProgress({
      done: 0, total: sendable.length, sent: 0, skipped: 0,
      currentName: sendable[0]?.student_name || '', campaignId: null,
    });
    try {
      const start = await analysisApi.karneNotifyBulkStart(examId, {
        answer_ids: sendable.map(r => r.answer_id),
        expected_recipients: kisiSelected,
      });
      if (!start.success || !start.data?.campaign_id) {
        throw new Error(start.error || 'Gönderim kaydı açılamadı.');
      }
      campaignId = start.data.campaign_id;
      setProgress(prev => prev ? { ...prev, campaignId } : prev);

      for (let i = 0; i < sendable.length; i++) {
        const row = sendable[i];
        setProgress({
          done: i,
          total: sendable.length,
          sent,
          skipped,
          currentName: row.student_name,
          campaignId,
        });
        try {
          const res = await analysisApi.karneNotifyBulkSend(
            examId,
            {
              ...payloadBase,
              answer_ids: [row.answer_id],
              campaign_id: campaignId,
            },
            rankingYear,
          );
          if (!res.success) {
            skipped += 1;
            errors.push(`${row.student_name}: ${res.error || 'Gönderilemedi'}`);
          } else {
            sent += res.data?.sent ?? 0;
            skipped += res.data?.skipped ?? 0;
            for (const err of res.data?.errors || []) errors.push(err);
            if (res.data?.campaign_id) campaignId = res.data.campaign_id;
          }
        } catch (e) {
          skipped += 1;
          errors.push(`${row.student_name}: ${e instanceof Error ? e.message : 'Gönderilemedi'}`);
        }
        setProgress({
          done: i + 1,
          total: sendable.length,
          sent,
          skipped,
          currentName: row.student_name,
          campaignId,
        });
      }

      setDone({
        sent,
        skipped,
        errors: errors.slice(0, 12),
        campaignId,
        partial: sent === 0 || errors.length > 0,
      });
    } catch (e) {
      if (campaignId) {
        setDone({
          sent,
          skipped,
          errors: [e instanceof Error ? e.message : 'Gönderim hatası', ...errors].slice(0, 12),
          campaignId,
          partial: true,
        });
      } else {
        setError(e instanceof Error ? e.message : 'Gönderim hatası');
      }
    } finally {
      setSending(false);
    }
  };

  const pct = progress && progress.total
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

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
              {examName} · {sendable.length} öğrenci
              {kisiSelected > 0 && (
                <> · {veliSelected} veli · {ogrenciSelected} öğrenci · <strong style={{ color: '#0f172a' }}>{kisiSelected} kişi</strong></>
              )}
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
              <select value={alanFilter || ''} onChange={e => setAlanFilter(e.target.value || null)} style={selectStyle} disabled={sending}>
                <option value="">Tümü</option>
                {Object.entries(ALAN_LABELS).map(([kod, label]) => (
                  <option key={kod} value={kod}>{label}</option>
                ))}
              </select>
            </label>
          )}
          <label style={{ fontSize: 12, color: '#475569' }}>
            Sınıf / Program
            <select value={sinifFilter || ''} onChange={e => setSinifFilter(e.target.value || null)} style={selectStyle} disabled={sending}>
              <option value="">Tümü</option>
              {uniqueSiniflar.map(sn => <option key={sn} value={sn}>{sn}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={includeVeli} disabled={sending} onChange={e => setIncludeVeli(e.target.checked)} />
            Velilere gönder
          </label>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={includeStudent} disabled={sending} onChange={e => setIncludeStudent(e.target.checked)} />
            Öğrencilere gönder
          </label>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Alıcılar yükleniyor…</div>
        ) : done ? (
          <div style={{ padding: 24 }}>
            <div style={{
              color: done.sent > 0 ? '#15803d' : '#b45309',
              fontSize: 14, fontWeight: 650, marginBottom: 8,
            }}>
              {done.sent > 0
                ? `${done.sent} mesaj kuyruğa alındı${done.skipped ? `, ${done.skipped} alıcıya gidemedi` : ''}.`
                : 'Hiçbir alıcıya gönderilemedi.'}
            </div>
            {done.partial && done.errors.length > 0 && (
              <ul style={{ margin: '0 0 16px', paddingLeft: 18, fontSize: 12, color: '#b91c1c', lineHeight: 1.5 }}>
                {done.errors.map(err => <li key={err}>{err}</li>)}
              </ul>
            )}
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
              Kime gittiğini / gitmediğini gönderim geçmişinden görebilirsiniz.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {done.campaignId && (
                <Link
                  href={`/admin/iletisim/kampanyalar/${done.campaignId}`}
                  className="btn-modern btn-primary"
                  style={{ textDecoration: 'none', padding: '8px 14px', borderRadius: 8, background: '#0061a6', color: '#fff', fontWeight: 600 }}
                >
                  Gönderim geçmişi
                </Link>
              )}
              <button type="button" onClick={onClose} style={{
                padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
              }}>Kapat</button>
            </div>
          </div>
        ) : error && !sending ? (
          <div style={{ padding: 24 }}>
            <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>
            <button type="button" onClick={() => setError('')} style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
            }}>Geri dön</button>
          </div>
        ) : (
          <>
            {sending && progress && (
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <div style={{ fontSize: 13, fontWeight: 650, color: '#0f172a', marginBottom: 6 }}>
                  {progress.currentName} gönderiliyor…
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>
                  {progress.done} / {progress.total} öğrenci · {progress.sent} kişi kuyruğa alındı
                  {progress.skipped ? ` · ${progress.skipped} gidemedi` : ''}
                </div>
                <div style={{ height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
                  <div style={{
                    width: `${pct}%`, height: '100%', background: '#0061a6',
                    transition: 'width 0.25s ease',
                  }} />
                </div>
                {progress.campaignId && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>
                    Gönderim kaydı açıldı — tarayıcı kapanırsa geçmişten devamını görebilirsiniz.
                  </div>
                )}
              </div>
            )}
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
                    cursor: blocked || sending ? 'not-allowed' : 'pointer',
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
                        {!r.skip_reason && (
                          <> · {(includeVeli ? r.veli_count : 0) + (includeStudent && r.has_student ? 1 : 0)} kişi</>
                        )}
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
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
            }}>
              <div style={{ fontSize: 12, color: '#475569' }}>
                Toplam <strong>{kisiSelected}</strong> kişi
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={onClose} disabled={sending} style={{
                  padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
                }}>İptal</button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || sendable.length === 0 || kisiSelected === 0}
                  style={{
                    padding: '8px 14px', borderRadius: 8, border: 'none',
                    background: sending || kisiSelected === 0 ? '#93c5fd' : '#0061a6',
                    color: '#fff', fontWeight: 600,
                    cursor: sending || kisiSelected === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {sending ? 'Gönderiliyor…' : `${kisiSelected} kişiye gönder`}
                </button>
              </div>
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
