'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { analysisApi, type KarneBulkProgress, type KarneBulkStudentRow } from '../api';
import { ALAN_LABELS } from '../pdfExport';
import type { ExamPublishDispatch, StudentAnalysis } from '../types';
import m from './KarneBulkNotifyModal.module.css';

const PREVIEW_CHUNK = 40;
const PREVIEW_PARALLEL = 3;
const DAILY_LIMIT_HINT = 250;

type Target = 'both' | 'veli' | 'ogrenci';
type View = 'all' | 'ready' | 'blocked';

interface Props {
  examId: number;
  examName: string;
  examType: string;
  students: StudentAnalysis[];
  uniqueSiniflar: string[];
  rankingYear?: number;
  unmatchedCount?: number;
  onClose: () => void;
}

const TARGETS: { id: Target; label: string }[] = [
  { id: 'both', label: 'Veli + öğrenci' },
  { id: 'veli', label: 'Yalnız veli' },
  { id: 'ogrenci', label: 'Yalnız öğrenci' },
];

function normalize(text: string) {
  return text.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function KarneBulkNotifyModal({
  examId, examName, examType, students, uniqueSiniflar, rankingYear, unmatchedCount = 0, onClose,
}: Props) {
  const [alanFilter, setAlanFilter] = useState('');
  const [sinifFilter, setSinifFilter] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>('all');
  const [target, setTarget] = useState<Target>('both');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(0);
  const [loadKey, setLoadKey] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rows, setRows] = useState<KarneBulkStudentRow[]>([]);
  const [schedule, setSchedule] = useState<ExamPublishDispatch | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [queued, setQueued] = useState(false);
  const [live, setLive] = useState<KarneBulkProgress | null>(null);
  const [banner, setBanner] = useState<KarneBulkProgress | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const includeVeli = target !== 'ogrenci';
  const includeStudent = target !== 'veli';

  const studentById = useMemo(() => {
    const map = new Map<number, StudentAnalysis>();
    for (const st of students) map.set(st.answer_id, st);
    return map;
  }, [students]);

  const allIds = useMemo(() => students.map(st => st.answer_id).join(','), [students]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = allIds ? allIds.split(',').map(Number) : [];
      setLoading(true);
      setLoadError('');
      setLoaded(0);
      if (!ids.length) {
        setRows([]);
        setLoading(false);
        return;
      }
      const chunks: number[][] = [];
      for (let i = 0; i < ids.length; i += PREVIEW_CHUNK) chunks.push(ids.slice(i, i + PREVIEW_CHUNK));
      const results: KarneBulkStudentRow[][] = new Array(chunks.length);
      let warning: ExamPublishDispatch | null = null;
      let next = 0;
      try {
        const worker = async () => {
          while (next < chunks.length) {
            const index = next++;
            if (cancelled) return;
            const res = await analysisApi.karneNotifyBulkPreview(examId, chunks[index]);
            if (!res.success || !res.data) throw new Error(res.error || 'Alıcılar yüklenemedi.');
            results[index] = res.data.students || [];
            if (res.data.scheduled_warning) warning = res.data.scheduled_warning;
            if (!cancelled) setLoaded(n => n + chunks[index].length);
          }
        };
        await Promise.all(Array.from({ length: Math.min(PREVIEW_PARALLEL, chunks.length) }, worker));
        if (cancelled) return;
        const all = results.flat();
        setRows(all);
        setSchedule(warning);
        setExcluded(new Set(all.filter(r => r.skip_reason).map(r => r.answer_id)));
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Alıcılar yüklenemedi.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [examId, allIds, loadKey]);

  const messagesFor = (r: KarneBulkStudentRow) =>
    r.skip_reason ? 0 : (includeVeli ? r.veli_count || 0 : 0) + (includeStudent && r.has_student ? 1 : 0);

  const scopeRows = useMemo(() => rows.filter(r => {
    const st = studentById.get(r.answer_id);
    if (alanFilter && st?.alan !== alanFilter) return false;
    if (sinifFilter && st?.sinif !== sinifFilter) return false;
    return true;
  }), [rows, studentById, alanFilter, sinifFilter]);

  const readyRows = scopeRows.filter(r => messagesFor(r) > 0);
  const blockedCount = scopeRows.length - readyRows.length;
  const sendable = readyRows.filter(r => !excluded.has(r.answer_id));
  const veliSelected = includeVeli ? sendable.reduce((n, r) => n + (r.veli_count || 0), 0) : 0;
  const ogrenciSelected = includeStudent ? sendable.filter(r => r.has_student).length : 0;
  const messageTotal = veliSelected + ogrenciSelected;
  const usesDocument = sendable.some(r => r.send_mode === 'document');

  const visibleRows = useMemo(() => {
    const q = normalize(search.trim());
    return scopeRows.filter(r => {
      const ready = messagesFor(r) > 0;
      if (view === 'ready' && !ready) return false;
      if (view === 'blocked' && ready) return false;
      if (q && !normalize(r.student_name || '').includes(q)) return false;
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeRows, search, view, target]);

  const visibleReady = visibleRows.filter(r => messagesFor(r) > 0);
  const allVisibleChecked = visibleReady.length > 0 && visibleReady.every(r => !excluded.has(r.answer_id));

  const toggle = (id: number) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVisible = () => {
    setExcluded(prev => {
      const next = new Set(prev);
      for (const r of visibleReady) {
        if (allVisibleChecked) next.add(r.answer_id);
        else next.delete(r.answer_id);
      }
      return next;
    });
  };

  const handleSend = async () => {
    if (!sendable.length || messageTotal === 0) return;
    setSending(true);
    setSendError('');
    try {
      const res = await analysisApi.karneNotifyBulkQueue(
        examId,
        {
          answer_ids: sendable.map(r => r.answer_id),
          include_veli: includeVeli,
          include_student: includeStudent,
          expected_recipients: messageTotal,
        },
        rankingYear,
      );
      if (!res.success) throw new Error(res.error || 'Gönderim kuyruğa alınamadı.');
      setConfirming(false);
      setQueued(true);
      setLive({
        state: 'running',
        students_total: sendable.length,
        students_done: 0,
        sent: 0,
        skipped: 0,
        campaign_id: res.data?.campaign_id ?? null,
      });
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Gönderim hatası');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    let stop = false;
    let timer = 0;
    const tick = async () => {
      try {
        const res = await analysisApi.karneNotifyBulkProgress(examId);
        if (stop || !res.success || !res.data) return;
        if (res.data.state === 'idle') return;
        if (res.data.state === 'running' || queued) {
          setLive(res.data);
          setBanner(null);
          if (res.data.state === 'running') {
            setQueued(true);
            timer = window.setTimeout(tick, 2000);
          }
          return;
        }
        setBanner(res.data);
      } catch {
        if (!stop && queued) timer = window.setTimeout(tick, 3000);
      }
    };
    timer = window.setTimeout(tick, queued ? 400 : 0);
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [examId, queued]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || sending) return;
      if (confirming) setConfirming(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming, sending, onClose]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const pct = live && live.students_total
    ? Math.min(100, Math.round((live.students_done / live.students_total) * 100))
    : 0;
  const showProgress = Boolean(live && live.state !== 'idle');
  const previouslySent = banner && banner.state === 'done' && (banner.sent || banner.students_done) ? banner : null;
  const historyHref = (id?: string | null) => (id ? `/admin/iletisim/kampanyalar?campaign=${id}` : '');

  const warnings: { tone: 'warn' | 'info'; text: React.ReactNode }[] = [];
  if (previouslySent) {
    warnings.push({
      tone: 'warn',
      text: (
        <>
          Bu sınavın karneleri daha önce gönderildi ({previouslySent.students_done} öğrenci, {previouslySent.sent} mesaj).
          Tekrar gönderirseniz seçtiğiniz kişilere <strong>ikinci kez</strong> gider.
        </>
      ),
    });
  }
  if (schedule) {
    warnings.push({
      tone: 'warn',
      text: <>Bu sınav için {formatDateTime(schedule.scheduled_at)} tarihinde otomatik karne gönderimi planlı. Şimdi gönderirseniz o plan iptal edilir.</>,
    });
  }
  if (usesDocument) {
    warnings.push({
      tone: 'warn',
      text: <>Karne için onaylı WhatsApp şablonu tanımlı değil. Mesaj yalnızca son 24 saatte size yazmış kişilere ulaşır, diğerleri başarısız olur.</>,
    });
  }
  if (messageTotal > DAILY_LIMIT_HINT) {
    warnings.push({
      tone: 'info',
      text: <>{messageTotal} mesaj kuyruğa alınır. WhatsApp hattınızın günlük kişi sınırı dolarsa kalanlar sınır açıldığında otomatik gider.</>,
    });
  }

  const subtitle = showProgress
    ? 'Gönderim sunucuda sürüyor'
    : loading
      ? 'Alıcılar hazırlanıyor…'
      : `${sendable.length} öğrenci seçili · ${messageTotal} mesaj`;

  return (
    <div
      className={m.overlay}
      onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }}
    >
      <div
        ref={dialogRef}
        className={m.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="karne-bulk-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={m.head}>
          <div className={m.headIcon} aria-hidden>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.5-.3Z" />
            </svg>
          </div>
          <div className={m.headText}>
            <h3 id="karne-bulk-title" className={m.title}>Karneleri WhatsApp ile gönder</h3>
            <p className={m.subtitle} title={examName}>
              <span className={m.examName}>{examName}</span>
              <span className={m.dot} aria-hidden>·</span>
              <span className={m.subtitleCount}>{subtitle}</span>
            </p>
          </div>
          <button type="button" className={m.close} onClick={onClose} disabled={sending} aria-label="Kapat">×</button>
        </header>

        {showProgress && live ? (
          <div className={m.progress}>
            <div className={`${m.progressBadge} ${live.state === 'error' ? m.toneError : live.state === 'done' ? m.toneOk : ''}`}>
              {live.state === 'done' ? 'Tamamlandı' : live.state === 'error' ? 'Durdu' : 'Hazırlanıyor'}
            </div>
            <h4 className={m.progressTitle}>
              {live.state === 'done'
                ? 'Karneler kuyruğa alındı'
                : live.state === 'error'
                  ? 'Gönderim durdu'
                  : 'Karneler hazırlanıyor ve kuyruğa alınıyor'}
            </h4>
            <div className={m.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={live.state === 'done' ? 100 : pct}>
              <div
                className={`${m.barFill} ${live.state === 'error' ? m.barError : ''}`}
                style={{ width: `${live.state === 'done' ? 100 : pct}%` }}
              />
            </div>
            <dl className={m.stats}>
              <div><dt>Öğrenci</dt><dd>{live.students_done} / {live.students_total || '…'}</dd></div>
              <div><dt>Kuyruktaki mesaj</dt><dd>{live.sent || 0}</dd></div>
              <div><dt>Gidemeyen</dt><dd className={live.skipped ? m.bad : ''}>{live.skipped || 0}</dd></div>
            </dl>
            <p className={m.progressNote}>
              {live.state === 'error'
                ? (live.error || 'Karne üretimi tamamlanamadı.')
                : 'Bu pencereyi kapatabilirsiniz; gönderim sunucuda devam eder. Kime gittiğini gönderim geçmişinden izleyebilirsiniz.'}
            </p>
            <div className={m.progressActions}>
              {live.campaign_id && (
                <Link href={historyHref(live.campaign_id)} className={m.btnPrimary}>Gönderim geçmişi</Link>
              )}
              <button type="button" className={m.btnGhost} onClick={onClose}>Kapat</button>
            </div>
          </div>
        ) : loadError ? (
          <div className={m.state}>
            <p className={m.stateError}>{loadError}</p>
            <button type="button" className={m.btnGhost} onClick={() => setLoadKey(k => k + 1)}>Tekrar dene</button>
          </div>
        ) : loading ? (
          <div className={m.state}>
            <div className={m.spinner} aria-hidden />
            <p>Alıcılar hazırlanıyor… {students.length > PREVIEW_CHUNK ? `${loaded}/${students.length}` : ''}</p>
          </div>
        ) : confirming ? (
          <div className={m.body}>
            <div className={m.confirm}>
              <h4 className={m.confirmTitle}>Gönderimi onaylayın</h4>
              <dl className={m.confirmList}>
                <div><dt>Sınav</dt><dd>{examName}</dd></div>
                <div><dt>Kapsam</dt><dd>{[sinifFilter || 'Tüm sınıflar', alanFilter ? ALAN_LABELS[alanFilter] || alanFilter : ''].filter(Boolean).join(' · ')}</dd></div>
                <div><dt>Öğrenci</dt><dd>{sendable.length}</dd></div>
                {includeVeli && <div><dt>Veliye giden</dt><dd>{veliSelected} mesaj</dd></div>}
                {includeStudent && <div><dt>Öğrenciye giden</dt><dd>{ogrenciSelected} mesaj</dd></div>}
                <div className={m.confirmTotal}><dt>Toplam</dt><dd>{messageTotal} mesaj</dd></div>
              </dl>
              <p className={m.hint}>Her mesajda öğrencinin kendi karnesi PDF olarak gider. Birden çok çocuğu olan veliye her çocuk için ayrı mesaj gider.</p>
              {warnings.map((w, i) => (
                <div key={i} className={`${m.alert} ${w.tone === 'warn' ? m.alertWarn : m.alertInfo}`}>{w.text}</div>
              ))}
              {sendError && <div className={`${m.alert} ${m.alertError}`}>{sendError}</div>}
            </div>
          </div>
        ) : (
          <div className={m.body}>
            <section className={m.controls} aria-label="Gönderim seçenekleri">
              <div className={m.field}>
                <span className={m.label}>Kime gitsin?</span>
                <div className={m.segment} role="radiogroup" aria-label="Alıcılar">
                  {TARGETS.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={target === t.id}
                      className={`${m.segmentBtn} ${target === t.id ? m.segmentOn : ''}`}
                      onClick={() => setTarget(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={m.filters}>
                <label className={m.field}>
                  <span className={m.label}>Sınıf / Program</span>
                  <select className={m.select} value={sinifFilter} onChange={e => setSinifFilter(e.target.value)}>
                    <option value="">Tüm sınıflar</option>
                    {uniqueSiniflar.map(sn => <option key={sn} value={sn}>{sn}</option>)}
                  </select>
                </label>
                {examType === 'YKS_AYT' && (
                  <label className={m.field}>
                    <span className={m.label}>Alan</span>
                    <select className={m.select} value={alanFilter} onChange={e => setAlanFilter(e.target.value)}>
                      <option value="">Tüm alanlar</option>
                      {Object.entries(ALAN_LABELS).map(([kod, label]) => (
                        <option key={kod} value={kod}>{label}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </section>

            <div className={m.summary} aria-live="polite">
              <div className={m.summaryItem}><strong>{sendable.length}</strong><span>öğrenci</span></div>
              {includeVeli && <div className={m.summaryItem}><strong>{veliSelected}</strong><span>veli mesajı</span></div>}
              {includeStudent && <div className={m.summaryItem}><strong>{ogrenciSelected}</strong><span>öğrenci mesajı</span></div>}
              <div className={`${m.summaryItem} ${m.summaryTotal}`}><strong>{messageTotal}</strong><span>toplam mesaj</span></div>
            </div>

            {previouslySent && (
              <div className={`${m.alert} ${m.alertWarn}`}>
                Son gönderim: {previouslySent.students_done} öğrenci · {previouslySent.sent} mesaj
                {previouslySent.skipped ? ` · ${previouslySent.skipped} gidemedi` : ''}.
                Tekrar gönderim aynı kişilere ikinci kez gider.
                {previouslySent.campaign_id && (
                  <> <Link href={historyHref(previouslySent.campaign_id)} className={m.alertLink}>Gönderim geçmişi</Link></>
                )}
              </div>
            )}
            {banner && banner.state === 'error' && (
              <div className={`${m.alert} ${m.alertError}`}>
                Son gönderim yarıda kaldı: {banner.students_done}/{banner.students_total} öğrenci. {banner.error}
              </div>
            )}

            <div className={m.listTools}>
              <input
                type="search"
                className={m.search}
                placeholder="Öğrenci ara"
                value={search}
                onChange={e => setSearch(e.target.value)}
                aria-label="Öğrenci ara"
              />
              <div className={m.chips} role="tablist" aria-label="Liste filtresi">
                {([
                  ['all', `Tümü ${scopeRows.length}`],
                  ['ready', `Gönderilebilir ${readyRows.length}`],
                  ['blocked', `Gönderilemez ${blockedCount}`],
                ] as [View, string][]).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={view === id}
                    className={`${m.chip} ${view === id ? m.chipOn : ''} ${id === 'blocked' && blockedCount ? m.chipWarn : ''}`}
                    onClick={() => setView(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {visibleReady.length > 0 && (
              <label className={m.selectAll}>
                <input type="checkbox" checked={allVisibleChecked} onChange={toggleVisible} />
                {allVisibleChecked ? 'Listedekilerin seçimini kaldır' : 'Listedekilerin hepsini seç'} ({visibleReady.length})
              </label>
            )}

            <ul className={m.list}>
              {visibleRows.map(r => {
                const count = messagesFor(r);
                const blocked = count === 0;
                const checked = !blocked && !excluded.has(r.answer_id);
                const st = studentById.get(r.answer_id);
                const reason = r.skip_reason
                  || (target === 'veli' ? 'Gönderilebilir veli yok' : target === 'ogrenci' ? 'Öğrenci telefonu yok veya izin vermemiş' : 'Alıcı yok');
                return (
                  <li key={r.answer_id}>
                    <label className={`${m.row} ${blocked ? m.rowBlocked : ''} ${checked ? m.rowOn : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={blocked}
                        onChange={() => toggle(r.answer_id)}
                      />
                      <span className={m.rowMain}>
                        <span className={m.rowName}>{r.student_name}</span>
                        <span className={m.rowMeta}>
                          {st?.sinif && <span className={m.tag}>{st.sinif}</span>}
                          {blocked ? (
                            <span className={m.reason}>{reason}</span>
                          ) : (
                            <>
                              {includeVeli && <span className={r.veli_count ? m.ok : m.muted}>{r.veli_count} veli</span>}
                              {includeStudent && <span className={r.has_student ? m.ok : m.muted}>{r.has_student ? 'öğrenci telefonu var' : 'öğrenci telefonu yok'}</span>}
                            </>
                          )}
                        </span>
                      </span>
                      {!blocked && <span className={m.rowCount} title="Bu öğrenci için giden mesaj">{count}</span>}
                    </label>
                  </li>
                );
              })}
              {!visibleRows.length && (
                <li className={m.empty}>
                  {rows.length ? 'Bu filtreye uyan öğrenci yok.' : 'Gönderilecek öğrenci yok.'}
                </li>
              )}
            </ul>
            {unmatchedCount > 0 && (
              <p className={m.hint}>{unmatchedCount} sonuç bir öğrenci kaydıyla eşleşmediği için listede yok.</p>
            )}
          </div>
        )}

        {!showProgress && !loading && !loadError && (
          <footer className={m.foot}>
            <div className={m.footInfo}>
              {confirming ? 'Gönderim arka planda yapılır, pencere kapanabilir.' : <><strong>{messageTotal}</strong> mesaj · {sendable.length} öğrenci</>}
            </div>
            <div className={m.footActions}>
              {confirming ? (
                <>
                  <button type="button" className={m.btnGhost} onClick={() => setConfirming(false)} disabled={sending}>Geri</button>
                  <button type="button" className={m.btnPrimary} onClick={handleSend} disabled={sending || messageTotal === 0}>
                    {sending ? 'Kuyruğa alınıyor…' : `Evet, ${messageTotal} mesajı gönder`}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className={m.btnGhost} onClick={onClose}>Vazgeç</button>
                  <button
                    type="button"
                    className={m.btnPrimary}
                    onClick={() => { setSendError(''); setConfirming(true); }}
                    disabled={messageTotal === 0}
                  >
                    Devam · {messageTotal} mesaj
                  </button>
                </>
              )}
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
