'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { fetchProgramlar } from '@/lib/ozel-ders-api';
import '../../ogrenci-akademik.css';
import '../akademik/ozel-ders-ogrenci.css';
import AkademikSubNav from '../akademik/AkademikSubNav';
import GenelBakisPanel from '../akademik/GenelBakisPanel';
import OzelDerslerPanel from '../akademik/OzelDerslerPanel';
import SinifDersleriPanel from '../akademik/SinifDersleriPanel';
import AkademikPlaceholderPanel from '../akademik/AkademikPlaceholderPanel';
import type {
  AkademikKayit,
  AkademikSubId,
  OzelDersInnerTab,
} from '../akademik/types';

interface AkademikTabProps {
  ogrenciId: number;
  onSwitchTopTab?: (tab: string) => void;
}

const VALID_SUB: AkademikSubId[] = [
  'genel',
  'ozel-dersler',
  'sinif-dersleri',
  'sinavlar',
  'devamsizlik',
  'odevler',
  'analiz',
];

const VALID_OD: OzelDersInnerTab[] = ['ozet', 'program', 'gecmis', 'paket'];

export default function AkademikTab({ ogrenciId, onSwitchTopTab }: AkademikTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [kayitlar, setKayitlar] = useState<AkademikKayit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasOzelProgram, setHasOzelProgram] = useState(false);

  const rawSub = searchParams.get('akademik') || 'genel';
  const activeSub: AkademikSubId = VALID_SUB.includes(rawSub as AkademikSubId)
    ? (rawSub as AkademikSubId)
    : 'genel';

  const rawOd = searchParams.get('od') || 'ozet';
  const innerTab: OzelDersInnerTab = VALID_OD.includes(rawOd as OzelDersInnerTab)
    ? (rawOd as OzelDersInnerTab)
    : 'ozet';

  const setQuery = useCallback(
    (patch: { akademik?: AkademikSubId; od?: OzelDersInnerTab }) => {
      const next = new URLSearchParams(searchParams.toString());
      if (patch.akademik) next.set('akademik', patch.akademik);
      if (patch.od) next.set('od', patch.od);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      apiGet<{ kayitlar?: AkademikKayit[] }>(`/ogrenciler/api/${ogrenciId}/akademik/`),
      fetchProgramlar({ ogrenci_id: ogrenciId }).catch(() => []),
    ])
      .then(([akRes, programs]) => {
        if (cancelled) return;
        if (akRes.success) {
          const data = (akRes.data || akRes) as { kayitlar?: AkademikKayit[] };
          setKayitlar(data.kayitlar || []);
        } else {
          setError(akRes.error || 'Akademik veriler yüklenemedi');
        }
        setHasOzelProgram(Array.isArray(programs) && programs.length > 0);
      })
      .catch(() => {
        if (!cancelled) setError('Akademik veriler yüklenirken hata oluştu');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ogrenciId]);

  const showOzelDersler = useMemo(() => {
    if (hasOzelProgram) return true;
    return kayitlar.some((k) =>
      k.kalemler.some((kalem) => ['ozel_ders', 'premium'].includes(kalem.kalem_turu)),
    );
  }, [hasOzelProgram, kayitlar]);

  const showSinifDersleri = useMemo(() => {
    return kayitlar.some(
      (k) =>
        Boolean(k.sinif_ad) ||
        k.kalemler.some((kalem) => kalem.kalem_turu === 'grup_dersi'),
    );
  }, [kayitlar]);

  // Geçersiz seçili alt menüyü düzelt
  useEffect(() => {
    if (activeSub === 'ozel-dersler' && !showOzelDersler && !loading) {
      setQuery({ akademik: 'genel' });
    }
    if (activeSub === 'sinif-dersleri' && !showSinifDersleri && !loading) {
      setQuery({ akademik: 'genel' });
    }
  }, [activeSub, showOzelDersler, showSinifDersleri, loading, setQuery]);

  return (
    <div className="tab-panel akademik-tab akd-shell">
      <AkademikSubNav
        active={activeSub}
        onChange={(id) => setQuery({ akademik: id })}
        showOzelDersler={showOzelDersler || activeSub === 'ozel-dersler'}
        showSinifDersleri={showSinifDersleri || activeSub === 'sinif-dersleri'}
      />

      <div className="akd-panel-body">
        {activeSub === 'genel' && (
          <GenelBakisPanel kayitlar={kayitlar} loading={loading} error={error} />
        )}

        {activeSub === 'ozel-dersler' && (
          <OzelDerslerPanel
            ogrenciId={ogrenciId}
            innerTab={innerTab}
            onInnerTabChange={(od) => setQuery({ akademik: 'ozel-dersler', od })}
          />
        )}

        {activeSub === 'sinif-dersleri' && <SinifDersleriPanel />}

        {activeSub === 'sinavlar' && (
          <AkademikPlaceholderPanel
            title="Sınavlar"
            description="Sınav sonuçları ve analiz için mevcut Sınav sekmesini kullanın. Bu alt sayfa ileride akademik özeti birleştirecek."
            actionLabel="Sınav sekmesine geç"
            onAction={() => onSwitchTopTab?.('sinav')}
          />
        )}

        {activeSub === 'devamsizlik' && (
          <AkademikPlaceholderPanel
            title="Devamsızlık"
            description="Sınıf ve özel ders devamsızlık özeti burada toplanacak. Özel ders tarafı için Özel Dersler → Geçmiş sekmesine bakabilirsiniz."
            actionLabel="Özel Ders Geçmişi"
            onAction={() => setQuery({ akademik: 'ozel-dersler', od: 'gecmis' })}
          />
        )}

        {activeSub === 'odevler' && (
          <AkademikPlaceholderPanel
            title="Ödevler"
            description="Öğrenci ödev listesi ve teslim durumu yakında bu alanda görünecek."
          />
        )}

        {activeSub === 'analiz' && (
          <AkademikPlaceholderPanel
            title="Akademik Analiz"
            description="Çok kaynaklı akademik performans özeti yakında eklenecek. Özel ders analizi için Paket & Analiz sekmesini kullanın."
            actionLabel="Özel Ders Analizi"
            onAction={() => setQuery({ akademik: 'ozel-dersler', od: 'paket' })}
          />
        )}
      </div>
    </div>
  );
}
