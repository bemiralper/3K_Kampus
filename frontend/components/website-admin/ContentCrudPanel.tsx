'use client';

import { useState } from 'react';
import { websiteAdminApi, cleanWebsiteFormPayload } from '@/lib/website-api';
import ImageUploadField from './ImageUploadField';
import WamModal from './WamModal';
import { WamInput, WamSelect, WamTextarea } from './WamField';
import type { WEBSITE_IMAGE_GUIDELINES } from '@/lib/website-image-guidelines';

type FieldDef = {
  key: string;
  label: string;
  textarea?: boolean;
  type?: string;
  select?: string[];
  placeholder?: string;
  hint?: string;
};

type ImageConfig = {
  resource: string;
  uploadField: string;
  urlKey: string;
  guideline: (typeof WEBSITE_IMAGE_GUIDELINES)[keyof typeof WEBSITE_IMAGE_GUIDELINES];
};

type ContentCrudPanelProps<T extends { id: number }> = {
  title: string;
  description?: string;
  resource: string;
  items: T[];
  fields: FieldDef[];
  imageConfig?: ImageConfig;
  onReload: () => void;
  onMessage?: (msg: string, type?: 'success' | 'error') => void;
  renderSummary?: (item: T) => string;
};

export default function ContentCrudPanel<T extends { id: number }>({
  title,
  description,
  resource,
  items,
  fields,
  imageConfig,
  onReload,
  onMessage,
  renderSummary,
}: ContentCrudPanelProps<T>) {
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string | number>>({});
  const [saving, setSaving] = useState(false);

  const startEdit = (item: T) => {
    setEditId(item.id);
    const f: Record<string, string | number> = {};
    fields.forEach(field => {
      f[field.key] = (item as Record<string, unknown>)[field.key] as string | number ?? '';
    });
    setForm(f);
  };

  const startCreate = () => {
    setEditId(0);
    setForm(Object.fromEntries(fields.map(f => [f.key, ''])));
  };

  const close = () => setEditId(null);

  const save = async () => {
    setSaving(true);
    try {
      const payload = cleanWebsiteFormPayload(form);
      if (editId === 0) {
        const res = await websiteAdminApi.create<T>(resource, payload);
        if (!res.success) {
          onMessage?.(res.error || 'Kayıt oluşturulamadı', 'error');
          return;
        }
        if (res.data) {
          setEditId((res.data as T).id);
          onMessage?.('Kayıt oluşturuldu — görsel ekleyebilirsiniz', 'success');
          onReload();
          return;
        }
      } else if (editId) {
        const res = await websiteAdminApi.update(resource, editId, payload);
        if (!res.success) {
          onMessage?.(res.error || 'Güncelleme başarısız', 'error');
          return;
        }
        onMessage?.('Kayıt güncellendi', 'success');
      }
      close();
      onReload();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Silmek istediğinize emin misiniz?')) return;
    const res = await websiteAdminApi.remove(resource, id);
    if (!res.success) {
      onMessage?.(res.error || 'Silme başarısız', 'error');
      return;
    }
    if (editId === id) close();
    onMessage?.('Kayıt silindi', 'success');
    onReload();
  };

  const editingItem = editId && editId > 0 ? items.find(i => i.id === editId) : null;
  const imageUrl = imageConfig && editingItem
    ? (editingItem as Record<string, unknown>)[imageConfig.urlKey] as string | null
    : null;

  return (
    <div className="wam-panel">
      <div className="wam-panel-header">
        <div>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        <button type="button" className="wam-btn wam-btn-primary wam-btn-sm" onClick={startCreate}>+ Yeni Ekle</button>
      </div>
      <div className="wam-panel-body">
        {imageConfig && (
          <div className="wam-info-banner">
            <div>
              <strong>{imageConfig.guideline.label}</strong>
              {' '}— {imageConfig.guideline.size} · max {imageConfig.guideline.maxMb} MB
            </div>
          </div>
        )}

        <WamModal
          open={editId !== null}
          title={editId === 0 ? 'Yeni Kayıt' : 'Düzenle'}
          onClose={close}
          footer={(
            <>
              <button type="button" className="wam-btn wam-btn-primary" disabled={saving} onClick={save}>
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
              <button type="button" className="wam-btn wam-btn-ghost" onClick={close}>İptal</button>
            </>
          )}
        >
          <div className="wam-form-grid">
            {fields.map(f => {
              if (f.textarea) {
                return (
                  <WamTextarea
                    key={f.key}
                    label={f.label}
                    hint={f.hint}
                    full
                    rows={4}
                    placeholder={f.placeholder}
                    value={String(form[f.key] ?? '')}
                    onChange={e => setForm(x => ({ ...x, [f.key]: e.target.value }))}
                  />
                );
              }
              if (f.select) {
                return (
                  <WamSelect
                    key={f.key}
                    label={f.label}
                    hint={f.hint}
                    value={String(form[f.key] ?? '')}
                    onChange={e => setForm(x => ({ ...x, [f.key]: e.target.value }))}
                    options={[{ value: '', label: 'Seçin' }, ...f.select.map(o => ({ value: o, label: o }))]}
                  />
                );
              }
              return (
                <WamInput
                  key={f.key}
                  label={f.label}
                  hint={f.hint}
                  type={f.type || 'text'}
                  placeholder={f.placeholder}
                  value={String(form[f.key] ?? '')}
                  onChange={e => setForm(x => ({
                    ...x,
                    [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value,
                  }))}
                />
              );
            })}
          </div>

          {imageConfig && editId !== null && editId > 0 && (
            <ImageUploadField
              label={imageConfig.guideline.label}
              sizeHint={imageConfig.guideline.size}
              detailHint={imageConfig.guideline.hint}
              maxMb={imageConfig.guideline.maxMb}
              currentUrl={imageUrl}
              onUpload={async file => {
                const res = await websiteAdminApi.upload(
                  imageConfig.resource,
                  editId,
                  file,
                  imageConfig.uploadField,
                );
                if (!res.success) {
                  onMessage?.(res.error || 'Görsel yüklenemedi', 'error');
                  throw new Error(res.error);
                }
                onMessage?.('Görsel yüklendi', 'success');
                onReload();
              }}
            />
          )}
          {imageConfig && editId === 0 && (
            <p className="wam-field-hint" style={{ marginTop: '0.75rem' }}>
              Önce kaydedin, ardından görsel yükleyebilirsiniz.
            </p>
          )}
        </WamModal>

        {items.length === 0 ? (
          <div className="wam-empty">Henüz kayıt yok.</div>
        ) : (
          <div className="wam-cards-grid">
            {items.map(item => {
              const thumb = imageConfig
                ? (item as Record<string, unknown>)[imageConfig.urlKey] as string | undefined
                : undefined;
              return (
                <div key={item.id} className="wam-item-card">
                  {thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="wam-item-thumb" />
                  )}
                  <div className="wam-item-body">
                    <p className="wam-item-title">
                      {renderSummary
                        ? renderSummary(item)
                        : String((item as Record<string, unknown>)[fields[0]?.key] ?? `#${item.id}`)}
                    </p>
                  </div>
                  <div className="wam-item-actions">
                    <button type="button" className="wam-btn wam-btn-secondary wam-btn-sm" onClick={() => startEdit(item)}>Düzenle</button>
                    <button type="button" className="wam-btn wam-btn-danger wam-btn-sm" onClick={() => remove(item.id)}>Sil</button>
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
