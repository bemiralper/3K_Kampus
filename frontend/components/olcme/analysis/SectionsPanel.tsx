'use client';

import type { AnalysisSectionItem } from '../types';
import s from '../../../app/admin/olcme-degerlendirme/olcme.module.css';

export default function SectionsPanel({ sections }: { sections: AnalysisSectionItem[] }) {
  if (!sections.length) {
    return <div className={s.analysisEmpty}>Alan/ders analizi için yeterli veri yok.</div>;
  }

  return (
    <div className={s.analysisPanel}>
      <h3 className={s.analysisPanelTitle}>Alan Bazlı Analiz</h3>

      {sections.filter(sec => !sec.is_sub_section).map(sec => (
        <div key={sec.section_id} className={s.analysisSectionCard}>
          <div className={s.analysisSectionHeader}>
            <h4>{sec.section_name}</h4>
            <span className={s.analysisSectionMeta}>{sec.question_count} soru · {sec.student_count} öğrenci</span>
          </div>

          <div className={s.analysisGrid3}>
            <div className={s.analysisMiniStat}>
              <span className={s.miniStatValue}>{sec.ortalama_net}</span>
              <span className={s.miniStatLabel}>Ort. Net</span>
            </div>
            <div className={s.analysisMiniStat}>
              <span className={s.miniStatValue} style={{ color: '#16a34a' }}>{sec.ortalama_dogru}</span>
              <span className={s.miniStatLabel}>Ort. Doğru</span>
            </div>
            <div className={s.analysisMiniStat}>
              <span className={s.miniStatValue} style={{ color: '#ef4444' }}>{sec.ortalama_yanlis}</span>
              <span className={s.miniStatLabel}>Ort. Yanlış</span>
            </div>
          </div>

          <div className={s.analysisGrid4}>
            <div className={s.analysisMiniStat}>
              <span className={s.miniStatValue}>{sec.bos_orani}%</span>
              <span className={s.miniStatLabel}>Boş Oranı</span>
            </div>
            <div className={s.analysisMiniStat}>
              <span className={s.miniStatValue}>{sec.max_net}</span>
              <span className={s.miniStatLabel}>Maks. Net</span>
            </div>
            <div className={s.analysisMiniStat}>
              <span className={s.miniStatValue}>{sec.min_net}</span>
              <span className={s.miniStatLabel}>Min. Net</span>
            </div>
            <div className={s.analysisMiniStat}>
              <span className={s.miniStatValue}>{sec.medyan_net}</span>
              <span className={s.miniStatLabel}>Medyan</span>
            </div>
          </div>

          {/* Dağılım Bar Chart */}
          {sec.dagilim && sec.dagilim.length > 0 && (
            <div className={s.analysisBarChart}>
              <div className={s.barChartLabel}>Net Dağılımı</div>
              <div className={s.barChartBars}>
                {sec.dagilim.map((d, i) => {
                  const maxCount = Math.max(...sec.dagilim.map(x => x.count), 1);
                  const pct = (d.count / maxCount) * 100;
                  return (
                    <div key={i} className={s.barChartItem}>
                      <div className={s.barChartBar}>
                        <div className={s.barChartFill} style={{ height: `${pct}%` }} />
                      </div>
                      <div className={s.barChartCount}>{d.count}</div>
                      <div className={s.barChartRange}>{d.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dersler */}
          {sections.filter(sub => sub.is_sub_section && sub.parent_id === sec.section_id).length > 0 && (
            <div className={s.analysisSubSections}>
              <table className={s.analysisTable}>
                <thead>
                  <tr>
                    <th>Ders</th>
                    <th style={{ textAlign: 'center' }}>Soru</th>
                    <th style={{ textAlign: 'center' }}>Ort. Net</th>
                    <th style={{ textAlign: 'center' }}>Ort. Doğru</th>
                    <th style={{ textAlign: 'center' }}>Ort. Yanlış</th>
                    <th style={{ textAlign: 'center' }}>Boş %</th>
                  </tr>
                </thead>
                <tbody>
                  {sections
                    .filter(sub => sub.is_sub_section && sub.parent_id === sec.section_id)
                    .map(sub => (
                      <tr key={sub.section_id}>
                        <td>{sub.section_name}</td>
                        <td style={{ textAlign: 'center' }}>{sub.question_count}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{sub.ortalama_net}</td>
                        <td style={{ textAlign: 'center', color: '#16a34a' }}>{sub.ortalama_dogru}</td>
                        <td style={{ textAlign: 'center', color: '#ef4444' }}>{sub.ortalama_yanlis}</td>
                        <td style={{ textAlign: 'center' }}>{sub.bos_orani}%</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
