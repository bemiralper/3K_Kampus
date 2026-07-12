'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  websiteAdminApi,
  invalidateLandingCache,
  type DersFormatlariConfig,
  type LandingBolum,
  type LandingFeatureCard,
  type NedenKart,
  type SiteSettings,
} from '@/lib/website-api';
import {
  DEFAULT_NEDEN_ALT,
  DEFAULT_NEDEN_BASLIK,
  NEDEN_IKON_OPTIONS,
  newFeatureCard,
  newLandingBolum,
  resolveDersFormatlariConfig,
} from '@/lib/landing-sections';
import CommaListInput from '@/components/website-admin/CommaListInput';
import { WamInput, WamTextarea } from '@/components/website-admin/WamField';
import CmsSectionOrderEditor, {
  syncSectionOrderWithBolumler,
  resolvedSectionOrder,
} from './CmsSectionOrderEditor';
import { bolumSectionKey, hiddenFromSettings, patchSectionVisibility } from '@/lib/landing-section-order';

type Props = {
  onMessage: (msg: string, type?: 'success' | 'error') => void;
};

function FeatureCardEditor({
  card,
  onChange,
  onRemove,
}: {
  card: LandingFeatureCard;
  onChange: (c: LandingFeatureCard) => void;
  onRemove: () => void;
}) {
  return (
    <div className="wam-settings-card" style={{ marginTop: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <strong style={{ fontSize: 14 }}>{card.title || 'Kart'}</strong>
        <button type="button" className="wam-btn wam-btn-ghost" onClick={onRemove} style={{ color: '#dc2626' }}>Sil</button>
      </div>
      <div className="wam-form-grid">
        <WamInput label="Rozet" value={card.badge || ''} onChange={(e) => onChange({ ...card, badge: e.target.value })} />
        <WamInput label="Başlık" value={card.title} onChange={(e) => onChange({ ...card, title: e.target.value })} />
        <WamInput label="Renk (#hex)" value={card.accent || ''} onChange={(e) => onChange({ ...card, accent: e.target.value })} placeholder="#0262a7" />
      </div>
      <WamTextarea
        label="Açıklama"
        full
        rows={2}
        value={card.description || ''}
        onChange={(e) => onChange({ ...card, description: e.target.value })}
      />
      <CommaListInput
        label="Madde listesi"
        hint="Virgülle ayırın"
        full
        value={card.highlights || []}
        onChange={(items) => onChange({ ...card, highlights: items })}
        placeholder="Madde 1, Madde 2"
      />
    </div>
  );
}

function FeatureSectionEditor({
  title,
  eyebrow,
  subtitle,
  footerNote,
  cards,
  onEyebrow,
  onTitle,
  onSubtitle,
  onFooter,
  onCards,
}: {
  title: string;
  eyebrow: string;
  subtitle: string;
  footerNote: string;
  cards: LandingFeatureCard[];
  onEyebrow: (v: string) => void;
  onTitle: (v: string) => void;
  onSubtitle: (v: string) => void;
  onFooter: (v: string) => void;
  onCards: (cards: LandingFeatureCard[]) => void;
}) {
  const updateCard = (idx: number, c: LandingFeatureCard) => {
    onCards(cards.map((x, i) => (i === idx ? c : x)));
  };
  const removeCard = (idx: number) => onCards(cards.filter((_, i) => i !== idx));

  return (
    <>
      <div className="wam-form-grid">
        <WamInput label="Üst etiket (eyebrow)" value={eyebrow} onChange={(e) => onEyebrow(e.target.value)} />
        <WamInput label="Bölüm başlığı" value={title} onChange={(e) => onTitle(e.target.value)} />
      </div>
      <WamTextarea label="Alt başlık / açıklama" full rows={2} value={subtitle} onChange={(e) => onSubtitle(e.target.value)} />
      <WamTextarea label="Alt not (isteğe bağlı)" full rows={2} value={footerNote} onChange={(e) => onFooter(e.target.value)} />
      <div style={{ marginTop: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="wam-field-label">Kartlar</span>
          <button type="button" className="wam-btn wam-btn-ghost" onClick={() => onCards([...cards, newFeatureCard()])}>+ Kart ekle</button>
        </div>
        {cards.map((card, idx) => (
          <FeatureCardEditor
            key={card.id}
            card={card}
            onChange={(c) => updateCard(idx, c)}
            onRemove={() => removeCard(idx)}
          />
        ))}
      </div>
    </>
  );
}

export default function CmsLandingSections({ onMessage }: Props) {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [nedenKartlari, setNedenKartlari] = useState<NedenKart[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingKart, setEditingKart] = useState<NedenKart | null>(null);
  const [newKart, setNewKart] = useState<{ ikon: string; baslik: string; aciklama: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [settingsRes, kartRes] = await Promise.all([
      websiteAdminApi.getSettings(),
      websiteAdminApi.list<NedenKart>('neden-kartlari'),
    ]);
    setLoading(false);
    if (settingsRes.success && settingsRes.data) setSettings(settingsRes.data);
    else onMessage(settingsRes.error || 'Ayarlar yüklenemedi', 'error');
    if (kartRes.success && kartRes.data) {
      setNedenKartlari([...kartRes.data].sort((a, b) => a.sira - b.sira));
    }
  }, [onMessage]);

  useEffect(() => { void load(); }, [load]);

  const saveSettings = async (patch: Partial<SiteSettings>) => {
    if (!settings) return false;
    setSaving(true);
    const merged = { ...settings, ...patch };
    const res = await websiteAdminApi.updateSettings(patch);
    setSaving(false);
    if (res.success) {
      setSettings(res.data || merged);
      await invalidateLandingCache();
      onMessage('Kaydedildi');
      return true;
    }
    onMessage(res.error || 'Kaydedilemedi', 'error');
    return false;
  };

  const saveAll = async () => {
    if (!settings) return;
    const bolumler = settings.landing_bolumleri || [];
    const landing_section_order = resolvedSectionOrder(settings);
    await saveSettings({
      neden_baslik: settings.neden_baslik,
      neden_alt_baslik: settings.neden_alt_baslik,
      ders_formatlari_config: settings.ders_formatlari_config,
      landing_bolumleri: bolumler,
      landing_section_order,
      landing_sections_hidden: settings.landing_sections_hidden ?? hiddenFromSettings(settings),
      yorumlar_goster: settings.yorumlar_goster,
      sss_goster: settings.sss_goster,
    });
  };

  const toggleSectionVisible = async (key: string, visible: boolean) => {
    if (!settings) return;
    const patch = patchSectionVisibility(settings, key, visible);
    const merged = { ...settings, ...patch };
    setSettings(merged);
    await saveSettings(patch);
  };

  const updateDersConfig = (patch: Partial<DersFormatlariConfig>) => {
    if (!settings) return;
    setSettings({
      ...settings,
      ders_formatlari_config: { ...(settings.ders_formatlari_config || {}), ...patch },
    });
  };

  const updateBolum = (idx: number, patch: Partial<LandingBolum>) => {
    if (!settings) return;
    const list = [...(settings.landing_bolumleri || [])];
    list[idx] = { ...list[idx], ...patch };
    setSettings({ ...settings, landing_bolumleri: list });
  };

  const removeBolum = (idx: number) => {
    if (!settings) return;
    const bolumler = (settings.landing_bolumleri || []).filter((_, i) => i !== idx);
    setSettings({
      ...settings,
      landing_bolumleri: bolumler,
      landing_section_order: syncSectionOrderWithBolumler(settings.landing_section_order, bolumler),
    });
  };

  const saveNedenKart = async (kart: NedenKart) => {
    const res = await websiteAdminApi.update<NedenKart>('neden-kartlari', kart.id, kart);
    if (res.success && res.data) {
      setNedenKartlari((prev) => prev.map((k) => (k.id === kart.id ? res.data! : k)));
      setEditingKart(null);
      onMessage('Kart güncellendi');
    } else {
      onMessage(res.error || 'Kart kaydedilemedi', 'error');
    }
  };

  const createNedenKart = async () => {
    if (!newKart?.baslik?.trim()) {
      onMessage('Kart başlığı gerekli', 'error');
      return;
    }
    const sira = nedenKartlari.length ? Math.max(...nedenKartlari.map((k) => k.sira)) + 1 : 0;
    const res = await websiteAdminApi.create<NedenKart>('neden-kartlari', { ...newKart, sira, aktif: true });
    if (res.success && res.data) {
      setNedenKartlari((prev) => [...prev, res.data!].sort((a, b) => a.sira - b.sira));
      setNewKart(null);
      onMessage('Kart eklendi');
    } else {
      onMessage(res.error || 'Kart eklenemedi', 'error');
    }
  };

  const deleteNedenKart = async (id: number) => {
    if (!confirm('Bu kart silinsin mi?')) return;
    const res = await websiteAdminApi.remove('neden-kartlari', id);
    if (res.success) {
      setNedenKartlari((prev) => prev.filter((k) => k.id !== id));
      onMessage('Kart silindi');
    } else {
      onMessage(res.error || 'Silinemedi', 'error');
    }
  };

  if (loading) return <div className="wam-empty" style={{ padding: '2rem' }}>Yükleniyor…</div>;
  if (!settings) return <div className="wam-empty" style={{ padding: '2rem' }}>Ayarlar bulunamadı</div>;

  const dersCfg = resolveDersFormatlariConfig(settings.ders_formatlari_config);

  return (
    <div className="wam-panel">
      <div className="wam-panel-header">
        <div>
          <h3>Anasayfa Bölümleri</h3>
          <p>Neden 3K Kampüs, ders formatları ve ek tanıtım bölümlerini düzenleyin</p>
        </div>
        <button type="button" className="wam-btn wam-btn-primary" onClick={() => void saveAll()} disabled={saving}>
          {saving ? 'Kaydediliyor…' : 'Tümünü Kaydet'}
        </button>
      </div>

      <div className="wam-panel-body wam-settings-body">
        <CmsSectionOrderEditor
          order={resolvedSectionOrder(settings)}
          hidden={hiddenFromSettings(settings)}
          bolumler={settings.landing_bolumleri || []}
          onOrderChange={(landing_section_order) => setSettings({ ...settings, landing_section_order })}
          onToggleVisible={toggleSectionVisible}
          onMessage={onMessage}
        />

        {/* Neden 3K */}
        <section className="wam-settings-card">
          <div className="wam-settings-card-head">
            <span className="wam-settings-icon">⭐</span>
            <div>
              <h5>Neden 3K Kampüs?</h5>
              <p>Bölüm başlığı ve altındaki kartlar</p>
            </div>
          </div>
          <div className="wam-form-grid">
            <WamInput
              label="Başlık"
              value={settings.neden_baslik || ''}
              onChange={(e) => setSettings({ ...settings, neden_baslik: e.target.value })}
              placeholder={DEFAULT_NEDEN_BASLIK}
            />
            <WamInput
              label="Alt başlık"
              value={settings.neden_alt_baslik || ''}
              onChange={(e) => setSettings({ ...settings, neden_alt_baslik: e.target.value })}
              placeholder={DEFAULT_NEDEN_ALT}
            />
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span className="wam-field-label">Kartlar ({nedenKartlari.length})</span>
              <button type="button" className="wam-btn wam-btn-ghost" onClick={() => setNewKart({ ikon: 'star', baslik: '', aciklama: '' })}>+ Kart ekle</button>
            </div>

            {newKart && (
              <div className="wam-settings-card" style={{ marginBottom: '0.75rem', background: '#f8fafc' }}>
                <div className="wam-form-grid">
                  <label className="wam-field">
                    <span className="wam-field-label">İkon</span>
                    <select className="wam-input" value={newKart.ikon} onChange={(e) => setNewKart({ ...newKart, ikon: e.target.value })}>
                      {NEDEN_IKON_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                  <WamInput label="Başlık" value={newKart.baslik} onChange={(e) => setNewKart({ ...newKart, baslik: e.target.value })} />
                </div>
                <WamTextarea label="Açıklama" full rows={2} value={newKart.aciklama} onChange={(e) => setNewKart({ ...newKart, aciklama: e.target.value })} />
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button type="button" className="wam-btn wam-btn-primary" onClick={() => void createNedenKart()}>Ekle</button>
                  <button type="button" className="wam-btn wam-btn-ghost" onClick={() => setNewKart(null)}>İptal</button>
                </div>
              </div>
            )}

            {nedenKartlari.map((kart) => (
              <div key={kart.id} className="wam-settings-card" style={{ marginBottom: '0.5rem' }}>
                {editingKart?.id === kart.id ? (
                  <>
                    <div className="wam-form-grid">
                      <label className="wam-field">
                        <span className="wam-field-label">İkon</span>
                        <select className="wam-input" value={editingKart.ikon} onChange={(e) => setEditingKart({ ...editingKart, ikon: e.target.value })}>
                          {NEDEN_IKON_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </label>
                      <WamInput label="Başlık" value={editingKart.baslik} onChange={(e) => setEditingKart({ ...editingKart, baslik: e.target.value })} />
                    </div>
                    <WamTextarea label="Açıklama" full rows={2} value={editingKart.aciklama} onChange={(e) => setEditingKart({ ...editingKart, aciklama: e.target.value })} />
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <button type="button" className="wam-btn wam-btn-primary" onClick={() => void saveNedenKart(editingKart)}>Kaydet</button>
                      <button type="button" className="wam-btn wam-btn-ghost" onClick={() => setEditingKart(null)}>İptal</button>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div>
                      <strong>{kart.baslik}</strong>
                      <p style={{ margin: '0.25rem 0 0', fontSize: 13, color: '#64748b' }}>{kart.aciklama}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                      <button type="button" className="wam-btn wam-btn-ghost" onClick={() => setEditingKart(kart)}>Düzenle</button>
                      <button type="button" className="wam-btn wam-btn-ghost" style={{ color: '#dc2626' }} onClick={() => void deleteNedenKart(kart.id)}>Sil</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Ders Formatları */}
        <section className="wam-settings-card">
          <div className="wam-settings-card-head">
            <span className="wam-settings-icon">📚</span>
            <div>
              <h5>Ders Formatlarımız</h5>
              <p>Grup ve özel ders tanıtım bölümü</p>
            </div>
          </div>
          <FeatureSectionEditor
            title={dersCfg.title}
            eyebrow={dersCfg.eyebrow}
            subtitle={dersCfg.subtitle}
            footerNote={dersCfg.footer_note}
            cards={dersCfg.cards}
            onEyebrow={(v) => updateDersConfig({ eyebrow: v })}
            onTitle={(v) => updateDersConfig({ title: v })}
            onSubtitle={(v) => updateDersConfig({ subtitle: v })}
            onFooter={(v) => updateDersConfig({ footer_note: v })}
            onCards={(cards) => updateDersConfig({ cards })}
          />
        </section>

        {/* Ek bölümler */}
        <section className="wam-settings-card">
          <div className="wam-settings-card-head">
            <span className="wam-settings-icon">➕</span>
            <div>
              <h5>Ek Tanıtım Bölümleri</h5>
              <p>Ders formatları gibi ek kartlı bölümler ekleyin</p>
            </div>
          </div>
          <button
            type="button"
            className="wam-btn wam-btn-ghost"
            onClick={() => {
              const bolum = newLandingBolum();
              const bolumler = [...(settings.landing_bolumleri || []), bolum];
              const order = syncSectionOrderWithBolumler(
                [...(settings.landing_section_order || []), bolumSectionKey(bolum.id)],
                bolumler,
              );
              setSettings({ ...settings, landing_bolumleri: bolumler, landing_section_order: order });
            }}
          >
            + Yeni bölüm ekle
          </button>

          {(settings.landing_bolumleri || []).map((bolum, idx) => (
            <div key={bolum.id} className="wam-settings-card" style={{ marginTop: '1rem', border: '2px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong>Bölüm {idx + 1}</strong>
                <button type="button" className="wam-btn wam-btn-ghost" style={{ color: '#dc2626' }} onClick={() => removeBolum(idx)}>Bölümü sil</button>
              </div>
              <div className="wam-form-grid">
                <WamInput
                  label="Hızlı Erişim Kart Adı"
                  hint="Doluysa anasayfa üstündeki kart şeridinde görünür; bölüm silinince kart da kalkar"
                  value={bolum.kart_adi || ''}
                  onChange={(e) => updateBolum(idx, { kart_adi: e.target.value })}
                  placeholder="Örn. Programlarımız"
                />
                <WamInput
                  label="Kart ikonu (megaphone, users, calendar, map, phone, help, building, star)"
                  value={bolum.kart_ikon || 'star'}
                  onChange={(e) => updateBolum(idx, { kart_ikon: e.target.value })}
                />
              </div>
              <WamInput
                label="Sayfa içi bağlantı ID (örn. programlarimiz)"
                full
                value={bolum.section_id || bolum.id}
                onChange={(e) => updateBolum(idx, { section_id: e.target.value })}
              />
              <FeatureSectionEditor
                title={bolum.title || ''}
                eyebrow={bolum.eyebrow || ''}
                subtitle={bolum.subtitle || ''}
                footerNote={bolum.footer_note || ''}
                cards={bolum.cards || []}
                onEyebrow={(v) => updateBolum(idx, { eyebrow: v })}
                onTitle={(v) => updateBolum(idx, { title: v })}
                onSubtitle={(v) => updateBolum(idx, { subtitle: v })}
                onFooter={(v) => updateBolum(idx, { footer_note: v })}
                onCards={(cards) => updateBolum(idx, { cards })}
              />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
