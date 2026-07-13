'use client';

import { useRef, useState } from 'react';
import {
  invalidateLandingCache,
  resolveMediaUrl,
  websiteCmsV2Api,
  type CmsContentEntry,
} from '@/lib/website-api';
import { CONTENT_PRIORITY_META, type ContentPriority } from '@/lib/content-labels';
import RichTextEditor from './RichTextEditor';

const EDITABLE_KINDS = [
  { value: 'duyuru', label: 'Duyuru' },
  { value: 'haber', label: 'Haber' },
  { value: 'blog', label: 'Blog' },
  { value: 'etkinlik', label: 'Etkinlik' },
];

export type ContentEditorState = {
  id: number | null;
  kind: string;
  title: string;
  status: string;
  priority: string;
  excerpt: string;
  cover_url: string;
  cover_thumb_url: string;
  body: string;
  is_pinned: boolean;
  is_featured: boolean;
  show_as_popup: boolean;
  publish_at: string;
  unpublish_at: string;
  meta_title: string;
  meta_description: string;
  gallery: CmsContentEntry['gallery'];
  attachments: CmsContentEntry['attachments'];
};

export const EMPTY_CONTENT_EDITOR: ContentEditorState = {
  id: null,
  kind: 'duyuru',
  title: '',
  status: 'draft',
  priority: 'normal',
  excerpt: '',
  cover_url: '',
  cover_thumb_url: '',
  body: '',
  is_pinned: false,
  is_featured: false,
  show_as_popup: false,
  publish_at: '',
  unpublish_at: '',
  meta_title: '',
  meta_description: '',
  gallery: [],
  attachments: [],
};

type Props = {
  editor: ContentEditorState;
  setEditor: React.Dispatch<React.SetStateAction<ContentEditorState | null>>;
  saving: boolean;
  setSaving: (v: boolean) => void;
  onMessage: (msg: string, type?: 'success' | 'error') => void;
  onSaved: () => void | Promise<void>;
};

function toLocalDatetime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

export function entryToEditor(full: CmsContentEntry): ContentEditorState {
  return {
    id: full.id,
    kind: full.kind,
    title: full.title,
    status: full.status,
    priority: full.priority || 'normal',
    excerpt: full.excerpt ?? '',
    cover_url: full.cover_url ?? '',
    cover_thumb_url: full.cover_thumb_url ?? '',
    body: full.body ?? '',
    is_pinned: !!full.is_pinned,
    is_featured: !!full.is_featured,
    show_as_popup: !!full.show_as_popup,
    publish_at: toLocalDatetime(full.publish_at),
    unpublish_at: toLocalDatetime(full.unpublish_at),
    meta_title: full.meta_title ?? '',
    meta_description: full.meta_description ?? '',
    gallery: full.gallery ?? [],
    attachments: full.attachments ?? [],
  };
}

export default function CmsContentEditor({
  editor,
  setEditor,
  saving,
  setSaving,
  onMessage,
  onSaved,
}: Props) {
  const coverRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const ensureSaved = async (): Promise<number | null> => {
    if (editor.id) return editor.id;
    if (!editor.title.trim()) {
      onMessage('Önce başlık girin', 'error');
      return null;
    }
    setSaving(true);
    const res = await websiteCmsV2Api.createContent({
      kind: editor.kind,
      title: editor.title.trim(),
      status: editor.status,
      excerpt: editor.excerpt,
      body: editor.body,
      priority: editor.priority,
      is_pinned: editor.is_pinned,
      is_featured: editor.is_featured,
      show_as_popup: editor.show_as_popup,
      publish_at: editor.publish_at || null,
      unpublish_at: editor.unpublish_at || null,
      meta_title: editor.meta_title,
      meta_description: editor.meta_description,
    });
    setSaving(false);
    if (!res.success || !res.data?.id) {
      onMessage(res.error || 'Kayıt oluşturulamadı', 'error');
      return null;
    }
    setEditor((prev) => (prev ? { ...prev, id: res.data!.id } : prev));
    return res.data.id;
  };

  const save = async () => {
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
      cover_thumb_url: editor.cover_thumb_url,
      body: editor.body,
      priority: editor.priority,
      is_pinned: editor.is_pinned,
      is_featured: editor.is_featured,
      show_as_popup: editor.show_as_popup,
      publish_at: editor.publish_at || null,
      unpublish_at: editor.unpublish_at || null,
      meta_title: editor.meta_title,
      meta_description: editor.meta_description,
    };
    const res = editor.id
      ? await websiteCmsV2Api.updateContent(editor.id, payload)
      : await websiteCmsV2Api.createContent({ ...payload, title: editor.title.trim() });
    setSaving(false);
    if (res.success) {
      await invalidateLandingCache();
      onMessage(editor.id ? 'İçerik güncellendi' : 'İçerik oluşturuldu');
      setEditor(null);
      await onSaved();
    } else {
      onMessage(res.error || 'Kaydedilemedi', 'error');
    }
  };

  const uploadCover = async (file: File) => {
    const id = await ensureSaved();
    if (!id) return;
    setUploading(true);
    const res = await websiteCmsV2Api.uploadContentCover(id, file);
    setUploading(false);
    if (res.success && res.data) {
      setEditor((prev) =>
        prev
          ? {
              ...prev,
              id,
              cover_url: res.data!.cover_url ?? prev.cover_url,
              cover_thumb_url: res.data!.cover_thumb_url ?? prev.cover_thumb_url,
            }
          : prev,
      );
      onMessage('Kapak yüklendi');
    } else onMessage(res.error || 'Kapak yüklenemedi', 'error');
  };

  const uploadGallery = async (file: File) => {
    const id = await ensureSaved();
    if (!id) return;
    setUploading(true);
    const res = await websiteCmsV2Api.uploadContentGallery(id, file);
    setUploading(false);
    if (res.success && res.data?.content) {
      setEditor((prev) =>
        prev ? { ...prev, id, gallery: res.data!.content.gallery ?? [] } : prev,
      );
      onMessage('Galeri görseli eklendi');
    } else onMessage(res.error || 'Görsel yüklenemedi', 'error');
  };

  const uploadAttachment = async (file: File) => {
    const id = await ensureSaved();
    if (!id) return;
    setUploading(true);
    const res = await websiteCmsV2Api.uploadContentAttachment(id, file, file.name);
    setUploading(false);
    if (res.success && res.data?.content) {
      setEditor((prev) =>
        prev ? { ...prev, id, attachments: res.data!.content.attachments ?? [] } : prev,
      );
      onMessage('Dosya eklendi');
    } else onMessage(res.error || 'Dosya yüklenemedi', 'error');
  };

  const coverPreview = resolveMediaUrl(editor.cover_thumb_url || editor.cover_url);

  return (
    <>
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
        <div className="wam-field">
          <label>Öncelik</label>
          <select value={editor.priority} onChange={(e) => setEditor({ ...editor, priority: e.target.value })}>
            {(Object.keys(CONTENT_PRIORITY_META) as ContentPriority[]).map((p) => (
              <option key={p} value={p}>{CONTENT_PRIORITY_META[p].label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="cms-drawer-grid cms-drawer-grid--2">
        <div className="wam-field">
          <label>Yayın Tarihi</label>
          <input type="datetime-local" value={editor.publish_at} onChange={(e) => setEditor({ ...editor, publish_at: e.target.value })} />
        </div>
        <div className="wam-field">
          <label>Yayından Kalkış</label>
          <input type="datetime-local" value={editor.unpublish_at} onChange={(e) => setEditor({ ...editor, unpublish_at: e.target.value })} />
        </div>
      </div>

      <div className="cms-content-flags">
        <label><input type="checkbox" checked={editor.is_pinned} onChange={(e) => setEditor({ ...editor, is_pinned: e.target.checked })} /> Sabitle (üstte)</label>
        <label><input type="checkbox" checked={editor.is_featured} onChange={(e) => setEditor({ ...editor, is_featured: e.target.checked })} /> Öne çıkar</label>
        <label><input type="checkbox" checked={editor.show_as_popup} onChange={(e) => setEditor({ ...editor, show_as_popup: e.target.checked })} /> Anasayfa popup</label>
      </div>

      <div className="wam-field">
        <label>Kapak Görseli</label>
        <div className="cms-cover-row">
          {coverPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverPreview} alt="" className="cms-cover-preview" />
          ) : (
            <div className="cms-cover-preview cms-cover-preview--empty">Kapak yok</div>
          )}
          <div className="cms-cover-actions">
            <button type="button" className="btn btn-secondary btn-sm" disabled={uploading} onClick={() => coverRef.current?.click()}>
              {uploading ? 'Yükleniyor…' : 'Dosyadan yükle'}
            </button>
            {editor.cover_url && editor.id && (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={async () => {
                  if (!editor.id) return;
                  const res = await websiteCmsV2Api.deleteContentCover(editor.id);
                  if (res.success) setEditor({ ...editor, cover_url: '', cover_thumb_url: '' });
                }}
              >
                Kaldır
              </button>
            )}
          </div>
        </div>
        <input ref={coverRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadCover(f); e.target.value = ''; }} />
        <input
          value={editor.cover_url}
          onChange={(e) => setEditor({ ...editor, cover_url: e.target.value })}
          placeholder="veya URL: /media/…"
          style={{ marginTop: 8 }}
        />
      </div>

      <div className="wam-field">
        <label>Özet</label>
        <textarea rows={2} value={editor.excerpt} onChange={(e) => setEditor({ ...editor, excerpt: e.target.value })} placeholder="Kısa açıklama (kartlarda görünür)" />
      </div>

      <div className="wam-field">
        <label>İçerik</label>
        <RichTextEditor value={editor.body} onChange={(html) => setEditor((prev) => (prev ? { ...prev, body: html } : prev))} />
      </div>

      <div className="wam-field">
        <label>Galeri Görselleri</label>
        <div className="cms-gallery-grid">
          {(editor.gallery ?? []).map((g) => (
            <div key={g.id} className="cms-gallery-thumb">
              <span>#{g.media_id}</span>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={async () => {
                  if (!editor.id) return;
                  const res = await websiteCmsV2Api.deleteContentGalleryItem(editor.id, g.id);
                  if (res.success && res.data) setEditor({ ...editor, gallery: res.data.gallery ?? [] });
                }}
              >
                Sil
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" disabled={uploading} onClick={() => galleryRef.current?.click()}>
          + Görsel ekle
        </button>
        <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadGallery(f); e.target.value = ''; }} />
      </div>

      <div className="wam-field">
        <label>Ek Dosyalar (PDF, Word, Excel, PPT, ZIP)</label>
        <ul className="cms-attach-list">
          {(editor.attachments ?? []).map((a) => (
            <li key={a.id}>
              <span>{a.title || `Medya #${a.media_id}`}</span>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={async () => {
                  if (!editor.id) return;
                  const res = await websiteCmsV2Api.deleteContentAttachment(editor.id, a.id);
                  if (res.success && res.data) setEditor({ ...editor, attachments: res.data.attachments ?? [] });
                }}
              >
                Sil
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-secondary btn-sm" disabled={uploading} onClick={() => attachRef.current?.click()}>
          + Dosya ekle
        </button>
        <input ref={attachRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAttachment(f); e.target.value = ''; }} />
      </div>

      <div className="cms-drawer-grid cms-drawer-grid--2">
        <div className="wam-field">
          <label>SEO Başlık</label>
          <input value={editor.meta_title} onChange={(e) => setEditor({ ...editor, meta_title: e.target.value })} maxLength={70} />
        </div>
        <div className="wam-field">
          <label>SEO Açıklama</label>
          <input value={editor.meta_description} onChange={(e) => setEditor({ ...editor, meta_description: e.target.value })} maxLength={320} />
        </div>
      </div>

      <div className="cms-drawer-foot">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditor(null)} disabled={saving}>İptal</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} disabled={saving || uploading}>
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </>
  );
}
