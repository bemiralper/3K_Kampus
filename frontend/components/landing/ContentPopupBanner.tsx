'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchPublicContentList, type PublicContentItem } from '@/lib/website-api';
import { LANDING_KURUM_KOD } from '@/lib/landing-theme';
import ContentModal from '@/components/website-content/ContentModal';
import '@/app/duyurular/content.css';

const DISMISS_KEY = 'wc_popup_dismiss';

export default function ContentPopupBanner() {
  const [popup, setPopup] = useState<PublicContentItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const dismissed = sessionStorage.getItem(DISMISS_KEY);
        if (dismissed) return;
        const data = await fetchPublicContentList(LANDING_KURUM_KOD);
        if (data.popup) setPopup(data.popup);
      } catch {
        /* public sayfa — sessiz */
      }
    })();
  }, []);

  if (!popup) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setPopup(null);
  };

  return (
    <>
      <aside className="wc-popup-banner wc-scope" aria-label="Duyuru bildirimi">
        <div className="wc-popup-banner__head">
          <span>📢 Duyuru</span>
          <button type="button" onClick={dismiss} aria-label="Kapat" style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
        </div>
        <div className="wc-popup-banner__body">
          <p className="wc-popup-banner__title">{popup.baslik}</p>
          <p className="wc-popup-banner__excerpt">{popup.ozet}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>Oku</button>
            <Link href={`/duyurular/${popup.slug}`} className="btn btn-secondary btn-sm">Detay</Link>
          </div>
        </div>
      </aside>
      {modalOpen && <ContentModal item={popup} onClose={() => setModalOpen(false)} />}
    </>
  );
}
