'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileBarChart2,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import {
  studentExamApi,
  type ParentExamReportOptions,
  type ParentExamReportPreviewData,
  type ParentReportTheme,
  type ParentReportTone,
} from '@/components/olcme/api';
import s from './ParentExamReportStudio.module.css';

interface Props {
  studentId: number;
  studentName?: string;
  onClose: () => void;
}

const PREFS_KEY = 'coach_parent_report_prefs_v2';

type StudioOptions = {
  scope: 'both' | 'TYT' | 'AYT' | 'LGS' | 'CLASS';
  window: 'last_3' | 'last_5' | 'last_10' | 'all';
  date_from: string;
  date_to: string;
  theme: ParentReportTheme;
  tone: ParentReportTone;
  custom_title: string;
  include_kurum_avg: boolean;
  include_progress_bridge: boolean;
  include_net_breakdown: boolean;
  include_exam_table: boolean;
  include_error_profile: boolean;
  include_strengths: boolean;
  include_study_focus: boolean;
  include_assignments: boolean;
  include_attendance: boolean;
  include_ranking: boolean;
  coach_note: string;
};

const DEFAULT_OPTIONS: StudioOptions = {
  scope: 'both',
  window: 'last_5',
  date_from: '',
  date_to: '',
  theme: 'midnight',
  tone: 'balanced',
  custom_title: '',
  include_kurum_avg: true,
  include_progress_bridge: true,
  include_net_breakdown: true,
  include_exam_table: true,
  include_error_profile: true,
  include_strengths: true,
  include_study_focus: true,
  include_assignments: true,
  include_attendance: true,
  include_ranking: false,
  coach_note: '',
};

const PERSISTED_KEYS: Array<keyof StudioOptions> = [
  'window',
  'theme',
  'tone',
  'include_kurum_avg',
  'include_progress_bridge',
  'include_net_breakdown',
  'include_exam_table',
  'include_error_profile',
  'include_strengths',
  'include_study_focus',
  'include_assignments',
  'include_attendance',
  'include_ranking',
];

function loadSavedOptions(): StudioOptions {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_OPTIONS;
    const parsed = JSON.parse(raw) as Partial<StudioOptions>;
    const next: StudioOptions = { ...DEFAULT_OPTIONS };
    for (const k of PERSISTED_KEYS) {
      if (parsed[k] !== undefined) {
        (next as Record<string, unknown>)[k] = parsed[k];
      }
    }
    return next;
  } catch {
    return DEFAULT_OPTIONS;
  }
}

const WINDOW_ITEMS: Array<{ value: StudioOptions['window']; label: string }> = [
  { value: 'last_3', label: 'Son 3' },
  { value: 'last_5', label: 'Son 5' },
  { value: 'last_10', label: 'Son 10' },
  { value: 'all', label: 'Tüm dönem' },
];

const THEME_ITEMS: Array<{ value: ParentReportTheme; label: string; swatchClass: string }> = [
  { value: 'midnight', label: 'Gece Laciverti', swatchClass: s.swatchMidnight },
  { value: 'brand', label: 'Kurumsal Mavi', swatchClass: s.swatchBrand },
  { value: 'print', label: 'Baskı Dostu', swatchClass: s.swatchPrint },
];

const TONE_ITEMS: Array<{ value: ParentReportTone; label: string }> = [
  { value: 'supportive', label: 'Destekleyici' },
  { value: 'balanced', label: 'Dengeli' },
  { value: 'focused', label: 'Hedef Odaklı' },
];

export default function ParentExamReportStudio({ studentId, studentName, onClose }: Props) {
  const [opts, setOpts] = useState<StudioOptions>(() => loadSavedOptions());
  const [excludedExamIds, setExcludedExamIds] = useState<number[]>([]);
  const [examPickerOpen, setExamPickerOpen] = useState(false);
  const [customDatesOpen, setCustomDatesOpen] = useState(false);
  const [preview, setPreview] = useState<ParentExamReportPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomMode, setZoomMode] = useState<'fit' | 0.75 | 0.9 | 1>('fit');
  const [fitScale, setFitScale] = useState<number>(0.85);
  const [frameHeight, setFrameHeight] = useState<number>(1160);

  const [selectedVeliIds, setSelectedVeliIds] = useState<number[]>([]);
  const [initializedRecipients, setInitializedRecipients] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [whatsappCaption, setWhatsappCaption] = useState('');

  const [pdfBusy, setPdfBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const deskRef = useRef<HTMLDivElement | null>(null);

  // Koç tercihlerini localStorage'da hatırla
  useEffect(() => {
    try {
      const toSave: Partial<StudioOptions> = {};
      for (const k of PERSISTED_KEYS) {
        (toSave as Record<string, unknown>)[k] = opts[k];
      }
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(toSave));
    } catch {
      // ignore storage quota
    }
  }, [opts]);

  useEffect(() => {
    const el = deskRef.current;
    if (!el) return;
    const calc = () => {
      const available = el.clientWidth - 48;
      if (available > 200) {
        setFitScale(Math.min(1, Math.max(0.45, Number((available / 820).toFixed(3)))));
      }
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoom = zoomMode === 'fit' ? fitScale : zoomMode;

  const selectedPrimaryVeli = useMemo(() => {
    if (!preview?.recipients?.length || selectedVeliIds.length !== 1) return null;
    return preview.recipients.find(r => r.veli_id === selectedVeliIds[0]) ?? null;
  }, [preview?.recipients, selectedVeliIds]);

  const payloadBody = useMemo<ParentExamReportOptions>(() => {
    const body: ParentExamReportOptions = {
      scope: opts.scope,
      window: opts.window,
      theme: opts.theme,
      tone: opts.tone,
      custom_title: opts.custom_title.trim() || undefined,
      recipient_greeting: selectedPrimaryVeli?.display_name || undefined,
      excluded_exam_ids: excludedExamIds.length ? excludedExamIds : undefined,
      include_kurum_avg: opts.include_kurum_avg,
      include_progress_bridge: opts.include_progress_bridge,
      include_net_breakdown: opts.include_net_breakdown,
      include_exam_table: opts.include_exam_table,
      include_error_profile: opts.include_error_profile,
      include_strengths: opts.include_strengths,
      include_study_focus: opts.include_study_focus,
      include_assignments: opts.include_assignments,
      include_attendance: opts.include_attendance,
      include_ranking: opts.include_ranking,
      coach_note: opts.coach_note,
    };
    if (customDatesOpen && opts.date_from) body.date_from = opts.date_from;
    if (customDatesOpen && opts.date_to) body.date_to = opts.date_to;
    return body;
  }, [opts, customDatesOpen, excludedExamIds, selectedPrimaryVeli?.display_name]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await studentExamApi.parentReportPreview(studentId, payloadBody, controller.signal);
        if (controller.signal.aborted) return;
        setPreview(res.data);
        if (!initializedRecipients && res.data.recipients?.length) {
          const defaults = res.data.recipients.filter(r => r.can_send && r.is_default).map(r => r.veli_id);
          const fallback = res.data.recipients.filter(r => r.can_send).slice(0, 1).map(r => r.veli_id);
          setSelectedVeliIds(defaults.length ? defaults : fallback);
          setInitializedRecipients(true);
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Rapor önizlemesi alınamadı.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 260);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [studentId, payloadBody, initializedRecipients]);

  const syncFrameHeight = useCallback(() => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc?.body) return;
      const h = Math.max(1060, doc.body.scrollHeight + 48);
      setFrameHeight(h);
    } catch {
      // ignore cross-origin
    }
  }, []);

  const availableGroups = preview?.meta.available_groups ?? [];
  const scopeButtons = useMemo(() => {
    const hasTyt = availableGroups.includes('TYT');
    const hasAyt = availableGroups.includes('AYT');
    if (hasTyt && hasAyt) {
      return [
        { value: 'both' as const, label: 'TYT + AYT' },
        { value: 'TYT' as const, label: 'Sadece TYT' },
        { value: 'AYT' as const, label: 'Sadece AYT' },
      ];
    }
    if (availableGroups.length <= 1) {
      return [{ value: 'both' as const, label: availableGroups[0] || 'Tüm Sınavlar' }];
    }
    return [
      { value: 'both' as const, label: 'Birlikte' },
      ...availableGroups.map(g => ({ value: g as StudioOptions['scope'], label: g })),
    ];
  }, [availableGroups]);

  const hasTracks = (preview?.tracks?.length ?? 0) > 0;
  const canSendNow = hasTracks && selectedVeliIds.length > 0 && !sendBusy && !loading;

  const handleDownloadPdf = async () => {
    if (!hasTracks || pdfBusy) return;
    setPdfBusy(true);
    setFeedback(null);
    try {
      const fname = await studentExamApi.parentReportPdf(studentId, payloadBody);
      setFeedback({ kind: 'success', text: `PDF indirildi: ${fname}` });
    } catch (err: unknown) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'PDF oluşturulamadı.',
      });
    } finally {
      setPdfBusy(false);
    }
  };

  const handleSendWhatsapp = async () => {
    if (!canSendNow) return;
    setSendBusy(true);
    setFeedback(null);
    try {
      const res = await studentExamApi.parentReportSend(studentId, {
        ...payloadBody,
        veli_ids: selectedVeliIds,
        whatsapp_caption: whatsappCaption.trim() || undefined,
      });
      const d = res.data;
      if (d.sent > 0 && d.errors.length === 0) {
        const names = d.sent_details.map(x => x.display_name).join(', ');
        setFeedback({
          kind: 'success',
          text: `WhatsApp ile ${d.sent} veliye rapor PDF'i gönderildi (${names}).`,
        });
      } else if (d.sent > 0) {
        setFeedback({
          kind: 'success',
          text: `${d.sent} veliye gönderildi, ${d.skipped} atlandı: ${d.errors.join(' · ')}`,
        });
      } else {
        setFeedback({
          kind: 'error',
          text: d.errors.join(' · ') || 'WhatsApp gönderimi tamamlanamadı.',
        });
      }
    } catch (err: unknown) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'WhatsApp gönderimi başarısız oldu.',
      });
    } finally {
      setSendBusy(false);
    }
  };

  const handleOpenInTab = () => {
    if (!preview?.html) return;
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) return;
    w.document.open();
    w.document.write(preview.html);
    w.document.close();
  };

  const toggleVeli = (veliId: number) => {
    setSelectedVeliIds(prev =>
      prev.includes(veliId) ? prev.filter(id => id !== veliId) : [...prev, veliId]
    );
  };

  const toggleExamExcluded = (examId: number) => {
    setExcludedExamIds(prev =>
      prev.includes(examId) ? prev.filter(id => id !== examId) : [...prev, examId]
    );
  };

  const toggleOpt = (key: keyof StudioOptions) => {
    setOpts(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const resetDefaults = () => {
    setOpts(DEFAULT_OPTIONS);
    setExcludedExamIds([]);
    setCustomDatesOpen(false);
    setWhatsappCaption('');
  };

  const displayStudent = preview?.meta.student_name || studentName || 'Öğrenci';
  const candidateExams = preview?.available_exams ?? [];
  const excludedCount = candidateExams.filter(e => e.excluded).length;
  const waPreviewText = whatsappCaption.trim() || preview?.default_whatsapp_caption || '';

  return (
    <div
      className={s.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Veli Sınav Genel Durum Raporu Stüdyosu"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={s.studio}>
        {/* ── Üst Çubuk ── */}
        <header className={s.header}>
          <div className={s.headerLeft}>
            <span className={s.brandMark}>
              <FileBarChart2 size={19} />
            </span>
            <div className={s.titleGroup}>
              <h2 className={s.title}>Veli Sınav Genel Durum Raporu</h2>
              <div className={s.subtitle}>
                <span>{displayStudent}</span>
                {preview?.meta.period_label && <span>· {preview.meta.period_label}</span>}
                <span className={`${s.liveBadge} ${loading ? s.liveBadgeBusy : ''}`}>
                  {loading ? (
                    <>
                      <Loader2 size={11} className="animate-spin" /> Güncelleniyor
                    </>
                  ) : (
                    'Canlı önizleme'
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className={s.headerActions}>
            <button
              type="button"
              className={s.btnSecondary}
              disabled={!hasTracks || pdfBusy || loading}
              onClick={handleDownloadPdf}
            >
              {pdfBusy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              <span>{pdfBusy ? 'PDF hazırlanıyor…' : 'PDF İndir'}</span>
            </button>
            <button
              type="button"
              className={s.btnWhatsapp}
              disabled={!canSendNow}
              onClick={handleSendWhatsapp}
            >
              {sendBusy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              <span>
                {sendBusy
                  ? 'Gönderiliyor…'
                  : `WhatsApp Gönder${selectedVeliIds.length ? ` (${selectedVeliIds.length})` : ''}`}
              </span>
            </button>
            <button type="button" className={s.closeBtn} aria-label="Kapat" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </header>

        {/* ── 2 Panelli Stüdyo Gövdesi ── */}
        <div className={s.body}>
          <aside className={s.controls}>
            {feedback && (
              <div
                className={`${s.statusBanner} ${
                  feedback.kind === 'success' ? s.statusSuccess : s.statusError
                }`}
              >
                {feedback.kind === 'success' ? (
                  <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                ) : (
                  <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                )}
                <span>{feedback.text}</span>
              </div>
            )}

            {/* 1. Kapak Teması & Özel Başlık */}
            <div className={s.section}>
              <div className={s.sectionLabel}>
                <span>Kapak Teması</span>
                <button
                  type="button"
                  className={s.linkBtnMuted}
                  title="Stüdyo ayarlarını varsayılana döndür"
                  onClick={resetDefaults}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <RotateCcw size={11} /> Varsayılan
                </button>
              </div>
              <div className={s.themeGrid}>
                {THEME_ITEMS.map(item => (
                  <button
                    key={item.value}
                    type="button"
                    className={`${s.themeCard} ${opts.theme === item.value ? s.themeCardActive : ''}`}
                    onClick={() => setOpts(prev => ({ ...prev, theme: item.value }))}
                  >
                    <span className={`${s.themeSwatch} ${item.swatchClass}`} />
                    <span className={s.themeName}>{item.label}</span>
                  </button>
                ))}
              </div>
              <input
                type="text"
                className={s.textInput}
                maxLength={90}
                placeholder="Özel rapor başlığı (örn. Kasım Ayı Değerlendirmesi)"
                value={opts.custom_title}
                onChange={e => setOpts(prev => ({ ...prev, custom_title: e.target.value }))}
              />
            </div>

            {/* 2. Sınav Kapsamı */}
            <div className={s.section}>
              <div className={s.sectionLabel}>
                <span>Sınav Kapsamı</span>
              </div>
              <div className={s.segmented}>
                {scopeButtons.map(item => (
                  <button
                    key={item.value}
                    type="button"
                    className={`${s.segBtn} ${opts.scope === item.value ? s.segBtnActive : ''}`}
                    onClick={() => {
                      setExcludedExamIds([]);
                      setOpts(prev => ({ ...prev, scope: item.value }));
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Dönem + Deneme Seç / Hariç Tut */}
            <div className={s.section}>
              <div className={s.sectionLabel}>
                <span>Rapor Dönemi</span>
                <button
                  type="button"
                  className={s.linkBtn}
                  onClick={() => setCustomDatesOpen(v => !v)}
                >
                  {customDatesOpen ? 'Tarihi gizle' : 'Özel tarih'}
                </button>
              </div>
              <div className={s.chipRow}>
                {WINDOW_ITEMS.map(w => (
                  <button
                    key={w.value}
                    type="button"
                    className={`${s.chip} ${
                      !customDatesOpen && opts.window === w.value ? s.chipActive : ''
                    }`}
                    onClick={() => {
                      setCustomDatesOpen(false);
                      setExcludedExamIds([]);
                      setOpts(prev => ({ ...prev, window: w.value, date_from: '', date_to: '' }));
                    }}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
              {customDatesOpen && (
                <div className={s.dateGrid}>
                  <label className={s.dateField}>
                    Başlangıç
                    <input
                      type="date"
                      value={opts.date_from}
                      onChange={e => setOpts(prev => ({ ...prev, date_from: e.target.value }))}
                    />
                  </label>
                  <label className={s.dateField}>
                    Bitiş
                    <input
                      type="date"
                      value={opts.date_to}
                      onChange={e => setOpts(prev => ({ ...prev, date_to: e.target.value }))}
                    />
                  </label>
                </div>
              )}

              {candidateExams.length > 0 && (
                <>
                  <button
                    type="button"
                    className={s.examPickerToggle}
                    onClick={() => setExamPickerOpen(v => !v)}
                  >
                    <span>
                      Denemeleri seç / hariç tut ({candidateExams.length - excludedCount}/
                      {candidateExams.length})
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {excludedCount > 0 && (
                        <span className={s.examPickerBadge}>{excludedCount} hariç</span>
                      )}
                      {examPickerOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </button>
                  {examPickerOpen && (
                    <div className={s.examList}>
                      {excludedCount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 2px 2px' }}>
                          <button
                            type="button"
                            className={s.linkBtn}
                            onClick={() => setExcludedExamIds([])}
                          >
                            Tümünü dahil et
                          </button>
                        </div>
                      )}
                      {candidateExams.map(ex => {
                        const included = !excludedExamIds.includes(ex.exam_id);
                        return (
                          <label
                            key={`${ex.group}-${ex.exam_id}`}
                            className={`${s.examRow} ${!included ? s.examRowExcluded : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={included}
                              onChange={() => toggleExamExcluded(ex.exam_id)}
                            />
                            <span className={s.examTag}>{ex.group_label}</span>
                            <span className={s.examRowName} title={ex.name}>
                              {ex.date_label ? `${ex.date_label} · ` : ''}
                              {ex.name}
                            </span>
                            <span className={s.examRowNet}>{ex.net.toFixed(1).replace('.', ',')}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 4. Veli Dil Tonu */}
            <div className={s.section}>
              <div className={s.sectionLabel}>
                <span>Veli Dil Tonu</span>
              </div>
              <div className={s.segmented}>
                {TONE_ITEMS.map(item => (
                  <button
                    key={item.value}
                    type="button"
                    className={`${s.segBtn} ${opts.tone === item.value ? s.segBtnActive : ''}`}
                    onClick={() => setOpts(prev => ({ ...prev, tone: item.value }))}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 5. Rapor Bölümleri */}
            <div className={s.section}>
              <div className={s.sectionLabel}>
                <span>Rapor Bölümleri</span>
              </div>
              <div className={s.toggleList}>
                {(
                  [
                    [
                      'include_kurum_avg',
                      'Kurum ortalaması çizgisi',
                      'Grafik ve KPI kartlarında kurum karşılaştırması',
                    ],
                    [
                      'include_progress_bridge',
                      'Nereden Nereye? & İstikrar',
                      'İlk–son dönem köprüsü ve tutarlılık rozeti',
                    ],
                    [
                      'include_net_breakdown',
                      'Netin Nereden Geliyor? şeridi',
                      'Derslerin toplam nete yüzdesel katkısı',
                    ],
                    [
                      'include_exam_table',
                      'Deneme geçmişi tablosu',
                      'Her denemenin tarihi, D/Y/B ve farkı',
                    ],
                    [
                      'include_error_profile',
                      'Hata profili (Yanlış / Boş)',
                      'Net kaybının nedenini gösteren halka grafik',
                    ],
                    [
                      'include_strengths',
                      'Güçlü yönler & istikrar',
                      'Moral dengesi için başarılı ders vurgusu',
                    ],
                    [
                      'include_study_focus',
                      'Çalışma odağı (Max 5 konu)',
                      'Plana alınan ve öncelikli kazanımlar',
                    ],
                    [
                      'include_assignments',
                      'Ödev tamamlama özeti',
                      'Aktif dönem ödev tamamlama yüzdesi',
                    ],
                    [
                      'include_attendance',
                      'Deneme katılım özeti',
                      'Yapılan denemelere katılım oranı',
                    ],
                    [
                      'include_ranking',
                      'Kurum içi sıralama',
                      'Varsayılan kapalı · dilerseniz rapora ekleyin',
                    ],
                  ] as const
                ).map(([key, title, hint]) => (
                  <label key={key} className={s.toggleRow}>
                    <span className={s.toggleText}>
                      <span className={s.toggleTitle}>{title}</span>
                      <span className={s.toggleHint}>{hint}</span>
                    </span>
                    <span className={s.switch}>
                      <input
                        type="checkbox"
                        checked={Boolean(opts[key])}
                        onChange={() => toggleOpt(key)}
                      />
                      <span className={s.slider} />
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* 6. Koç Değerlendirme Notu */}
            <div className={s.section}>
              <div className={s.sectionLabel}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Sparkles size={12} color="#4f46e5" /> Koç Değerlendirme Notu
                </span>
                {opts.coach_note && (
                  <button
                    type="button"
                    className={s.linkBtnMuted}
                    onClick={() => setOpts(prev => ({ ...prev, coach_note: '' }))}
                  >
                    Temizle
                  </button>
                )}
              </div>
              {preview?.note_templates && preview.note_templates.length > 0 && (
                <div className={s.templateRow}>
                  {preview.note_templates.map(tpl => (
                    <button
                      key={tpl.id}
                      type="button"
                      className={s.templateChip}
                      onClick={() => setOpts(prev => ({ ...prev, coach_note: tpl.text }))}
                    >
                      + {tpl.label}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                className={s.textarea}
                placeholder="Veliye iletmek istediğiniz kişisel değerlendirme ve önerileri yazın veya yukarıdan hazır taslak seçin…"
                value={opts.coach_note}
                onChange={e => setOpts(prev => ({ ...prev, coach_note: e.target.value }))}
              />
            </div>

            {/* 7. WhatsApp Alıcıları + Canlı Balon Önizlemesi */}
            <div className={s.section}>
              <div className={s.sectionLabel}>
                <span>WhatsApp Alıcıları (Veli)</span>
                <button
                  type="button"
                  className={s.linkBtn}
                  onClick={() => setCaptionOpen(v => !v)}
                >
                  {captionOpen ? 'Mesajı gizle' : 'Mesajı düzenle'}
                </button>
              </div>
              {preview?.recipients && preview.recipients.length > 0 ? (
                <div className={s.recipientList}>
                  {preview.recipients.map(r => {
                    const checked = selectedVeliIds.includes(r.veli_id);
                    return (
                      <label
                        key={r.veli_id}
                        className={`${s.recipientCard} ${
                          checked ? s.recipientCardSelected : ''
                        } ${!r.can_send ? s.recipientCardDisabled : ''}`}
                      >
                        <input
                          type="checkbox"
                          disabled={!r.can_send}
                          checked={checked}
                          onChange={() => toggleVeli(r.veli_id)}
                        />
                        <div className={s.recipientMeta}>
                          <div className={s.recipientName}>
                            {r.display_name}
                            {r.relation ? ` · ${r.relation}` : ''}
                          </div>
                          {r.can_send ? (
                            <div className={s.recipientSub}>{r.masked_phone}</div>
                          ) : (
                            <div className={s.recipientWarn}>{r.skip_reason}</div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className={s.emptyRecipients}>
                  Bu öğrenci için kayıtlı veli telefonu bulunamadı. Raporu PDF olarak indirip paylaşabilirsiniz.
                </div>
              )}

              {captionOpen && (
                <textarea
                  className={s.textarea}
                  style={{ minHeight: 72 }}
                  placeholder="Boş bırakırsanız kurumsal standart WhatsApp bilgilendirme metni kullanılır…"
                  value={whatsappCaption}
                  onChange={e => setWhatsappCaption(e.target.value)}
                />
              )}

              {preview && (
                <div className={s.waPreviewWrap}>
                  <div className={s.waPreviewHead}>WhatsApp Mesaj Önizlemesi</div>
                  <div className={s.waBubble}>
                    <div className={s.waDoc}>
                      <span className={s.waPdfBadge}>PDF</span>
                      <span className={s.waDocName} title={preview.filename}>
                        {preview.filename}
                      </span>
                    </div>
                    <p className={s.waText}>{waPreviewText}</p>
                    <div className={s.waTime}>Şimdi · ✓✓</div>
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* Sağ: Canlı A4 Editoryal Önizleme Masası */}
          <section className={s.previewDesk}>
            <div className={s.previewBar}>
              <div className={s.previewMeta}>
                <span>A4 Editoryal Önizleme</span>
                {preview?.filename && (
                  <span style={{ color: '#64748b', fontWeight: 500 }}>· {preview.filename}</span>
                )}
              </div>
              <div className={s.zoomControls}>
                <button
                  type="button"
                  className={`${s.zoomBtn} ${zoomMode === 'fit' ? s.zoomBtnActive : ''}`}
                  onClick={() => setZoomMode('fit')}
                >
                  Sığdır
                </button>
                {([0.75, 0.9, 1] as const).map(z => (
                  <button
                    key={z}
                    type="button"
                    className={`${s.zoomBtn} ${zoomMode === z ? s.zoomBtnActive : ''}`}
                    onClick={() => setZoomMode(z)}
                  >
                    %{Math.round(z * 100)}
                  </button>
                ))}
                <button
                  type="button"
                  className={s.zoomBtn}
                  disabled={!preview?.html}
                  title="Yeni sekmede tam ekran aç"
                  onClick={handleOpenInTab}
                >
                  <ExternalLink size={12} />
                </button>
              </div>
            </div>

            <div className={s.canvasScroll} ref={deskRef}>
              {error ? (
                <div className={s.previewLoading} style={{ color: '#be123c' }}>
                  <AlertCircle size={24} />
                  <span>{error}</span>
                </div>
              ) : !preview ? (
                <div className={s.previewLoading}>
                  <Loader2 size={24} className="animate-spin" />
                  <span>Modern veli raporu hazırlanıyor…</span>
                </div>
              ) : (
                <div
                  style={{
                    width: `${Math.round(820 * zoom)}px`,
                    height: `${Math.round(frameHeight * zoom)}px`,
                    flexShrink: 0,
                  }}
                >
                  <div
                    className={s.paperShell}
                    style={{
                      transform: `scale(${zoom})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    <iframe
                      ref={iframeRef}
                      title="Veli Sınav Genel Durum Raporu Önizleme"
                      srcDoc={preview.html}
                      className={s.paperFrame}
                      style={{ height: `${frameHeight}px` }}
                      onLoad={syncFrameHeight}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
