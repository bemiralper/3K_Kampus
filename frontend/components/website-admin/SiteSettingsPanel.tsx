'use client';

import type { SiteSettings } from '@/lib/website-api';
import { WamInput, WamTextarea } from './WamField';
import { formatPhoneInput } from '@/lib/phone-format';
import { parseMapEmbedUrl, buildMapEmbedFromAddress } from '@/lib/map-embed';

type SiteSettingsPanelProps = {
  settings: SiteSettings;
  onChange: (settings: SiteSettings) => void;
  onSave: () => void;
  saving: boolean;
};

export default function SiteSettingsPanel({ settings, onChange, onSave, saving }: SiteSettingsPanelProps) {
  const set = (key: keyof SiteSettings, value: string | string[]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="wam-panel">
      <div className="wam-panel-header">
        <div>
          <h3>Site Ayarları</h3>
          <p>İletişim bilgileri, hero metinleri, tanıtım ve SEO ayarları</p>
        </div>
        <button type="button" className="wam-btn wam-btn-primary" onClick={onSave} disabled={saving}>
          {saving ? 'Kaydediliyor…' : 'Değişiklikleri Kaydet'}
        </button>
      </div>

      <div className="wam-panel-body wam-settings-body">
        <section className="wam-settings-card">
          <div className="wam-settings-card-head">
            <span className="wam-settings-icon">📞</span>
            <div>
              <h5>İletişim Bilgileri</h5>
              <p>Top bar, footer ve iletişim bölümünde görünür</p>
            </div>
          </div>
          <div className="wam-form-grid">
            <WamInput
              label="Telefon"
              value={settings.telefon || ''}
              onChange={e => set('telefon', formatPhoneInput(e.target.value))}
              placeholder="0212 555 00 00"
            />
            <WamInput label="WhatsApp" value={settings.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} placeholder="+90 555 000 00 00" />
            <WamInput label="E-posta" type="email" value={settings.eposta || ''} onChange={e => set('eposta', e.target.value)} placeholder="info@3kkampus.com" />
          </div>
          <WamTextarea label="Adres" full value={settings.adres || ''} onChange={e => set('adres', e.target.value)} rows={2} />
          <WamTextarea label="Çalışma Saatleri" full value={settings.calisma_saatleri || ''} onChange={e => set('calisma_saatleri', e.target.value)} rows={2} placeholder="Pzt–Cum 09:00–18:00" />
          <WamTextarea
            label="Google Harita Embed URL"
            hint="Google Maps → Paylaş → Harita Yerleştir → iframe src veya tam iframe HTML yapıştırın. Boş bırakırsanız adres kaydedilince otomatik üretilir."
            full
            value={settings.harita_embed_url || ''}
            onChange={e => set('harita_embed_url', e.target.value)}
            onBlur={() => {
              const parsed = parseMapEmbedUrl(settings.harita_embed_url);
              if (parsed !== (settings.harita_embed_url || '')) {
                set('harita_embed_url', parsed);
              } else if (!parsed && settings.adres?.trim()) {
                set('harita_embed_url', buildMapEmbedFromAddress(settings.adres));
              }
            }}
            rows={2}
          />
        </section>

        <section className="wam-settings-card">
          <div className="wam-settings-card-head">
            <span className="wam-settings-icon">✨</span>
            <div>
              <h5>Hero Metinleri</h5>
              <p>Ana sayfa giriş bölümündeki başlık ve maddeler</p>
            </div>
          </div>
          <div className="wam-form-grid">
            <WamInput label="Ana Başlık" value={settings.hero_baslik || ''} onChange={e => set('hero_baslik', e.target.value)} />
            <WamInput label="Alt Başlık" value={settings.hero_alt_baslik || ''} onChange={e => set('hero_alt_baslik', e.target.value)} />
            <WamInput label="Slogan" full value={settings.hero_slogan || ''} onChange={e => set('hero_slogan', e.target.value)} />
          </div>
          <WamInput
            label="Hero Maddeler"
            hint="Virgülle ayırın"
            full
            value={(settings.hero_maddeler || []).join(', ')}
            onChange={e => set('hero_maddeler', e.target.value.split(',').map(x => x.trim()).filter(Boolean))}
            placeholder="Akademik Takip, Bireysel Koçluk, Deneme Analizleri"
          />
        </section>

        <section className="wam-settings-card">
          <div className="wam-settings-card-head">
            <span className="wam-settings-icon">🏫</span>
            <div>
              <h5>3K Sistemi (Anasayfa)</h5>
              <p>Anasayfadaki 3K Sistemi tanıtım kartının başlık ve metni</p>
            </div>
          </div>
          <WamInput label="Tanıtım Başlık" full value={settings.tanitim_baslik || ''} onChange={e => set('tanitim_baslik', e.target.value)} />
          <WamTextarea label="Tanıtım Metni" full value={settings.tanitim_icerik || ''} onChange={e => set('tanitim_icerik', e.target.value)} rows={5} />
        </section>

        <section className="wam-settings-card">
          <div className="wam-settings-card-head">
            <span className="wam-settings-icon">🔍</span>
            <div>
              <h5>SEO & Google</h5>
              <p>Arama motorları, Open Graph ve Google Search Console doğrulama</p>
            </div>
          </div>
          <div className="wam-form-grid">
            <WamInput label="SEO Başlık" value={settings.seo_baslik || ''} onChange={e => set('seo_baslik', e.target.value)} />
            <WamInput
              label="Canonical URL"
              hint="Boş bırakılırsa anasayfa adresi kullanılır"
              value={settings.seo_canonical_url || ''}
              onChange={e => set('seo_canonical_url', e.target.value)}
              placeholder="https://www.3kkampus.com"
            />
          </div>
          <WamTextarea label="SEO Açıklama" full value={settings.seo_aciklama || ''} onChange={e => set('seo_aciklama', e.target.value)} rows={2} />
          <WamInput
            label="Anahtar Kelimeler"
            hint="Virgülle ayırın"
            full
            value={settings.seo_anahtar_kelimeler || ''}
            onChange={e => set('seo_anahtar_kelimeler', e.target.value)}
            placeholder="LGS, YKS, eğitim merkezi, deneme sınavı"
          />
          <WamInput
            label="Google Site Verification"
            hint="Search Console meta etiketindeki content değeri"
            full
            value={settings.google_site_verification || ''}
            onChange={e => set('google_site_verification', e.target.value)}
            placeholder="google-site-verification content"
          />
          <WamInput
            label="Google Analytics (gtag.js)"
            hint="Google'ın verdiği kodda id= sonrasındaki değer — örn. G-3NWSLBGCK8. Tam script yapıştırmayın."
            full
            value={settings.google_analytics_id || ''}
            onChange={e => set('google_analytics_id', e.target.value.replace(/\s/g, ''))}
            placeholder="G-3NWSLBGCK8"
          />
          <label className="wam-checkbox-row">
            <input
              type="checkbox"
              checked={settings.seo_robots_index !== false}
              onChange={e => onChange({ ...settings, seo_robots_index: e.target.checked })}
            />
            <span>Arama motorlarında indekslemeye izin ver (robots: index)</span>
          </label>
          <p className="wam-field-hint" style={{ marginTop: '0.75rem' }}>
            Otomatik dosyalar: <code>/sitemap.xml</code> ve <code>/robots.txt</code> — kayıt sonrası Google Search Console&apos;a sitemap ekleyin.
          </p>
        </section>

        <section className="wam-settings-card">
          <div className="wam-settings-card-head">
            <span className="wam-settings-icon">©</span>
            <div>
              <h5>Footer</h5>
              <p>Alt bilgi telif ve marka bildirimi</p>
            </div>
          </div>
          <div className="wam-form-grid">
            <WamInput label="Footer Telif Metni" value={settings.footer_copyright || ''} onChange={e => set('footer_copyright', e.target.value)} />
          </div>
          <WamInput
            label="Footer Marka Bildirimi"
            hint="Anasayfa footer altında görünen marka / ticari unvan metni"
            full
            value={settings.footer_marka_metni || ''}
            onChange={e => set('footer_marka_metni', e.target.value)}
            placeholder="3K Kampüs, Özgün Sınav Öğretim Eğitim A.Ş. markasıdır."
          />
        </section>
      </div>
    </div>
  );
}
