'use client';

import { useCallback, useEffect, useState } from 'react';
import { websiteCmsV2Api, type CmsPage } from '@/lib/website-api';
import { pageStatusLabel, statusBadgeClass } from '@/lib/cms/cms-labels';

type Props = {
  onOpenBuilder: (pageId: number) => void;
  onMessage: (msg: string, type?: 'success' | 'error') => void;
};

export default function CmsPagesList({ onOpenBuilder, onMessage }: Props) {
  const [pages, setPages] = useState<CmsPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await websiteCmsV2Api.listPages();
    setLoading(false);
    if (res.success && res.data) setPages(res.data);
    else onMessage(res.error || 'Sayfalar yüklenemedi', 'error');
  }, [onMessage]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!title.trim()) {
      onMessage('Başlık gerekli', 'error');
      return;
    }
    setCreating(true);
    const res = await websiteCmsV2Api.createPage({
      title: title.trim(),
      slug: slug.trim() || undefined,
      status: 'draft',
      blocks: [],
    });
    setCreating(false);
    if (res.success && res.data) {
      onMessage('Sayfa oluşturuldu');
      setTitle('');
      setSlug('');
      await load();
      onOpenBuilder(res.data.id);
    } else {
      onMessage(res.error || 'Oluşturma başarısız', 'error');
    }
  };

  const publish = async (id: number) => {
    const res = await websiteCmsV2Api.publishPage(id);
    if (res.success) {
      onMessage('Sayfa yayınlandı');
      await load();
    } else onMessage(res.error || 'Yayınlama başarısız', 'error');
  };

  const duplicate = async (id: number) => {
    const res = await websiteCmsV2Api.duplicatePage(id);
    if (res.success && res.data) {
      onMessage('Sayfa kopyalandı');
      await load();
    } else onMessage(res.error || 'Kopyalama başarısız', 'error');
  };

  return (
    <div className="wam-panel">
      <div className="wam-panel-header">
        <div>
          <h3>Sayfalar</h3>
          <p>CMS sayfalarını oluşturun, düzenleyin ve yayınlayın</p>
        </div>
      </div>
      <div className="wam-panel-body">
        <div className="cms-inline-form">
          <div className="wam-field">
            <label>Başlık</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Yeni sayfa" />
          </div>
          <div className="wam-field">
            <label>Slug</label>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Boş bırakılırsa otomatik" />
          </div>
          <button type="button" className="btn btn-primary btn-sm" disabled={creating} onClick={create}>
            {creating ? 'Oluşturuluyor…' : '+ Yeni Sayfa'}
          </button>
        </div>

        {loading ? (
          <div className="wam-empty">Yükleniyor…</div>
        ) : pages.length === 0 ? (
          <div className="wam-empty">Henüz sayfa yok.</div>
        ) : (
          <table className="cms-table">
            <thead>
              <tr>
                <th>Başlık</th>
                <th>Slug</th>
                <th>Durum</th>
                <th>Güncelleme</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.title}
                    {p.is_homepage ? ' ★' : ''}
                  </td>
                  <td><code>{p.slug}</code></td>
                  <td>
                    <span className={`cms-badge ${statusBadgeClass(p.status)}`}>
                      {pageStatusLabel(p.status)}
                    </span>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {p.updated_at ? new Date(p.updated_at).toLocaleString('tr-TR') : '—'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpenBuilder(p.id)}>
                      Düzenle
                    </button>{' '}
                    {p.status !== 'published' && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => publish(p.id)}>
                        Yayınla
                      </button>
                    )}{' '}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => duplicate(p.id)}>
                      Kopyala
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
