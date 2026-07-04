'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  websiteAdminApi,
  type SiteSettings,
  type Duyuru,
  type SinavTakvim,
  type NedenKart,
  type BasariIstatistik,
  type OgrenciYorumu,
  type SSSItem,
  type SocialLink,
  type FooterLink,
  type HeroSlide,
  type YasalMetin,
} from '@/lib/website-api';
import { WEBSITE_IMAGE_GUIDELINES } from '@/lib/website-image-guidelines';
import ContentCrudPanel from '@/components/website-admin/ContentCrudPanel';
import SinavCalendarAdmin from '@/components/website-admin/SinavCalendarAdmin';
import SiteSettingsPanel from '@/components/website-admin/SiteSettingsPanel';
import ImageUploadField from '@/components/website-admin/ImageUploadField';
import MesajlarPanel from '@/components/website-admin/MesajlarPanel';
import '@/components/website-admin/website-admin.css';

type Tab =
  | 'settings' | 'hero' | 'duyurular' | 'sinav' | 'neden' | 'basari'
  | 'yorumlar' | 'sss' | 'sosyal' | 'footer' | 'yasal' | 'mesajlar';

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: 'settings', label: 'Site Ayarları', icon: '⚙️' },
  { id: 'hero', label: 'Hero Görselleri', icon: '🖼️' },
  { id: 'duyurular', label: 'Duyurular', icon: '📢' },
  { id: 'sinav', label: 'Sınav Takvimi', icon: '📅' },
  { id: 'neden', label: 'Neden 3K', icon: '✨' },
  { id: 'basari', label: 'Başarılar', icon: '🏆' },
  { id: 'yorumlar', label: 'Yorumlar', icon: '💬' },
  { id: 'sss', label: 'SSS', icon: '❓' },
  { id: 'sosyal', label: 'Sosyal Medya', icon: '🔗' },
  { id: 'footer', label: 'Footer', icon: '📋' },
  { id: 'yasal', label: 'Yasal Metinler', icon: '📜' },
  { id: 'mesajlar', label: 'Gelen Mesajlar', icon: '✉️' },
];

const KAPSAM_LABEL: Record<string, string> = {
  turkiye_geneli: 'Türkiye Geneli',
  yerel: 'Yerel',
};

export default function WebsiteYonetimiClient() {
  const [tab, setTab] = useState<Tab>('settings');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [settings, setSettings] = useState<SiteSettings>({});
  const [duyurular, setDuyurular] = useState<Duyuru[]>([]);
  const [sinavlar, setSinavlar] = useState<SinavTakvim[]>([]);
  const [neden, setNeden] = useState<NedenKart[]>([]);
  const [basari, setBasari] = useState<BasariIstatistik[]>([]);
  const [yorumlar, setYorumlar] = useState<OgrenciYorumu[]>([]);
  const [sss, setSss] = useState<SSSItem[]>([]);
  const [sosyal, setSosyal] = useState<SocialLink[]>([]);
  const [footer, setFooter] = useState<FooterLink[]>([]);
  const [hero, setHero] = useState<HeroSlide[]>([]);
  const [yasal, setYasal] = useState<YasalMetin[]>([]);
  const [mesajlar, setMesajlar] = useState<Array<{ id: number; ad_soyad: string; telefon: string; mesaj: string; okundu: boolean; created_at: string }>>([]);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [s, d, sn, n, b, y, ss, so, fo, h, ya, m] = await Promise.all([
        websiteAdminApi.getSettings(),
        websiteAdminApi.list<Duyuru>('duyurular'),
        websiteAdminApi.list<SinavTakvim>('sinav-takvim'),
        websiteAdminApi.list<NedenKart>('neden-kartlari'),
        websiteAdminApi.list<BasariIstatistik>('basari-istatistikleri'),
        websiteAdminApi.list<OgrenciYorumu>('yorumlar'),
        websiteAdminApi.list<SSSItem>('sss'),
        websiteAdminApi.list<SocialLink>('social-links'),
        websiteAdminApi.list<FooterLink>('footer-links'),
        websiteAdminApi.list<HeroSlide>('hero-slides'),
        websiteAdminApi.list<YasalMetin>('yasal-metinler'),
        websiteAdminApi.list<{ id: number; ad_soyad: string; telefon: string; mesaj: string; okundu: boolean; created_at: string }>('iletisim-mesajlari'),
      ]);
      if (s.success && s.data) setSettings(s.data);
      if (d.success && d.data) setDuyurular(d.data);
      if (sn.success && sn.data) setSinavlar(sn.data);
      if (n.success && n.data) setNeden(n.data);
      if (b.success && b.data) setBasari(b.data);
      if (y.success && y.data) setYorumlar(y.data);
      if (ss.success && ss.data) setSss(ss.data);
      if (so.success && so.data) setSosyal(so.data);
      if (fo.success && fo.data) setFooter(fo.data);
      if (h.success && h.data) setHero(h.data);
      if (ya.success && ya.data) setYasal(ya.data);
      if (m.success && m.data) setMesajlar(m.data);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(false); }, [loadAll]);

  const flash = (msg: string, type: 'success' | 'error' = 'success') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 4000);
  };

  const saveSettings = async () => {
    setSaving(true);
    const res = await websiteAdminApi.updateSettings(settings);
    setSaving(false);
    if (res.success) { flash('Ayarlar kaydedildi'); if (res.data) setSettings(res.data); }
    else flash(res.error || 'Kayıt hatası', 'error');
  };

  if (loading) {
    return (
      <div className="section">
        <div className="wam-empty">İçerikler yükleniyor…</div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="page-header">
        <div>
          <h2>Kurumsal Site Yönetimi</h2>
          <p className="muted">Ana sayfa (landing) içeriklerini buradan yönetin. Görseller için önerilen boyutlar her alanın altında belirtilmiştir.</p>
        </div>
        <a href="/" target="_blank" rel="noopener noreferrer" className="btn btn-secondary">Siteyi Önizle ↗</a>
      </div>

      {message && (
        <div className={`wam-toast ${messageType}`}>{message}</div>
      )}

      <div className="wam-shell">
        <aside className="wam-sidebar">
          <div className="wam-sidebar-title">Bölümler</div>
          {NAV.map(n => (
            <button
              key={n.id}
              type="button"
              className={`wam-nav-btn ${tab === n.id ? 'active' : ''}`}
              onClick={() => setTab(n.id)}
            >
              <span className="wam-nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </aside>

        <div>
          {tab === 'settings' && (
            <SiteSettingsPanel
              settings={settings}
              onChange={setSettings}
              onSave={saveSettings}
              saving={saving}
            />
          )}

          {tab === 'hero' && (
            <div className="wam-panel">
              <div className="wam-panel-header">
                <div>
                  <h3>Hero Görselleri</h3>
                  <p>Ana sayfa hero bölümünde dönen slaytlar</p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={async () => { await websiteAdminApi.create('hero-slides', {}); loadAll(true); }}
                >
                  + Slayt Ekle
                </button>
              </div>
              <div className="wam-panel-body">
                <p className="muted" style={{ marginBottom: '1rem', fontSize: 13 }}>
                  {WEBSITE_IMAGE_GUIDELINES.hero.label}: <strong>{WEBSITE_IMAGE_GUIDELINES.hero.size}</strong> — {WEBSITE_IMAGE_GUIDELINES.hero.hint}
                </p>
                {hero.length === 0 ? (
                  <div className="wam-empty">Henüz slayt yok.</div>
                ) : hero.map(slide => (
                  <div key={slide.id} className="wam-list-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <ImageUploadField
                      label={`Slayt #${slide.sira}`}
                      sizeHint={WEBSITE_IMAGE_GUIDELINES.hero.size}
                      detailHint={WEBSITE_IMAGE_GUIDELINES.hero.hint}
                      currentUrl={slide.gorsel_url}
                      onUpload={async file => {
                        await websiteAdminApi.upload('hero-slides', slide.id, file, 'gorsel');
                        loadAll(true);
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={async () => { await websiteAdminApi.remove('hero-slides', slide.id); loadAll(true); }}
                      >
                        Slaytı Sil
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'duyurular' && (
            <ContentCrudPanel
              title="Duyurular"
              description="Ana sayfada en fazla 6 güncel duyuru gösterilir"
              resource="duyurular"
              items={duyurular}
              fields={[
                { key: 'baslik', label: 'Başlık' },
                { key: 'ozet', label: 'Kısa Açıklama', textarea: true },
                { key: 'icerik', label: 'Detay İçerik', textarea: true },
                { key: 'yayin_tarihi', label: 'Yayın Tarihi', type: 'date' },
              ]}
              imageConfig={{
                resource: 'duyurular',
                uploadField: WEBSITE_IMAGE_GUIDELINES.duyuru.field,
                urlKey: 'kapak_gorseli_url',
                guideline: WEBSITE_IMAGE_GUIDELINES.duyuru,
              }}
              onReload={() => loadAll(true)}
              onMessage={flash}
            />
          )}

          {tab === 'sinav' && (
            <div className="wam-panel">
              <div className="wam-panel-header">
                <div>
                  <h3>Sınav Takvimi</h3>
                  <p>Takvimden tarih seçerek sınav ekleyin; görsel detay penceresinde görünür (1200×675 px)</p>
                </div>
              </div>
              <div className="wam-panel-body">
                <SinavCalendarAdmin sinavlar={sinavlar} onReload={() => loadAll(true)} onMessage={flash} />
              </div>
            </div>
          )}

          {tab === 'neden' && (
            <ContentCrudPanel
              title="Neden 3K Kampüs?"
              description="4 bilgi kartı (ikon emoji kullanabilirsiniz: 🎯 📚 📱)"
              resource="neden-kartlari"
              items={neden}
              fields={[
                { key: 'ikon', label: 'İkon (emoji)' },
                { key: 'baslik', label: 'Başlık' },
                { key: 'aciklama', label: 'Açıklama', textarea: true },
              ]}
              onReload={() => loadAll(true)}
              onMessage={flash}
            />
          )}

          {tab === 'basari' && (
            <ContentCrudPanel
              title="Başarı İstatistikleri"
              description="Başarılarımız bölümündeki sayılar"
              resource="basari-istatistikleri"
              items={basari}
              fields={[{ key: 'etiket', label: 'Etiket' }, { key: 'deger', label: 'Değer' }]}
              onReload={() => loadAll(true)}
              onMessage={flash}
            />
          )}

          {tab === 'yorumlar' && (
            <ContentCrudPanel
              title="Öğrenci Yorumları"
              resource="yorumlar"
              items={yorumlar}
              fields={[
                { key: 'ad', label: 'Ad Soyad' },
                { key: 'rol', label: 'Rol (ör. LGS Öğrencisi)' },
                { key: 'puan', label: 'Puan (1-5)', type: 'number' },
                { key: 'yorum', label: 'Yorum', textarea: true },
              ]}
              onReload={() => loadAll(true)}
              onMessage={flash}
            />
          )}

          {tab === 'sss' && (
            <ContentCrudPanel
              title="Sık Sorulan Sorular"
              resource="sss"
              items={sss}
              fields={[
                { key: 'soru', label: 'Soru' },
                { key: 'cevap', label: 'Cevap', textarea: true },
              ]}
              onReload={() => loadAll(true)}
              onMessage={flash}
            />
          )}

          {tab === 'sosyal' && (
            <ContentCrudPanel
              title="Sosyal Medya"
              resource="social-links"
              items={sosyal}
              fields={[
                { key: 'platform', label: 'Platform', select: ['instagram', 'facebook', 'youtube', 'twitter', 'linkedin', 'whatsapp'] },
                { key: 'url', label: 'URL' },
              ]}
              onReload={() => loadAll(true)}
              onMessage={flash}
            />
          )}

          {tab === 'footer' && (
            <ContentCrudPanel
              title="Footer Bağlantıları"
              resource="footer-links"
              items={footer}
              fields={[
                { key: 'kolon', label: 'Kolon', select: ['kurumsal', 'hizli', 'yasal', 'sosyal'] },
                { key: 'etiket', label: 'Etiket' },
                { key: 'url', label: 'URL (#duyurular veya /yasal/kvkk)' },
              ]}
              onReload={() => loadAll(true)}
              onMessage={flash}
            />
          )}

          {tab === 'yasal' && (
            <ContentCrudPanel
              title="Yasal Metinler"
              resource="yasal-metinler"
              items={yasal}
              fields={[
                { key: 'tur', label: 'Tür', select: ['kvkk', 'gizlilik', 'kullanim', 'cerez'] },
                { key: 'baslik', label: 'Başlık' },
                { key: 'icerik', label: 'İçerik (HTML)', textarea: true },
              ]}
              onReload={() => loadAll(true)}
              onMessage={flash}
            />
          )}

          {tab === 'mesajlar' && (
            <MesajlarPanel
              mesajlar={mesajlar}
              onToggleOkundu={async (id, okundu) => {
                await websiteAdminApi.update('iletisim-mesajlari', id, { okundu });
                loadAll(true);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
