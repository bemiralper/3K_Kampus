'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  websiteCmsV2Api,
  type CmsDashboard,
} from '@/lib/website-api';
import {
  HEALTH_ITEMS,
  type HealthKey,
  explainSeoWarning,
  seoWarningSeverity,
} from '@/lib/cms/dashboard-guides';
import { pageStatusLabel, statusBadgeClass } from '@/lib/cms/cms-labels';

type Props = {
  onOpenPages: () => void;
  onOpenSeo: () => void;
  onNavigate: (id: 'seo' | 'integrations' | 'theme' | 'pages' | 'media') => void;
  onMessage: (msg: string, type?: 'success' | 'error') => void;
};

export default function CmsDashboard({ onOpenPages, onOpenSeo, onNavigate, onMessage }: Props) {
  const [data, setData] = useState<CmsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [filling, setFilling] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [openHealth, setOpenHealth] = useState<HealthKey | null>(null);
  const [openWarn, setOpenWarn] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await websiteCmsV2Api.getDashboard();
    setLoading(false);
    if (res.success && res.data) setData(res.data);
    else onMessage(res.error || 'Dashboard yüklenemedi', 'error');
  }, [onMessage]);

  useEffect(() => { void load(); }, [load]);

  const fillHealth = async () => {
    if (!confirm(
      'Eksik sağlık alanları otomatik doldurulsun mu?\n\n'
      + '• GA4 ölçüm kimliği (sonra panelden değiştirebilirsiniz)\n'
      + '• robots.txt (site alan adınıza göre)\n'
      + '• Logo / Favicon (kurum markasından)\n'
      + '• Sayfa meta / canonical / OG alanları\n\n'
      + 'Dolu olan alanlar ezilmez.',
    )) return;
    setFilling(true);
    const res = await websiteCmsV2Api.ensureHealth();
    setFilling(false);
    if (res.success && res.data) {
      const n = (res.data.changes || []).length;
      onMessage(n ? `Sağlık alanları dolduruldu (${n} değişiklik)` : 'Zaten tamamlanmış görünüyor');
      await load();
    } else {
      onMessage(res.error || 'Doldurma başarısız', 'error');
    }
  };

  const bootstrapSite = async () => {
    if (!confirm(
      'Anasayfa yerleşimi, Programlar / Hakkımızda / İletişim / 3K Sistemi sayfaları, '
      + 'menü ve örnek içerikler oluşturulsun / güncellensin mi?\n\n'
      + 'Anasayfa blokları yenilenir; diğer boş sayfalar doldurulur. Sonra panelden düzenleyebilirsiniz.',
    )) return;
    setBootstrapping(true);
    const res = await websiteCmsV2Api.bootstrapContent(true);
    setBootstrapping(false);
    if (res.success && res.data) {
      const pages = (res.data.pages_updated || []).join(', ') || '—';
      onMessage(`Site içeriği hazır. Güncellenen sayfalar: ${pages}`);
      await load();
    } else {
      onMessage(res.error || 'İçerik oluşturulamadı', 'error');
    }
  };

  if (loading) {
    return (
      <div className="cms-loading">
        <div className="cms-spinner" />
        <span>Özet yükleniyor…</span>
      </div>
    );
  }
  if (!data) {
    return <div className="cms-empty-state">Veri alınamadı. Sayfayı yenileyin.</div>;
  }

  const totals = data.totals || {};
  const cards: { key: string; label: string; hint: string }[] = [
    { key: 'pages', label: 'Sayfalar', hint: 'Toplam CMS sayfası' },
    { key: 'published', label: 'Yayında', hint: 'Ziyaretçinin gördüğü' },
    { key: 'draft', label: 'Taslak', hint: 'Henüz yayınlanmadı' },
    { key: 'media', label: 'Medya', hint: 'Kütüphanedeki dosyalar' },
    { key: 'content', label: 'İçerik', hint: 'Duyuru / haber / blog' },
    { key: 'form_submissions', label: 'Başvurular', hint: 'Form yanıtları' },
    { key: 'contact_messages', label: 'Mesajlar', hint: 'İletişim formu' },
    { key: 'sinav', label: 'Sınavlar', hint: 'Takvim kayıtları' },
  ];

  const healthEntries = (Object.keys(HEALTH_ITEMS) as HealthKey[]).map((key) => {
    const ok = Boolean(data.health?.[key]);
    return { key, ok, meta: HEALTH_ITEMS[key] };
  });
  const missingCount = healthEntries.filter((h) => !h.ok).length;
  const seoWarnings = data.seo_warnings || [];
  const actionableSeoCount = seoWarnings.filter(
    (w) => seoWarningSeverity(w.code, w.severity) === 'warn',
  ).length;
  const infoSeoCount = seoWarnings.length - actionableSeoCount;

  return (
    <div className="cms-dash">
      <header className="cms-dash-hero">
        <div>
          <p className="cms-eyebrow">Genel bakış</p>
          <h2 className="cms-dash-title">Web Sitesi paneli</h2>
          <p className="cms-dash-sub">
            Yayın durumu, SEO sağlığı ve hızlı işlemler tek ekranda.
          </p>
        </div>
        <div className="cms-dash-actions">
          <button type="button" className="cms-btn cms-btn-ghost" onClick={onOpenPages}>
            Sayfalar
          </button>
          <button type="button" className="cms-btn cms-btn-ghost" onClick={onOpenSeo}>
            SEO Merkezi
          </button>
          <button type="button" className="cms-btn cms-btn-ghost" disabled={filling} onClick={fillHealth}>
            {filling ? 'Dolduruluyor…' : 'Eksikleri doldur'}
          </button>
          <button type="button" className="cms-btn cms-btn-primary" disabled={bootstrapping} onClick={bootstrapSite}>
            {bootstrapping ? 'Hazırlanıyor…' : 'Anasayfa & sayfaları oluştur'}
          </button>
        </div>
      </header>

      {missingCount > 0 && (
        <div className="cms-callout cms-callout--warn">
          <div>
            <strong>Site sağlığı eksik</strong>
            <p>
              {missingCount} madde tamamlanmadı. Aşağıdaki &quot;Site sağlığı&quot; kartlarına tıklayarak
              ne anlama geldiğini ve nasıl düzelteceğinizi görebilirsiniz.
            </p>
          </div>
        </div>
      )}

      {actionableSeoCount > 0 && (
        <div className="cms-callout cms-callout--info">
          <div>
            <strong>SEO iyileştirmeleri</strong>
            <p>
              {actionableSeoCount} öneri var — sayfa sağlığı kartlarından bağımsızdır.
              Aşağıdaki &quot;SEO uyarıları&quot; bölümünden detayları inceleyin.
              {infoSeoCount > 0 ? ` (${infoSeoCount} bilgi notu)` : ''}
            </p>
          </div>
        </div>
      )}

      <section className="cms-stat-grid">
        {cards.map((c) => (
          <article key={c.key} className="cms-stat">
            <span className="cms-stat-hint">{c.hint}</span>
            <span className="cms-stat-value">{totals[c.key] ?? 0}</span>
            <span className="cms-stat-label">{c.label}</span>
          </article>
        ))}
      </section>

      <section className="cms-panel">
        <div className="cms-panel-head">
          <div>
            <h3>Site sağlığı</h3>
            <p>Arama motoru ve marka görünürlüğü için temel kontroller</p>
          </div>
        </div>
        <div className="cms-health-grid">
          {healthEntries.map(({ key, ok, meta }) => (
            <button
              key={key}
              type="button"
              className={`cms-health-card ${ok ? 'is-ok' : 'is-missing'} ${openHealth === key ? 'is-open' : ''}`}
              onClick={() => setOpenHealth(openHealth === key ? null : key)}
            >
              <div className="cms-health-top">
                <span className={`cms-dot ${ok ? 'ok' : 'bad'}`} />
                <span className="cms-health-label">{meta.label}</span>
                <span className={`cms-pill ${ok ? 'ok' : 'bad'}`}>{ok ? 'Tamam' : 'Eksik'}</span>
              </div>
              <div className="cms-health-title">{ok ? meta.okTitle : meta.missingTitle}</div>
              {openHealth === key && (
                <div className="cms-health-detail" onClick={(e) => e.stopPropagation()}>
                  <p><strong>Ne anlama geliyor?</strong> {meta.meaning}</p>
                  <p><strong>Nasıl tamamlanır?</strong> {meta.howTo}</p>
                  <button
                    type="button"
                    className="cms-btn cms-btn-primary cms-btn-sm"
                    onClick={() => onNavigate(meta.goTo)}
                  >
                    {meta.goLabel}
                  </button>
                </div>
              )}
            </button>
          ))}
        </div>
      </section>

      <div className="cms-two-col">
        <section className="cms-panel">
          <div className="cms-panel-head">
            <div>
              <h3>Son sayfalar</h3>
              <p>En son güncellenen CMS sayfaları</p>
            </div>
            <button type="button" className="cms-btn cms-btn-ghost cms-btn-sm" onClick={onOpenPages}>
              Tümü
            </button>
          </div>
          {(data.recent_pages || []).length === 0 ? (
            <div className="cms-empty-state">
              Henüz sayfa yok. “Anasayfa & sayfaları oluştur” ile başlayın.
            </div>
          ) : (
            <div className="cms-table-wrap">
              <table className="cms-table">
                <thead>
                  <tr>
                    <th>Başlık</th>
                    <th>URL</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_pages.map((p) => (
                    <tr key={p.id}>
                      <td>{p.title}</td>
                      <td><code>/{p.slug === 'home' ? '' : p.slug}</code></td>
                      <td>
                        <span className={`cms-badge ${statusBadgeClass(p.status)}`}>
                          {pageStatusLabel(p.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="cms-panel">
          <div className="cms-panel-head">
            <div>
              <h3>SEO uyarıları</h3>
              <p>
                {actionableSeoCount > 0
                  ? `${actionableSeoCount} iyileştirme önerisi`
                  : 'Sayfa meta ve medya kontrolleri'}
              </p>
            </div>
            <button type="button" className="cms-btn cms-btn-ghost cms-btn-sm" onClick={onOpenSeo}>
              SEO Merkezi
            </button>
          </div>
          {(data.seo_warnings || []).length === 0 ? (
            <div className="cms-empty-state">Şimdilik SEO önerisi yok.</div>
          ) : (
            <ul className="cms-warn-accordion">
              {data.seo_warnings.slice(0, 8).map((w, i) => {
                const help = explainSeoWarning(w.code, w.message);
                const severity = seoWarningSeverity(w.code, w.severity);
                const open = openWarn === i;
                return (
                  <li key={i} className={`${open ? 'is-open' : ''} severity-${severity}`}>
                    <button type="button" className="cms-warn-toggle" onClick={() => setOpenWarn(open ? null : i)}>
                      <span className="cms-warn-code">{help.title}</span>
                      {severity === 'info' ? (
                        <span className="cms-pill info">Bilgi</span>
                      ) : null}
                      <span className="cms-warn-chevron">{open ? '−' : '+'}</span>
                    </button>
                    {open && (
                      <div className="cms-warn-body">
                        <p className="cms-muted">{w.message}</p>
                        <p><strong>Ne demek?</strong> {help.meaning}</p>
                        <p><strong>Ne yapmalısınız?</strong> {help.howTo}</p>
                        {w.page_id != null && (
                          <button
                            type="button"
                            className="cms-btn cms-btn-ghost cms-btn-sm"
                            onClick={() => onOpenSeo()}
                          >
                            SEO Merkezi’nde düzelt
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
