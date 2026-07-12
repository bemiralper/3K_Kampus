'use client';

import { useCallback, useEffect, useState } from 'react';
import { websiteCmsV2Api, type CmsContentEntry } from '@/lib/website-api';
import { contentKindLabel, contentStatusLabel, statusBadgeClass } from '@/lib/cms/cms-labels';
import RichTextEditor from './RichTextEditor';
import SortableList from './SortableList';

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

const EDITABLE_KINDS = KINDS.filter((k) => k.value);

type EditorState = {
  id: number | null;
  kind: string;
  title: string;
  status: string;
  excerpt: string;
  cover_url: string;
  body: string;
};

const EMPTY_EDITOR: EditorState = {
  id: null,
  kind: 'duyuru',
  title: '',
  status: 'draft',
  excerpt: '',
  cover_url: '',
  body: '',
};

export default function CmsContentPanel({ onMessage }: Props) {
  const [items, setItems] = useState<CmsContentEntry[]>([]);
  const [kind, setKind] = useState('');
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await websiteCmsV2Api.listContent(kind || undefined);
    setLoading(false);
    if (res.success && res.data) setItems(res.data);
    else onMessage(res.error || 'İçerik yüklenemedi', 'error');
  }, [kind, onMessage]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => setEditor({ ...EMPTY_EDITOR, kind: kind || 'duyuru' });

  const openEdit = async (item: CmsContentEntry) => {
    const res = await websiteCmsV2Api.getContent(item.id);
    const full = res.success && res.data ? res.data : item;
    setEditor({
      id: full.id,
      kind: full.kind,
      title: full.title,
      status: full.status,
      excerpt: full.excerpt ?? '',
      cover_url: full.cover_url ?? '',
      body: full.body ?? '',
    });
    if (!res.success) onMessage(res.error || 'İçerik açılamadı', 'error');
  };

  const save = async () => {
    if (!editor) return;
    if (!editor.title.trim()) {
      onMessage('Başlık gerekli', 'error');
      return;
    }
    setSaving(true);
    const payload = {
      kind: editor.kind,
      title: editor.title.trim(),
      status: editor.status,
      excerpt: editor.excerpt,
      cover_url: editor.cover_url,
      body: editor.body,
    };
    const res = editor.id
      ? await websiteCmsV2Api.updateContent(editor.id, payload)
      : await websiteCmsV2Api.createContent(payload);
    setSaving(false);
    if (res.success) {
      onMessage(editor.id ? 'İçerik güncellendi' : 'İçerik oluşturuldu');
      setEditor(null);
      await load();
    } else onMessage(res.error || 'Kaydedilemedi', 'error');
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
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="cms-select"
          >
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
          <div className="cms-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="cms-drawer-head">
              <h3>{editor.id ? 'İçeriği Düzenle' : 'Yeni İçerik'}</h3>
              <button type="button" className="cms-drawer-close" onClick={() => setEditor(null)} aria-label="Kapat">✕</button>
            </div>
            <div className="cms-drawer-body">
              <div className="cms-drawer-grid">
                <div className="wam-field">
                  <label>Başlık</label>
                  <input value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} placeholder="İçerik başlığı" />
                </div>
                <div className="wam-field">
                  <label>Tür</label>
                  <select value={editor.kind} onChange={(e) => setEditor({ ...editor, kind: e.target.value })}>
                    {EDITABLE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </div>
                <div className="wam-field">
                  <label>Durum</label>
                  <select value={editor.status} onChange={(e) => setEditor({ ...editor, status: e.target.value })}>
                    <option value="draft">Taslak</option>
                    <option value="published">Yayında</option>
                  </select>
                </div>
              </div>
              <div className="wam-field">
                <label>Kapak Görseli URL</label>
                <input value={editor.cover_url} onChange={(e) => setEditor({ ...editor, cover_url: e.target.value })} placeholder="https://… veya /media/…" />
              </div>
              <div className="wam-field">
                <label>Özet</label>
                <textarea rows={2} value={editor.excerpt} onChange={(e) => setEditor({ ...editor, excerpt: e.target.value })} placeholder="Kısa açıklama" />
              </div>
              <div className="wam-field">
                <label>İçerik</label>
                <RichTextEditor value={editor.body} onChange={(html) => setEditor((prev) => (prev ? { ...prev, body: html } : prev))} />
              </div>
            </div>
            <div className="cms-drawer-foot">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditor(null)} disabled={saving}>İptal</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} disabled={saving}>
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
