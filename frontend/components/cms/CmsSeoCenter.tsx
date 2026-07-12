'use client';

import { useCallback, useEffect, useState } from 'react';
import { websiteCmsV2Api, type CmsPage, type CmsRedirect } from '@/lib/website-api';

type Props = {
  onOpenBuilder: (pageId: number) => void;
  onMessage: (msg: string, type?: 'success' | 'error') => void;
};

export default function CmsSeoCenter({ onOpenBuilder, onMessage }: Props) {
  const [warnings, setWarnings] = useState<Array<{ level?: string; message: string; page_id?: number }>>([]);
  const [redirects, setRedirects] = useState<CmsRedirect[]>([]);
  const [pages, setPages] = useState<CmsPage[]>([]);
  const [scores, setScores] = useState<Record<number, number | undefined>>({});
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [w, r, p] = await Promise.all([
      websiteCmsV2Api.seoWarnings(),
      websiteCmsV2Api.listRedirects(),
      websiteCmsV2Api.listPages(),
    ]);
    setLoading(false);
    if (w.success && w.data) setWarnings(w.data);
    if (r.success && r.data) setRedirects(r.data);
    if (p.success && p.data) setPages(p.data);
    const failed = [w, r, p].find((x) => !x.success);
    if (failed) onMessage(failed.error || 'SEO verileri kısmen yüklenemedi', 'error');
  }, [onMessage]);

  useEffect(() => { void load(); }, [load]);

  const createRedirect = async () => {
    if (!source.trim()) {
      onMessage('Kaynak yol zorunlu', 'error');
      return;
    }
    const res = await websiteCmsV2Api.createRedirect({
      source_path: source.trim(),
      target_path: target.trim() || '/',
      redirect_type: '301',
    });
    if (res.success) {
      onMessage('Yönlendirme eklendi');
      setSource('');
      setTarget('');
      await load();
    } else onMessage(res.error || 'Eklenemedi', 'error');
  };

  const loadScore = async (pageId: number) => {
    const res = await websiteCmsV2Api.seoScore(pageId);
    if (res.success && res.data) {
      setScores((prev) => ({ ...prev, [pageId]: typeof res.data!.score === 'number' ? res.data!.score : undefined }));
    } else onMessage(res.error || 'Skor alınamadı', 'error');
  };

  if (loading) return <div className="wam-empty">SEO merkezi yükleniyor…</div>;

  return (
    <div>
      <div className="wam-panel" style={{ marginBottom: '1rem' }}>
        <div className="wam-panel-header">
          <div>
            <h3>SEO Uyarıları</h3>
            <p>Site geneli iyileştirme önerileri</p>
          </div>
        </div>
        <div className="wam-panel-body" style={{ padding: 0 }}>
          {warnings.length === 0 ? (
            <div className="wam-empty">Uyarı yok</div>
          ) : (
            <ul className="cms-warning-list">
              {warnings.map((w, i) => (
                <li key={i}>
                  {w.level && <span className="cms-warn-level">{w.level}</span>}
                  {w.message}
                  {w.page_id != null && (
                    <>
                      {' '}
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenBuilder(w.page_id!)}>
                        Sayfayı Düzenle
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="wam-panel" style={{ marginBottom: '1rem' }}>
        <div className="wam-panel-header">
          <div>
            <h3>Yönlendirmeler</h3>
            <p>301/302 redirect kuralları</p>
          </div>
        </div>
        <div className="wam-panel-body">
          <div className="cms-inline-form">
            <div className="wam-field">
              <label>Kaynak</label>
              <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="/eski-yol" />
            </div>
            <div className="wam-field">
              <label>Hedef</label>
              <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="/yeni-yol" />
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={createRedirect}>+ Yönlendirme</button>
          </div>
          {redirects.length === 0 ? (
            <div className="wam-empty">Henüz yönlendirme yok</div>
          ) : (
            <table className="cms-table">
              <thead>
                <tr>
                  <th>Kaynak</th>
                  <th>Hedef</th>
                  <th>Tip</th>
                  <th>Hit</th>
                </tr>
              </thead>
              <tbody>
                {redirects.map((r) => (
                  <tr key={r.id}>
                    <td><code>{r.source_path}</code></td>
                    <td><code>{r.target_path}</code></td>
                    <td>{r.redirect_type}</td>
                    <td>{r.hit_count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="wam-panel">
        <div className="wam-panel-header">
          <div>
            <h3>Sayfa SEO Skorları</h3>
            <p>Sayfa bazlı SEO skoru</p>
          </div>
        </div>
        <div className="wam-panel-body" style={{ padding: 0 }}>
          {pages.length === 0 ? (
            <div className="wam-empty">Sayfa yok</div>
          ) : (
            <table className="cms-table">
              <thead>
                <tr>
                  <th>Sayfa</th>
                  <th>Skor</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.id}>
                    <td>{p.title}</td>
                    <td>{scores[p.id] != null ? scores[p.id] : '—'}</td>
                    <td>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadScore(p.id)}>
                        Skor Al
                      </button>{' '}
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpenBuilder(p.id)}>
                        Düzenle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
