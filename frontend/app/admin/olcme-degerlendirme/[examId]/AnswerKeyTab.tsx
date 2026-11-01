'use client';

import { useState, useEffect, useCallback, useMemo, useRef, type KeyboardEvent } from 'react';
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
  AUDITED_CHOICES,
  auditBookletChoiceCounts,
  formatChoiceAuditMessage,
  parsePastedAnswers,
  type BookletChoiceAudit,
} from '../../../../components/olcme/booklet-choice-audit';
import {
  filterTopicsByQuery,
  findOutcomeByText,
  flattenSubjectOutcomes,
  subjectsForSection,
} from '../../../../components/olcme/outcome-search';
import {
  leafExamSections, leafSectionForQuestion, optionalQuestionCount, optionalSectionIds,
} from '../../../../components/olcme/section-ranges';

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

type Step = 'answers' | 'b_booklet' | 'outcomes' | 'preview';
type Filter = 'all' | 'blank' | 'no_outcome';

const LETTERS: AnswerChoice[] = ['A', 'B', 'C', 'D', 'E'];

/** Konu başlığı kodu (21.5) kazanıma bağlanmadan konuya bağlıdır; o da kazanımlı sayılır. */
const hasOutcome = (row: { outcome_id: number | null; outcome_code: string; outcome_text: string }) =>
  !!(row.outcome_id || (row.outcome_code && row.outcome_text));

const toText = (answer: string) => (
  answer === 'INVALID' ? 'İPTAL' : answer === 'EMPTY' ? 'BOŞ' : answer
);

function subjectForRow(subjects: SubjectItem[], sections: ExamDetail['sections'], sectionId: number): SubjectItem | null {
  const section = (sections ?? []).find(s => s.id === sectionId);
  if (section?.subject == null) return null;
  return subjects.find(s => Number(s.id) === Number(section.subject)) ?? null;
}

function outcomesForRow(subjects: SubjectItem[], sections: ExamDetail['sections'], sectionId: number): OutcomeItem[] {
  const section = (sections ?? []).find(s => s.id === sectionId);
  return flattenSubjectOutcomes(subjectsForSection(subjects, section?.subject ?? null));
}

export default function AnswerKeyTab({ exam }: { exam: ExamDetail }) {
  const [answerKeys, setAnswerKeys] = useState<AnswerKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [dirty, setDirty] = useState(false);
  const [pdfMeta, setPdfMeta] = useState<{ has_uploaded: boolean; can_generate: boolean; filename: string } | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfCopies, setPdfCopies] = useState<2 | 4 | 6>(2);
  const [pdfBooklet, setPdfBooklet] = useState('');

  const [rows, setRows] = useState<GridRow[]>([]);
  const [step, setStep] = useState<Step>('answers');
  const [filter, setFilter] = useState<Filter>('all');
  const [hasExistingData, setHasExistingData] = useState(false);

  const [answerText, setAnswerText] = useState('');
  const [bBookletText, setBBookletText] = useState('');
  const [bAnswerText, setBAnswerText] = useState('');
  const [bSavedText, setBSavedText] = useState('');
  const [outcomeText, setOutcomeText] = useState('');

  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [outcomeModal, setOutcomeModal] = useState<{ rowIdx: number } | null>(null);
  const [outcomeSearch, setOutcomeSearch] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const sections = useMemo(() => leafExamSections(exam.sections), [exam.sections]);
  const hasB = exam.booklet_type === 'AB' || exam.booklet_type === 'ABCD';
  const allOutcomes = useMemo(() => flattenSubjectOutcomes(subjects), [subjects]);

  const buildEmptyGrid = useCallback((): GridRow[] => {
    const grid: GridRow[] = [];
    for (const sec of sections) {
      for (let q = sec.question_start; q <= sec.question_end; q++) {
        grid.push({
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
    return grid;
  }, [sections]);

  const order = useMemo(() => buildEmptyGrid().map(row => row.question_number), [buildEmptyGrid]);
  const totalQuestions = order.length;
  const optionalIds = useMemo(() => optionalSectionIds(exam.sections), [exam.sections]);
  const optionalCount = useMemo(() => optionalQuestionCount(exam.sections), [exam.sections]);
  const questionSummary = optionalCount > 0
    ? `${totalQuestions} soru (${totalQuestions - optionalCount} + ${optionalCount} seçmeli)`
    : `${totalQuestions} soru`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const keys = await answerKeyApi.list(exam.id);
      setAnswerKeys(keys);
      const primary = pickPrimaryAnswerKey(keys);
      const grid = buildEmptyGrid();
      const at = new Map(grid.map((row, i) => [row.question_number, i]));
      const extra: GridRow[] = [];
      for (const item of primary?.items ?? []) {
        const leaf = leafSectionForQuestion(exam.sections, item.question_number);
        const row: GridRow = {
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
        const idx = at.get(item.question_number);
        if (idx === undefined) extra.push(row);
        else grid[idx] = row;
      }
      setRows([...grid, ...extra.sort((a, b) => a.question_number - b.question_number)]);

      const bKey = keys.find(key => (key.booklet || '').toUpperCase() === 'B' && key !== primary);
      const bByQ = new Map((bKey?.items ?? []).map(item => [item.question_number, item.correct_answer as string]));
      const bText = bByQ.size ? order.map(q => toText(bByQ.get(q) ?? '')).join('\n') : '';
      setBAnswerText(bText);
      setBSavedText(bText);

      const has = Boolean(primary && primary.items.length > 0);
      setHasExistingData(has);
      setStep(has ? 'preview' : 'answers');
      setDirty(false);
    } catch (err: unknown) {
      setMsg(`❌ Cevap anahtarı yüklenemedi: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`);
      setRows(buildEmptyGrid());
      setHasExistingData(false);
    } finally {
      setLoading(false);
    }
  }, [exam.id, exam.sections, buildEmptyGrid, order]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const loadPdfMeta = useCallback(async () => {
    try { setPdfMeta(await examApi.answerKeyPdfMeta(exam.id)); }
    catch { setPdfMeta(null); }
  }, [exam.id]);
  useEffect(() => { loadPdfMeta(); }, [loadPdfMeta]);

  useEffect(() => {
    answerKeyApi.outcomes(exam.id).then(setSubjects).catch(() => {});
  }, [exam.id]);

  const unsaved = dirty || bAnswerText !== bSavedText;

  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  const editRows = (update: (prev: GridRow[]) => GridRow[]) => {
    setRows(update);
    setDirty(true);
  };

  /* ── Yapıştırma adımları ─────────────────────────────────────────────── */

  const applyAnswers = () => {
    const parsed = parsePastedAnswers(answerText, order);
    const read = parsed.filter(Boolean).length;
    if (!read) { setMsg('⚠️ Tanınan cevap yok. A–E, İPTAL veya BOŞ yazın.'); return; }
    editRows(prev => prev.map((row, i) => {
      const answer = (i < totalQuestions ? parsed[i] ?? '' : row.correct_answer) as AnswerChoice;
      return { ...row, correct_answer: answer, is_cancelled: answer === 'INVALID' };
    }));
    const extra = Math.max(0, parsed.length - totalQuestions);
    const blank = totalQuestions - parsed.slice(0, totalQuestions).filter(Boolean).length;
    const notes = [
      extra ? `${extra} fazla cevap yok sayıldı` : '',
      blank ? `${blank} soru boş kaldı` : '',
    ].filter(Boolean);
    setMsg(notes.length
      ? `⚠️ ${Math.min(read, totalQuestions)} cevap yazıldı · ${notes.join(' · ')}.`
      : `✅ ${read} cevap yazıldı.`);
    setStep(hasB ? 'b_booklet' : 'preview');
  };

  const applyBBooklet = () => {
    const raw = bBookletText.trim();
    const notes: string[] = [];
    if (raw) {
      const numbers = raw.split(/[\n\t\r, ;]+/).map(t => parseInt(t, 10)).filter(n => !Number.isNaN(n));
      const max = Math.max(...order);
      const bad = numbers.filter(n => n < 1 || n > max).length;
      const dupes = numbers.length - new Set(numbers).size;
      if (bad) { setMsg(`⚠️ ${bad} numara 1–${max} aralığında değil. Düzeltip tekrar deneyin.`); return; }
      if (dupes) notes.push(`${dupes} numara tekrar ediyor`);
      editRows(prev => prev.map((row, i) => (i < numbers.length ? { ...row, b_question_number: numbers[i] } : row)));
      notes.unshift(`${Math.min(numbers.length, totalQuestions)} B numarası eşlendi`);
      if (numbers.length < totalQuestions) notes.push(`${totalQuestions - numbers.length} soru eşlenmedi`);
    }
    if (bChoiceAudit && !bChoiceAudit.ok) { setMsg(formatChoiceAuditMessage(bChoiceAudit)); return; }
    if (bChoiceAudit?.ok) notes.push('şık dağılımı uyumlu');
    setMsg(notes.length ? `${notes.some(n => /tekrar|eşlenmedi/.test(n)) ? '⚠️' : '✅'} ${notes.join(' · ')}.` : '');
    setStep('preview');
  };

  const applyOutcomes = () => {
    const lines = outcomeText.replace(/\r/g, '').split('\n').map(line => line.trim());
    const misses: string[] = [];
    let matched = 0;
    let unmatched = 0;
    editRows(prev => prev.map((row, i) => {
      const text = lines[i];
      if (!text) return row;
      const found = findOutcomeByText(
        text,
        outcomesForRow(subjects, exam.sections, row.section_id),
        subjectForRow(subjects, exam.sections, row.section_id)?.code,
      );
      if (!found) {
        unmatched++;
        if (misses.length < 3) misses.push(text);
        return {
          ...row,
          imported_outcome_text: text,
          outcome_id: null,
          sub_outcome_id: null,
          outcome_code: '',
          outcome_text: '',
        };
      }
      matched++;
      return {
        ...row,
        imported_outcome_text: text,
        outcome_id: found.id,
        sub_outcome_id: found.sub_outcome_id ?? null,
        outcome_code: found.code,
        outcome_text: found.text,
      };
    }));
    setMsg(unmatched
      ? `⚠️ ${matched} kazanım eşleşti · ${unmatched} bulunamadı (${misses.map(t => `"${t.slice(0, 40)}"`).join(', ')}). Listeden elle seçin.`
      : `✅ ${matched} kazanım eşleşti.`);
    setFilter(unmatched ? 'no_outcome' : 'all');
    setStep('preview');
  };

  /* ── Liste düzenleme ─────────────────────────────────────────────────── */

  const setAnswer = (idx: number, answer: AnswerChoice) => {
    editRows(prev => prev.map((row, i) => {
      if (i !== idx) return row;
      const next = row.correct_answer === answer ? ('' as AnswerChoice) : answer;
      return { ...row, correct_answer: next, is_cancelled: next === 'INVALID' };
    }));
  };

  const setBQuestion = (idx: number, val: string) => {
    const num = val === '' ? null : Number(val);
    editRows(prev => prev.map((row, i) => (i === idx ? { ...row, b_question_number: num } : row)));
  };

  const setOutcome = (idx: number, outcome: OutcomeItem | null) => {
    editRows(prev => prev.map((row, i) => (i === idx ? {
      ...row,
      outcome_id: outcome?.id ?? null,
      sub_outcome_id: outcome?.sub_outcome_id ?? null,
      outcome_code: outcome?.code ?? '',
      outcome_text: outcome?.text ?? '',
      imported_outcome_text: '',
    } : row)));
    setOutcomeModal(null);
  };

  const bChoiceAudit = useMemo<BookletChoiceAudit | null>(() => {
    if (!hasB || !bAnswerText.trim()) return null;
    return auditBookletChoiceCounts(
      exam.sections,
      new Map(rows.map(row => [row.question_number, row.correct_answer])),
      parsePastedAnswers(bAnswerText, order),
    );
  }, [hasB, bAnswerText, rows, exam.sections, order]);

  const handleSave = async () => {
    if (bChoiceAudit && !bChoiceAudit.ok) {
      setMsg(formatChoiceAuditMessage(bChoiceAudit));
      setStep('b_booklet');
      return;
    }
    const toSave = rows.filter(r =>
      r.correct_answer
      || r.outcome_id !== null
      || r.sub_outcome_id !== null
      || r.imported_outcome_text
      || r.b_question_number !== null,
    );
    const items: BulkAnswerKeyRow[] = toSave.map(r => ({
      question_number: r.question_number,
      correct_answer: r.correct_answer,
      is_cancelled: r.is_cancelled,
      outcome_id: r.outcome_id,
      sub_outcome_id: r.sub_outcome_id,
      imported_outcome_text: r.imported_outcome_text,
      b_question_number: r.b_question_number,
    }));
    const bChanged = hasB && bAnswerText.trim() && bAnswerText !== bSavedText;
    const bItems = bChanged
      ? parsePastedAnswers(bAnswerText, order).flatMap((answer, index) => {
          const q = order[index];
          if (q === undefined || !answer) return [];
          return [{ question_number: q, correct_answer: answer as AnswerChoice, is_cancelled: answer === 'INVALID' }];
        })
      : [];

    setSaving(true);
    setMsg('');
    try {
      const result = await answerKeyApi.bulkImport(exam.id, {
        booklet: hasB ? 'A' : '',
        items,
        ...(bItems.length ? { b_items: bItems } : {}),
      });
      setMsg(`✅ ${result.message}`);
      await loadPdfMeta();
      await fetchData();
    } catch (err: unknown) {
      setMsg(`❌ Kaydetme hatası: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Kayıtlı cevap anahtarı (A ve B) silinsin mi? Kazanım bağları da gider.')) return;
    try {
      for (const ak of answerKeys) await answerKeyApi.delete(exam.id, ak.id);
      setAnswerText('');
      setBBookletText('');
      setOutcomeText('');
      setMsg('Cevap anahtarı silindi.');
      await loadPdfMeta();
      await fetchData();
    } catch { setMsg('❌ Silme hatası.'); }
  };

  const discard = () => {
    if (!confirm('Kaydedilmemiş değişiklikler atılsın mı?')) return;
    setMsg('');
    setAnswerText('');
    setBBookletText('');
    setOutcomeText('');
    void fetchData();
  };

  /* ── PDF ─────────────────────────────────────────────────────────────── */

  const bookletOptions = useMemo(() => {
    const fromKeys = answerKeys.map(item => (item.booklet || '').trim().toUpperCase()).filter(Boolean);
    const fromType = exam.booklet_type === 'ABCD' ? ['A', 'B', 'C', 'D'] : exam.booklet_type === 'AB' ? ['A', 'B'] : [];
    return [...new Set([...fromType, ...fromKeys])].sort();
  }, [answerKeys, exam.booklet_type]);

  const savedBooklets = useMemo(
    () => [...new Set(answerKeys.map(item => (item.booklet || '').trim().toUpperCase()).filter(Boolean))],
    [answerKeys],
  );
  const showsBothBooklets = !pdfBooklet && savedBooklets.includes('A') && savedBooklets.includes('B');
  const canDownloadPdf = !unsaved && Boolean(hasExistingData || pdfMeta?.can_generate || pdfMeta?.has_uploaded);

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      await examApi.downloadAnswerKeyPdf(exam.id, { source: 'generated', copies: pdfCopies, booklet: pdfBooklet || undefined });
    } catch (err: unknown) {
      setMsg(`❌ ${err instanceof Error ? err.message : 'PDF indirilemedi.'}`);
    } finally {
      setPdfBusy(false);
    }
  };

  /* ── Türemiş sayılar ─────────────────────────────────────────────────── */

  const filledCount = rows.filter(r => r.correct_answer).length;
  const blankCount = rows.length - filledCount;
  const outcomeCount = rows.filter(hasOutcome).length;
  const noOutcomeCount = rows.length - outcomeCount;
  const bCount = rows.filter(r => r.b_question_number).length;
  const percent = totalQuestions ? Math.round((filledCount / totalQuestions) * 100) : 0;

  const shownRows = useMemo(() => rows
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => (filter === 'blank' ? !row.correct_answer : filter === 'no_outcome' ? !hasOutcome(row) : true)),
  [rows, filter]);

  const sectionStats = useMemo(() => {
    const map = new Map<number, { total: number; filled: number }>();
    for (const row of rows) {
      const cur = map.get(row.section_id) ?? { total: 0, filled: 0 };
      cur.total += 1;
      if (row.correct_answer) cur.filled += 1;
      map.set(row.section_id, cur);
    }
    return map;
  }, [rows]);

  const onRowKey = (event: KeyboardEvent<HTMLDivElement>, idx: number) => {
    if (event.target instanceof HTMLInputElement) return;
    const key = event.key.toUpperCase();
    const answer = LETTERS.includes(key as AnswerChoice) ? key as AnswerChoice : key === 'X' ? 'INVALID' as AnswerChoice : null;
    const move = (dir: 1 | -1) => {
      const list = listRef.current?.querySelectorAll<HTMLElement>('[data-row]');
      if (!list) return;
      const all = [...list];
      const at = all.findIndex(el => Number(el.dataset.row) === idx);
      all[at + dir]?.focus();
    };
    if (answer) {
      event.preventDefault();
      if (rows[idx]?.correct_answer !== answer) setAnswer(idx, answer);
      move(1);
    } else if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
    else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      if (rows[idx]?.correct_answer) setAnswer(idx, rows[idx].correct_answer);
    }
  };

  if (loading) return <div className={k.loading}>Yükleniyor…</div>;

  const steps: { key: Step; label: string; done: boolean }[] = [
    { key: 'answers', label: 'Cevaplar', done: filledCount > 0 },
    ...(hasB ? [{ key: 'b_booklet' as Step, label: 'B kitapçığı', done: bCount > 0 || Boolean(bAnswerText.trim()) }] : []),
    { key: 'outcomes', label: 'Kazanımlar', done: outcomeCount > 0 },
    { key: 'preview', label: 'Liste', done: false },
  ];
  const toastKind = msg.includes('❌') ? k.toastErr : msg.includes('⚠️') ? k.toastWarn : k.toastOk;
  const auditBlocks = Boolean(bChoiceAudit && !bChoiceAudit.ok);

  return (
    <div className={k.page}>
      {msg && (
        <div className={`${k.toast} ${toastKind}`} role="status">
          <span>{msg.replace(/^(✅|⚠️|❌)\s*/u, '')}</span>
          <button type="button" aria-label="Kapat" onClick={() => setMsg('')}>×</button>
        </div>
      )}

      <section className={k.toolbar}>
        <div className={k.summary}>
          <p className={k.count}>
            <b>{filledCount}</b>/{totalQuestions} cevap
            <span>
              {optionalCount > 0 ? `${optionalCount} seçmeli dahil · ` : ''}
              {outcomeCount} kazanım{hasB ? ` · ${bCount} B eşleme` : ''}
            </span>
          </p>
          <div className={k.meter} aria-hidden><i style={{ width: `${percent}%` }} /></div>
          <p className={unsaved ? k.stateDirty : k.state}>
            {unsaved ? 'Kaydedilmedi' : hasExistingData ? 'Kaydedildi' : 'Anahtar yok'}
          </p>
        </div>
      </section>

      {unsaved && (
        <div className={k.dock} role="region" aria-label="Kaydedilmemiş değişiklik">
          <p>
            <b>Kaydedilmedi</b>
            <span>{auditBlocks ? 'B kitapçığı şıkları uyuşmuyor' : `${filledCount}/${totalQuestions} cevap`}</span>
          </p>
          <button type="button" className={k.dockGhost} onClick={discard}>Vazgeç</button>
          <button
            type="button"
            className={k.dockSave}
            onClick={handleSave}
            disabled={saving || (filledCount === 0 && outcomeCount === 0) || auditBlocks}
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      )}

      <nav className={k.tabs} role="tablist" aria-label="Cevap anahtarı">
        {steps.map(st => (
          <button
            key={st.key}
            type="button"
            role="tab"
            aria-selected={step === st.key}
            className={step === st.key ? k.tabOn : k.tab}
            onClick={() => setStep(st.key)}
          >
            {st.done && <span className={k.tick} aria-hidden>✓</span>}
            {st.label}
          </button>
        ))}
      </nav>

      {step === 'answers' && (
        <section className={k.panel}>
          <header className={k.head}>
            <h3>Cevapları yapıştır</h3>
            <p>
              {questionSummary}. Alt alta, yan yana (ABCDE), test test satırlar veya numaralı (1-A) olabilir.
              İptal için İPTAL veya X, boş için BOŞ.
              {filledCount > 0 && ' Yapıştırınca mevcut cevaplar değişir; kazanım ve B eşlemesi korunur.'}
            </p>
          </header>
          <textarea
            className={k.area}
            value={answerText}
            onChange={e => setAnswerText(e.target.value)}
            placeholder={'ABCDEABCDE…\nveya\n1-A\n2-C'}
            rows={9}
            autoFocus
          />
          <PasteCount text={answerText} order={order} />
          <div className={k.panelBar}>
            <span />
            <button type="button" className={k.btnPrimary} onClick={applyAnswers} disabled={!answerText.trim()}>
              Cevaplara yaz
            </button>
          </div>
        </section>
      )}

      {step === 'b_booklet' && hasB && (
        <section className={k.panel}>
          <header className={k.head}>
            <h3>B kitapçığı</h3>
            <p>İkisi de isteğe bağlı. Yalnız B cevaplarını girerseniz soru eşlemesi şıklardan kurulur.</p>
          </header>
          <div className={k.twoCol}>
            <label className={k.block}>
              <span>B cevap anahtarı</span>
              <small>B kitapçığının kendi sırasıyla. Her testte şık sayıları A ile aynı olmalı.</small>
              <textarea
                className={k.area}
                value={bAnswerText}
                onChange={e => setBAnswerText(e.target.value)}
                placeholder={'ABCDEABCDE…'}
                rows={8}
              />
              <PasteCount text={bAnswerText} order={order} />
            </label>
            <label className={k.block}>
              <span>Soru numarası eşlemesi</span>
              <small>A kitapçığındaki her sorunun B’deki numarası, alt alta.</small>
              <textarea
                className={k.area}
                value={bBookletText}
                onChange={e => setBBookletText(e.target.value)}
                placeholder={'3\n1\n5\n2'}
                rows={8}
              />
            </label>
          </div>
          {bChoiceAudit && <ChoiceAuditPanel audit={bChoiceAudit} />}
          <div className={k.panelBar}>
            <span />
            <button
              type="button"
              className={k.btnPrimary}
              onClick={applyBBooklet}
              disabled={auditBlocks || (!bBookletText.trim() && bAnswerText === bSavedText)}
            >
              Uygula
            </button>
          </div>
        </section>
      )}

      {step === 'outcomes' && (
        <section className={k.panel}>
          <header className={k.head}>
            <h3>Kazanımları yapıştır</h3>
            <p>Her satır bir soru: kazanım kodu veya açıklaması. Boş satır o soruyu atlar. Eşleşmeyenler listede elle seçilir.</p>
          </header>
          {allOutcomes.length === 0 && (
            <div className={k.warn}>Bu sınavın derslerinde kazanım yok. Müfredattan kazanım ekleyince eşleşir.</div>
          )}
          <textarea
            className={k.area}
            value={outcomeText}
            onChange={e => setOutcomeText(e.target.value)}
            placeholder={'M.6.1.1.1\nDoğal sayılarla dört işlem yapar'}
            rows={9}
            autoFocus
          />
          <div className={k.panelBar}>
            <span className={k.muted}>{outcomeText.split('\n').filter(l => l.trim()).length} satır</span>
            <button type="button" className={k.btnPrimary} onClick={applyOutcomes} disabled={!outcomeText.trim() || allOutcomes.length === 0}>
              Kazanımlara yaz
            </button>
          </div>
        </section>
      )}

      {step === 'preview' && (
        <section className={k.panel}>
          <div className={k.listHead}>
            <div className={k.filters} role="group" aria-label="Süz">
              <button type="button" className={filter === 'all' ? k.filterOn : k.filter} onClick={() => setFilter('all')}>
                Tümü <b>{rows.length}</b>
              </button>
              <button type="button" className={filter === 'blank' ? k.filterOn : k.filter} onClick={() => setFilter('blank')}>
                Boş <b>{blankCount}</b>
              </button>
              {allOutcomes.length > 0 && (
                <button type="button" className={filter === 'no_outcome' ? k.filterOn : k.filter} onClick={() => setFilter('no_outcome')}>
                  Kazanımsız <b>{noOutcomeCount}</b>
                </button>
              )}
            </div>
            <p className={k.muted}>Satıra gelip A–E, X (iptal) veya ↑↓ ile hızlı girin.</p>
          </div>

          {auditBlocks && bChoiceAudit && (
            <div className={k.auditWrap}><ChoiceAuditPanel audit={bChoiceAudit} /></div>
          )}

          <div ref={listRef}>
            {shownRows.map(({ row, idx }, i) => {
              const prev = shownRows[i - 1]?.row;
              const header = !prev || prev.section_id !== row.section_id;
              const stat = sectionStats.get(row.section_id);
              return (
                <div key={row.question_number}>
                  {header && (
                    <div className={k.section}>
                      <b>{row.section_name}</b>
                      {optionalIds.has(row.section_id) && !/seçmeli/i.test(row.section_name) && (
                        <em className={k.optionalTag}>Seçmeli</em>
                      )}
                      {stat && <span className={stat.filled === stat.total ? k.sectionDone : ''}>{stat.filled}/{stat.total}</span>}
                    </div>
                  )}
                  <QuestionRow
                    row={row}
                    idx={idx}
                    hasB={hasB}
                    canPickOutcome={allOutcomes.length > 0}
                    onAnswer={setAnswer}
                    onBQuestion={setBQuestion}
                    onOpenOutcome={() => { setOutcomeSearch(''); setOutcomeModal({ rowIdx: idx }); }}
                    onClearOutcome={() => setOutcome(idx, null)}
                    onKeyDown={e => onRowKey(e, idx)}
                  />
                </div>
              );
            })}
            {shownRows.length === 0 && (
              <div className={k.blank}>
                {filter === 'all' ? 'Bu sınavda bölüm yok.' : 'Bu süzgece uyan soru yok.'}
              </div>
            )}
          </div>
        </section>
      )}

      <section className={k.footer}>
        <div className={k.pdf}>
          <span className={k.footLabel}>Cevap anahtarı PDF</span>
          <select aria-label="Adet" value={pdfCopies} onChange={e => setPdfCopies(Number(e.target.value) as 2 | 4 | 6)}>
            <option value={2}>{showsBothBooklets ? '2 adet (A ve B)' : '2 adet'}</option>
            <option value={4}>4 adet</option>
            <option value={6}>6 adet</option>
          </select>
          {bookletOptions.length > 0 && (
            <select aria-label="Kitapçık" value={pdfBooklet} onChange={e => setPdfBooklet(e.target.value)}>
              <option value="">Tüm kitapçıklar</option>
              {bookletOptions.map(letter => <option key={letter} value={letter}>{letter} kitapçığı</option>)}
            </select>
          )}
          <button
            type="button"
            className={k.btn}
            disabled={pdfBusy || !canDownloadPdf}
            title={unsaved ? 'Önce kaydedin; PDF kayıtlı anahtarı basar.' : canDownloadPdf ? undefined : 'Önce cevapları kaydedin'}
            onClick={downloadPdf}
          >
            {pdfBusy ? 'Hazırlanıyor…' : 'PDF indir'}
          </button>
        </div>
        {hasExistingData && (
          <button type="button" className={k.btnDanger} onClick={handleReset}>Anahtarı sil</button>
        )}
      </section>

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
    </div>
  );
}

function PasteCount({ text, order }: { text: string; order: number[] }) {
  if (!text.trim()) return null;
  const parsed = parsePastedAnswers(text, order);
  const read = parsed.filter(Boolean).length;
  const ok = parsed.length === order.length && read === order.length;
  return (
    <p className={ok ? k.countOk : k.countWarn}>
      {read} cevap okundu · {order.length} soru
      {parsed.length > order.length ? ` · ${parsed.length - order.length} fazla` : ''}
    </p>
  );
}

function ChoiceAuditPanel({ audit }: { audit: BookletChoiceAudit }) {
  return (
    <div className={k.audit}>
      <p className={audit.ok ? k.auditNoteOk : k.auditNoteBad}>
        {audit.ok
          ? 'Her testte şık sayıları A kitapçığıyla aynı.'
          : (audit.lengthNote || 'Şık sayıları uyuşmuyor. Kırmızı şıklar A ve B kitapçığında farklı.')}
      </p>
      {audit.tests.map(test => (
        <div key={`${test.name}-${test.start}`} className={test.ok ? k.auditOk : k.auditBad}>
          <b>
            {test.name}
            <span>{test.questionCount} soru · {test.ok ? 'Uyumlu' : 'Uyuşmuyor'}</span>
          </b>
          <div className={k.chips}>
            {AUDITED_CHOICES.filter(choice => choice !== 'INVALID' || test.a[choice] > 0 || test.b[choice] > 0).map(choice => {
              const left = test.a[choice];
              const right = test.b[choice];
              const bad = left !== right;
              return (
                <span key={choice} className={bad ? k.chipBad : k.chip}>
                  {choice === 'INVALID' ? 'İptal' : choice} {bad ? `${left}≠${right}` : left}
                </span>
              );
            })}
          </div>
          {!test.ok && (test.aFilled !== test.questionCount || test.bFilled !== test.questionCount) && (
            <p className={k.diffLine}>
              Cevap sayısı: A kitapçığı {test.aFilled}, B kitapçığı {test.bFilled}, soru {test.questionCount}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function QuestionRow({
  row, idx, hasB, canPickOutcome, onAnswer, onBQuestion, onOpenOutcome, onClearOutcome, onKeyDown,
}: {
  row: GridRow;
  idx: number;
  hasB: boolean;
  canPickOutcome: boolean;
  onAnswer: (idx: number, a: AnswerChoice) => void;
  onBQuestion: (idx: number, v: string) => void;
  onOpenOutcome: () => void;
  onClearOutcome: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const blank = !row.correct_answer;
  return (
    <div
      className={blank ? `${k.q} ${k.qBlank}` : k.q}
      data-row={idx}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label={`${row.question_number}. soru`}
    >
      <span className={k.num}>{row.question_number}</span>
      <div className={k.choices}>
        {LETTERS.map(ch => (
          <button
            key={ch}
            type="button"
            tabIndex={-1}
            className={row.correct_answer === ch ? k.choiceOn : k.choice}
            onClick={() => onAnswer(idx, ch)}
            aria-pressed={row.correct_answer === ch}
          >
            {ch}
          </button>
        ))}
        <button
          type="button"
          tabIndex={-1}
          className={`${row.correct_answer === 'INVALID' ? k.choiceOff : k.choice} ${k.cancel}`}
          onClick={() => onAnswer(idx, 'INVALID')}
          aria-pressed={row.correct_answer === 'INVALID'}
          title="Soru iptal (klavyede X)"
        >
          İptal
        </button>
        {row.correct_answer === 'EMPTY' && <span className={k.emptyTag}>Boş</span>}
      </div>
      {hasB && (
        <input
          className={k.bInput}
          type="number"
          min={1}
          value={row.b_question_number ?? ''}
          onChange={e => onBQuestion(idx, e.target.value)}
          placeholder="B"
          aria-label={`${row.question_number}. sorunun B kitapçığı numarası`}
        />
      )}
      <div className={k.outcome}>
        {hasOutcome(row) ? (
          <>
            <button type="button" className={k.outcomeOn} onClick={onOpenOutcome} title={row.outcome_text}>
              <b>{row.outcome_code}</b>
              <span>{row.outcome_text}</span>
            </button>
            <button type="button" className={k.x} onClick={onClearOutcome} aria-label="Kazanımı kaldır">×</button>
          </>
        ) : canPickOutcome ? (
          <button
            type="button"
            className={row.imported_outcome_text ? k.outcomeMiss : k.outcomeAdd}
            onClick={onOpenOutcome}
            title={row.imported_outcome_text || 'Kazanım seç'}
          >
            {row.imported_outcome_text ? <>Eşleşmedi: <span>{row.imported_outcome_text}</span></> : '+ Kazanım'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function OutcomePickerModal({ subjects, search, onSearch, onSelect, onClose }: {
  subjects: SubjectItem[];
  search: string;
  onSearch: (s: string) => void;
  onSelect: (o: OutcomeItem) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={k.modal} onClick={onClose}>
      <div className={k.sheet} role="dialog" aria-modal="true" aria-label="Kazanım seç" onClick={e => e.stopPropagation()}>
        <div className={k.sheetHead}>
          <h3>Kazanım seç</h3>
          <button type="button" className={k.x} onClick={onClose} aria-label="Kapat">×</button>
        </div>
        <div className={k.sheetBody}>
          <input
            className={k.search}
            type="search"
            placeholder="Kod veya metin ara"
            value={search}
            onChange={e => onSearch(e.target.value)}
            autoFocus
          />
          {subjects.map(subj => {
            const topics = filterTopicsByQuery(subj.topics ?? [], search).filter(t => (t.outcomes ?? []).length > 0);
            if (topics.length === 0) return null;
            return (
              <div key={subj.id} className={k.group}>
                <b>{subj.name}</b>
                {topics.map(topic => (
                  <div key={topic.id}>
                    <div className={k.topic}>{topic.name}</div>
                    {topic.outcomes.map(o => (
                      <div key={o.id}>
                        <button type="button" className={k.opt} onClick={() => onSelect({ ...o, sub_outcome_id: null })}>
                          <strong>{o.code}</strong>
                          {o.text}
                        </button>
                        {(o.sub_outcomes ?? []).map(sub => (
                          <button
                            key={sub.id}
                            type="button"
                            className={`${k.opt} ${k.sub}`}
                            onClick={() => onSelect({ id: o.id, code: sub.code, text: sub.text, sub_outcome_id: sub.id })}
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
            <div className={k.blank}>Bu dersin kazanımı yok. Müfredat modülünden ekleyebilirsiniz.</div>
          )}
        </div>
      </div>
    </div>
  );
}
