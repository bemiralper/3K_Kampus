'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback, useRef } from 'react';
import { examApi, uploadApi } from '../../../components/olcme/api';
import type { ExamListItem } from '../../../components/olcme/types';
import { EXAM_TYPES, EXAM_STATUS } from '../../../components/olcme/types';

/* ── Yardımcı ─────────────────────────────────────────────────────────────── */

const statusColor = (status: string) => {
  const map: Record<string, string> = {
    DRAFT: '', ANSWER_KEY_READY: 'info',
    RESULTS_UPLOADED: 'warning', COMPLETED: 'success',
  };
  return map[status] ?? '';
};

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/* ── Silme Onay Modal'ı ──────────────────────────────────────────────────── */

interface DeleteModalProps {
  exam: ExamListItem | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmModal({ exam, onConfirm, onCancel }: DeleteModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (exam) {
      setConfirmText('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [exam]);

  if (!exam) return null;

  const canDelete = confirmText === exam.name;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480,
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        overflow: 'hidden', animation: 'fadeIn 0.2s ease-out',
      }}>
        {/* Üst kırmızı bant */}
        <div style={{
          background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
          padding: '24px 28px', color: '#fff', textAlign: 'center',
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Sınavı Silmek Üzeresiniz!</h3>
          <p style={{ margin: '6px 0 0', fontSize: 13, opacity: 0.9 }}>Bu işlem geri alınamaz</p>
        </div>

        {/* İçerik */}
        <div style={{ padding: '20px 28px' }}>
          {/* Sınav bilgisi */}
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
            padding: '14px 16px', marginBottom: 16,
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#991b1b', marginBottom: 4 }}>
              {exam.name}
            </div>
            <div style={{ fontSize: 12, color: '#b91c1c' }}>
              {exam.exam_type_display} • {exam.status_display}
            </div>
          </div>

          {/* Uyarı listesi */}
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 16, lineHeight: 1.7 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#991b1b' }}>
              Aşağıdaki veriler kalıcı olarak silinecek:
            </p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>Sınava ait tüm bölümler ve sorular</li>
              <li>
                <strong>{exam.answer_count || 0}</strong> öğrenci cevap kaydı
              </li>
              <li>Tüm oturum verileri ({exam.session_count || 0} oturum)</li>
              <li>Analiz ve sıralama sonuçları</li>
              {exam.linked_tyt_exam_name && (
                <li>TYT bağlantısı: <strong>{exam.linked_tyt_exam_name}</strong> ile bağ kopar</li>
              )}
              {exam.linked_ayt_exam_name && (
                <li>AYT bağlantısı: <strong>{exam.linked_ayt_exam_name}</strong> ile bağ kopar</li>
              )}
            </ul>
          </div>

          {/* Onay kutusu */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Silmeyi onaylamak için sınav adını yazın:
              <span style={{
                display: 'inline-block', background: '#fee2e2', color: '#991b1b',
                padding: '1px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700, marginLeft: 6,
              }}>
                {exam.name}
              </span>
            </label>
            <input
              ref={inputRef}
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={`"${exam.name}" yazın…`}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 14,
                border: `2px solid ${canDelete ? '#22c55e' : '#e5e7eb'}`,
                outline: 'none', transition: 'border-color 0.2s',
                boxSizing: 'border-box',
              }}
              onKeyDown={e => { if (e.key === 'Enter' && canDelete) onConfirm(); }}
            />
          </div>

          {/* Butonlar */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onCancel} style={{
              padding: '10px 22px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: '#f3f4f6', border: '1px solid #d1d5db', color: '#374151',
              cursor: 'pointer',
            }}>
              Vazgeç
            </button>
            <button
              onClick={onConfirm}
              disabled={!canDelete}
              style={{
                padding: '10px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                background: canDelete ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : '#fca5a5',
                border: 'none', color: '#fff',
                cursor: canDelete ? 'pointer' : 'not-allowed',
                opacity: canDelete ? 1 : 0.6,
                transition: 'all 0.2s',
              }}
            >
              🗑️ Kalıcı Olarak Sil
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function OlcmeListPage() {
  const [exams, setExams]     = useState<ExamListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');
  const [typeFilter, setTypeFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  /* ── Silme Modal State ── */
  const [deleteTarget, setDeleteTarget] = useState<ExamListItem | null>(null);

  /* ── Toplu Eşleştirme State ── */
  const [rematching, setRematching] = useState(false);
  const [rematchResult, setRematchResult] = useState<{
    success: boolean;
    total_unmatched: number;
    newly_matched: number;
    still_unmatched: number;
    exam_results: Array<{ exam_id: number; exam_name: string; newly_matched: number; still_unmatched: number }>;
    message?: string;
  } | null>(null);

  /* ── Fetch ── */
  const fetchExams = useCallback(() => {
    const params: Record<string, string> = {};
    if (search)       params.search    = search;
    if (typeFilter)   params.exam_type = typeFilter;
    if (statusFilter) params.status    = statusFilter;

    setLoading(true);
    examApi.list(params)
      .then(setExams)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [search, typeFilter, statusFilter]);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await examApi.delete(deleteTarget.id);
      setExams(prev => prev.filter(e => e.id !== deleteTarget.id));
    } catch (e: any) {
      setError(e.message || 'Silme işlemi başarısız');
    }
    setDeleteTarget(null);
  };

  /* ── Toplu Yeniden Eşleştirme ── */
  const handleRematchAll = async () => {
    setRematching(true);
    setRematchResult(null);
    try {
      const result = await uploadApi.rematchAll();
      setRematchResult(result);
      fetchExams(); // Sınav listesini yenile (eşleşme sayıları güncellensin)
    } catch (e: any) {
      setRematchResult({
        success: false,
        total_unmatched: 0,
        newly_matched: 0,
        still_unmatched: 0,
        exam_results: [],
        message: e.message || 'Eşleştirme sırasında hata oluştu',
      });
    } finally {
      setRematching(false);
    }
  };

  const stats = {
    total: exams.length,
    draft: exams.filter(e => e.status === 'DRAFT').length,
    completed: exams.filter(e => e.status === 'COMPLETED').length,
    questions: exams.reduce((a, e) => a + (e.total_questions || 0), 0),
  };

  /* ═══════════ RENDER ═══════════ */

  return (
    <div className="section">

      {/* ── Silme Modal'ı ─────────────────────────────────────────────────── */}
      <DeleteConfirmModal
        exam={deleteTarget}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* ── Hero Header ──────────────────────────────────────────────────── */}
      <div className="hero-header">
        <div className="hero-content">
          <div className="hero-breadcrumb">
            <span>Koçluk</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            <span>Ölçme & Değerlendirme</span>
          </div>
          <h1 className="hero-title">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>
            Sınav Yönetimi
          </h1>
          <p className="hero-subtitle">Sınavları oluşturun, yönetin ve analiz edin</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleRematchAll}
            disabled={rematching}
            className="btn-hero"
            style={{
              background: rematching
                ? 'linear-gradient(135deg, #9ca3af, #6b7280)'
                : 'linear-gradient(135deg, #10b981, #059669)',
              cursor: rematching ? 'wait' : 'pointer',
              border: 'none',
            }}
          >
            <span className="btn-hero-icon">{rematching ? '⏳' : '🔄'}</span>
            {rematching ? 'Eşleştiriliyor…' : 'Toplu Eşleştir'}
          </button>
          <Link href="/admin/olcme-degerlendirme/kazanimlar" className="btn-hero" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
            <span className="btn-hero-icon">📚</span>
            Kazanım Yönetimi
          </Link>
          <Link href="/admin/olcme-degerlendirme/yeni" className="btn-hero">
            <span className="btn-hero-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </span>
            Yeni Sınav Oluştur
          </Link>
        </div>
      </div>

      {/* ── Toplu Eşleştirme Sonuç Bildirimi ─────────────────────────── */}
      {rematchResult && (
        <div style={{
          padding: '16px 20px', borderRadius: 12, marginBottom: 16,
          background: rematchResult.success
            ? (rematchResult.newly_matched > 0 ? '#ecfdf5' : '#fffbeb')
            : '#fef2f2',
          border: `1px solid ${
            rematchResult.success
              ? (rematchResult.newly_matched > 0 ? '#a7f3d0' : '#fde68a')
              : '#fecaca'
          }`,
          position: 'relative',
        }}>
          <button
            onClick={() => setRematchResult(null)}
            style={{
              position: 'absolute', top: 8, right: 12,
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 18, color: '#9ca3af', lineHeight: 1,
            }}
          >×</button>

          {rematchResult.message ? (
            <div style={{
              fontSize: 14,
              color: rematchResult.success ? '#065f46' : '#991b1b',
              fontWeight: 600,
            }}>
              {rematchResult.success ? '✅' : '❌'} {rematchResult.message}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: '#065f46' }}>
                🔄 Toplu Eşleştirme Tamamlandı
              </div>
              <div style={{ display: 'flex', gap: 20, fontSize: 13, color: '#374151', marginBottom: 8 }}>
                <span>Toplam eşleşmemiş: <strong>{rematchResult.total_unmatched}</strong></span>
                <span style={{ color: '#059669' }}>Yeni eşleşen: <strong>{rematchResult.newly_matched}</strong></span>
                <span style={{ color: '#dc2626' }}>Hâlâ eşleşmemiş: <strong>{rematchResult.still_unmatched}</strong></span>
              </div>
              {rematchResult.exam_results.length > 0 && (
                <details style={{ fontSize: 12, color: '#6b7280' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#374151' }}>
                    Sınav bazlı detay ({rematchResult.exam_results.length} sınav)
                  </summary>
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {rematchResult.exam_results.map(er => (
                      <div key={er.exam_id} style={{ display: 'flex', gap: 12 }}>
                        <span style={{ fontWeight: 500 }}>{er.exam_name}</span>
                        <span style={{ color: '#059669' }}>+{er.newly_matched}</span>
                        {er.still_unmatched > 0 && (
                          <span style={{ color: '#dc2626' }}>{er.still_unmatched} kaldı</span>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      )}

      {/* ── İstatistikler ─────────────────────────────────────────────────── */}
      {!loading && exams.length > 0 && (
        <div className="quick-stats">
          <div className="quick-stat">
            <div className="quick-stat-icon blue">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            </div>
            <div className="quick-stat-info">
              <h4>{stats.total}</h4>
              <span>Toplam Sınav</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-icon orange">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </div>
            <div className="quick-stat-info">
              <h4>{stats.draft}</h4>
              <span>Taslak</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-icon green">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div className="quick-stat-info">
              <h4>{stats.completed}</h4>
              <span>Tamamlanan</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-icon purple">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div className="quick-stat-info">
              <h4>{stats.questions}</h4>
              <span>Toplam Soru</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Filtre Çubuğu ─────────────────────────────────────────────────── */}
      <div className="card-modern">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-modern" style={{ flex: '1 1 280px', maxWidth: 360 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input placeholder="Sınav adı ara…" value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>

          <select className="form-select" value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            style={{ minWidth: 180, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}>
            <option value="">Tüm Türler</option>
            {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          <select className="form-select" value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ minWidth: 160, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}>
            <option value="">Tüm Durumlar</option>
            {EXAM_STATUS.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Loading / Error / Empty ─────────────────────────────────────── */}
      {loading && (
        <div className="card-modern" style={{ textAlign: 'center', padding: 60 }}>
          <div className="skeleton" style={{ width: 32, height: 32, borderRadius: '50%', margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: 14 }}>Yükleniyor…</p>
        </div>
      )}

      {error && (
        <div style={{ padding: '20px 24px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, color: '#991b1b', marginTop: 16 }}>
          <strong>Hata:</strong> {error}
        </div>
      )}

      {!loading && !error && exams.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: 52, marginBottom: 16 }}>📋</div>
          <h3>Henüz sınav yok</h3>
          <p>İlk sınavınızı oluşturarak başlayın.</p>
          <Link href="/admin/olcme-degerlendirme/yeni" className="btn-modern btn-primary">
            İlk Sınavı Oluştur
          </Link>
        </div>
      )}

      {/* ── TABLO ─────────────────────────────────────────────────────────── */}
      {!loading && exams.length > 0 && (
        <div className="card-modern" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table-modern">
            <thead>
              <tr>
                <th>Sınav Adı</th>
                <th>Tür</th>
                <th>Durum</th>
                <th>Tarih</th>
                <th>Süre</th>
                <th>Soru</th>
                <th>Oturum</th>
                <th>Sonuç</th>
                <th>Sınıflar</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {exams.map(exam => (
                <tr key={exam.id}>
                  <td style={{ fontWeight: 600 }}>
                    <Link href={`/admin/olcme-degerlendirme/${exam.id}`}
                      style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>
                      {exam.name}
                    </Link>
                    {exam.is_locked && <span style={{ marginLeft: 6 }}>🔒</span>}
                    {exam.is_template && <span style={{ marginLeft: 4 }}>📋</span>}
                    {/* TYT-AYT bağlantı bilgisi */}
                    {exam.linked_tyt_exam_name && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        marginLeft: 8, padding: '2px 8px', borderRadius: 6,
                        background: '#eff6ff', border: '1px solid #bfdbfe',
                        fontSize: 11, fontWeight: 500, color: '#1d4ed8',
                      }}>
                        🔗 TYT: {exam.linked_tyt_exam_name}
                      </div>
                    )}
                    {exam.linked_ayt_exam_name && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        marginLeft: 8, padding: '2px 8px', borderRadius: 6,
                        background: '#faf5ff', border: '1px solid #e9d5ff',
                        fontSize: 11, fontWeight: 500, color: '#7c3aed',
                      }}>
                        🔗 AYT: {exam.linked_ayt_exam_name}
                      </div>
                    )}
                  </td>
                  <td>{exam.exam_type_display}</td>
                  <td>
                    <span className={`badge-modern ${statusColor(exam.status)}`}>
                      {exam.status_display}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(exam.exam_date)}</td>
                  <td>{exam.duration_minutes ? `${exam.duration_minutes} dk` : '—'}</td>
                  <td>{exam.total_questions} / {exam.section_count} böl.</td>
                  <td>{exam.session_count || '—'}</td>
                  <td style={{ fontSize: 12 }}>
                    {exam.answer_count > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span>{exam.answer_count} öğrenci</span>
                        <div style={{ display: 'flex', gap: 6, fontSize: 11 }}>
                          <span style={{ color: '#16a34a' }}>✓ {exam.matched_count}</span>
                          {exam.unmatched_count > 0 && (
                            <span style={{ color: '#ef4444' }}>✗ {exam.unmatched_count}</span>
                          )}
                        </div>
                      </div>
                    ) : '—'}
                  </td>
                  <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {exam.sinif_display || '—'}
                  </td>
                  <td>
                    <div className="row-actions" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <Link href={`/admin/olcme-degerlendirme/${exam.id}`}
                        className="btn-modern btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }}>
                        Aç
                      </Link>
                      <button onClick={() => setDeleteTarget(exam)}
                        className="btn-modern" style={{ padding: '6px 14px', fontSize: 12, color: 'var(--danger)', border: '1px solid #fecaca', background: '#fff', cursor: 'pointer', borderRadius: 6 }}>
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
