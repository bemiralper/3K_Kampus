'use client';

import { useCallback, useState } from 'react';
import CmsDashboard from './CmsDashboard';
import CmsPagesList from './CmsPagesList';
import CmsPageBuilder from './CmsPageBuilder';
import CmsMediaLibrary from './CmsMediaLibrary';
import CmsMenuEditor from './CmsMenuEditor';
import CmsSeoCenter from './CmsSeoCenter';
import CmsIntegrations from './CmsIntegrations';
import CmsThemePanel from './CmsThemePanel';
import CmsFormsPanel from './CmsFormsPanel';
import CmsContentPanel from './CmsContentPanel';
import CmsSiteSettings from './CmsSiteSettings';
import CmsLandingSections from './CmsLandingSections';
import CmsHomeContent from './CmsHomeContent';
import './cms.css';

export type CmsNavId =
  | 'dashboard'
  | 'site'
  | 'sections'
  | 'home-content'
  | 'pages'
  | 'builder'
  | 'menus'
  | 'media'
  | 'content'
  | 'forms'
  | 'seo'
  | 'integrations'
  | 'theme';

const NAV: { id: CmsNavId; label: string; desc: string; needsPage?: boolean }[] = [
  { id: 'dashboard', label: 'Özet', desc: 'Sağlık ve istatistik' },
  { id: 'site', label: 'Anasayfa & Hero', desc: 'Hero, iletişim, sosyal medya' },
  { id: 'sections', label: 'Anasayfa Bölümleri', desc: 'Neden 3K, ders formatları' },
  { id: 'home-content', label: 'Sınav & SSS', desc: 'Deneme takvimi, yorum, SSS' },
  { id: 'pages', label: 'Sayfalar', desc: 'Oluştur / yayınla' },
  { id: 'builder', label: 'Sayfa düzenleyici', desc: 'Bloklarla tasarla', needsPage: true },
  { id: 'menus', label: 'Menü', desc: 'Header & footer' },
  { id: 'media', label: 'Medya', desc: 'Görsel kütüphanesi' },
  { id: 'content', label: 'İçerik', desc: 'Duyuru / haber' },
  { id: 'forms', label: 'Formlar', desc: 'Başvuru formları' },
  { id: 'seo', label: 'SEO', desc: 'Arama görünürlüğü' },
  { id: 'integrations', label: 'Entegrasyonlar', desc: 'GA4, kodlar' },
  { id: 'theme', label: 'Görünüm', desc: 'Logo ve renkler' },
];

type Props = {
  onMessage: (msg: string, type?: 'success' | 'error') => void;
};

export default function CmsShell({ onMessage }: Props) {
  const [nav, setNav] = useState<CmsNavId>('dashboard');
  const [pageId, setPageId] = useState<number | null>(null);

  const openBuilder = useCallback((id: number) => {
    setPageId(id);
    setNav('builder');
  }, []);

  const flash = useCallback(
    (msg: string, type: 'success' | 'error' = 'success') => {
      onMessage(msg, type);
    },
    [onMessage],
  );

  const go = useCallback((id: CmsNavId) => setNav(id), []);

  return (
    <div className="cms-shell">
      <aside className="cms-sidebar">
        <div className="cms-brand">
          <div className="cms-brand-mark">W</div>
          <div>
            <div className="cms-brand-name">Web Sitesi</div>
            <div className="cms-brand-sub">Yönetim paneli</div>
          </div>
        </div>

        <nav className="cms-nav" aria-label="Web sitesi menüsü">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`cms-nav-btn ${nav === n.id ? 'active' : ''}`}
              disabled={n.needsPage && pageId == null}
              onClick={() => setNav(n.id)}
              title={n.needsPage && pageId == null ? 'Önce Sayfalar’dan bir sayfa seçin' : n.desc}
            >
              <span className="cms-nav-label">{n.label}</span>
              <span className="cms-nav-desc">{n.desc}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="cms-main">
        {nav === 'dashboard' && (
          <CmsDashboard
            onOpenPages={() => setNav('pages')}
            onOpenSeo={() => setNav('seo')}
            onNavigate={(id) => go(id)}
            onMessage={flash}
          />
        )}
        {nav === 'site' && <CmsSiteSettings onMessage={flash} />}
        {nav === 'sections' && <CmsLandingSections onMessage={flash} />}
        {nav === 'home-content' && <CmsHomeContent onMessage={flash} />}
        {nav === 'pages' && (
          <CmsPagesList onOpenBuilder={openBuilder} onMessage={flash} />
        )}
        {nav === 'builder' && pageId != null && (
          <CmsPageBuilder
            pageId={pageId}
            onMessage={flash}
            onBack={() => setNav('pages')}
          />
        )}
        {nav === 'menus' && <CmsMenuEditor onMessage={flash} />}
        {nav === 'media' && <CmsMediaLibrary onMessage={flash} />}
        {nav === 'content' && <CmsContentPanel onMessage={flash} />}
        {nav === 'forms' && <CmsFormsPanel onMessage={flash} />}
        {nav === 'seo' && (
          <CmsSeoCenter onOpenBuilder={openBuilder} onMessage={flash} />
        )}
        {nav === 'integrations' && <CmsIntegrations onMessage={flash} />}
        {nav === 'theme' && <CmsThemePanel onMessage={flash} />}
      </div>
    </div>
  );
}
