'use client';

import { Panel, CompareBars, EmptyState, Tag } from '../ui/analysis';
import type { ClassAnalysis } from '../types';
import s from '../../../app/admin/olcme-degerlendirme/olcme.module.css';

export default function ClassesPanel({ classes }: { classes: ClassAnalysis[] }) {
  if (!classes.length) {
    return (
      <Panel title="Sınıf / Şube Analizi" icon="users">
        <EmptyState
          title="Sınıf verisi yok"
          description="Yüklenen sonuçlarda öğrenciler bir sınıfla eşleşmemiş olabilir. “Sonuç Yükle” sekmesinden eşleşmeyen kayıtları kontrol edin."
        />
      </Panel>
    );
  }

  const allSections = Array.from(new Set(classes.flatMap(c => Object.keys(c.section_avgs))));
  const ranked = [...classes].sort((a, b) => b.ortalama_net - a.ortalama_net);

  // Genel ortalama, öğrenci sayısıyla ağırlıklandırılır; küçük şubeler
  // ortalamayı orantısız etkilemesin.
  const totalStudents = classes.reduce((acc, c) => acc + c.student_count, 0);
  const overallAvg = totalStudents > 0
    ? Math.round((classes.reduce((acc, c) => acc + c.ortalama_net * c.student_count, 0) / totalStudents) * 100) / 100
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel
        title="Sınıf Karşılaştırması"
        icon="chart"
        subtitle="Ortalama net'e göre sıralı. Turuncu çizgi kurum ortalamasıdır."
      >
        <CompareBars
          rows={ranked.map(c => ({
            key: c.sinif_id,
            name: `${c.sinif_name} (${c.student_count})`,
            value: c.ortalama_net,
            tone: c.ortalama_net >= overallAvg ? undefined : 'linear-gradient(90deg,#fca5a5,#ef4444)',
          }))}
          reference={overallAvg}
          referenceLabel="Kurum ortalaması"
        />
      </Panel>

      <Panel title="Sınıf Detayları" icon="users" flush>
        <div className={s.analysisTableWrap}>
          <table className={s.analysisTable}>
            <thead>
              <tr>
                <th>Sınıf</th>
                <th style={{ textAlign: 'center' }}>Öğrenci</th>
                <th style={{ textAlign: 'center' }}>Ort. Net</th>
                <th style={{ textAlign: 'center' }}>Medyan</th>
                <th style={{ textAlign: 'center' }}>En Düşük</th>
                <th style={{ textAlign: 'center' }}>En Yüksek</th>
                <th style={{ textAlign: 'center' }}>Başarı</th>
                {allSections.map(sn => (
                  <th key={sn} style={{ textAlign: 'center' }}>{sn}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map(c => (
                <tr key={c.sinif_id}>
                  <td style={{ fontWeight: 600 }}>{c.sinif_name}</td>
                  <td style={{ textAlign: 'center' }}>{c.student_count}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{c.ortalama_net}</td>
                  <td style={{ textAlign: 'center' }}>{c.medyan_net}</td>
                  <td style={{ textAlign: 'center', color: '#ef4444' }}>{c.min_net}</td>
                  <td style={{ textAlign: 'center', color: '#16a34a' }}>{c.max_net}</td>
                  <td style={{ textAlign: 'center' }}>
                    <Tag tone={c.basari_yuzdesi >= 50 ? 'green' : 'red'}>%{c.basari_yuzdesi}</Tag>
                  </td>
                  {allSections.map(sn => (
                    <td key={sn} style={{ textAlign: 'center' }}>{c.section_avgs[sn] ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
