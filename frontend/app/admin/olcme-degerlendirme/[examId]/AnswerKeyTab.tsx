'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { answerKeyApi, examApi } from '../../../../components/olcme/api';
import type {
  ExamDetail,
  AnswerKey,
  AnswerChoice,
  BulkAnswerKeyRow,
  SubjectItem,
  OutcomeItem,
} from '../../../../components/olcme/types';
import k from './answer-key.module.css';
import { pickPrimaryAnswerKey } from '../../../../components/olcme/answer-key';
import {
  filterTopicsByQuery,
  findOutcomeByText,
  flattenSubjectOutcomes,
  subjectsForSection,
} from '../../../../components/olcme/outcome-search';
import { leafExamSections, leafSectionForQuestion } from '../../../../components/olcme/section-ranges';

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
  sub_outcome_id: number | null;
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

function outcomesForRow(subjects: SubjectItem[], sections: ExamDetail['sections'], sectionId: number): OutcomeItem[] {
  const section = (sections ?? []).find(s => s.id === sectionId);
  return flattenSubjectOutcomes(subjectsForSection(subjects, section?.subject ?? null));
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
  const [showJumps, setShowJumps]   = useState(false);
  const [pdfMeta, setPdfMeta]       = useState<{ has_uploaded: boolean; can_generate: boolean; filename: string } | null>(null);
  const [pdfBusy, setPdfBusy]       = useState('');
  const [pdfCopies, setPdfCopies]   = useState<1 | 2 | 4 | 6>(1);
  const [pdfBooklet, setPdfBooklet] = useState('');

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
  const sections = useMemo(() => leafExamSections(exam.sections), [exam.sections]);
  const hasB = exam.booklet_type === 'AB' || exam.booklet_type === 'ABCD';

  const totalQuestions = useMemo(
    () => sections.reduce((sum, sec) => sum + (sec.question_end - sec.question_start + 1), 0),
    [sections],
  );

  const allOutcomes = useMemo(
    () => flattenSubjectOutcomes(subjects),
    [subjects],
  );

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
          sub_outcome_id: null,
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

      const primary = pickPrimaryAnswerKey(keys);
      if (primary && primary.items.length > 0) {
        setRows(
          primary.items.map(item => {
            const leaf = leafSectionForQuestion(exam.sections, item.question_number);
            return {
            question_number: item.question_number,
            correct_answer: item.correct_answer,
            is_cancelled: item.is_cancelled,
            section_id: leaf?.id ?? item.section,
            section_name: leaf?.name ?? item.section_name,
            outcome_id: item.outcome,
            sub_outcome_id: item.sub_outcome ?? null,
            outcome_code: item.outcome_code || '',
            outcome_text: item.outcome_text || '',
            imported_outcome_text: item.imported_outcome_text || '',
            b_question_number: item.b_question_number ?? null,
            item_id: item.id,
            };
          }),
        );
        setHasExistingData(true);
        setStep('preview');
      } else {
        setRows(buildEmptyGrid());
        setHasExistingData(false);
        setStep('answers');
      }
    } catch (err: unknown) {
      setMsg(`❌ Cevap anahtarı yüklenemedi: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`);
      setRows(buildEmptyGrid());
      setHasExistingData(false);
    }
    finally { setLoading(false); }
  }, [exam.id, buildEmptyGrid]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const loadPdfMeta = useCallback(async () => {
    try { setPdfMeta(await examApi.answerKeyPdfMeta(exam.id)); }
    catch { setPdfMeta(null); }
  }, [exam.id]);

  useEffect(() => { loadPdfMeta(); }, [loadPdfMeta]);

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
      const found = findOutcomeByText(
        lines[i],
        outcomesForRow(subjects, exam.sections, newRows[i].section_id),
      );
      // Orijinal yapıştırılan metni her zaman kaydet
      newRows[i] = {
        ...newRows[i],
        imported_outcome_text: lines[i],
      };
      if (found) {
        newRows[i] = {
          ...newRows[i],
          outcome_id: found.id,
          sub_outcome_id: found.sub_outcome_id ?? null,
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
  }, [outcomeText, rows, subjects, exam.sections]);

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
        sub_outcome_id: outcome?.sub_outcome_id ?? null,
        outcome_code: outcome?.code ?? '',
        outcome_text: outcome?.text ?? '',
      };
      return next;
    });
    setOutcomeModal(null);
  };

  /** Toplu kaydet */
  const handleSave = async () => {
    const answered = rows.filter(r => r.correct_answer && r.correct_answer !== ('' as AnswerChoice));
    if (answered.length === 0) { setMsg('En az bir sorunun cevabını girin.'); return; }

    // Cevabı boş ama kazanımı işaretlenmiş satırlar da gönderilir; aksi
    // hâlde sunucu tarafında o satırların kazanım bağı kayboluyordu.
    const toSave = rows.filter(r =>
      (r.correct_answer && r.correct_answer !== ('' as AnswerChoice))
      || r.outcome_id !== null
      || r.sub_outcome_id !== null
      || r.imported_outcome_text
      || r.b_question_number !== null,
    );

    setSaving(true);
    setMsg('');
    try {
      const items: BulkAnswerKeyRow[] = toSave.map(r => ({
        question_number: r.question_number,
        correct_answer: r.correct_answer,
        is_cancelled: r.is_cancelled,
        outcome_id: r.outcome_id,
        sub_outcome_id: r.sub_outcome_id,
        imported_outcome_text: r.imported_outcome_text,
        b_question_number: r.b_question_number,
      }));

      const result = await answerKeyApi.bulkImport(exam.id, {
        booklet: hasB ? 'A' : '',
        items,
      });

      setMsg(`✅ ${result.message}`);
      setHasExistingData(true);
      await loadPdfMeta();
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
      await loadPdfMeta();
    } catch { setMsg('Silme hatası.'); }
  };

  /* ═════════════════════════════════════════════════════════════════════════ */
  /*  RENDER                                                                 */
  /* ═════════════════════════════════════════════════════════════════════════ */

  const bookletOptions = useMemo(() => {
    const letters = [...new Set(
      answerKeys.map(k => (k.booklet || '').trim().toUpperCase()).filter(Boolean),
    )];
    return letters.sort();
  }, [answerKeys]);

  const downloadPdf = async (source?: 'uploaded' | 'generated') => {
    setPdfBusy(source || 'generated');
    try {
      await examApi.downloadAnswerKeyPdf(exam.id, {
        source,
        copies: pdfCopies,
        booklet: pdfBooklet || undefined,
      });
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'PDF indirilemedi.');
    } finally {
      setPdfBusy('');
    }
  };

  const canDownloadPdf = Boolean(hasExistingData || pdfMeta?.can_generate || pdfMeta?.has_uploaded);
  const filledCount  = rows.filter(r => r.correct_answer && r.correct_answer !== ('' as AnswerChoice)).length;
  const outcomeCount = rows.filter(r => r.outcome_id).length;
  const bCount       = rows.filter(r => r.b_question_number).length;

  useEffect(() => {
    const onScroll = () => setShowJumps(window.scrollY > 160);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (loading) return (
    <div className={k.panel} style={{ textAlign: 'center' }}>
      <p className={k.hint} style={{ margin: 0 }}>Yükleniyor…</p>
    </div>
  );

  const stepLabels: { key: Step; label: string; short: string; hint: string }[] = [
    { key: 'answers', label: 'Cevaplar', short: 'Cevap', hint: 'Yapıştır' },
    ...(hasB ? [{ key: 'b_booklet' as Step, label: 'B kitapçığı', short: 'B', hint: 'Eşle' }] : []),
    { key: 'outcomes', label: 'Kazanımlar', short: 'Kazanım', hint: 'İsteğe bağlı' },
    { key: 'preview', label: 'Önizleme', short: 'Önizle', hint: 'Kaydet' },
  ];
  const currentStepIdx = stepLabels.findIndex(sl => sl.key === step);
  const toastKind = msg.includes('❌') || /hata/i.test(msg)
    ? k.toastErr
    : msg.includes('⚠️') ? k.toastWarn : k.toastOk;

  const scrollPage = (to: 'top' | 'bottom') => {
    const root = document.scrollingElement || document.documentElement;
    const top = to === 'top' ? 0 : root.scrollHeight;
    root.scrollTo({ top, behavior: 'auto' });
    window.scrollTo({ top, behavior: 'auto' });
  };

  return (
    <div className={k.page}>
      {msg && (
        <div className={`${k.toast} ${toastKind} mobile-above-nav`} role="status">
          <span>{msg}</span>
          <button type="button" aria-label="Kapat" onClick={() => setMsg('')}>×</button>
        </div>
      )}

      <div className={k.stats}>
        <div className={k.stat}><b>{filledCount}</b><span>Cevap</span></div>
        <div className={k.stat}><b>{totalQuestions}</b><span>Soru</span></div>
        <div className={k.stat}><b>{outcomeCount}</b><span>Kazanım</span></div>
        <div className={k.stat}><b>{hasB ? bCount : '—'}</b><span>B eşleme</span></div>
      </div>

      <div className={k.steps}>
        {stepLabels.map((sl, i) => (
          <button
            key={sl.key}
            type="button"
            className={step === sl.key ? k.stepOn : i < currentStepIdx ? k.stepDone : k.step}
            onClick={() => {
              if (i <= currentStepIdx || hasExistingData) setStep(sl.key);
            }}
          >
            <b>
              <span className={k.full}>{i < currentStepIdx ? '✓ ' : `${i + 1}. `}{sl.label}</span>
              <span className={k.short}>{i < currentStepIdx ? '✓' : i + 1} {sl.short}</span>
            </b>
            <span className={k.hintLine}>{sl.hint}</span>
          </button>
        ))}
      </div>

      <section className={k.panel}>
        <div className={k.pdf}>
          <label className={k.field} title="Bir sayfaya kaç cevap anahtarı basılacağı">
            Cevap anahtarı
            <select value={pdfCopies} onChange={e => setPdfCopies(Number(e.target.value) as 1 | 2 | 4 | 6)}>
              <option value={1}>1 adet</option>
              <option value={2}>2 adet</option>
              <option value={4}>4 adet</option>
              <option value={6}>6 adet</option>
            </select>
          </label>
          {bookletOptions.length > 0 && (
            <label className={k.field}>
              Kitapçık
              <select value={pdfBooklet} onChange={e => setPdfBooklet(e.target.value)}>
                <option value="">Tümü</option>
                {bookletOptions.map(letter => (
                  <option key={letter} value={letter}>{letter}</option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className={k.btnPrimary}
            disabled={pdfBusy !== '' || !canDownloadPdf}
            title={canDownloadPdf ? 'Cevap anahtarı PDF indir' : 'Önce cevapları kaydedin'}
            onClick={() => downloadPdf('generated')}
          >
            {pdfBusy ? 'Hazırlanıyor…' : 'PDF indir'}
          </button>
        </div>
      </section>

      {step === 'answers' && (
        <section className={k.panel}>
          <h3>Cevapları yapıştırın</h3>
          <p className={k.hint}>{totalQuestions} soru bekleniyor. Alt alta, yan yana veya Excel sütunu olarak yapıştırabilirsiniz.</p>
          <div className={k.formats}>
            <div className={k.format}><b>Alt alta</b><code>{'A\nB\nC\nD\nE'}</code></div>
            <div className={k.format}><b>Yan yana</b><code>ABCDEABCDE</code></div>
            <div className={k.format}><b>İptal</b><code>{'A\nİPTAL\nC'}</code></div>
          </div>
          <textarea
            className={k.area}
            value={answerText}
            onChange={e => setAnswerText(e.target.value)}
            placeholder={'Cevapları buraya yapıştırın. İptal için İPTAL, X veya INVALID.'}
            rows={8}
            autoFocus
          />
          <div className={k.bar}>
            <span />
            <button type="button" className={k.btnPrimary} onClick={applyAnswers} disabled={!answerText.trim()}>
              İleri
            </button>
          </div>
        </section>
      )}

      {step === 'b_booklet' && hasB && (
        <section className={k.panel}>
          <h3>B kitapçığı soru numaraları</h3>
          <p className={k.hint}>A kitapçığındaki her sorunun B kitapçığındaki karşılığını alt alta yapıştırın. Bu adım isteğe bağlı.</p>
          <textarea
            className={k.area}
            value={bBookletText}
            onChange={e => setBBookletText(e.target.value)}
            placeholder={'3\n1\n5\n2\n4'}
            rows={6}
            autoFocus
          />
          <div className={k.bar}>
            <button type="button" className={k.btn} onClick={() => setStep('answers')}>Geri</button>
            <div className={k.actions}>
              <button type="button" className={k.btn} onClick={() => { setBBookletText(''); setStep('outcomes'); }}>Atla</button>
              <button type="button" className={k.btnPrimary} onClick={applyBBooklet}>İleri</button>
            </div>
          </div>
        </section>
      )}

      {step === 'outcomes' && (
        <section className={k.panel}>
          <h3>Kazanımlar</h3>
          <p className={k.hint}>Her satıra bir kazanım kodu veya açıklaması. Eşleşmeyenler önizlemede elle seçilir. Bu adım isteğe bağlı.</p>
          <div className={k.formats}>
            <div className={k.format}>
              <b>Kod veya açıklama</b>
              <code>{'M.6.1.1.1\nDoğal sayılarla dört işlem yapar'}</code>
            </div>
          </div>
          <textarea
            className={k.area}
            value={outcomeText}
            onChange={e => setOutcomeText(e.target.value)}
            placeholder={'M.6.1.1.1\nDoğal sayılarla dört işlem yapar'}
            rows={6}
            autoFocus
          />
          {allOutcomes.length === 0 && (
            <div className={k.warn}>Kazanım listesi boş. Müfredattan kazanım ekleyince buradan eşleşir.</div>
          )}
          <div className={k.bar}>
            <button type="button" className={k.btn} onClick={() => setStep(hasB ? 'b_booklet' : 'answers')}>Geri</button>
            <div className={k.actions}>
              <button type="button" className={k.btn} onClick={() => { setOutcomeText(''); setStep('preview'); }}>Atla</button>
              <button type="button" className={k.btnPrimary} onClick={applyOutcomes} disabled={!outcomeText.trim()}>İleri</button>
            </div>
          </div>
        </section>
      )}

      {step === 'preview' && (
        <>
          <div className={k.tools}>
            <div>
              <h3>Önizleme</h3>
              <p>{filledCount}/{totalQuestions} cevap{outcomeCount > 0 ? ` · ${outcomeCount} kazanım` : ''}{hasB && bCount > 0 ? ` · ${bCount} B eşleme` : ''}</p>
            </div>
            <div className={k.actions}>
              {!hasExistingData && (
                <button type="button" className={k.btn} onClick={() => setStep('answers')}>Adımlara dön</button>
              )}
              {hasExistingData && (
                <button type="button" className={k.btnDanger} onClick={handleReset}>Sıfırla</button>
              )}
              <button type="button" className={k.btnPrimary} onClick={handleSave} disabled={saving || filledCount === 0}>
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>

          <section className={k.panel}>
            {rows.map((row, idx) => {
              const showHeader = idx === 0 || rows[idx - 1].section_id !== row.section_id;
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
                  hasB={hasB}
                  onAnswer={setAnswer}
                  onBQuestion={setBQuestion}
                  onOpenOutcome={() => setOutcomeModal({ rowIdx: idx })}
                  onClearOutcome={() => setOutcome(idx, null)}
                  sectionInfo={sectionInfo}
                />
              );
            })}
            {filledCount === 0 && (
              <div className={k.blank}>
                <p>Henüz cevap girilmemiş.</p>
                <button type="button" className={k.btnPrimary} onClick={() => setStep('answers')}>Cevapları gir</button>
              </div>
            )}
          </section>
        </>
      )}

      {outcomeModal !== null && (
        <OutcomePickerModal
          subjects={subjectsForSection(
            subjects,
            (exam.sections ?? []).find(sec => sec.id === rows[outcomeModal.rowIdx]?.section_id)?.subject ?? null,
          )}
          search={outcomeSearch}
          onSearch={setOutcomeSearch}
          onSelect={o => setOutcome(outcomeModal.rowIdx, o)}
          onClose={() => setOutcomeModal(null)}
        />
      )}

      {showJumps && (
        <div className={k.jumps}>
          <button type="button" className={k.jump} aria-label="Yukarı" onClick={() => scrollPage('top')}>↑</button>
          <button type="button" className={k.jump} aria-label="Aşağı" onClick={() => scrollPage('bottom')}>↓</button>
        </div>
      )}
    </div>
  );
}

function PreviewRow({
  row, idx, showHeader, hasB,
  onAnswer, onBQuestion, onOpenOutcome, onClearOutcome,
  sectionInfo,
}: {
  row: GridRow;
  idx: number;
  showHeader: boolean;
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
        <div className={k.section}>
          {sectionInfo?.name ?? row.section_name}
          {sectionInfo ? ` · ${sectionInfo.question_count} soru` : ''}
        </div>
      )}
      <div className={k.q}>
        <div className={k.num}>{row.question_number}</div>
        <div className={k.choices}>
          {['A', 'B', 'C', 'D', 'E'].map(ch => (
            <button
              key={ch}
              type="button"
              className={row.correct_answer === ch ? k.choiceOn : k.choice}
              onClick={() => onAnswer(idx, ch as AnswerChoice)}
            >
              {ch}
            </button>
          ))}
          <button
            type="button"
            className={row.is_cancelled ? k.choiceOff : k.choice}
            onClick={() => onAnswer(idx, 'INVALID')}
            title="İptal"
          >
            ×
          </button>
        </div>
        <div className={k.side}>
          {hasB && (
            <input
              className={k.bInput}
              type="number"
              min={1}
              value={row.b_question_number ?? ''}
              onChange={e => onBQuestion(idx, e.target.value)}
              placeholder="B"
              aria-label="B kitapçığı soru numarası"
            />
          )}
          {row.outcome_code && (
            <span className={k.tag} title={row.outcome_text}>{row.outcome_code}</span>
          )}
          <button type="button" className={k.iconBtn} onClick={onOpenOutcome} title="Kazanım seç">
            {row.outcome_id ? '✎' : '+'}
          </button>
          {row.outcome_id && (
            <button type="button" className={k.iconBtn} onClick={onClearOutcome} title="Kazanımı kaldır">×</button>
          )}
        </div>
      </div>
    </>
  );
}

function OutcomePickerModal({ subjects, search, onSearch, onSelect, onClose }: {
  subjects: SubjectItem[];
  search: string;
  onSearch: (s: string) => void;
  onSelect: (o: OutcomeItem) => void;
  onClose: () => void;
}) {
  return (
    <div className={k.modal} onClick={onClose}>
      <div className={k.sheet} onClick={e => e.stopPropagation()}>
        <div className={k.sheetHead}>
          <h3>Kazanım seç</h3>
          <button type="button" className={k.iconBtn} onClick={onClose} aria-label="Kapat">×</button>
        </div>
        <div className={k.sheetBody}>
          <input
            className={k.search}
            type="text"
            placeholder="Kazanım kodu veya metin ara"
            value={search}
            onChange={e => onSearch(e.target.value)}
            autoFocus
          />
          {subjects.map(subj => {
            const filteredTopics = filterTopicsByQuery(subj.topics ?? [], search)
              .filter(t => (t.outcomes ?? []).length > 0);
            if (filteredTopics.length === 0) return null;
            return (
              <div key={subj.id} className={k.group}>
                <b>{subj.name}</b>
                {filteredTopics.map(topic => (
                  <div key={topic.id}>
                    <div className={k.topic}>{topic.name}</div>
                    {topic.outcomes.map(o => (
                      <div key={o.id}>
                        <button
                          type="button"
                          className={k.opt}
                          onClick={() => onSelect({ ...o, sub_outcome_id: null })}
                        >
                          <strong>{o.code}</strong>
                          {o.text}
                        </button>
                        {(o.sub_outcomes ?? []).map(sub => (
                          <button
                            key={sub.id}
                            type="button"
                            className={`${k.opt} ${k.sub}`}
                            onClick={() => onSelect({
                              id: o.id,
                              code: sub.code,
                              text: sub.text,
                              sub_outcome_id: sub.id,
                            })}
                          >
                            <strong>{sub.code}</strong>
                            {sub.text}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
          {subjects.length === 0 && (
            <div className={k.blank}>
              <p>Kazanım verisi bulunamadı.</p>
              <p>Müfredat modülünden kazanım ekleyebilirsiniz.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
