'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { examApi, uploadApi } from '../../../components/olcme/api';
import type { ExamListItem } from '../../../components/olcme/types';
import { EXAM_TYPES } from '../../../components/olcme/types';
import Icon from '../../../components/olcme/ui/Icon';
import s from './examList.module.css';

/* ── Sınav aşamaları ──────────────────────────────────────────────────────── */

/**
 * Sınavın yaşam döngüsü. `step` ilerleme çubuğunu, `tone` ise renk sınıfını
 * belirler; ikisi de aynı kaynaktan geldiği için etiket ve çubuk hep uyumlu.
 */
const STAGES: Record<string, { step: number; label: string; tone: string }> = {
  DRAFT:            { step: 1, label: 'Taslak',            tone: 'stageDraft'    },
  ANSWER_KEY_READY: { step: 2, label: 'Cevap Anahtarı',    tone: 'stageKey'      },
  RESULTS_UPLOADED: { step: 3, label: 'Sonuçlar Yüklendi', tone: 'stageUploaded' },
  COMPLETED:        { step: 4, label: 'Tamamlandı',        tone: 'stageDone'     },
};

const STAGE_ORDER = ['DRAFT', 'ANSWER_KEY_READY', 'RESULTS_UPLOADED', 'COMPLETED'];

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** Backend ExamViewSet.ORDERING_FIELDS ile birebir aynı olmalı */
type SortKey = 'name' | 'exam_date' | 'status' | 'exam_type' | 'total_questions' | 'answer_count' | 'created_at';

interface SortState { key: SortKey; dir: 'asc' | 'desc' }

/* ── Sıralanabilir sütun başlığı ──────────────────────────────────────────── */

function SortHeader({ label, columnKey, sort, onSort, align }: {
  label: string;
  columnKey: SortKey;
  sort: SortState | null;
  onSort: (key: SortKey) => void;
  align?: 'right';
}) {
  const active = sort?.key === columnKey;
  return (
    <th
      className={`${s.sortable}`}
      onClick={() => onSort(columnKey)}
      style={{ textAlign: align }}
      title={`${label} sütununa göre sırala`}
      aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className={s.thInner}>
        {label}
        <Icon
          name={active && sort?.dir === 'asc' ? 'chevronUp' : 'chevronDown'}
          size={11}
          strokeWidth={3}
          style={{ opacity: active ? 1 : 0.25 }}
        />
      </span>
    </th>
  );
}

/* ── Aşama göstergesi ─────────────────────────────────────────────────────── */

function StageCell({ status, statusDisplay }: { status: string; statusDisplay: string }) {
  const stage = STAGES[status];
  const step = stage?.step ?? 0;
  const tone = stage ? s[stage.tone] : s.stageDraft;
  return (
    <div className={`${s.stage} ${tone}`}>
      <div className={s.stageLabel}>{stage?.label || statusDisplay}</div>
      <div className={s.stageTrack} title={`${step}/4 adım tamamlandı`}>
        {[1, 2, 3, 4].map(i => (
          <span key={i} className={`${s.stageSeg} ${i <= step ? s.stageSegOn : ''}`} />
        ))}
      </div>
    </div>
  );
}

/* ── Silme Onay Modal'ı ───────────────────────────────────────────────────── */

interface DeleteModalProps {
  exam: ExamListItem | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmModal({ exam, busy, onConfirm, onCancel }: DeleteModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (exam) {
      setConfirmText('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [exam]);

  useEffect(() => {
    if (!exam) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exam, onCancel]);

  if (!exam) return null;

  const canDelete = confirmText.trim() === exam.name && !busy;

  return (
    <div role="dialog" aria-modal="true" className={s.modalOverlay} onClick={onCancel}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <div className={s.modalHead}>
          <span className={s.modalHeadIcon}>
            <Icon name="trash" size={19} />
          </span>
          <div>
            <h3 className={s.modalTitle}>Sınavı Listeden Kaldır</h3>
            <p className={s.modalSubtitle}>Sınav pasife alınır, veriler silinmez</p>
          </div>
        </div>

        <div className={s.modalBody}>
          <div className={s.modalExam}>
            <div className={s.modalExamName}>{exam.name}</div>
            <div className={s.modalExamMeta}>
              {exam.exam_type_display} · {exam.status_display}
            </div>
          </div>

          {/* Backend perform_destroy() kaydı is_active=False yapar; veriler silinmez. */}
          <ul className={s.modalList}>
            <li>Sınav listede ve analiz ekranlarında görünmez.</li>
            <li>
              <strong>{exam.answer_count || 0}</strong> öğrenci cevap kaydı ve{' '}
              <strong>{exam.session_count || 0}</strong> oturum verisi veritabanında korunur.
            </li>
            {exam.linked_tyt_exam_name && (
              <li>TYT bağlantısı (<strong>{exam.linked_tyt_exam_name}</strong>) kullanılamaz hâle gelir.</li>
            )}
            {exam.linked_ayt_exam_name && (
              <li>AYT bağlantısı (<strong>{exam.linked_ayt_exam_name}</strong>) kullanılamaz hâle gelir.</li>
            )}
            <li>Geri almak için sistem yöneticisine başvurmanız gerekir.</li>
          </ul>

          <label className={s.modalLabel} htmlFor="delete-confirm-input">
            Onaylamak için sınav adını yazın: <strong>{exam.name}</strong>
          </label>
          <input
            id="delete-confirm-input"
            ref={inputRef}
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={exam.name}
            className={`${s.modalInput} ${canDelete ? s.modalInputReady : ''}`}
            onKeyDown={e => { if (e.key === 'Enter' && canDelete) onConfirm(); }}
          />

          <div className={s.modalFoot}>
            <button onClick={onCancel} className={s.modalCancel}>Vazgeç</button>
            <button onClick={onConfirm} disabled={!canDelete} className={s.modalConfirm}>
              <Icon name={busy ? 'refresh' : 'trash'} size={14} />
              {busy ? 'Kaldırılıyor…' : 'Listeden Kaldır'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */

interface RematchResult {
  success: boolean;
  total_unmatched: number;
  newly_matched: number;
  still_unmatched: number;
  exam_results: Array<{ exam_id: number; exam_name: string; newly_matched: number; still_unmatched: number }>;
  message?: string;
}

export default function OlcmeListPage() {
  const [exams, setExams]     = useState<ExamListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  /* Arama: searchInput anlık, search gecikmeli (her tuşta istek atmasın) */
  const [searchInput, setSearchInput]   = useState('');
  const [search, setSearch]             = useState('');
  const [typeFilter, setTypeFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort]                 = useState<SortState | null>({ key: 'created_at', dir: 'desc' });
  const [pdfBusy, setPdfBusy]           = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ExamListItem | null>(null);
  const [deleting, setDeleting]         = useState(false);

  const [rematching, setRematching]         = useState(false);
  const [rematchResult, setRematchResult]   = useState<RematchResult | null>(null);

  /* ── Arama debounce ── */
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listParams = useCallback((): Record<string, string> => {
    const params: Record<string, string> = {};
    if (search)       params.search    = search;
    if (typeFilter)   params.exam_type = typeFilter;
    if (statusFilter) params.status    = statusFilter;
    if (sort)         params.ordering  = `${sort.dir === 'desc' ? '-' : ''}${sort.key}`;
    return params;
  }, [search, typeFilter, statusFilter, sort]);

  /* ── Fetch ── */
  const fetchExams = useCallback(() => {
    setLoading(true);
    examApi.list(listParams())
      .then(data => { setExams(data); setError(''); })
      .catch(e => setError(e instanceof Error ? e.message : 'Sınavlar yüklenemedi.'))
      .finally(() => setLoading(false));
  }, [listParams]);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  const handleSort = (key: SortKey) => {
    setSort(prev => {
      const defaultDir = key === 'exam_date' || key === 'created_at' ? 'desc' : 'asc';
      if (prev?.key !== key) return { key, dir: defaultDir };
      if (prev.dir === defaultDir) return { key, dir: defaultDir === 'desc' ? 'asc' : 'desc' };
      return { key: 'created_at', dir: 'desc' };
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await examApi.delete(deleteTarget.id);
      setExams(prev => prev.filter(e => e.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Silme işlemi başarısız.');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleRematchAll = async () => {
    setRematching(true);
    setRematchResult(null);
    try {
      const result = await uploadApi.rematchAll();
      setRematchResult(result);
      fetchExams();
    } catch (e) {
      setRematchResult({
        success: false, total_unmatched: 0, newly_matched: 0, still_unmatched: 0,
        exam_results: [],
        message: e instanceof Error ? e.message : 'Eşleştirme sırasında hata oluştu',
      });
    } finally {
      setRematching(false);
    }
  };

  const hasFilter = Boolean(search || typeFilter || statusFilter);
  const clearFilters = () => {
    setSearchInput(''); setSearch(''); setTypeFilter(''); setStatusFilter('');
  };

  const handleListPdf = async () => {
    setPdfBusy(true);
    setError('');
    try {
      await examApi.downloadListPdf(listParams());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Liste PDF indirilemedi.');
    } finally {
      setPdfBusy(false);
    }
  };

  /* İstatistikler ekrandaki (filtrelenmiş) listeyi özetler */
  const stats = useMemo(() => ({
    total: exams.length,
    draft: exams.filter(e => e.status === 'DRAFT').length,
    completed: exams.filter(e => e.status === 'COMPLETED').length,
    unmatched: exams.reduce((a, e) => a + (e.unmatched_count || 0), 0),
  }), [exams]);

  /**
   * Durum çiplerindeki sayılar. Durum filtresi sunucuda uygulandığı için,
   * bir durum seçiliyken diğerlerinin sayısı elde olmaz; bu yüzden sayı
   * yalnızca filtre yokken gösterilir.
   */
  const statusCounts = useMemo(() => {
    if (statusFilter) return null;
    const counts: Record<string, number> = {};
    for (const st of STAGE_ORDER) counts[st] = 0;
    for (const e of exams) counts[e.status] = (counts[e.status] || 0) + 1;
    return counts;
  }, [exams, statusFilter]);

  /* ═══════════ RENDER ═══════════ */

  return (
    <div className="section">
      <DeleteConfirmModal
        exam={deleteTarget}
        busy={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* ── Sayfa başlığı ────────────────────────────────────────────────── */}
      <header className={s.header}>
        <div className={s.headerTop}>
          <div style={{ minWidth: 0 }}>
            <div className={s.breadcrumb}>
              <span>Koçluk</span>
              <Icon name="chevronRight" size={13} />
              <span className={s.crumbCurrent}>Ölçme &amp; Değerlendirme</span>
            </div>
            <div className={s.titleBlock}>
              <span className={s.titleIcon}>
                <Icon name="exam" size={24} />
              </span>
              <div style={{ minWidth: 0 }}>
                <h1 className={s.title}>Sınav Yönetimi</h1>
                <p className={s.subtitle}>
                  Sınavları oluşturun, optik sonuçları yükleyin ve analiz edin
                </p>
              </div>
            </div>
          </div>

          <div className={s.actions}>
            <button
              onClick={handleRematchAll}
              disabled={rematching}
              className={s.action}
              title="Tüm sınavlarda eşleşmemiş öğrenci kayıtlarını güncel öğrenci havuzuyla yeniden eşleştirir"
            >
              <Icon name="refresh" size={15} className={rematching ? s.spin : undefined} />
              {rematching ? 'Eşleştiriliyor…' : 'Toplu Eşleştir'}
            </button>
            <Link href="/admin/olcme-degerlendirme/kazanimlar" className={s.action}>
              <Icon name="outcome" size={15} />
              Kazanım Yönetimi
            </Link>
            <Link href="/admin/olcme-degerlendirme/yeni" className={`${s.action} ${s.actionPrimary}`}>
              <Icon name="plus" size={16} strokeWidth={2.5} />
              Yeni Sınav
            </Link>
          </div>
        </div>

        {/* Metrikler — eşleşmeyen kayıt sayısı doğrudan uyarı rengiyle görünür */}
        <div className={s.metrics}>
          <div className={s.metric}>
            <span className={s.metricValue}>{stats.total}</span>
            <span className={s.metricLabel}>
              <Icon name="exam" size={12} />
              {hasFilter ? 'Filtrelenen sınav' : 'Toplam sınav'}
            </span>
          </div>
          <div className={s.metric}>
            <span className={s.metricValue}>{stats.draft}</span>
            <span className={s.metricLabel}>
              <Icon name="edit" size={12} />
              Taslak
            </span>
          </div>
          <div className={s.metric}>
            <span className={s.metricValue}>{stats.completed}</span>
            <span className={s.metricLabel}>
              <Icon name="checkCircle" size={12} />
              Tamamlanan
            </span>
          </div>
          <div className={s.metric}>
            <span className={`${s.metricValue} ${stats.unmatched > 0 ? s.metricWarn : ''}`}>
              {stats.unmatched}
            </span>
            <span className={`${s.metricLabel} ${stats.unmatched > 0 ? s.metricWarn : ''}`}>
              <Icon name="users" size={12} />
              Eşleşmeyen kayıt
            </span>
          </div>
        </div>
      </header>

      {/* ── Toplu Eşleştirme Sonucu ──────────────────────────────────────── */}
      {rematchResult && (
        <div className={`${s.notice} ${
          !rematchResult.success ? s.noticeError
            : rematchResult.newly_matched > 0 ? s.noticeOk
            : s.noticeWarn
        }`}>
          <Icon name={rematchResult.success ? 'checkCircle' : 'error'} size={18} style={{ marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {rematchResult.message ? (
              <strong>{rematchResult.message}</strong>
            ) : (
              <>
                <strong>Toplu eşleştirme tamamlandı</strong>
                <div className={s.rematchStats}>
                  <span>Toplam eşleşmemiş: <strong>{rematchResult.total_unmatched}</strong></span>
                  <span>Yeni eşleşen: <strong>{rematchResult.newly_matched}</strong></span>
                  <span>Hâlâ eşleşmemiş: <strong>{rematchResult.still_unmatched}</strong></span>
                </div>
                {rematchResult.exam_results.length > 0 && (
                  <details className={s.rematchDetails}>
                    <summary>Sınav bazlı detay ({rematchResult.exam_results.length} sınav)</summary>
                    <div style={{ marginTop: 6 }}>
                      {rematchResult.exam_results.map(er => (
                        <div key={er.exam_id} className={s.rematchRow}>
                          <span style={{ fontWeight: 500 }}>{er.exam_name}</span>
                          <span>+{er.newly_matched} eşleşti</span>
                          {er.still_unmatched > 0 && <span>{er.still_unmatched} kaldı</span>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}
          </div>
          <button onClick={() => setRematchResult(null)} aria-label="Kapat" className={s.noticeClose}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      {/* ── Filtreler ────────────────────────────────────────────────────── */}
      <div className={s.toolbar}>
        <div className={s.searchBox}>
          <Icon name="search" size={15} className={s.searchIcon} />
          <input
            className={s.searchInput}
            placeholder="Sınav adı ara…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            aria-label="Sınav adı ara"
          />
          {searchInput && (
            <button className={s.searchClear} onClick={() => setSearchInput('')} aria-label="Aramayı temizle">
              <Icon name="close" size={13} />
            </button>
          )}
        </div>

        <select
          className={s.select}
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          aria-label="Sınav türü filtresi"
        >
          <option value="">Tüm Türler</option>
          {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        {/* Durum filtresi — dört değer için çip, açılır listeden daha hızlı */}
        <div className={s.chips}>
          <button
            className={`${s.chip} ${!statusFilter ? s.chipActive : ''}`}
            onClick={() => setStatusFilter('')}
          >
            Tümü
          </button>
          {STAGE_ORDER.map(st => (
            <button
              key={st}
              className={`${s.chip} ${statusFilter === st ? s.chipActive : ''}`}
              onClick={() => setStatusFilter(statusFilter === st ? '' : st)}
            >
              {STAGES[st].label}
              {statusCounts && <span className={s.chipCount}>{statusCounts[st]}</span>}
            </button>
          ))}
        </div>

        <div className={s.toolbarSpacer} />

        {loading && exams.length > 0 && (
          <span className={s.toolbarNote}>
            <Icon name="refresh" size={13} className={s.spin} />
            Güncelleniyor…
          </span>
        )}

        {hasFilter && (
          <button onClick={clearFilters} className={s.linkBtn}>
            <Icon name="close" size={13} />
            Filtreleri Temizle
          </button>
        )}

        <button
          type="button"
          onClick={handleListPdf}
          disabled={pdfBusy || exams.length === 0}
          className={s.linkBtn}
          title="Ekrandaki filtrelenmiş listeyi PDF indir"
        >
          <Icon name="download" size={13} />
          {pdfBusy ? 'PDF hazırlanıyor…' : 'Liste PDF'}
        </button>
      </div>

      {/* ── Hata ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className={`${s.notice} ${s.noticeError}`}>
          <Icon name="error" size={18} style={{ marginTop: 1 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button className={s.linkBtn} onClick={fetchExams}>
            <Icon name="refresh" size={13} />
            Tekrar Dene
          </button>
        </div>
      )}

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {loading && exams.length === 0 && (
        <div className={s.tableCard}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className={s.skeletonRow}>
              <div className="skeleton" style={{ height: 14, borderRadius: 6, flex: 3 }} />
              <div className="skeleton" style={{ height: 14, borderRadius: 6, flex: 1 }} />
              <div className="skeleton" style={{ height: 14, borderRadius: 6, flex: 1 }} />
              <div className="skeleton" style={{ height: 14, borderRadius: 6, flex: 1 }} />
            </div>
          ))}
        </div>
      )}

      {/* ── Boş durumlar ─────────────────────────────────────────────────── */}
      {!loading && !error && exams.length === 0 && (
        <div className={s.empty}>
          <span className={s.emptyIcon}>
            <Icon name={hasFilter ? 'search' : 'exam'} size={26} />
          </span>
          {hasFilter ? (
            <>
              <h3 className={s.emptyTitle}>Sonuç bulunamadı</h3>
              <p className={s.emptyText}>Seçtiğiniz filtrelere uyan sınav yok.</p>
              <button onClick={clearFilters} className={s.rowBtn}>
                <Icon name="close" size={14} />
                Filtreleri Temizle
              </button>
            </>
          ) : (
            <>
              <h3 className={s.emptyTitle}>Henüz sınav yok</h3>
              <p className={s.emptyText}>
                İlk sınavınızı oluşturarak başlayın. Bölümler sınav türüne göre otomatik gelir.
              </p>
              <Link href="/admin/olcme-degerlendirme/yeni" className={`${s.rowBtn} ${s.rowBtnPrimary}`}>
                <Icon name="plus" size={14} strokeWidth={2.5} />
                İlk Sınavı Oluştur
              </Link>
            </>
          )}
        </div>
      )}

      {/* ── Tablo ────────────────────────────────────────────────────────── */}
      {!loading && exams.length > 0 && (
        <div className={s.tableCard}>
          <div className={s.tableScroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.numHead}>#</th>
                  <SortHeader label="Sınav" columnKey="name" sort={sort} onSort={handleSort} />
                  <SortHeader label="Tür" columnKey="exam_type" sort={sort} onSort={handleSort} />
                  <SortHeader label="Aşama" columnKey="status" sort={sort} onSort={handleSort} />
                  <SortHeader label="Sınav tarihi" columnKey="exam_date" sort={sort} onSort={handleSort} />
                  <SortHeader label="İçerik" columnKey="total_questions" sort={sort} onSort={handleSort} />
                  <SortHeader label="Sonuçlar" columnKey="answer_count" sort={sort} onSort={handleSort} />
                  <th>Sınıflar</th>
                  <th style={{ textAlign: 'right' }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((exam, index) => {
                  const matchPct = exam.answer_count > 0
                    ? Math.round((exam.matched_count / exam.answer_count) * 100)
                    : 0;
                  return (
                    <tr key={exam.id}>
                      <td className={s.numCell}>{index + 1}</td>
                      {/* Sınav adı + bağlantı rozetleri */}
                      <td className={s.nameCell}>
                        <div className={s.nameRow}>
                          <Link href={`/admin/olcme-degerlendirme/${exam.id}`} className={s.nameLink}>
                            {exam.name}
                          </Link>
                          {exam.is_locked && (
                            <span className={s.tagIcon} title="Kilitli — düzenlemeye kapalı">
                              <Icon name="lock" size={12} strokeWidth={2.5} />
                            </span>
                          )}
                          {exam.is_template && <span className={s.tag}>ŞABLON</span>}
                        </div>
                        {(exam.linked_tyt_exam_name || exam.linked_ayt_exam_name) && (
                          <div className={s.linkChips}>
                            {exam.linked_tyt_exam_name && (
                              <span className={`${s.linkChip} ${s.linkChipTyt}`} title={exam.linked_tyt_exam_name}>
                                <Icon name="link" size={10} />
                                TYT: {exam.linked_tyt_exam_name}
                              </span>
                            )}
                            {exam.linked_ayt_exam_name && (
                              <span className={`${s.linkChip} ${s.linkChipAyt}`} title={exam.linked_ayt_exam_name}>
                                <Icon name="link" size={10} />
                                AYT: {exam.linked_ayt_exam_name}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td style={{ whiteSpace: 'nowrap' }}>{exam.exam_type_display}</td>

                      <td>
                        <StageCell status={exam.status} statusDisplay={exam.status_display} />
                      </td>

                      <td style={{ whiteSpace: 'nowrap' }}>
                        {fmtDate(exam.exam_date)}
                        {exam.duration_minutes && (
                          <div className={s.subMeta}>
                            {exam.duration_minutes} dk
                            {exam.session_count > 1 && ` · ${exam.session_count} oturum`}
                          </div>
                        )}
                      </td>

                      <td style={{ whiteSpace: 'nowrap' }}>
                        <strong>{exam.total_questions}</strong> soru
                        <div className={s.subMeta}>{exam.section_count} bölüm</div>
                      </td>

                      {/* Sonuç durumu — eşleşme oranı çubukla görünür */}
                      <td className={s.resultCell}>
                        {exam.answer_count > 0 ? (
                          <>
                            <div className={s.resultTop}>
                              <span className={s.resultCount}>{exam.answer_count}</span>
                              <span className={s.muted}>öğrenci</span>
                            </div>
                            <div className={s.matchTrack} title={`${exam.matched_count} / ${exam.answer_count} eşleşti`}>
                              <div className={s.matchFill} style={{ width: `${matchPct}%` }} />
                            </div>
                            <div className={s.matchMeta}>
                              {exam.unmatched_count > 0 ? (
                                <span className={s.matchWarn}>{exam.unmatched_count} eşleşmedi</span>
                              ) : (
                                <>Tümü eşleşti</>
                              )}
                            </div>
                          </>
                        ) : (
                          <span className={s.muted}>Yüklenmedi</span>
                        )}
                      </td>

                      <td className={s.muted} style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={exam.sinif_display || ''}>
                        {exam.sinif_display || '—'}
                      </td>

                      {/* İşlemler — sınavın aşamasına göre en olası adım öne çıkar */}
                      <td>
                        <div className={s.rowActions}>
                          {exam.answer_count > 0 ? (
                            <Link href={`/admin/olcme-degerlendirme/${exam.id}?tab=analiz`}
                              className={`${s.rowBtn} ${s.rowBtnPrimary}`}>
                              <Icon name="chart" size={13} />
                              Analiz
                            </Link>
                          ) : exam.status === 'DRAFT' ? (
                            <Link href={`/admin/olcme-degerlendirme/${exam.id}?tab=cevap-anahtari`}
                              className={`${s.rowBtn} ${s.rowBtnPrimary}`}>
                              <Icon name="answerKey" size={13} />
                              Cevap Anahtarı
                            </Link>
                          ) : (
                            <Link href={`/admin/olcme-degerlendirme/${exam.id}?tab=yukle`}
                              className={`${s.rowBtn} ${s.rowBtnPrimary}`}>
                              <Icon name="upload" size={13} />
                              Sonuç Yükle
                            </Link>
                          )}
                          <Link href={`/admin/olcme-degerlendirme/${exam.id}`} className={s.rowBtn}>
                            Aç
                          </Link>
                          <button
                            onClick={() => setDeleteTarget(exam)}
                            title="Sınavı listeden kaldır"
                            aria-label={`${exam.name} sınavını listeden kaldır`}
                            className={`${s.rowBtn} ${s.rowBtnDanger}`}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
