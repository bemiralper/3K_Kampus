'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { answerKeyApi } from '../../../../components/olcme/api';
import type {
  ExamDetail,
  AnswerKey,
  AnswerChoice,
  BulkAnswerKeyRow,
  SubjectItem,
  OutcomeItem,
} from '../../../../components/olcme/types';
import s from '../olcme.module.css';

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Yardımcı Tipler & Fonksiyonlar                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

interface GridRow {
  question_number: number;
  correct_answer: AnswerChoice;
  is_cancelled: boolean;
  section_id: number;
  section_name: string;
  outcome_id: number | null;
  outcome_code: string;
  outcome_text: string;
  imported_outcome_text: string;
  b_question_number: number | null;
  item_id: number | null;
}

function normalizeAnswer(val: string): AnswerChoice {
  const upper = val.toUpperCase().trim();
  if (['A', 'B', 'C', 'D', 'E'].includes(upper)) return upper as AnswerChoice;
  if (upper === 'İPTAL' || upper === 'IPTAL' || upper === 'X' || upper === 'INVALID') return 'INVALID';
  if (upper === 'BOŞ' || upper === 'BOS' || upper === 'EMPTY' || upper === '-') return 'EMPTY';
  return '' as AnswerChoice;
}

/** Tüm kazanımları düz listeye çevir (Subject → Topic → Outcome) */
function flattenOutcomes(subjects: SubjectItem[]): OutcomeItem[] {
  const flat: OutcomeItem[] = [];
  for (const subj of subjects) {
    // Yeni yapı: Subject → Topic → Outcome
    const topics = subj.topics ?? [];
    for (const topic of topics) {
      for (const o of topic.outcomes) {
        flat.push(o);
      }
    }
  }
  return flat;
}

/**
 * Kazanım metnine/koduna göre en iyi eşleşmeyi bul.
 * Öncelik: tam code → tam text → code içerme → text içerme
 */
function findOutcomeByText(input: string, allOutcomes: OutcomeItem[]): OutcomeItem | null {
  if (!input.trim()) return null;
  const q = input.trim().toLowerCase();

  // 1) Tam eşleşme — code
  const byCodeExact = allOutcomes.find(o => o.code.toLowerCase() === q);
  if (byCodeExact) return byCodeExact;

  // 2) Tam eşleşme — text
  const byTextExact = allOutcomes.find(o => o.text.toLowerCase() === q);
  if (byTextExact) return byTextExact;

  // 3) Code başlangıç veya içerme
  const byCodeIncludes = allOutcomes.find(
    o => o.code.toLowerCase().includes(q) || q.includes(o.code.toLowerCase()),
  );
  if (byCodeIncludes) return byCodeIncludes;

  // 4) Text içerme — giriş metni kazanımda var mı VEYA kazanım metni girişte var mı
  const byTextIncludes = allOutcomes.find(
    o => o.text.toLowerCase().includes(q) || q.includes(o.text.toLowerCase()),
  );
  if (byTextIncludes) return byTextIncludes;

  return null;
}

type Step = 'answers' | 'b_booklet' | 'outcomes' | 'preview';

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  ANA BİLEŞEN                                                             */
/* ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  exam: ExamDetail;
}

export default function AnswerKeyTab({ exam }: Props) {
  /* ── Genel durum ─── */
  const [answerKeys, setAnswerKeys] = useState<AnswerKey[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState('');

  const [rows, setRows]               = useState<GridRow[]>([]);
  const [step, setStep]               = useState<Step>('answers');
  const [hasExistingData, setHasExistingData] = useState(false);

  /* Textarea içerikleri */
  const [answerText, setAnswerText]     = useState('');
  const [bBookletText, setBBookletText] = useState('');
  const [outcomeText, setOutcomeText]   = useState('');

  /* Kazanım ağacı */
  const [subjects, setSubjects]           = useState<SubjectItem[]>([]);
  const [outcomeModal, setOutcomeModal]   = useState<{ rowIdx: number } | null>(null);
  const [outcomeSearch, setOutcomeSearch] = useState('');

  /* Türemiş değerler */
  // Alt bölümlerle tamamen kapsanan ana bölümleri hariç tut
  const sections = useMemo(() => {
    const allSecs = exam.sections ?? [];
    const subSecs = allSecs.filter(s => s.is_sub_section);
    const parentsWithChildren = new Set(subSecs.map(s => s.parent_section).filter(Boolean));

    // Alt bölümleri olan ana bölümleri çıkar, alt bölümlerini ekle
    const result: typeof allSecs = [];
    for (const sec of allSecs) {
      if (!sec.is_sub_section && parentsWithChildren.has(sec.id)) continue; // alt bölümü var → atla
      if (!sec.is_sub_section) result.push(sec); // alt bölümü yok → ekle
    }
    // Alt bölümleri ekle (soru başlangıcına göre sıralı)
    for (const sec of subSecs) {
      result.push(sec);
    }
    // Soru başlangıcına göre sırala
    return result.sort((a, b) => a.question_start - b.question_start);
  }, [exam.sections]);
  const hasB = exam.booklet_type === 'AB' || exam.booklet_type === 'ABCD';

  const totalQuestions = useMemo(
    () => sections.reduce((sum, sec) => sum + (sec.question_end - sec.question_start + 1), 0),
    [sections],
  );

  const allOutcomes = useMemo(() => flattenOutcomes(subjects), [subjects]);

  /* ── Boş grid oluştur ─── */
  const buildEmptyGrid = useCallback((): GridRow[] => {
    const newRows: GridRow[] = [];
    for (const sec of sections) {
      for (let q = sec.question_start; q <= sec.question_end; q++) {
        newRows.push({
          question_number: q,
          correct_answer: '' as AnswerChoice,
          is_cancelled: false,
          section_id: sec.id,
          section_name: sec.name,
          outcome_id: null,
          outcome_code: '',
          outcome_text: '',
          imported_outcome_text: '',
          b_question_number: null,
          item_id: null,
        });
      }
    }
    return newRows;
  }, [sections]);

  /* ── Veri yükle ─── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const keys = await answerKeyApi.list(exam.id);
      setAnswerKeys(keys);

      // En çok soruya sahip olan primary key'i seç
      const primaryCandidates = keys.filter(k => k.is_primary && k.items.length > 0);
      const primary = primaryCandidates.length > 0
        ? primaryCandidates.reduce((best, k) => k.items.length > best.items.length ? k : best)
        : keys.find(k => k.items.length > 0) ?? keys[0];
      if (primary && primary.items.length > 0) {
        setRows(
          primary.items.map(item => ({
            question_number: item.question_number,
            correct_answer: item.correct_answer,
            is_cancelled: item.is_cancelled,
            section_id: item.section,
            section_name: item.section_name,
            outcome_id: item.outcome,
            outcome_code: item.outcome_code || '',
            outcome_text: item.outcome_text || '',
            imported_outcome_text: item.imported_outcome_text || '',
            b_question_number: item.b_question_number ?? null,
            item_id: item.id,
          })),
        );
        setHasExistingData(true);
        setStep('preview');
      } else {
        setRows(buildEmptyGrid());
        setHasExistingData(false);
        setStep('answers');
      }
    } catch { /* */ }
    finally { setLoading(false); }
  }, [exam.id, buildEmptyGrid]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* Kazanım ağacını yükle */
  useEffect(() => {
    answerKeyApi.outcomes(exam.id).then(setSubjects).catch(() => {});
  }, [exam.id]);

  /* ═════════════════════════════════════════════════════════════════════════ */
  /*  ADIM İŞLEYİCİLERİ                                                     */
  /* ═════════════════════════════════════════════════════════════════════════ */

  /** Adım 1 — Cevapları parse et ve grid'e yaz */
  const applyAnswers = useCallback(() => {
    const raw = answerText.trim();
    if (!raw) { setMsg('Cevap alanı boş.'); return; }

    const grid = buildEmptyGrid();
    const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean);

    if (lines.length === 1 && lines[0].length > 1 && !lines[0].includes('\t')) {
      // Tek satır yan yana: ABCDEABC…
      const chars = lines[0].split('');
      for (let i = 0; i < chars.length && i < grid.length; i++) {
        const a = normalizeAnswer(chars[i]);
        grid[i] = { ...grid[i], correct_answer: a, is_cancelled: a === 'INVALID' };
      }
      setMsg(`✅ ${Math.min(chars.length, grid.length)} cevap okundu (yan yana format).`);
    } else {
      // Alt alta satırlar
      let filled = 0;
      for (let i = 0; i < lines.length && i < grid.length; i++) {
        const val = lines[i].split('\t')[0]; // tab varsa ilk sütunu al
        const a = normalizeAnswer(val);
        if (a) {
          grid[i] = { ...grid[i], correct_answer: a, is_cancelled: a === 'INVALID' };
          filled++;
        }
      }
      setMsg(`✅ ${filled} cevap okundu (${totalQuestions} soru bekleniyor).`);
    }

    setRows(grid);
    setStep(hasB ? 'b_booklet' : 'outcomes');
  }, [answerText, buildEmptyGrid, totalQuestions, hasB]);

  /** Adım 2 — B kitapçığı soru numaralarını parse et */
  const applyBBooklet = useCallback(() => {
    const raw = bBookletText.trim();
    if (!raw) { setStep('outcomes'); return; }

    // Farklı formatları destekle:
    // 1) Her satırda bir numara: "3\n1\n5\n2\n4"
    // 2) Tek satırda tab/boşluk ile: "3\t1\t5\t2\t4"
    // 3) Karışık — tab ve newline karışımı
    // Tüm whitespace'leri ayraç olarak kullan
    const numbers: number[] = [];
    const tokens = raw.split(/[\n\t\r, ]+/).map(t => t.trim()).filter(Boolean);
    for (const token of tokens) {
      const num = parseInt(token, 10);
      if (!isNaN(num) && num > 0) {
        numbers.push(num);
      }
    }

    const newRows = [...rows];
    let applied = 0;
    for (let i = 0; i < numbers.length && i < newRows.length; i++) {
      newRows[i] = { ...newRows[i], b_question_number: numbers[i] };
      applied++;
    }
    setRows(newRows);

    const missing = newRows.length - applied;
    if (missing > 0 && applied > 0) {
      setMsg(`✅ ${applied} B kitapçığı soru numarası eşlendi · ⚠️ ${missing} soru için B numarası girilmedi (toplam ${newRows.length} soru).`);
    } else {
      setMsg(`✅ ${applied} B kitapçığı soru numarası eşlendi.`);
    }
    setStep('outcomes');
  }, [bBookletText, rows]);

  /** Adım 3 — Kazanım metinlerini parse et ve eşleştir */
  const applyOutcomes = useCallback(() => {
    const raw = outcomeText.trim();
    if (!raw) { setStep('preview'); return; }

    const lines = raw.split(/\n/).map(l => l.trim());
    const newRows = [...rows];
    let matched = 0;
    let unmatched = 0;
    const unmatchedTexts: string[] = [];

    for (let i = 0; i < lines.length && i < newRows.length; i++) {
      if (!lines[i]) continue; // boş satır atla
      const found = findOutcomeByText(lines[i], allOutcomes);
      // Orijinal yapıştırılan metni her zaman kaydet
      newRows[i] = {
        ...newRows[i],
        imported_outcome_text: lines[i],
      };
      if (found) {
        newRows[i] = {
          ...newRows[i],
          outcome_id: found.id,
          outcome_code: found.code,
          outcome_text: found.text,
        };
        matched++;
      } else {
        unmatched++;
        if (unmatchedTexts.length < 3) unmatchedTexts.push(lines[i]);
      }
    }

    setRows(newRows);

    if (unmatched > 0) {
      const examples = unmatchedTexts.map(t => `"${t.substring(0, 40)}…"`).join(', ');
      setMsg(`✅ ${matched} kazanım eşleşti · ⚠️ ${unmatched} bulunamadı (${examples}). Önizlemeden manuel seçebilirsiniz.`);
    } else if (matched > 0) {
      setMsg(`✅ ${matched} kazanım başarıyla eşleştirildi.`);
    }
    setStep('preview');
  }, [outcomeText, rows, allOutcomes]);

  /* ═════════════════════════════════════════════════════════════════════════ */
  /*  ÖNİZLEME İŞLEYİCİLERİ                                                */
  /* ═════════════════════════════════════════════════════════════════════════ */

  const setAnswer = (idx: number, answer: AnswerChoice) => {
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], correct_answer: answer, is_cancelled: answer === 'INVALID' };
      return next;
    });
  };

  const setBQuestion = (idx: number, val: string) => {
    const num = val === '' ? null : Number(val);
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], b_question_number: num };
      return next;
    });
  };

  const setOutcome = (idx: number, outcome: OutcomeItem | null) => {
    setRows(prev => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        outcome_id: outcome?.id ?? null,
        outcome_code: outcome?.code ?? '',
        outcome_text: outcome?.text ?? '',
      };
      return next;
    });
    setOutcomeModal(null);
  };

  /** Toplu kaydet */
  const handleSave = async () => {
    const filled = rows.filter(r => r.correct_answer && r.correct_answer !== ('' as AnswerChoice));
    if (filled.length === 0) { setMsg('En az bir sorunun cevabını girin.'); return; }

    setSaving(true);
    setMsg('');
    try {
      const items: BulkAnswerKeyRow[] = filled.map(r => ({
        question_number: r.question_number,
        correct_answer: r.correct_answer,
        is_cancelled: r.is_cancelled,
        outcome_id: r.outcome_id,
        imported_outcome_text: r.imported_outcome_text,
        b_question_number: r.b_question_number,
      }));

      const result = await answerKeyApi.bulkImport(exam.id, {
        booklet: hasB ? 'A' : '',
        items,
      });

      setMsg(`✅ ${result.message}`);
      setHasExistingData(true);
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
      setMsg(`❌ Kaydetme hatası: ${message}`);
      console.error('bulkImport error:', err);
    } finally {
      setSaving(false);
    }
  };

  /** Sıfırla */
  const handleReset = async () => {
    if (!confirm('Cevap anahtarını silmek istediğinize emin misiniz?')) return;
    try {
      for (const ak of answerKeys) {
        await answerKeyApi.delete(exam.id, ak.id);
      }
      setRows(buildEmptyGrid());
      setHasExistingData(false);
      setStep('answers');
      setAnswerText('');
      setBBookletText('');
      setOutcomeText('');
      setMsg('Cevap anahtarı silindi.');
      setAnswerKeys([]);
    } catch { setMsg('Silme hatası.'); }
  };

  /* ═════════════════════════════════════════════════════════════════════════ */
  /*  RENDER                                                                 */
  /* ═════════════════════════════════════════════════════════════════════════ */

  const filledCount  = rows.filter(r => r.correct_answer && r.correct_answer !== ('' as AnswerChoice)).length;
  const outcomeCount = rows.filter(r => r.outcome_id).length;
  const bCount       = rows.filter(r => r.b_question_number).length;

  if (loading) return (
    <div className="card-modern" style={{ textAlign: 'center', padding: 60 }}>
      <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: 14 }}>Yükleniyor…</p>
    </div>
  );

  const stepLabels: { key: Step; label: string; icon: string }[] = [
    { key: 'answers',   label: 'Cevaplar',    icon: '✏️' },
    ...(hasB ? [{ key: 'b_booklet' as Step, label: 'B Kitapçığı', icon: '🔄' }] : []),
    { key: 'outcomes',  label: 'Kazanımlar',  icon: '🎯' },
    { key: 'preview',   label: 'Önizleme',    icon: '👁' },
  ];
  const currentStepIdx = stepLabels.findIndex(sl => sl.key === step);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ────────────────────────────────────────────────────────────────── */}
      {/*  Başlık + Adım göstergesi                                        */}
      {/* ────────────────────────────────────────────────────────────────── */}
      <div className="card-modern">
        <div className="card-modern-header">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
            Cevap Anahtarı
          </h3>
          <div className="card-modern-header-actions">
            {hasExistingData && (
              <button className="btn-modern" onClick={handleReset}
                style={{ padding: '6px 14px', fontSize: 12, color: 'var(--danger)', border: '1px solid #fecaca' }}>
                🗑 Sıfırla
              </button>
            )}
          </div>
        </div>
        <div className={`card-modern-body ${s.cardBody}`}>

          {/* Adım göstergesi */}
          <div className={s.akSteps}>
            {stepLabels.map((sl, i) => (
              <button
                key={sl.key}
                type="button"
                className={[
                  s.akStep,
                  step === sl.key ? s.akStepActive : '',
                  i < currentStepIdx ? s.akStepDone : '',
                ].filter(Boolean).join(' ')}
                onClick={() => {
                  if (i <= currentStepIdx || hasExistingData) setStep(sl.key);
                }}
              >
                <span className={s.akStepNum}>{i < currentStepIdx ? '✓' : i + 1}</span>
                <span className={s.akStepLabel}>{sl.icon} {sl.label}</span>
              </button>
            ))}
          </div>

          {msg && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginTop: 14,
              background: msg.includes('❌') ? '#fef2f2' : msg.includes('⚠️') ? '#fffbeb' : '#f0fdf4',
              color: msg.includes('❌') ? '#991b1b' : msg.includes('⚠️') ? '#92400e' : '#166534',
              fontSize: 13, lineHeight: 1.5,
            }}>
              {msg}
            </div>
          )}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────── */}
      {/*  ADIM 1: CEVAPLAR                                                 */}
      {/* ────────────────────────────────────────────────────────────────── */}
      {step === 'answers' && (
        <div className="card-modern">
          <div className="card-modern-header"><h3>✏️ Adım 1: Cevapları Yapıştırın</h3></div>
          <div className={`card-modern-body ${s.cardBody}`}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
              Excel&apos;den veya metin dosyasından cevapları kopyalayıp aşağıya yapıştırın.
              <strong> {totalQuestions} soru</strong> bekleniyor.
            </p>

            <div className={s.akFormatHelp}>
              <div className={s.akFormatCard}>
                <strong>📝 Alt Alta</strong>
                <code>{'A\nB\nC\nD\nE'}</code>
              </div>
              <div className={s.akFormatCard}>
                <strong>📝 Yan Yana</strong>
                <code>ABCDEABCDE…</code>
              </div>
              <div className={s.akFormatCard}>
                <strong>📝 Excel Sütunu</strong>
                <code>{'A\nB\nİPTAL\nC\nD'}</code>
              </div>
            </div>

            <textarea
              className={s.akTextarea}
              value={answerText}
              onChange={e => setAnswerText(e.target.value)}
              placeholder={`Cevapları buraya yapıştırın…\nÖrnek: ABCDEABCDE veya her satırda bir cevap\n\nİptal: İPTAL, X veya INVALID yazabilirsiniz`}
              rows={8}
              autoFocus
            />

            <div className={s.akStepActions}>
              <div />
              <button className="btn-modern btn-primary" onClick={applyAnswers}
                style={{ padding: '8px 20px', fontSize: 13 }}
                disabled={!answerText.trim()}>
                İleri →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────── */}
      {/*  ADIM 2: B KİTAPÇIĞI (opsiyonel, sadece hasB)                   */}
      {/* ────────────────────────────────────────────────────────────────── */}
      {step === 'b_booklet' && hasB && (
        <div className="card-modern">
          <div className="card-modern-header">
            <h3>🔄 Adım 2: B Kitapçığı Soru Numaraları
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 6 }}>(opsiyonel)</span>
            </h3>
          </div>
          <div className={`card-modern-body ${s.cardBody}`}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
              A kitapçığındaki her sorunun B kitapçığındaki karşılık soru numarasını alt alta yapıştırın.
            </p>

            <textarea
              className={s.akTextarea}
              value={bBookletText}
              onChange={e => setBBookletText(e.target.value)}
              placeholder={'B kitapçığı soru numaralarını yapıştırın…\nÖrnek:\n3\n1\n5\n2\n4'}
              rows={6}
              autoFocus
            />

            <div className={s.akStepActions}>
              <button className="btn-modern" onClick={() => setStep('answers')}
                style={{ padding: '8px 20px', fontSize: 13 }}>
                ← Geri
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-modern" onClick={() => { setBBookletText(''); setStep('outcomes'); }}
                  style={{ padding: '8px 20px', fontSize: 13 }}>
                  Atla
                </button>
                <button className="btn-modern btn-primary" onClick={applyBBooklet}
                  style={{ padding: '8px 20px', fontSize: 13 }}>
                  İleri →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────── */}
      {/*  ADIM 3: KAZANIMLAR (opsiyonel)                                   */}
      {/* ────────────────────────────────────────────────────────────────── */}
      {step === 'outcomes' && (
        <div className="card-modern">
          <div className="card-modern-header">
            <h3>🎯 Adım {hasB ? '3' : '2'}: Kazanımlar
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 6 }}>(opsiyonel)</span>
            </h3>
          </div>
          <div className={`card-modern-body ${s.cardBody}`}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
              Her sorunun kazanımını alt alta yapıştırın.
              Kazanım <strong>kodunu</strong> (ör. M.6.1.1.1) veya <strong>açıklamasını</strong> (ör. Doğal sayılarla dört işlem yapar)
              yazabilirsiniz. Sistem otomatik eşleştirecektir.
            </p>

            <div className={s.akFormatHelp}>
              <div className={s.akFormatCard} style={{ flex: '1 1 auto' }}>
                <strong>📋 Kazanım Kodu veya Açıklaması</strong>
                <code style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>
                  {'M.6.1.1.1\nDoğal sayılarla dört işlem yapar\nM.6.1.2.3\nKesirlerle toplama işlemi yapar'}
                </code>
              </div>
            </div>

            <textarea
              className={s.akTextarea}
              value={outcomeText}
              onChange={e => setOutcomeText(e.target.value)}
              placeholder={'Kazanımları buraya yapıştırın…\nHer satıra bir kazanım kodu veya açıklaması\n\nÖrnek:\nM.6.1.1.1\nDoğal sayılarla dört işlem yapar'}
              rows={6}
              autoFocus
            />

            {allOutcomes.length === 0 && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: 12, marginTop: 8 }}>
                ⚠️ Kazanım verisi bulunamadı. Müfredat modülünden kazanım eklediğinizden emin olun.
              </div>
            )}

            <div className={s.akStepActions}>
              <button className="btn-modern" onClick={() => setStep(hasB ? 'b_booklet' : 'answers')}
                style={{ padding: '8px 20px', fontSize: 13 }}>
                ← Geri
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-modern" onClick={() => { setOutcomeText(''); setStep('preview'); }}
                  style={{ padding: '8px 20px', fontSize: 13 }}>
                  Atla
                </button>
                <button className="btn-modern btn-primary" onClick={applyOutcomes}
                  style={{ padding: '8px 20px', fontSize: 13 }}
                  disabled={!outcomeText.trim()}>
                  İleri →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────── */}
      {/*  ÖNİZLEME + DÜZENLEME                                            */}
      {/* ────────────────────────────────────────────────────────────────── */}
      {step === 'preview' && (
        <div className="card-modern">
          <div className="card-modern-header">
            <h3>
              👁 Önizleme
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8 }}>
                {filledCount}/{totalQuestions} cevap
                {outcomeCount > 0 && ` · ${outcomeCount} kazanım`}
                {hasB && bCount > 0 && ` · ${bCount} B eşleme`}
              </span>
            </h3>
            <div className="card-modern-header-actions">
              <div style={{ display: 'flex', gap: 8 }}>
                {!hasExistingData && (
                  <button className="btn-modern" onClick={() => setStep('answers')}
                    style={{ padding: '6px 14px', fontSize: 12 }}>
                    ← Adımlara Dön
                  </button>
                )}
                <button className="btn-modern btn-primary" onClick={handleSave}
                  disabled={saving || filledCount === 0}
                  style={{ padding: '6px 14px', fontSize: 12 }}>
                  {saving ? '⏳ Kaydediliyor…' : '💾 Kaydet'}
                </button>
              </div>
            </div>
          </div>
          <div className="card-modern-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table className={s.akTable}>
              <thead>
                <tr>
                  <th style={{ width: 50 }}>Soru</th>
                  <th style={{ width: 80 }}>Bölüm</th>
                  <th>Doğru Cevap</th>
                  {hasB && <th style={{ width: 70 }}>B Kit.</th>}
                  <th>Kazanım</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const showHeader = idx === 0 || rows[idx - 1].section_id !== row.section_id;
                  const colSpan = hasB ? 5 : 4;
                  const sec = sections.find(ss => ss.id === row.section_id);
                  const sectionInfo = sec
                    ? { name: sec.name, question_count: sec.question_end - sec.question_start + 1 }
                    : undefined;
                  return (
                    <PreviewRow
                      key={row.question_number}
                      row={row}
                      idx={idx}
                      showHeader={showHeader}
                      colSpan={colSpan}
                      hasB={hasB}
                      onAnswer={setAnswer}
                      onBQuestion={setBQuestion}
                      onOpenOutcome={() => setOutcomeModal({ rowIdx: idx })}
                      onClearOutcome={() => setOutcome(idx, null)}
                      sectionInfo={sectionInfo}
                    />
                  );
                })}
              </tbody>
            </table>

            {filledCount === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                <p style={{ fontSize: 14 }}>Henüz cevap girilmemiş.</p>
                <button className="btn-modern btn-primary" onClick={() => setStep('answers')}
                  style={{ marginTop: 8, padding: '8px 20px', fontSize: 13 }}>
                  ✏️ Cevapları Gir
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Kazanım Seçici Modal ─── */}
      {outcomeModal !== null && (
        <OutcomePickerModal
          subjects={subjects}
          search={outcomeSearch}
          onSearch={setOutcomeSearch}
          onSelect={o => setOutcome(outcomeModal.rowIdx, o)}
          onClose={() => setOutcomeModal(null)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Önizleme Tablo Satırı                                                    */
/* ═══════════════════════════════════════════════════════════════════════════ */

function PreviewRow({
  row, idx, showHeader, colSpan, hasB,
  onAnswer, onBQuestion, onOpenOutcome, onClearOutcome,
  sectionInfo,
}: {
  row: GridRow;
  idx: number;
  showHeader: boolean;
  colSpan: number;
  hasB: boolean;
  onAnswer: (idx: number, a: AnswerChoice) => void;
  onBQuestion: (idx: number, v: string) => void;
  onOpenOutcome: () => void;
  onClearOutcome: () => void;
  sectionInfo?: { name: string; question_count: number };
}) {
  return (
    <>
      {showHeader && (
        <tr className={s.akSectionRow}>
          <td colSpan={colSpan}>
            📁 {sectionInfo?.name ?? row.section_name}
            {sectionInfo && (
              <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8, fontSize: 11 }}>
                ({sectionInfo.question_count} soru)
              </span>
            )}
          </td>
        </tr>
      )}
      <tr className={row.is_cancelled ? s.akCancelled : undefined}>
        <td>{row.question_number}</td>
        <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{row.section_name}</td>
        <td>
          <div className={s.akAnswerGroup}>
            {['A', 'B', 'C', 'D', 'E'].map(ch => (
              <button
                key={ch}
                type="button"
                className={row.correct_answer === ch ? s.akAnswerBtnActive : s.akAnswerBtn}
                onClick={() => onAnswer(idx, ch as AnswerChoice)}
              >
                {ch}
              </button>
            ))}
            <button
              type="button"
              className={row.is_cancelled ? s.akAnswerBtnCancelled : s.akAnswerBtn}
              onClick={() => onAnswer(idx, 'INVALID')}
              title="İptal"
              style={{ fontSize: 10 }}
            >
              ✕
            </button>
          </div>
        </td>
        {hasB && (
          <td>
            <input
              className={s.akBInput}
              type="number"
              min={1}
              value={row.b_question_number ?? ''}
              onChange={e => onBQuestion(idx, e.target.value)}
              placeholder="—"
            />
          </td>
        )}
        <td>
          <div className={s.akOutcomeCell}>
            {row.outcome_code && (
              <span className={s.akOutcomeTag} title={row.outcome_text}>
                {row.outcome_code}
              </span>
            )}
            <button className={s.akOutcomeBtn} onClick={onOpenOutcome} title="Kazanım Seç">
              {row.outcome_id ? '✏' : '+'}
            </button>
            {row.outcome_id && (
              <button className={s.akOutcomeBtn} onClick={onClearOutcome} title="Kazanımı Kaldır"
                style={{ color: 'var(--danger)' }}>
                ✕
              </button>
            )}
          </div>
        </td>
      </tr>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Kazanım Seçici Modal                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

function OutcomePickerModal({ subjects, search, onSearch, onSelect, onClose }: {
  subjects: SubjectItem[];
  search: string;
  onSearch: (s: string) => void;
  onSelect: (o: OutcomeItem) => void;
  onClose: () => void;
}) {
  const lower = search.toLowerCase();

  return (
    <div className={s.outcomeModal} onClick={onClose}>
      <div className={s.outcomeModalContent} onClick={e => e.stopPropagation()}>
        <div className={s.outcomeModalHeader}>
          <h3>Kazanım Seç</h3>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: '0 4px', color: 'var(--text-secondary)' }}>
            ✕
          </button>
        </div>
        <div className={s.outcomeModalBody}>
          <input
            className={s.outcomeSearch}
            type="text"
            placeholder="Kazanım kodu veya metin ara…"
            value={search}
            onChange={e => onSearch(e.target.value)}
            autoFocus
          />

          {subjects.map(subj => {
            const filteredTopics = (subj.topics ?? [])
              .map(topic => ({
                ...topic,
                outcomes: (topic.outcomes ?? []).filter(o =>
                  !lower ||
                  o.code.toLowerCase().includes(lower) ||
                  o.text.toLowerCase().includes(lower) ||
                  topic.name.toLowerCase().includes(lower)
                ),
              }))
              .filter(t => t.outcomes.length > 0);

            if (filteredTopics.length === 0) return null;

            return (
              <div key={subj.id} className={s.outcomeGroup}>
                <div className={s.outcomeGroupTitle}>📚 {subj.name}</div>
                {filteredTopics.map(topic => (
                  <div key={topic.id} style={{ marginLeft: 12, marginBottom: 4 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, padding: '4px 0' }}>
                      {topic.name}
                    </div>
                    {topic.outcomes.map(o => (
                      <button
                        key={o.id}
                        className={s.outcomeOption}
                        onClick={() => onSelect(o)}
                        style={{ marginLeft: 8 }}
                      >
                        <strong>{o.code}</strong>
                        {o.text}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            );
          })}

          {subjects.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)' }}>
              <p>Kazanım verisi bulunamadı.</p>
              <p style={{ fontSize: 12 }}>Müfredat modülünden kazanım ekleyebilirsiniz.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
