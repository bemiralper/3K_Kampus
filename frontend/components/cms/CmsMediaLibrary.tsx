'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { websiteCmsV2Api, resolveMediaUrl, type CmsMediaAsset } from '@/lib/website-api';
import { mediaKindLabel } from '@/lib/cms/cms-labels';

type Props = {
  onMessage: (msg: string, type?: 'success' | 'error') => void;
};

export default function CmsMediaLibrary({ onMessage }: Props) {
  const [items, setItems] = useState<CmsMediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Arama girişini geciktir — her tuş vuruşunda API'yi yormasın
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await websiteCmsV2Api.listMedia(query ? { q: query } : undefined);
    setLoading(false);
    if (res.success && res.data) setItems(res.data);
    else onMessage(res.error || 'Medya yüklenemedi', 'error');
  }, [query, onMessage]);

  useEffect(() => { void load(); }, [load]);

  const upload = async (file: File) => {
    setUploading(true);
    const res = await websiteCmsV2Api.uploadMedia(file, { title: file.name });
    setUploading(false);
    if (res.success) {
      onMessage('Yüklendi');
      await load();
    } else onMessage(res.error || 'Yükleme başarısız', 'error');
  };

  const updateAlt = async (id: number, alt_text: string) => {
    const res = await websiteCmsV2Api.updateMedia(id, { alt_text });
    if (res.success) onMessage('Alt metin kaydedildi');
    else onMessage(res.error || 'Güncelleme başarısız', 'error');
  };

  const remove = async (id: number) => {
    if (!confirm('Medya silinsin mi?')) return;
    const res = await websiteCmsV2Api.deleteMedia(id);
    if (res.success) {
      onMessage('Silindi');
      await load();
    } else onMessage(res.error || 'Silinemedi', 'error');
  };

  return (
    <div className="wam-panel">
      <div className="wam-panel-header">
        <div>
          <h3>Medya Kütüphanesi</h3>
          <p>Görselleri yükleyin ve alt metinlerini düzenleyin</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ara…"
            style={{ padding: '0.4rem 0.6rem', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? 'Yükleniyor…' : 'Yükle'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,.pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>
      <div className="wam-panel-body">
        {loading ? (
          <div className="wam-empty">Yükleniyor…</div>
        ) : items.length === 0 ? (
          <div className="wam-empty">{query ? 'Aramayla eşleşen medya yok' : 'Henüz medya yok. Görsel yükleyerek başlayın.'}</div>
        ) : (
          <div className="cms-media-grid">
            {items.map((m) => {
              const url = resolveMediaUrl(m.url);
              return (
                <div key={m.id} className="cms-media-card">
                  {url && m.mime_type?.startsWith('image') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={m.alt_text || m.title} />
                  ) : (
                    <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', fontSize: 12 }}>
                      {mediaKindLabel(m.kind)}
                    </div>
                  )}
                  <div className="cms-media-card-body">
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.title || `#${m.id}`}
                    </div>
                    <input
                      defaultValue={m.alt_text || ''}
                      placeholder="Alt metin"
                      onBlur={(e) => {
                        if (e.target.value !== (m.alt_text || '')) void updateAlt(m.id, e.target.value);
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      style={{ marginTop: 6, width: '100%' }}
                      onClick={() => remove(m.id)}
                    >
                      Sil
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
