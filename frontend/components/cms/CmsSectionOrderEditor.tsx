'use client';

import { useMemo, useState } from 'react';
import type { LandingBolum, SiteSettings } from '@/lib/website-api';
import { websiteAdminApi, invalidateLandingCache } from '@/lib/website-api';
import {
  resolveLandingSectionOrder,
  sectionOrderLabel,
  isSectionVisible,
  orderableSectionKeys,
  QUICK_ACCESS_SECTION_KEY,
} from '@/lib/landing-section-order';
import SortableList from './SortableList';

type Props = {
  order: string[];
  hidden: string[];
  bolumler: LandingBolum[];
  onOrderChange: (order: string[]) => void;
  onToggleVisible: (key: string, visible: boolean) => void | Promise<void>;
  onMessage: (msg: string, type?: 'success' | 'error') => void;
};

export default function CmsSectionOrderEditor({
  order,
  hidden,
  bolumler,
  onOrderChange,
  onToggleVisible,
  onMessage,
}: Props) {
  const [saving, setSaving] = useState(false);

  const sortableOrder = useMemo(() => orderableSectionKeys(order), [order]);

  const bolumTitles = useMemo(() => {
    const map: Record<string, string> = {};
    for (const b of bolumler) {
      map[b.id] = b.kart_adi || b.title || b.eyebrow || b.id;
    }
    return map;
  }, [bolumler]);

  const labels = useMemo(
    () => Object.fromEntries(order.map((key) => [key, sectionOrderLabel(key, bolumTitles)])),
    [order, bolumTitles],
  );

  const persistOrder = async (sortable: string[]) => {
    const next = [QUICK_ACCESS_SECTION_KEY, ...sortable];
    setSaving(true);
    const res = await websiteAdminApi.updateSettings({ landing_section_order: next });
    setSaving(false);
    if (res.success) {
      onOrderChange(next);
      await invalidateLandingCache();
      onMessage('Bölüm sırası kaydedildi');
    } else {
      onMessage(res.error || 'Kaydedilemedi', 'error');
    }
  };

  const quickVisible = isSectionVisible(QUICK_ACCESS_SECTION_KEY, hidden);

  return (
    <section className="wam-settings-card">
      <div className="wam-settings-card-head">
        <span className="wam-settings-icon">↕️</span>
        <div>
          <h5>Anasayfa Bölüm Sırası</h5>
          <p>Hızlı erişim kartları hero altında sabittir; diğer bölümleri ⠿ ile sıralayın</p>
        </div>
        <button
          type="button"
          className="wam-btn wam-btn-primary wam-btn-sm"
          onClick={() => void persistOrder(sortableOrder)}
          disabled={saving}
        >
          {saving ? 'Kaydediliyor…' : 'Sırayı Kaydet'}
        </button>
      </div>

      {/* Hero altı — sabit konum, sürüklenemez */}
      <div className={`cms-section-order-pinned ${quickVisible ? '' : 'is-hidden-section'}`}>
        <span className="cms-section-order-pin-badge" title="Hero altında sabit">📌</span>
        <span className="cms-content-title">{labels[QUICK_ACCESS_SECTION_KEY] || 'Hızlı Erişim Kartları'}</span>
        <code className="cms-section-order-code">{QUICK_ACCESS_SECTION_KEY}</code>
        <span className="cms-section-order-pin-note">Hero altı (sabit)</span>
        <label className="cms-section-order-toggle">
          <input
            type="checkbox"
            checked={quickVisible}
            onChange={(e) => void onToggleVisible(QUICK_ACCESS_SECTION_KEY, e.target.checked)}
          />
          <span>Göster</span>
        </label>
      </div>

      <SortableList
        items={sortableOrder}
        getKey={(key) => key}
        onChange={(sortable) => onOrderChange([QUICK_ACCESS_SECTION_KEY, ...sortable])}
        onReorderComplete={(sortable) => void persistOrder(sortable)}
        renderItem={(key, _index, handle) => {
          const visible = isSectionVisible(key, hidden);
          return (
            <div className={`cms-section-order-row ${visible ? '' : 'is-hidden-section'}`}>
              {handle}
              <span className="cms-content-title">{labels[key] || key}</span>
              <code className="cms-section-order-code">{key}</code>
              <label className="cms-section-order-toggle" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(e) => void onToggleVisible(key, e.target.checked)}
                />
                <span>Göster</span>
              </label>
            </div>
          );
        }}
      />
    </section>
  );
}

export function syncSectionOrderWithBolumler(
  order: string[] | undefined,
  bolumler: LandingBolum[],
): string[] {
  const ids = bolumler.map((b) => b.id);
  const resolved = resolveLandingSectionOrder(order, ids);
  const bolumKeys = new Set(ids.map((id) => `bolum:${id}`));
  const filtered = resolved.filter((key) => !key.startsWith('bolum:') || bolumKeys.has(key));
  if (!filtered.includes(QUICK_ACCESS_SECTION_KEY)) {
    return [QUICK_ACCESS_SECTION_KEY, ...filtered];
  }
  return [QUICK_ACCESS_SECTION_KEY, ...orderableSectionKeys(filtered)];
}

export function resolvedSectionOrder(settings: {
  landing_section_order?: string[];
  landing_bolumleri?: LandingBolum[];
}): string[] {
  const bolumIds = (settings.landing_bolumleri || []).map((b) => b.id);
  const resolved = resolveLandingSectionOrder(settings.landing_section_order, bolumIds);
  if (!resolved.includes(QUICK_ACCESS_SECTION_KEY)) {
    return [QUICK_ACCESS_SECTION_KEY, ...resolved];
  }
  return [QUICK_ACCESS_SECTION_KEY, ...orderableSectionKeys(resolved)];
}
