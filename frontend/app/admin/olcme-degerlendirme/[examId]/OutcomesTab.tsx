'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { examApi, answerKeyApi, curriculumApi } from '../../../../components/olcme/api';
import type {
  ExamDetail,
  ExamSection,
  AnswerKey,
  SubjectItem,
  TopicItem,
  OutcomeItem,
  MatchResult,
} from '../../../../components/olcme/types';
import s from '../olcme.module.css';

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Yardımcı Tipler & Fonksiyonlar                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

/** Soru‐kazanım satırı (UI state) */
interface OutcomeRow {
  item_id: number;
  question_number: number;
  correct_answer: string;
  is_cancelled: boolean;
  section_id: number;
  section_name: string;
  // Orijinal import edilen kazanım metni
  imported_outcome_text: string;
  // Mevcut eşleşmiş kazanım
  outcome_id: number | null;
  outcome_code: string;
  outcome_text: string;
  // Konu bilgisi (outcome → topic)
  topic_name: string;
  // Eşleştirme puanı (0”100)
  match_score: number;
}

/** Alt ders bilgisi (sub_section + bağlı Subject) */
interface SubSectionInfo {
  section: ExamSection;
  subject: SubjectItem | null;
  topics: TopicItem[];
  outcomes: OutcomeItem[];
}

/** Düz outcome listesi oluştur: Subject → Topic → Outcome */
function flattenOutcomes(topics: TopicItem[]): OutcomeItem[] {
  const flat: OutcomeItem[] = [];
  for (const topic of topics) {
    for (const o of (topic.outcomes ?? [])) {
      flat.push(o);
    }
  }
  return flat;
}

/** Konu bilgisini outcome'dan bul */
function findTopicForOutcome(topics: TopicItem[], outcomeId: number): string {
  for (const t of topics) {
    if ((t.outcomes ?? []).some(o => o.id === outcomeId)) return t.name;
  }
  return '';
}

/** Eşleştirme puanı hesapla (0‐100):
 *  100 = tam code eşleşmesi
 *   90 = tam text eşleşmesi
 *   80 = code başlangıcı eşleşmesi
 *   70 = code kısmi eşleşme
 *   60 = text kısmi eşleşme
 *    0 = eşleşme yok
 */
function calcMatchScore(inputCode: string, inputText: string, outcome: OutcomeItem): number {
  if (!outcome) return 0;
  const ic = (inputCode || '').trim().toLowerCase();
  const it = (inputText || '').trim().toLowerCase();
  const oc = outcome.code.toLowerCase();
  const ot = outcome.text.toLowerCase();

  // code tam eşleşme
  if (ic && ic === oc) return 100;
  // text tam eşleşme
  if (it && it === ot) return 90;
  // code ile tam eşleşme (giriş metni = outcome code)
  if (it && it === oc) return 95;
  // code başlangıcı
  if (ic && oc.startsWith(ic)) return 80;
  if (ic && ic.startsWith(oc)) return 80;
  // code kısmi
  if (ic && (oc.includes(ic) || ic.includes(oc))) return 70;
  // text kısmi
  if (it && ot.includes(it)) return 65;
  if (it && it.includes(ot)) return 60;
  // Hiçbir eşleşme yoksa ama outcome atanmışsa → manuel atama
  if (outcome.id) return 50;
  return 0;
}

/** Eşleştirme puanı badge rengi */
function scoreColor(score: number): string {
  if (score >= 90) return '#16a34a';
  if (score >= 70) return '#ca8a04';
  if (score >= 50) return '#ea580c';
  return '#dc2626';
}

function scoreBg(score: number): string {
  if (score >= 90) return '#f0fdf4';
  if (score >= 70) return '#fefce8';
  if (score >= 50) return '#fff7ed';
  return '#fef2f2';
}

function scoreLabel(score: number): string {
  if (score >= 95) return 'Tam Eşleşme';
  if (score >= 80) return 'Yüksek';
  if (score >= 60) return 'Kısmi';
  if (score >= 50) return 'Manuel';
  return 'Eşleşme Yok';
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  ANA BİLEŞEN                                                             */
/* ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  exam: ExamDetail;
}

export default function OutcomesTab({ exam }: Props) {
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [msg, setMsg]                 = useState('');
  const [answerKeys, setAnswerKeys]   = useState<AnswerKey[]>([]);
  const [subSections, setSubSections] = useState<SubSectionInfo[]>([]);
  const [rows, setRows]               = useState<OutcomeRow[]>([]);

  // Kazanım seçici modal
  const [pickerOpen, setPickerOpen]       = useState(false);
  const [pickerRowIdx, setPickerRowIdx]   = useState<number>(-1);
  const [pickerSearch, setPickerSearch]   = useState('');
  const [pickerSection, setPickerSection] = useState<SubSectionInfo | null>(null);

  // Toplu kazanım yapıştırma modal
  const [bulkOpen, setBulkOpen]             = useState(false);
  const [bulkSectionId, setBulkSectionId]   = useState<number | null>(null);
  const [bulkText, setBulkText]             = useState('');

  // Filtre
  const [filterSection, setFilterSection] = useState<number | null>(null);
  const [filterMatch, setFilterMatch]     = useState<'all' | 'matched' | 'unmatched'>('all');

  /* ── Veri yükle ─── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 0) Güncel exam verisini çek (yeni oluşturulan alt bölümleri de görmek için)
      const freshExam = await examApi.detail(exam.id);
      const allSections: ExamSection[] = freshExam.sections ?? [];
      const freshSubSections = allSections.filter(sec => sec.is_sub_section);
      const freshMainSections = allSections.filter(sec => !sec.is_sub_section);

      // 1) Cevap anahtarlarını yükle
      const keys = await answerKeyApi.list(exam.id);
      setAnswerKeys(keys);

      // 2) Kazanım ağacını yükle (sınav türüne göre filtrelenmiş)
      const subjectsTree = await answerKeyApi.outcomes(exam.id);

      // 3) Alt bölümlerin bağlı Subject'lerini bul
      //    Alt bölümü olan ana bölümler → alt bölümlerle temsil edilir
      //    Alt bölümü olmayan ana bölümler → kendileri temsil eder
      const ssInfos: SubSectionInfo[] = [];

      // Alt bölümü olan ana bölümlerin id'lerini topla
      const parentsWithChildren = new Set(
        freshSubSections.map(s => s.parent_section).filter(Boolean)
      );

      // Önce alt bölümleri ekle
      for (const sub of freshSubSections) {
        let subject: SubjectItem | null = null;
        let topics: TopicItem[] = [];
        let outcomes: OutcomeItem[] = [];

        if (sub.subject) {
          subject = subjectsTree.find(s => s.id === sub.subject) ?? null;
          if (subject) {
            topics = subject.topics ?? [];
            outcomes = flattenOutcomes(topics);
          }
        }
        ssInfos.push({ section: sub, subject, topics, outcomes });
      }

      // Alt bölümü olmayan ana bölümleri de ekle
      for (const main of freshMainSections) {
        if (parentsWithChildren.has(main.id)) continue; // alt bölümü var, atla
        let subject: SubjectItem | null = null;
        let topics: TopicItem[] = [];
        let outcomes: OutcomeItem[] = [];

        if (main.subject) {
          subject = subjectsTree.find(s => s.id === main.subject) ?? null;
          if (subject) {
            topics = subject.topics ?? [];
            outcomes = flattenOutcomes(topics);
          }
        }
        ssInfos.push({ section: main, subject, topics, outcomes });
      }

      // Soru başlangıcına göre sırala
      ssInfos.sort((a, b) => a.section.question_start - b.section.question_start);

      setSubSections(ssInfos);

      // 4) Cevap anahtarı satırlarını OutcomeRow'a dönüştür
      const primary = keys.find(k => k.is_primary) ?? keys[0];
      if (primary && primary.items.length > 0) {
        const newRows: OutcomeRow[] = primary.items.map(item => {
          // Bu sorunun ait olduğu alt bölümü bul
          const ssInfo = ssInfos.find(ss => ss.section.id === item.section);
          const topicName = item.outcome && ssInfo
            ? findTopicForOutcome(ssInfo.topics, item.outcome)
            : '';
          const matchScore = item.outcome
            ? calcMatchScore(item.outcome_code, item.outcome_text, {
                id: item.outcome,
                code: item.outcome_code,
                text: item.outcome_text,
              })
            : 0;

          return {
            item_id: item.id,
            question_number: item.question_number,
            correct_answer: item.correct_answer,
            is_cancelled: item.is_cancelled,
            section_id: item.section,
            section_name: item.section_name,
            imported_outcome_text: item.imported_outcome_text || '',
            outcome_id: item.outcome,
            outcome_code: item.outcome_code || '',
            outcome_text: item.outcome_text || '',
            topic_name: topicName,
            match_score: item.outcome ? matchScore || 50 : 0, // atanmışsa en az 50
          };
        });
        setRows(newRows);
      }
    } catch (err) {
      console.error('OutcomesTab fetchData error:', err);
      setMsg('❌ Veri yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [exam.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── İstatistikler ─── */
  const totalQuestions = rows.length;
  const matchedCount  = rows.filter(r => r.outcome_id).length;
  const unmatchedCount = totalQuestions - matchedCount;
  const avgScore = matchedCount > 0
    ? Math.round(rows.filter(r => r.outcome_id).reduce((s, r) => s + r.match_score, 0) / matchedCount)
    : 0;

  /* ── Filtreleme ─── */
  const filteredRows = useMemo(() => {
    let result = rows;
    if (filterSection !== null) {
      result = result.filter(r => r.section_id === filterSection);
    }
    if (filterMatch === 'matched') {
      result = result.filter(r => r.outcome_id !== null);
    } else if (filterMatch === 'unmatched') {
      result = result.filter(r => r.outcome_id === null);
    }
    return result;
  }, [rows, filterSection, filterMatch]);

  /* ── Kazanım ata (tekil — API ile kaydet) ─── */
  const handleSetOutcome = useCallback(async (rowIdx: number, outcome: OutcomeItem | null) => {
    const row = rows[rowIdx];
    if (!row) return;

    // UI güncelle
    const ssInfo = subSections.find(ss => ss.section.id === row.section_id);
    const topicName = outcome && ssInfo ? findTopicForOutcome(ssInfo.topics, outcome.id) : '';
    const matchScore = outcome ? 100 : 0; // kullanıcı seçtiği için yüksek puan

    setRows(prev => {
      const next = [...prev];
      next[rowIdx] = {
        ...next[rowIdx],
        outcome_id: outcome?.id ?? null,
        outcome_code: outcome?.code ?? '',
        outcome_text: outcome?.text ?? '',
        topic_name: topicName,
        match_score: matchScore,
      };
      return next;
    });

    // API'ye kaydet
    const primary = answerKeys.find(k => k.is_primary) ?? answerKeys[0];
    if (primary) {
      try {
        await answerKeyApi.updateItem(exam.id, primary.id, {
          item_id: row.item_id,
          outcome_id: outcome?.id ?? null,
        });
      } catch (err) {
        console.error('updateItem error:', err);
        setMsg('❌ Kazanım kaydedilirken hata oluştu.');
      }
    }

    setPickerOpen(false);
  }, [rows, answerKeys, exam.id, subSections]);

  /* ── Kazanım kaldır ─── */
  const handleRemoveOutcome = useCallback(async (rowIdx: number) => {
    await handleSetOutcome(rowIdx, null);
  }, [handleSetOutcome]);

  /* ── Kazanım seçici aç ─── */
  const openPicker = useCallback((rowIdx: number) => {
    const row = rows[rowIdx];
    const ssInfo = subSections.find(ss => ss.section.id === row.section_id);
    setPickerRowIdx(rowIdx);
    setPickerSection(ssInfo ?? null);
    setPickerSearch('');
    setPickerOpen(true);
  }, [rows, subSections]);

  /* ── Toplu kazanım yapıştır (Backend Akıllı Eşleştirme) ─── */
  const handleBulkPaste = useCallback(async () => {
    if (!bulkSectionId || !bulkText.trim()) return;

    const ssInfo = subSections.find(ss => ss.section.id === bulkSectionId);
    if (!ssInfo || !ssInfo.subject) {
      setMsg('⚠️ Bu bölüme ders bağlanmamış. Önce ders bağlayın.');
      return;
    }

    const lines = bulkText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const sectionRows = rows
      .map((r, idx) => ({ row: r, idx }))
      .filter(item => item.row.section_id === bulkSectionId);

    if (sectionRows.length === 0) {
      setMsg('⚠️ Bu bölümde soru bulunamadı.');
      return;
    }

    setSaving(true);
    setMsg('🔄 Backend eşleştirme yapılıyor...');

    try {
      // Backend'e toplu eşleştirme isteği gönder
      const { results } = await curriculumApi.matchOutcomes(ssInfo.subject.id, lines);

      let matched = 0;
      let unmatched = 0;
      const newRows = [...rows];
      const primary = answerKeys.find(k => k.is_primary) ?? answerKeys[0];

      // Her satır için sonuçları uygula
      for (let i = 0; i < Math.min(results.length, sectionRows.length); i++) {
        const result: MatchResult = results[i];
        const { row, idx } = sectionRows[i];

        // Orijinal yapıştırılan metni her zaman kaydet
        newRows[idx] = {
          ...newRows[idx],
          imported_outcome_text: result.input_text,
        };

        if (result.outcome_id) {
          newRows[idx] = {
            ...newRows[idx],
            outcome_id: result.outcome_id,
            outcome_code: result.outcome_code ?? '',
            outcome_text: result.outcome_text ?? '',
            topic_name: result.topic_name ?? '',
            match_score: result.match_score,
          };
          matched++;

          // API'ye kaydet
          if (primary) {
            try {
              await answerKeyApi.updateItem(exam.id, primary.id, {
                item_id: row.item_id,
                outcome_id: result.outcome_id,
                imported_outcome_text: result.input_text,
              });
            } catch { /* devam */ }
          }
        } else {
          unmatched++;
          // Eşleşmese de orijinal metni API'ye kaydet
          if (primary) {
            try {
              await answerKeyApi.updateItem(exam.id, primary.id, {
                item_id: row.item_id,
                imported_outcome_text: result.input_text,
              });
            } catch { /* devam */ }
          }
        }
      }

      setRows(newRows);
      setSaving(false);
      setBulkOpen(false);
      setBulkText('');

      const matchTypes = results.filter(r => r.outcome_id).reduce((acc, r) => {
        const type = r.match_type === 'topic' ? '📂 Konu' : r.match_type === 'sub_outcome' ? '📎 Alt Kazanım' : '📋 Kazanım';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const typeInfo = Object.entries(matchTypes).map(([k, v]) => `${k}: ${v}`).join(', ');

      if (unmatched > 0) {
        setMsg(`✅ ${matched} eşleştirildi (${typeInfo}) · ⚠️ ${unmatched} eşleşemedi.`);
      } else {
        setMsg(`✅ ${matched} kazanım başarıyla eşleştirildi. (${typeInfo})`);
      }
    } catch (err) {
      console.error('Bulk match error:', err);
      setSaving(false);
      setMsg('❌ Eşleştirme sırasında hata oluştu: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    }
  }, [bulkSectionId, bulkText, subSections, rows, answerKeys, exam.id]);

  /* ── Tüm kazanımları temizle ─── */
  const handleClearAll = useCallback(async () => {
    if (!confirm('Tüm kazanım eşleştirmelerini kaldırmak istediğinize emin misiniz?')) return;

    setSaving(true);
    const primary = answerKeys.find(k => k.is_primary) ?? answerKeys[0];
    const newRows = [...rows];

    for (let i = 0; i < newRows.length; i++) {
      if (newRows[i].outcome_id) {
        newRows[i] = {
          ...newRows[i],
          outcome_id: null,
          outcome_code: '',
          outcome_text: '',
          topic_name: '',
          match_score: 0,
        };
        if (primary) {
          try {
            await answerKeyApi.updateItem(exam.id, primary.id, {
              item_id: newRows[i].item_id,
              outcome_id: null,
            });
          } catch { /* devam */ }
        }
      }
    }

    setRows(newRows);
    setSaving(false);
    setMsg('✅ Tüm kazanım eşleştirmeleri kaldırıldı.');
  }, [rows, answerKeys, exam.id]);

  /* ═════════════════════════════════════════════════════════════════════════ */
  /*  RENDER                                                                 */
  /* ═════════════════════════════════════════════════════════════════════════ */

  if (loading) return (
    <div className="card-modern" style={{ textAlign: 'center', padding: 60 }}>
      <div className="skeleton" style={{ width: 32, height: 32, borderRadius: '50%', margin: '0 auto 12px' }} />
      <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: 14 }}>Kazanım verileri yükleniyor…</p>
    </div>
  );

  if (rows.length === 0) return (
    <div className="card-modern">
      <div className={s.comingSoon}>
        <span style={{ fontSize: 48, lineHeight: 1 }}>📋</span>
        <p className={s.comingSoonTitle}>Cevap Anahtarı Yok</p>
        <p className={s.comingSoonDesc}>
          Kazanım eşleştirmesi yapabilmek için önce &quot;Cevap Anahtarı&quot; sekmesinden soruları girmeniz gerekiyor.
        </p>
      </div>
    </div>
  );

  // Alt ders gruplarını belirle (subSections zaten hem alt bölümleri hem alt bölümü olmayan ana bölümleri içerir)
  const sectionGroups = subSections;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── İstatistik Kartları ────────────────────────────────────────── */}
      <div className="quick-stats">
        <div className="quick-stat">
          <div className="quick-stat-icon blue">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div className="quick-stat-info">
            <h4>{matchedCount}<span style={{ fontSize: 12, fontWeight: 400 }}>/{totalQuestions}</span></h4>
            <span>Eşleştirilmiş</span>
          </div>
        </div>
        <div className="quick-stat">
          <div className="quick-stat-icon orange">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <div className="quick-stat-info">
            <h4>{unmatchedCount}</h4>
            <span>Eşleşmemiş</span>
          </div>
        </div>
        <div className="quick-stat">
          <div className="quick-stat-icon green">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <div className="quick-stat-info">
            <h4>{avgScore}<span style={{ fontSize: 12, fontWeight: 400 }}>%</span></h4>
            <span>Ort. Eşleşme</span>
          </div>
        </div>
        <div className="quick-stat">
          <div className="quick-stat-icon purple">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h7"/></svg>
          </div>
          <div className="quick-stat-info">
            <h4>{subSections.filter(ss => ss.subject).length}<span style={{ fontSize: 12, fontWeight: 400 }}>/{subSections.length}</span></h4>
            <span>Bağlı Alt Ders</span>
          </div>
        </div>
      </div>

      {/* ── Araç Çubuğu ───────────────────────────────────────────────── */}
      <div className="card-modern">
        <div className="card-modern-body" style={{ padding: '14px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Alt ders filtresi */}
              <select
                value={filterSection ?? ''}
                onChange={e => setFilterSection(e.target.value ? Number(e.target.value) : null)}
                style={{
                  padding: '7px 12px', fontSize: 12.5, borderRadius: 8,
                  border: '1px solid var(--border)', background: '#fff',
                  cursor: 'pointer', minWidth: 160,
                }}
              >
                <option value="">Tüm Alt Dersler</option>
                {sectionGroups.map(sg => (
                  <option key={sg.section.id} value={sg.section.id}>
                    {sg.section.name} {sg.subject ? `(${sg.subject.name})` : ''}
                  </option>
                ))}
              </select>

              {/* Eşleşme filtresi */}
              <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {[
                  { key: 'all' as const, label: 'Tümü' },
                  { key: 'matched' as const, label: '✅ Eşleşmiş' },
                  { key: 'unmatched' as const, label: '⚠️ Eşleşmemiş' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setFilterMatch(opt.key)}
                    style={{
                      padding: '7px 14px', fontSize: 12, border: 'none',
                      borderRight: opt.key !== 'unmatched' ? '1px solid var(--border)' : 'none',
                      background: filterMatch === opt.key ? 'var(--primary)' : '#fff',
                      color: filterMatch === opt.key ? '#fff' : 'var(--text-secondary)',
                      cursor: 'pointer', fontWeight: filterMatch === opt.key ? 600 : 400,
                      transition: 'all .15s',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {filteredRows.length} soru gösteriliyor
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {/* Toplu yapıştır */}
              <button
                className="btn-modern btn-primary"
                onClick={() => {
                  setBulkSectionId(sectionGroups[0]?.section.id ?? null);
                  setBulkText('');
                  setBulkOpen(true);
                }}
                style={{ padding: '7px 14px', fontSize: 12 }}
              >
                📋 Toplu Yapıştır
              </button>

              {/* Temizle */}
              {matchedCount > 0 && (
                <button
                  className="btn-modern"
                  onClick={handleClearAll}
                  disabled={saving}
                  style={{
                    padding: '7px 14px', fontSize: 12,
                    color: 'var(--danger)', border: '1px solid #fecaca',
                  }}
                >
                  🗑 Tümünü Temizle
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Mesaj ──────────────────────────────────────────────────────── */}
      {msg && (
        <div style={{
          padding: '10px 16px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
          background: msg.includes('❌') ? '#fef2f2' : msg.includes('⚠️') ? '#fffbeb' : '#f0fdf4',
          color: msg.includes('❌') ? '#991b1b' : msg.includes('⚠️') ? '#92400e' : '#166534',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{msg}</span>
          <button onClick={() => setMsg('')} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 14,
            color: 'inherit', padding: '0 4px',
          }}>✕</button>
        </div>
      )}

      {/* ── Alt Ders Grupları ──────────────────────────────────────────── */}
      {sectionGroups.map(sg => {
        const sectionRows = filteredRows.filter(r => r.section_id === sg.section.id);
        if (filterSection !== null && filterSection !== sg.section.id) return null;
        const secMatched = sectionRows.filter(r => r.outcome_id).length;
        const secTotal = rows.filter(r => r.section_id === sg.section.id).length;

        return (
          <div key={sg.section.id} className="card-modern" style={{ overflow: 'hidden' }}>
            <div className="card-modern-header" style={{ padding: '14px 22px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className={s.otSectionIcon}>📘</span>
                {sg.section.name}
                {sg.subject && (
                  <span className={s.otSubjectBadge}>
                    🎯 {sg.subject.name}
                  </span>
                )}
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>
                  {secMatched}/{secTotal} eşleşmiş
                </span>
              </h3>
              <div className="card-modern-header-actions">
                <button
                  className="btn-modern btn-primary"
                  onClick={() => {
                    setBulkSectionId(sg.section.id);
                    setBulkText('');
                    setBulkOpen(true);
                  }}
                  style={{ padding: '5px 12px', fontSize: 11 }}
                >
                  📋 Toplu Yapıştır
                </button>
              </div>
            </div>

            {!sg.subject && (
              <div style={{
                padding: '12px 22px', background: '#fffbeb', borderBottom: '1px solid #fde68a',
                fontSize: 12, color: '#92400e',
              }}>
                ⚠️ Bu alt derse henüz bir müfredat dersi bağlanmamış.
                Kazanım Yönetimi sayfasından ders bağlantısı yapabilirsiniz.
              </div>
            )}

            {sectionRows.length === 0 && filterMatch !== 'all' ? (
              <div style={{ padding: '30px 22px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                Bu filtreye uygun soru bulunamadı.
              </div>
            ) : sectionRows.length === 0 ? (
              <div style={{ padding: '30px 22px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                Bu bölümde henüz cevap anahtarı girişi yok.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className={s.otTable}>
                  <thead>
                    <tr>
                      <th style={{ width: 55 }}>Soru</th>
                      <th style={{ width: 55 }}>Cevap</th>
                      <th style={{ minWidth: 120 }}>Konu</th>
                      <th style={{ minWidth: 160 }}>Girilen Kazanım</th>
                      <th style={{ minWidth: 200 }}>Eşleştirilen Kazanım</th>
                      <th style={{ width: 100 }}>Eşleşme</th>
                      <th style={{ width: 100 }}>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionRows.map(row => {
                      const globalIdx = rows.findIndex(r => r.item_id === row.item_id);
                      return (
                        <tr key={row.item_id} className={row.is_cancelled ? s.otCancelled : undefined}>
                          <td style={{ fontWeight: 700, textAlign: 'center' }}>{row.question_number}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={s.otAnswerBadge} data-answer={row.correct_answer}>
                              {row.is_cancelled ? '✕' : row.correct_answer}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              {row.topic_name || '—'}
                            </span>
                          </td>
                          <td>
                            {(row.imported_outcome_text || row.outcome_code) ? (
                              <span
                                style={{
                                  fontSize: 12,
                                  color: row.imported_outcome_text
                                    ? (row.outcome_id
                                        ? (row.imported_outcome_text.toLowerCase().includes(row.outcome_code.toLowerCase())
                                            ? 'var(--text-secondary)'
                                            : '#f59e0b')
                                        : '#ef4444')
                                    : '#94a3b8',
                                  fontFamily: 'monospace',
                                  fontStyle: row.imported_outcome_text ? 'normal' : 'italic',
                                }}
                                title={row.imported_outcome_text || row.outcome_code || ''}
                              >
                                {(() => {
                                  const text = row.imported_outcome_text || row.outcome_code || '';
                                  return text.length > 40 ? text.substring(0, 40) + '…' : text;
                                })()}
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, color: '#cbd5e1', fontStyle: 'italic' }}>—</span>
                            )}
                          </td>
                          <td>
                            {row.outcome_id ? (
                              <div className={s.otOutcomeCell}>
                                <span className={s.otOutcomeCode}>{row.outcome_code}</span>
                                <span className={s.otOutcomeText} title={row.outcome_text}>
                                  {row.outcome_text}
                                </span>
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                                Kazanım atanmamış
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {row.outcome_id ? (
                              <span
                                className={s.otScoreBadge}
                                style={{
                                  background: scoreBg(row.match_score),
                                  color: scoreColor(row.match_score),
                                }}
                                title={scoreLabel(row.match_score)}
                              >
                                {row.match_score}%
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, color: '#cbd5e1' }}>—</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                              <button
                                className={s.otActionBtn}
                                onClick={() => openPicker(globalIdx)}
                                title={row.outcome_id ? 'Kazanımı Değiştir' : 'Kazanım Ata'}
                              >
                                {row.outcome_id ? '✏️' : '➕'}
                              </button>
                              {row.outcome_id && (
                                <button
                                  className={s.otActionBtnDanger}
                                  onClick={() => handleRemoveOutcome(globalIdx)}
                                  title="Kazanımı Kaldır"
                                >
                                  🗑
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Kazanım Seçici Modal ──────────────────────────────────────── */}
      {pickerOpen && (
        <OutcomePickerModal
          section={pickerSection}
          search={pickerSearch}
          onSearch={setPickerSearch}
          onSelect={o => handleSetOutcome(pickerRowIdx, o)}
          onClose={() => setPickerOpen(false)}
          currentOutcomeId={rows[pickerRowIdx]?.outcome_id ?? null}
          questionNumber={rows[pickerRowIdx]?.question_number ?? 0}
        />
      )}

      {/* ── Toplu Yapıştır Modal ──────────────────────────────────────── */}
      {bulkOpen && (
        <div className={s.outcomeModal} onClick={() => setBulkOpen(false)}>
          <div
            className={s.outcomeModalContent}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 600 }}
          >
            <div className={s.outcomeModalHeader}>
              <h3>📋 Toplu Kazanım Yapıştır</h3>
              <button
                onClick={() => setBulkOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: '0 4px', color: 'var(--text-secondary)' }}
              >
                ✕
              </button>
            </div>
            <div className={s.outcomeModalBody}>
              <div className={s.formGroup} style={{ marginBottom: 14 }}>
                <label>Alt Ders / Bölüm</label>
                <select
                  value={bulkSectionId ?? ''}
                  onChange={e => setBulkSectionId(Number(e.target.value))}
                  style={{
                    padding: '9px 12px', fontSize: 13, borderRadius: 8,
                    border: '1px solid var(--border)', width: '100%',
                  }}
                >
                  {sectionGroups.map(sg => (
                    <option key={sg.section.id} value={sg.section.id}>
                      {sg.section.name} ({rows.filter(r => r.section_id === sg.section.id).length} soru)
                    </option>
                  ))}
                </select>
              </div>

              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
                Her satıra bir kazanım kodu veya açıklaması yapıştırın. Soru numarası sırasıyla eşleştirilecektir.
              </p>

              <div className={s.akFormatHelp}>
                <div className={s.akFormatCard} style={{ flex: '1 1 auto' }}>
                  <strong>📋 Kazanım Kodu veya Açıklaması</strong>
                  <code style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>
                    {'M.6.1.1.1\nM.6.1.1.2\nDoğal sayılarla dört işlem yapar\nM.6.1.2.3'}
                  </code>
                </div>
              </div>

              <textarea
                className={s.akTextarea}
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                placeholder={'Kazanımları buraya yapıştırın…\nHer satıra bir kazanım kodu veya açıklaması'}
                rows={8}
                autoFocus
              />

              {bulkSectionId && (() => {
                const ssInfo = subSections.find(ss => ss.section.id === bulkSectionId);
                if (!ssInfo?.subject) return (
                  <div style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: 12, marginTop: 8 }}>
                    ⚠️ Bu bölüme henüz müfredat dersi bağlanmamış. Eşleştirme yapılamaz.
                  </div>
                );
                return (
                  <div style={{ padding: '8px 12px', borderRadius: 8, background: '#f0fdf4', color: '#166534', fontSize: 12, marginTop: 8 }}>
                    🎯 {ssInfo.subject.name} — {ssInfo.outcomes.length} kazanım mevcut
                  </div>
                );
              })()}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <button className="btn-modern btn-secondary" onClick={() => setBulkOpen(false)}
                  style={{ padding: '8px 18px', fontSize: 13 }}>
                  İptal
                </button>
                <button
                  className="btn-modern btn-primary"
                  onClick={handleBulkPaste}
                  disabled={saving || !bulkText.trim()}
                  style={{ padding: '8px 18px', fontSize: 13 }}
                >
                  {saving ? '⏳ Eşleştiriliyor…' : '🎯 Eşleştir ve Kaydet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Kazanım Seçici Modal                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

function OutcomePickerModal({
  section, search, onSearch, onSelect, onClose, currentOutcomeId, questionNumber,
}: {
  section: SubSectionInfo | null;
  search: string;
  onSearch: (s: string) => void;
  onSelect: (o: OutcomeItem) => void;
  onClose: () => void;
  currentOutcomeId: number | null;
  questionNumber: number;
}) {
  const lower = search.toLowerCase();

  const topics = section?.topics ?? [];

  const filteredTopics = topics
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

  return (
    <div className={s.outcomeModal} onClick={onClose}>
      <div className={s.outcomeModalContent} onClick={e => e.stopPropagation()}>
        <div className={s.outcomeModalHeader}>
          <h3>
            🎯 Kazanım Seç
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8 }}>
              Soru {questionNumber}
              {section?.section.name && ` · ${section.section.name}`}
            </span>
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: '0 4px', color: 'var(--text-secondary)' }}
          >
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

          {!section?.subject ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)' }}>
              <p>⚠️ Bu bölüme müfredat dersi bağlanmamış.</p>
              <p style={{ fontSize: 12 }}>Kazanım Yönetimi sayfasından ders bağlayabilirsiniz.</p>
            </div>
          ) : filteredTopics.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)' }}>
              <p>Arama sonucu bulunamadı.</p>
            </div>
          ) : (
            <>
              {section.subject && (
                <div style={{
                  padding: '8px 12px', borderRadius: 8, background: '#eff6ff',
                  color: '#1e40af', fontSize: 12, marginBottom: 10, fontWeight: 500,
                }}>
                  📚 {section.subject.name}
                </div>
              )}
              {filteredTopics.map(topic => (
                <div key={topic.id} className={s.outcomeGroup}>
                  <div className={s.outcomeGroupTitle}>📖 {topic.name}</div>
                  {topic.outcomes.map(o => (
                    <button
                      key={o.id}
                      className={`${s.outcomeOption} ${o.id === currentOutcomeId ? s.otOptionActive : ''}`}
                      onClick={() => onSelect(o)}
                      style={{ marginLeft: 8 }}
                    >
                      <strong>{o.code}</strong>
                      {o.text}
                      {o.id === currentOutcomeId && (
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--primary)' }}>● Mevcut</span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
