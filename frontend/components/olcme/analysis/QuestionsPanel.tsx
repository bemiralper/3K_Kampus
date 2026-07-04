'use client';

import InfoTip from './InfoTip';
import type { QuestionAnalysis } from '../types';
import s from '../../../app/admin/olcme-degerlendirme/olcme.module.css';

export default function QuestionsPanel({
  questions, sections, sectionFilter, onSectionFilter,
}: {
  questions: QuestionAnalysis[];
  sections: { id: number; name: string; is_sub_section: boolean }[];
  sectionFilter: number | undefined;
  onSectionFilter: (v: number | undefined) => void;
}) {
  if (!questions.length) return <div className={s.analysisEmpty}>Madde analizi için veri yok.</div>;

  const diffColor = (d: string) => d === 'Kolay' ? '#16a34a' : d === 'Orta' ? '#f59e0b' : '#ef4444';

  return (
    <div className={s.analysisPanel}>
      <div className={s.analysisPanelHeader}>
        <h3 className={s.analysisPanelTitle}>Madde (Soru) Analizi</h3>
        <select
          className={s.analysisSelect}
          value={sectionFilter || ''}
          onChange={e => onSectionFilter(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">Tüm Alanlar</option>
          {sections.filter(sec => !sec.is_sub_section).map(sec => (
            <option key={sec.id} value={sec.id}>{sec.name}</option>
          ))}
        </select>
      </div>

      <div className={s.analysisTableWrap}>
        <table className={s.analysisTable}>
          <thead>
            <tr>
              <th>Soru</th>
              <th>Alan/Ders</th>
              <th style={{ textAlign: 'center' }}>Cevap</th>
              <th style={{ textAlign: 'center' }}>Doğru %</th>
              <th style={{ textAlign: 'center' }}>Yanlış %</th>
              <th style={{ textAlign: 'center' }}>Boş %</th>
              <th style={{ textAlign: 'center' }}>Zorluk <InfoTip tip="zorluk" /></th>
              <th style={{ textAlign: 'center' }}>Ayırt Ed. <InfoTip tip="ayirtEdicilik" /></th>
              <th style={{ textAlign: 'center' }}>A</th>
              <th style={{ textAlign: 'center' }}>B</th>
              <th style={{ textAlign: 'center' }}>C</th>
              <th style={{ textAlign: 'center' }}>D</th>
              <th style={{ textAlign: 'center' }}>E</th>
              <th style={{ textAlign: 'center' }}>Boş</th>
              <th>Çeldirici</th>
              {questions.some(q => q.outcome_code) && <th>Kazanım</th>}
            </tr>
          </thead>
          <tbody>
            {questions.map(q => (
              <tr key={q.question_number}>
                <td style={{ fontWeight: 700 }}>{q.question_number}</td>
                <td style={{ fontSize: 12 }}>{q.section_name}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: '#0262a7' }}>{q.correct_answer}</td>
                <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>{q.correct_pct}</td>
                <td style={{ textAlign: 'center', color: '#ef4444' }}>{q.wrong_pct}</td>
                <td style={{ textAlign: 'center', color: '#94a3b8' }}>{q.empty_pct}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ color: diffColor(q.difficulty), fontWeight: 600, fontSize: 12 }}>{q.difficulty}</span>
                </td>
                <td style={{ textAlign: 'center', fontWeight: 600, color: q.discrimination >= 0.3 ? '#16a34a' : q.discrimination >= 0.15 ? '#f59e0b' : '#ef4444' }}>
                  {q.discrimination.toFixed(2)}
                </td>
                {['A', 'B', 'C', 'D', 'E'].map(ch => (
                  <td key={ch} style={{
                    textAlign: 'center',
                    fontSize: 12,
                    fontWeight: ch === q.correct_answer ? 700 : 400,
                    color: ch === q.correct_answer ? '#16a34a' : ch === q.top_distractor ? '#ef4444' : '#64748b',
                    background: ch === q.correct_answer ? '#f0fdf4' : ch === q.top_distractor ? '#fef2f2' : 'transparent',
                  }}>
                    {q.choices[ch] || 0}
                  </td>
                ))}
                <td style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>{q.choices.EMPTY || 0}</td>
                <td style={{ fontSize: 12 }}>
                  {q.top_distractor ? (
                    <span style={{ color: '#ef4444' }}>{q.top_distractor} (%{q.top_distractor_pct})</span>
                  ) : '—'}
                </td>
                {questions.some(qq => qq.outcome_code) && (
                  <td style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={q.outcome_text}>
                    {q.outcome_code ? `[${q.outcome_code}]` : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
