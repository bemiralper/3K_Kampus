'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  websiteAdminApi,
  invalidateLandingCache,
  type OgrenciYorumu,
  type SinavTakvim,
  type SiteSettings,
  type SSSItem,
} from '@/lib/website-api';
import {
  hiddenFromSettings,
  patchSectionVisibility,
  isSectionVisible,
} from '@/lib/landing-section-order';
import SinavCalendarAdmin from '@/components/website-admin/SinavCalendarAdmin';
import ContentCrudPanel from '@/components/website-admin/ContentCrudPanel';

type Props = {
  onMessage: (msg: string, type?: 'success' | 'error') => void;
};

function SectionVisibilityToggle({
  label,
  sectionKey,
  settings,
  saving,
  onPatch,
}: {
  label: string;
  sectionKey: string;
  settings: SiteSettings;
  saving: boolean;
  onPatch: (patch: Partial<SiteSettings>) => Promise<void>;
}) {
  const hidden = hiddenFromSettings(settings);
  const visible = isSectionVisible(sectionKey, hidden);

  return (
    <div className={`cms-section-visibility ${visible ? '' : 'is-hidden'}`}>
      <label className="cms-section-visibility-label">
        <input
          type="checkbox"
          checked={visible}
          disabled={saving}
          onChange={(e) => void onPatch(patchSectionVisibility(settings, sectionKey, e.target.checked))}
        />
        <span>Anasayfada göster</span>
      </label>
      <span className="cms-section-visibility-hint">
        {visible ? `${label} bölümü ziyaretçilere açık` : `${label} anasayfada gizli (içerik silinmez)`}
      </span>
    </div>
  );
}

export default function CmsHomeContent({ onMessage }: Props) {
  const [sinavlar, setSinavlar] = useState<SinavTakvim[]>([]);
  const [yorumlar, setYorumlar] = useState<OgrenciYorumu[]>([]);
  const [sss, setSss] = useState<SSSItem[]>([]);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingVisibility, setSavingVisibility] = useState(false);

  const reload = useCallback(async () => {
    const [sinavRes, yorumRes, sssRes, settingsRes] = await Promise.all([
      websiteAdminApi.list<SinavTakvim>('sinav-takvim'),
      websiteAdminApi.list<OgrenciYorumu>('yorumlar'),
      websiteAdminApi.list<SSSItem>('sss'),
      websiteAdminApi.getSettings(),
    ]);
    if (sinavRes.success && sinavRes.data) {
      setSinavlar([...sinavRes.data].sort((a, b) => a.tarih.localeCompare(b.tarih)));
    } else if (!sinavRes.success) {
      onMessage(sinavRes.error || 'Sınav takvimi yüklenemedi', 'error');
    }
    if (yorumRes.success && yorumRes.data) {
      setYorumlar([...yorumRes.data].sort((a, b) => a.sira - b.sira));
    }
    if (sssRes.success && sssRes.data) {
      setSss([...sssRes.data].sort((a, b) => a.sira - b.sira));
    }
    if (settingsRes.success && settingsRes.data) {
      setSettings(settingsRes.data);
    }
    await invalidateLandingCache();
  }, [onMessage]);

  useEffect(() => {
    void reload().finally(() => setLoading(false));
  }, [reload]);

  const applyVisibilityPatch = async (patch: Partial<SiteSettings>) => {
    if (!settings) return;
    setSavingVisibility(true);
    const res = await websiteAdminApi.updateSettings(patch);
    setSavingVisibility(false);
    if (res.success) {
      setSettings(res.data || { ...settings, ...patch });
      onMessage('Görünürlük güncellendi');
    } else {
      onMessage(res.error || 'Kaydedilemedi', 'error');
    }
  };

  if (loading) {
    return <div className="wam-empty" style={{ padding: '2rem' }}>Yükleniyor…</div>;
  }

  if (!settings) {
    return <div className="wam-empty" style={{ padding: '2rem' }}>Ayarlar yüklenemedi</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <SinavCalendarAdmin sinavlar={sinavlar} onReload={reload} onMessage={onMessage} />

      <div>
        <SectionVisibilityToggle
          label="Öğrenci Yorumları"
          sectionKey="yorumlar"
          settings={settings}
          saving={savingVisibility}
          onPatch={applyVisibilityPatch}
        />
        <ContentCrudPanel<OgrenciYorumu>
          title="Öğrenci Yorumları"
          description="Pasif olsa bile kayıtlar saklanır; Anasayfa Bölümleri sırasından da yönetilebilir"
          resource="yorumlar"
          items={yorumlar}
          fields={[
            { key: 'ad', label: 'Ad Soyad', placeholder: 'Ayşe Y.' },
            { key: 'rol', label: 'Rol', select: ['Öğrenci', 'Veli', 'Mezun'] },
            { key: 'puan', label: 'Puan (1–5)', type: 'number' },
            { key: 'yorum', label: 'Yorum', textarea: true },
            { key: 'sira', label: 'Sıra', type: 'number' },
          ]}
          onReload={reload}
          onMessage={onMessage}
          renderSummary={(item) => `${item.ad} · ${item.rol} · ${item.puan}/5`}
        />
      </div>

      <div>
        <SectionVisibilityToggle
          label="Sıkça Sorulan Sorular"
          sectionKey="sss"
          settings={settings}
          saving={savingVisibility}
          onPatch={applyVisibilityPatch}
        />
        <ContentCrudPanel<SSSItem>
          title="Sıkça Sorulan Sorular"
          description="Pasif olsa bile sorular saklanır; Anasayfa Bölümleri sırasından da yönetilebilir"
          resource="sss"
          items={sss}
          fields={[
            { key: 'soru', label: 'Soru', textarea: true },
            { key: 'cevap', label: 'Cevap', textarea: true },
            { key: 'sira', label: 'Sıra', type: 'number' },
          ]}
          onReload={reload}
          onMessage={onMessage}
          renderSummary={(item) => item.soru}
        />
      </div>
    </div>
  );
}
