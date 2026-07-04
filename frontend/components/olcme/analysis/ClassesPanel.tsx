'use client';

import type { ClassAnalysis } from '../types';
import s from '../../../app/admin/olcme-degerlendirme/olcme.module.css';

export default function ClassesPanel({ classes }: { classes: ClassAnalysis[] }) {
  if (!classes.length) return <div className={s.analysisEmpty}>Sınıf verisi yok.</div>;

  // Alan/Ders isimleri (section_avgs key'lerinden)
  const allSections = Array.from(new Set(classes.flatMap(c => Object.keys(c.section_avgs))));

  return (
    <div className={s.analysisPanel}>
      <h3 className={s.analysisPanelTitle}>Sınıf / Şube Analizi</h3>

      {/* Sınıf kartları */}
      <div className={s.analysisGrid3}>
        {classes.map(c => (
          <div key={c.sinif_id} className={s.analysisClassCard}>
            <div className={s.classCardHeader}>
              <h4>{c.sinif_name}</h4>
              <span className={s.classStudentCount}>{c.student_count} öğrenci</span>
            </div>
            <div className={s.classCardStats}>
              <div><strong>{c.ortalama_net}</strong> <span>Ort. Net</span></div>
              <div><strong>{c.max_net}</strong> <span>Maks</span></div>
              <div><strong>{c.min_net}</strong> <span>Min</span></div>
              <div>
                <strong style={{ color: c.basari_yuzdesi >= 50 ? '#16a34a' : '#ef4444' }}>%{c.basari_yuzdesi}</strong>
                <span>Başarı</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Alan/Ders bazlı karşılaştırma tablosu */}
      {allSections.length > 0 && (
        <>
          <h4 style={{ margin: '20px 0 8px', fontSize: 14, fontWeight: 600 }}>Alan/Ders Bazlı Sınıf Karşılaştırması</h4>
          <div className={s.analysisTableWrap}>
            <table className={s.analysisTable}>
              <thead>
                <tr>
                  <th>Sınıf</th>
                  {allSections.map(sn => <th key={sn} style={{ textAlign: 'center' }}>{sn}</th>)}
                  <th style={{ textAlign: 'center' }}>Toplam Ort.</th>
                </tr>
              </thead>
              <tbody>
                {classes.map(c => (
                  <tr key={c.sinif_id}>
                    <td style={{ fontWeight: 600 }}>{c.sinif_name}</td>
                    {allSections.map(sn => (
                      <td key={sn} style={{ textAlign: 'center' }}>{c.section_avgs[sn] ?? '—'}</td>
                    ))}
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{c.ortalama_net}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
