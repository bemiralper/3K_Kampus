'use client';

import InfoTip from './InfoTip';
import { Panel, StatGrid, Stat, SpreadBar, EmptyState, TrendBar } from '../ui/analysis';
import type { AnalysisSummary } from '../types';

export default function SummaryPanel({ data, examType }: { data: AnalysisSummary; examType?: string }) {
  if (data.katilim === 0) {
    return (
      <Panel title="Genel Özet" icon="chart">
        <EmptyState
          icon="upload"
          title="Henüz sonuç yüklenmedi"
          description="Analiz üretilebilmesi için önce “Sonuç Yükle” sekmesinden optik okuyucu (DAT) dosyasını yükleyin."
        />
      </Panel>
    );
  }

  const { trend } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel
        title="Genel Özet"
        icon="chart"
        subtitle={`${data.exam_type_display} · ${data.exam_date || 'tarih belirtilmemiş'} · ${data.total_questions} soru`}
      >
        {trend && (
          <TrendBar direction={trend.direction}>
            Önceki sınava ({trend.prev_exam_name}) göre{' '}
            <strong>{trend.diff > 0 ? '+' : ''}{trend.diff} net</strong>{' '}
            {trend.direction === 'up' ? 'artış var.' : trend.direction === 'down' ? 'düşüş var.' : 'değişim yok.'}
          </TrendBar>
        )}

        {/* Önce karar verdiren dört sayı; ayrıntı aşağıda. */}
        <StatGrid>
          <Stat value={data.katilim} label="Katılan öğrenci" />
          <Stat value={data.ortalama_net} label="Ortalama net" tone="blue" accent />
          <Stat value={data.ortalama_puan} label="Ortalama puan" tone="violet" accent />
          <Stat
            value={`%${data.basari_yuzdesi}`}
            label="Başarı oranı"
            tone={data.basari_yuzdesi >= 50 ? 'green' : 'red'}
            accent
            info={<InfoTip tip="basariYuzdesi" />}
            hint={`${data.basari_esik}+ net alanların payı`}
          />
        </StatGrid>

        {/* Dört ayrı kart yerine tek eksen: sınıfın dağınık mı toplu mu
            olduğunu mesafeden okumak mümkün. */}
        <div style={{ marginTop: 16 }}>
          <SpreadBar
            title="Net yayılımı"
            min={data.min_net}
            median={data.medyan_net}
            mean={data.ortalama_net}
            max={data.max_net}
            sd={data.std_sapma_net}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <SpreadBar
            title="Puan yayılımı"
            min={data.min_puan}
            median={data.ortalama_puan}
            mean={data.ortalama_puan}
            max={data.max_puan}
            sd={data.std_sapma_puan}
          />
        </div>
      </Panel>

      {/* AYT puan türleri — TYT sınavlarında anlamsız olduğu için gizlenir. */}
      {examType !== 'YKS_TYT' && data.puan_turleri && (
        <Panel
          title="AYT Puan Türleri"
          icon="layers"
          subtitle={data.linked_tyt_exam
            ? `TYT netleri “${data.linked_tyt_exam.name}” sınavından alınıyor.`
            : 'TYT sınavı bağlanmadığı için puanlar yalnızca AYT netleriyle hesaplandı.'}
        >
          <StatGrid>
            {(['SAY', 'EA', 'SOZ'] as const).map(pt => {
              const d = data.puan_turleri![pt];
              const tone = pt === 'SAY' ? 'blue' : pt === 'EA' ? 'violet' : 'green';
              return (
                <Stat
                  key={pt}
                  value={d.ortalama}
                  label={`${pt === 'SOZ' ? 'SÖZ' : pt} ortalaması`}
                  tone={tone}
                  accent
                  hint={`En yüksek ${d.max} · En düşük ${d.min} · SS ${d.std_sapma}`}
                />
              );
            })}
          </StatGrid>
        </Panel>
      )}
    </div>
  );
}
