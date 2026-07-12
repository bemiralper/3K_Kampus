'use client';

import { useCallback, useEffect, useState } from 'react';
import { websiteAdminApi, invalidateLandingCache, type SocialLink } from '@/lib/website-api';
import { SOCIAL_PLATFORMS, socialPlatformLabel } from '@/lib/landing-social';
import ContentCrudPanel from '@/components/website-admin/ContentCrudPanel';

type Props = {
  onMessage: (msg: string, type?: 'success' | 'error') => void;
};

export default function CmsSocialLinks({ onMessage }: Props) {
  const [items, setItems] = useState<SocialLink[]>([]);

  const load = useCallback(async () => {
    const res = await websiteAdminApi.list<SocialLink>('social-links');
    if (res.success && res.data) {
      setItems([...res.data].sort((a, b) => a.sira - b.sira || a.id - b.id));
    } else {
      onMessage(res.error || 'Sosyal medya listesi yüklenemedi', 'error');
    }
  }, [onMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = async () => {
    await load();
    await invalidateLandingCache();
  };

  return (
    <ContentCrudPanel<SocialLink>
      title="Sosyal Medya Linkleri"
      description="Üst bar ve footer’da görünür. URL tam adres olmalı (https://instagram.com/…). WhatsApp için iletişim numarası ayrıca Anasayfa & Hero ayarlarından yönetilir."
      resource="social-links"
      items={items}
      fields={[
        {
          key: 'platform',
          label: 'Platform',
          select: SOCIAL_PLATFORMS.map((p) => p.value),
          hint: SOCIAL_PLATFORMS.map((p) => p.label).join(' · '),
        },
        {
          key: 'url',
          label: 'Profil URL',
          placeholder: 'https://instagram.com/3kkampus',
        },
        {
          key: 'sira',
          label: 'Sıra',
          type: 'number',
          hint: 'Küçük numara önce görünür',
        },
      ]}
      onReload={() => void reload()}
      onMessage={onMessage}
      renderSummary={(item) => {
        const status = item.aktif === false ? ' · pasif' : '';
        const url = item.url.length > 42 ? `${item.url.slice(0, 42)}…` : item.url;
        return `${socialPlatformLabel(item.platform)} — ${url}${status}`;
      }}
    />
  );
}
