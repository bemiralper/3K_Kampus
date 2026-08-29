'use client';

import { Panel, StatGrid, Stat, Histogram, CompareBars, EmptyState, Tag } from '../ui/analysis';
import type { AnalysisSectionItem } from '../types';
import s from '../../../app/admin/olcme-degerlendirme/olcme.module.css';

/** Net'i soru sayısına oranlar; farklı uzunluktaki alanları kıyaslanabilir kılar. */
const successPct = (net: number, questions: number) =>
  questions > 0 ? Math.round((net / questions) * 1000) / 10 : 0;

export default function SectionsPanel({ sections }: { sections: AnalysisSectionItem[] }) {
  const mains = sections.filter(sec => !sec.is_sub_section);

  if (!mains.length) {
    return (
      <Panel title="Ders Analizi" icon="layers">
        <EmptyState
          title="Alan/ders analizi için yeterli veri yok"
          description="Sınavda tanımlı bölüm bulunmuyor ya da bu bölümlere ait cevap verisi yüklenmemiş."
        />
      </Panel>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Alanları önce birbiriyle kıyasla: hangi ders geride, tek bakışta. */}
      {mains.length > 1 && (
        <Panel
          title="Alan Karşılaştırması"
          icon="chart"
          subtitle="Net'ler soru sayısına oranlandı; farklı uzunluktaki alanlar böylece kıyaslanabilir."
        >
          <CompareBars
            max={100}
            unit="%"
            rows={mains
              .map(sec => ({
                key: sec.section_id,
                name: sec.section_name,
                value: successPct(sec.ortalama_net, sec.question_count),
              }))
              .sort((a, b) => b.value - a.value)}
          />
        </Panel>
      )}

      {mains.map(sec => {
        const subs = sections.filter(sub => sub.is_sub_section && sub.parent_id === sec.section_id);
        const pct = successPct(sec.ortalama_net, sec.question_count);
        return (
          <Panel
            key={sec.section_id}
            title={sec.section_name}
            icon="document"
            subtitle={`${sec.question_count} soru · ${sec.student_count} öğrenci`}
            actions={
              <Tag tone={pct >= 60 ? 'green' : pct >= 40 ? 'amber' : 'red'}>
                %{pct} başarı
              </Tag>
            }
          >
            <StatGrid>
              <Stat value={sec.ortalama_net} label="Ortalama net" tone="blue" accent />
              <Stat value={sec.ortalama_dogru} label="Ortalama doğru" tone="green" />
              <Stat value={sec.ortalama_yanlis} label="Ortalama yanlış" tone="red" />
              <Stat value={`%${sec.bos_orani}`} label="Boş bırakma oranı" tone="amber" />
              <Stat value={sec.medyan_net} label="Medyan net" />
              <Stat value={`${sec.min_net} – ${sec.max_net}`} label="En düşük – en yüksek" />
            </StatGrid>

            {sec.dagilim && sec.dagilim.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#64748b', marginBottom: 2 }}>
                  Net dağılımı
                </div>
                <Histogram data={sec.dagilim.map(d => ({ label: d.label, count: d.count }))} />
              </div>
            )}

            {subs.length > 0 && (
              <div className={s.analysisTableWrap} style={{ marginTop: 18 }}>
                <table className={s.analysisTable}>
                  <thead>
                    <tr>
                      <th>Ders</th>
                      <th style={{ textAlign: 'center' }}>Soru</th>
                      <th style={{ textAlign: 'center' }}>Ort. Net</th>
                      <th style={{ textAlign: 'center' }}>Ort. Doğru</th>
                      <th style={{ textAlign: 'center' }}>Ort. Yanlış</th>
                      <th style={{ textAlign: 'center' }}>Boş %</th>
                      <th style={{ textAlign: 'center' }}>Başarı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subs.map(sub => {
                      const subPct = successPct(sub.ortalama_net, sub.question_count);
                      return (
                        <tr key={sub.section_id}>
                          <td style={{ fontWeight: 600 }}>{sub.section_name}</td>
                          <td style={{ textAlign: 'center' }}>{sub.question_count}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>{sub.ortalama_net}</td>
                          <td style={{ textAlign: 'center', color: '#16a34a' }}>{sub.ortalama_dogru}</td>
                          <td style={{ textAlign: 'center', color: '#ef4444' }}>{sub.ortalama_yanlis}</td>
                          <td style={{ textAlign: 'center' }}>%{sub.bos_orani}</td>
                          <td style={{ textAlign: 'center' }}>
                            <Tag tone={subPct >= 60 ? 'green' : subPct >= 40 ? 'amber' : 'red'}>%{subPct}</Tag>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
