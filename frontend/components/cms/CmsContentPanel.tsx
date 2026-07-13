'use client';

import { useCallback, useEffect, useState } from 'react';
import { websiteCmsV2Api, type CmsContentEntry } from '@/lib/website-api';
import { contentKindLabel, contentStatusLabel, statusBadgeClass } from '@/lib/cms/cms-labels';
import SortableList from './SortableList';
import CmsContentEditor, {
  EMPTY_CONTENT_EDITOR,
  entryToEditor,
  type ContentEditorState,
} from './CmsContentEditor';

type Props = {
  onMessage: (msg: string, type?: 'success' | 'error') => void;
};

const KINDS = [
  { value: '', label: 'Tümü' },
  { value: 'duyuru', label: 'Duyuru' },
  { value: 'haber', label: 'Haber' },
  { value: 'blog', label: 'Blog' },
  { value: 'etkinlik', label: 'Etkinlik' },
];

export default function CmsContentPanel({ onMessage }: Props) {
  const [items, setItems] = useState<CmsContentEntry[]>([]);
  const [kind, setKind] = useState('');
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<ContentEditorState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await websiteCmsV2Api.listContent(kind || undefined);
    setLoading(false);
    if (res.success && res.data) setItems(res.data);
    else onMessage(res.error || 'İçerik yüklenemedi', 'error');
  }, [kind, onMessage]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => setEditor({ ...EMPTY_CONTENT_EDITOR, kind: kind || 'duyuru' });

  const openEdit = async (item: CmsContentEntry) => {
    const res = await websiteCmsV2Api.getContent(item.id);
    const full = res.success && res.data ? res.data : item;
    setEditor(entryToEditor(full));
    if (!res.success) onMessage(res.error || 'İçerik açılamadı', 'error');
  };

  const remove = async (item: CmsContentEntry) => {
    if (!confirm(`"${item.title}" silinsin mi?`)) return;
    const res = await websiteCmsV2Api.deleteContent(item.id);
    if (res.success) {
      onMessage('İçerik silindi');
      await load();
    } else onMessage(res.error || 'Silinemedi', 'error');
  };

  const persistOrder = async (ordered: CmsContentEntry[]) => {
    const payload = ordered.map((it, idx) => ({ id: it.id, sira: idx }));
    const res = await websiteCmsV2Api.reorderContent(payload);
    if (res.success) onMessage('Sıralama kaydedildi');
    else onMessage(res.error || 'Sıralama kaydedilemedi', 'error');
  };

  return (
    <div className="wam-panel">
      <div className="wam-panel-header">
        <div>
          <h3>İçerik</h3>
          <p>⠿ tutamacından sürükleyerek sıralayın; duyuru, haber, blog ve etkinlikleri yönetin.</p>
        </div>
        <div className="cms-header-actions">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="cms-select">
            {KINDS.map((k) => (
              <option key={k.value || 'all'} value={k.value}>{k.label}</option>
            ))}
          </select>
          <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>+ Yeni İçerik</button>
        </div>
      </div>
      <div className="wam-panel-body">
        {loading ? (
          <div className="wam-empty">Yükleniyor…</div>
        ) : (
          <SortableList
            items={items}
            getKey={(item) => item.id}
            onChange={setItems}
            onReorderComplete={(ordered) => void persistOrder(ordered)}
            emptyMessage='Henüz içerik yok. "+ Yeni İçerik" ile başlayın.'
            renderItem={(item, _index, handle) => (
              <div className="cms-content-row-inner">
                {handle}
                <span className="cms-content-title">{item.title}</span>
                <span className="cms-content-kind">{contentKindLabel(item.kind)}</span>
                <span className={`cms-badge ${statusBadgeClass(item.status)}`}>{contentStatusLabel(item.status)}</span>
                {item.is_pinned && <span className="cms-badge cms-badge--info">Sabit</span>}
                <span className="cms-content-views">{item.view_count ?? 0} görüntülenme</span>
                <span className="cms-content-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openEdit(item)}>Düzenle</button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => void remove(item)}>Sil</button>
                </span>
              </div>
            )}
          />
        )}
      </div>

      {editor && (
        <div className="cms-drawer-overlay" onClick={() => !saving && setEditor(null)}>
          <div className="cms-drawer cms-drawer--wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="cms-drawer-head">
              <h3>{editor.id ? 'İçeriği Düzenle' : 'Yeni İçerik'}</h3>
              <button type="button" className="cms-drawer-close" onClick={() => setEditor(null)} aria-label="Kapat">✕</button>
            </div>
            <div className="cms-drawer-body">
              <CmsContentEditor
                editor={editor}
                setEditor={setEditor}
                saving={saving}
                setSaving={setSaving}
                onMessage={onMessage}
                onSaved={load}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
