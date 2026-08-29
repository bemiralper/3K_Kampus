'use client';

import { useMemo } from 'react';

import InfoTip from './InfoTip';
import { Panel, StatGrid, Stat, EmptyState, Tag } from '../ui/analysis';
import type { QuestionAnalysis } from '../types';
import s from '../../../app/admin/olcme-degerlendirme/olcme.module.css';

const CHOICES = ['A', 'B', 'C', 'D', 'E'] as const;

const diffTone = (d: string) => (d === 'Kolay' ? 'green' : d === 'Orta' ? 'amber' : 'red');

/** Ayırt edicilik eşikleri madde analizinde yerleşik kabul: <0.15 zayıf, 0.30+ iyi. */
const discTone = (v: number) => (v >= 0.3 ? 'green' : v >= 0.15 ? 'amber' : 'red');

export default function QuestionsPanel({
  questions, sections, sectionFilter, onSectionFilter,
}: {
  questions: QuestionAnalysis[];
  sections: { id: number; name: string; is_sub_section: boolean }[];
  sectionFilter: number | undefined;
  onSectionFilter: (v: number | undefined) => void;
}) {
  const hasOutcomes = questions.some(q => q.outcome_code);

  /* Tabloya girmeden önce "hangi sorulara bakmalıyım" sorusunu yanıtlayan özet. */
  const stats = useMemo(() => {
    if (!questions.length) return null;
    const total = questions.length;
    const hard = questions.filter(q => q.difficulty === 'Zor').length;
    const weakDisc = questions.filter(q => q.discrimination < 0.15).length;
    const cancelled = questions.filter(q => q.is_cancelled).length;
    const avgCorrect =
      Math.round((questions.reduce((acc, q) => acc + q.correct_pct, 0) / total) * 10) / 10;
    return { total, hard, weakDisc, cancelled, avgCorrect };
  }, [questions]);

  const filterControl = (
    <select
      className={s.analysisSelect}
      value={sectionFilter || ''}
      onChange={e => onSectionFilter(e.target.value ? Number(e.target.value) : undefined)}
      aria-label="Alana göre filtrele"
    >
      <option value="">Tüm Alanlar</option>
      {sections.filter(sec => !sec.is_sub_section).map(sec => (
        <option key={sec.id} value={sec.id}>{sec.name}</option>
      ))}
    </select>
  );

  if (!questions.length) {
    return (
      <Panel title="Madde Analizi" icon="search" actions={filterControl}>
        <EmptyState
          title="Madde analizi için veri yok"
          description="Madde analizi cevap anahtarı ve yüklenmiş öğrenci cevapları birlikte olduğunda üretilir."
        />
      </Panel>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {stats && (
        <Panel
          title="Madde Analizi Özeti"
          icon="search"
          subtitle="Gözden geçirilmesi gereken soruları öne çıkarır."
          actions={filterControl}
        >
          <StatGrid>
            <Stat value={stats.total} label="İncelenen soru" />
            <Stat value={`%${stats.avgCorrect}`} label="Ortalama doğru oranı" tone="blue" accent />
            <Stat
              value={stats.hard}
              label="Zor soru"
              tone={stats.hard > 0 ? 'red' : 'default'}
              hint="Doğru oranı düşük maddeler"
            />
            <Stat
              value={stats.weakDisc}
              label="Zayıf ayırt edicilik"
              tone={stats.weakDisc > 0 ? 'amber' : 'default'}
              info={<InfoTip tip="ayirtEdicilik" />}
              hint="0.15 altı — soruyu gözden geçirin"
            />
            {stats.cancelled > 0 && (
              <Stat value={stats.cancelled} label="İptal edilen soru" tone="violet" />
            )}
          </StatGrid>
        </Panel>
      )}

      <Panel title="Soru Bazlı Döküm" icon="document" flush>
        <div className={s.analysisTableWrap}>
          <table className={s.analysisTable}>
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>Soru</th>
                <th>Alan / Ders</th>
                <th style={{ textAlign: 'center' }}>Cevap</th>
                <th style={{ textAlign: 'center' }}>Doğru %</th>
                <th style={{ textAlign: 'center' }}>Yanlış %</th>
                <th style={{ textAlign: 'center' }}>Boş %</th>
                <th style={{ textAlign: 'center' }}>Zorluk <InfoTip tip="zorluk" /></th>
                <th style={{ textAlign: 'center' }}>Ayırt Ed. <InfoTip tip="ayirtEdicilik" /></th>
                <th style={{ textAlign: 'center' }}>Şık Dağılımı (A · B · C · D · E · Boş)</th>
                <th>Çeldirici</th>
                {hasOutcomes && <th>Kazanım</th>}
              </tr>
            </thead>
            <tbody>
              {questions.map(q => (
                <tr key={q.question_number} style={q.is_cancelled ? { opacity: 0.55 } : undefined}>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>
                    {q.question_number}
                    {q.is_cancelled && (
                      <div style={{ fontSize: 9.5, color: '#7c3aed', fontWeight: 600 }}>iptal</div>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>{q.section_name}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: '#0262a7' }}>
                    {q.correct_answer}
                  </td>
                  <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>{q.correct_pct}</td>
                  <td style={{ textAlign: 'center', color: '#ef4444' }}>{q.wrong_pct}</td>
                  <td style={{ textAlign: 'center', color: '#94a3b8' }}>{q.empty_pct}</td>
                  <td style={{ textAlign: 'center' }}>
                    <Tag tone={diffTone(q.difficulty)}>{q.difficulty}</Tag>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <Tag tone={discTone(q.discrimination)}>{q.discrimination.toFixed(2)}</Tag>
                  </td>
                  {/* Sayı sütunları yerine tek şerit: doğru yeşil, en güçlü
                      çeldirici kırmızı; hangi şıkka kaçıldığı bir bakışta. */}
                  <td>
                    <ChoiceBar q={q} />
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {q.top_distractor
                      ? <span style={{ color: '#ef4444', fontWeight: 600 }}>{q.top_distractor} · %{q.top_distractor_pct}</span>
                      : '—'}
                  </td>
                  {hasOutcomes && (
                    <td
                      style={{ fontSize: 11, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={q.outcome_text || undefined}
                    >
                      {q.outcome_code || '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/** Şık dağılımını tek satırlık yığılmış çubuk olarak çizer. */
function ChoiceBar({ q }: { q: QuestionAnalysis }) {
  const segments = [
    ...CHOICES.map(ch => ({ key: ch, count: q.choices[ch] || 0 })),
    { key: 'Boş', count: q.choices.EMPTY || 0 },
  ];
  const total = segments.reduce((acc, seg) => acc + seg.count, 0);
  if (total === 0) return <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>;

  const colorOf = (key: string) =>
    key === q.correct_answer ? '#16a34a'
      : key === q.top_distractor ? '#ef4444'
        : key === 'Boş' ? '#e2e8f0'
          : '#cbd5e1';

  return (
    <div style={{ minWidth: 190 }}>
      <div style={{ display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden', background: '#f8fafc' }}>
        {segments.map(seg => seg.count > 0 && (
          <div
            key={seg.key}
            title={`${seg.key}: ${seg.count} öğrenci (%${Math.round((seg.count / total) * 100)})`}
            style={{ width: `${(seg.count / total) * 100}%`, background: colorOf(seg.key) }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 3, fontSize: 10, color: '#94a3b8' }}>
        {segments.map(seg => (
          <span
            key={seg.key}
            style={{
              color: seg.key === q.correct_answer ? '#16a34a' : seg.key === q.top_distractor ? '#ef4444' : '#94a3b8',
              fontWeight: seg.key === q.correct_answer || seg.key === q.top_distractor ? 700 : 400,
            }}
          >
            {seg.key}
            {' '}
            {seg.count}
          </span>
        ))}
      </div>
    </div>
  );
}
