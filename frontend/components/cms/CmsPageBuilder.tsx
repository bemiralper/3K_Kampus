'use client';

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import {
  websiteCmsV2Api,
  type CmsBlock,
  type CmsPage,
} from '@/lib/website-api';
import {
  BLOCK_TYPES,
  CATEGORY_LABELS,
  createBlock,
  getBlockLabel,
  type BlockCategory,
} from '@/lib/cms/block-types';
import BlockRenderer from './BlockRenderer';
import { pageStatusLabel, statusBadgeClass } from '@/lib/cms/cms-labels';

type Device = 'desktop' | 'tablet' | 'mobile';

type Props = {
  pageId: number;
  onMessage: (msg: string, type?: 'success' | 'error') => void;
  onBack: () => void;
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as BlockCategory[];

function simpleFieldsForType(type: string): Array<{ key: string; label: string; textarea?: boolean; number?: boolean }> {
  switch (type) {
    case 'hero':
      return [
        { key: 'title', label: 'Başlık' },
        { key: 'subtitle', label: 'Alt başlık' },
        { key: 'description', label: 'Açıklama', textarea: true },
        { key: 'imageUrl', label: 'Görsel URL' },
        { key: 'overlay', label: 'Karartma katmanı' },
      ];
    case 'richText':
    case 'html':
      return [{ key: 'html', label: 'HTML', textarea: true }];
    case 'heading':
      return [
        { key: 'text', label: 'Metin' },
        { key: 'level', label: 'Seviye (1-6)', number: true },
        { key: 'align', label: 'Hizalama' },
      ];
    case 'image':
      return [
        { key: 'src', label: 'Kaynak URL' },
        { key: 'alt', label: 'Alt metin' },
        { key: 'caption', label: 'Alt yazı' },
        { key: 'linkUrl', label: 'Link' },
      ];
    case 'cta':
      return [
        { key: 'title', label: 'Başlık' },
        { key: 'description', label: 'Açıklama', textarea: true },
        { key: 'buttonLabel', label: 'Buton metni' },
        { key: 'buttonUrl', label: 'Buton URL' },
      ];
    case 'youtube':
      return [
        { key: 'videoId', label: 'Video ID' },
        { key: 'title', label: 'Başlık' },
      ];
    case 'spacer':
      return [{ key: 'height', label: 'Yükseklik (px)', number: true }];
    case 'divider':
      return [
        { key: 'style', label: 'Stil (solid/dashed)' },
        { key: 'color', label: 'Renk' },
      ];
    case 'button':
      return [
        { key: 'label', label: 'Etiket' },
        { key: 'url', label: 'URL' },
        { key: 'variant', label: 'Varyant' },
        { key: 'align', label: 'Hizalama' },
      ];
    default:
      return [];
  }
}

export default function CmsPageBuilder({ pageId, onMessage, onBack }: Props) {
  const [page, setPage] = useState<CmsPage | null>(null);
  const [blocks, setBlocks] = useState<CmsBlock[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>('desktop');
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [publishing, setPublishing] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await websiteCmsV2Api.getPage(pageId);
    setLoading(false);
    if (res.success && res.data) {
      setPage(res.data);
      setBlocks(res.data.blocks || []);
    } else {
      onMessage(res.error || 'Sayfa yüklenemedi', 'error');
    }
  }, [pageId, onMessage]);

  useEffect(() => { void load(); }, [load]);

  const autosave = useCallback(
    (nextBlocks: CmsBlock[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setSaveState('saving');
        const res = await websiteCmsV2Api.updatePage(pageId, { blocks: nextBlocks, autosave: true });
        if (res.success) {
          setSaveState('saved');
          if (res.data) setPage((prev) => (prev ? { ...prev, ...res.data } : res.data!));
        } else {
          setSaveState('error');
          onMessage(res.error || 'Otomatik kayıt başarısız', 'error');
        }
      }, 1500);
    },
    [pageId, onMessage],
  );

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const updateBlocks = (next: CmsBlock[]) => {
    setBlocks(next);
    autosave(next);
  };

  const addBlock = (type: string) => {
    const block = createBlock(type) as CmsBlock;
    updateBlocks([...blocksRef.current, block]);
    setSelectedId(block.id);
  };

  const moveBlock = (index: number, dir: -1 | 1) => {
    const next = [...blocksRef.current];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    updateBlocks(next);
  };

  const deleteBlock = (id: string) => {
    updateBlocks(blocksRef.current.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const selected = blocks.find((b) => b.id === selectedId) || null;

  const setProp = (key: string, value: unknown) => {
    if (!selected) return;
    updateBlocks(
      blocks.map((b) =>
        b.id === selected.id ? { ...b, props: { ...b.props, [key]: value } } : b,
      ),
    );
  };

  const setVisibility = (deviceKey: 'desktop' | 'tablet' | 'mobile', value: boolean) => {
    if (!selected) return;
    const style = { ...(selected.style || {}) } as Record<string, unknown>;
    const vis = { ...((style.visibility as Record<string, boolean>) || { desktop: true, tablet: true, mobile: true }) };
    vis[deviceKey] = value;
    style.visibility = vis;
    updateBlocks(blocks.map((b) => (b.id === selected.id ? { ...b, style } : b)));
  };

  const setPropsJson = (raw: string) => {
    if (!selected) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      updateBlocks(blocks.map((b) => (b.id === selected.id ? { ...b, props: parsed } : b)));
    } catch {
      /* typing */
    }
  };

  const publish = async () => {
    setPublishing(true);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      await websiteCmsV2Api.updatePage(pageId, { blocks, autosave: true });
    }
    const res = await websiteCmsV2Api.publishPage(pageId);
    setPublishing(false);
    if (res.success) {
      onMessage('Sayfa yayınlandı');
      if (res.data) {
        setPage(res.data);
        setBlocks(res.data.blocks || blocks);
      }
    } else onMessage(res.error || 'Yayınlama başarısız', 'error');
  };

  const onDragStart = (index: number) => setDragIndex(index);
  const onDragOver = (e: DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const next = [...blocks];
    const [item] = next.splice(dragIndex, 1);
    next.splice(index, 0, item);
    setDragIndex(index);
    setBlocks(next);
  };
  const onDragEnd = () => {
    if (dragIndex !== null) autosave(blocks);
    setDragIndex(null);
  };

  if (loading) return <div className="wam-empty">Düzenleyici yükleniyor…</div>;
  if (!page) return <div className="wam-empty">Sayfa bulunamadı</div>;

  const fields = selected ? simpleFieldsForType(selected.type) : [];
  const vis = (selected?.style?.visibility || { desktop: true, tablet: true, mobile: true }) as Record<string, boolean>;

  return (
    <div>
      <div className="wam-panel" style={{ marginBottom: '0.75rem' }}>
        <div className="wam-panel-header">
          <div>
            <h3>{page.title}</h3>
            <p>
              <code>{page.slug}</code>
              {' · '}
              <span className={`cms-badge ${statusBadgeClass(page.status)}`}>{pageStatusLabel(page.status)}</span>
              {' · '}
              <span className={`cms-autosave ${saveState}`}>
                {saveState === 'saving' && 'Kaydediliyor…'}
                {saveState === 'saved' && 'Kaydedildi'}
                {saveState === 'error' && 'Kayıt hatası'}
                {saveState === 'idle' && 'Hazır'}
              </span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>← Sayfalar</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={publishing} onClick={publish}>
              {publishing ? 'Yayınlanıyor…' : 'Yayınla'}
            </button>
          </div>
        </div>
      </div>

      <div className="cms-builder">
        <div className="cms-builder-col">
          <div className="cms-builder-col-header">Bloklar</div>
          <div className="cms-builder-col-body">
            {CATEGORIES.map((cat) => {
              const items = BLOCK_TYPES.filter((b) => b.category === cat);
              if (!items.length) return null;
              return (
                <div key={cat}>
                  <div className="cms-palette-cat">{CATEGORY_LABELS[cat]}</div>
                  {items.map((b) => (
                    <button
                      key={b.type}
                      type="button"
                      className="cms-palette-btn"
                      onClick={() => addBlock(b.type)}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="cms-builder-col">
          <div className="cms-builder-col-header">
            <span>Önizleme</span>
            <div className="cms-canvas-toolbar">
              {(['desktop', 'tablet', 'mobile'] as Device[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`cms-device-btn ${device === d ? 'active' : ''}`}
                  onClick={() => setDevice(d)}
                >
                  {d === 'desktop' ? 'Masaüstü' : d === 'tablet' ? 'Tablet' : 'Mobil'}
                </button>
              ))}
            </div>
          </div>
          <div className="cms-builder-col-body">
            <div className={`cms-canvas-frame ${device}`}>
              {blocks.length === 0 && (
                <div className="wam-empty">Soldan blok ekleyin</div>
              )}
              {blocks.map((block, index) => (
                <div
                  key={block.id}
                  className={`cms-block-row ${selectedId === block.id ? 'selected' : ''} ${dragIndex === index ? 'dragging' : ''}`}
                  draggable
                  onDragStart={() => onDragStart(index)}
                  onDragOver={(e) => onDragOver(e, index)}
                  onDragEnd={onDragEnd}
                >
                  <div className="cms-block-handle" title="Sürükle">⠿</div>
                  <div
                    className="cms-block-preview"
                    onClick={() => setSelectedId(block.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedId(block.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="cms-block-preview-label">{getBlockLabel(block.type)}</div>
                    <BlockRenderer block={block} preview />
                  </div>
                  <div className="cms-block-actions">
                    <button type="button" onClick={() => moveBlock(index, -1)} title="Yukarı">↑</button>
                    <button type="button" onClick={() => moveBlock(index, 1)} title="Aşağı">↓</button>
                    <button type="button" onClick={() => deleteBlock(block.id)} title="Sil">✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="cms-builder-col">
          <div className="cms-builder-col-header">Özellikler</div>
          <div className="cms-builder-col-body">
            {!selected ? (
              <div className="wam-empty" style={{ padding: '1rem 0' }}>Blok seçin</div>
            ) : (
              <>
                <p className="cms-inspector-title">
                  {getBlockLabel(selected.type)}
                </p>

                <div className="cms-inspector-field">
                  <label>Görünürlük</label>
                  <div className="cms-inspector-vis">
                    {([
                      { id: 'desktop' as const, label: 'Masaüstü' },
                      { id: 'tablet' as const, label: 'Tablet' },
                      { id: 'mobile' as const, label: 'Mobil' },
                    ]).map((d) => (
                      <label key={d.id}>
                        <input
                          type="checkbox"
                          checked={vis[d.id] !== false}
                          onChange={(e) => setVisibility(d.id, e.target.checked)}
                        />
                        <span>{d.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {fields.map((f) => (
                  <div key={f.key} className="cms-inspector-field">
                    <label>{f.label}</label>
                    {f.textarea ? (
                      <textarea
                        value={String(selected.props[f.key] ?? '')}
                        onChange={(e) => setProp(f.key, e.target.value)}
                      />
                    ) : (
                      <input
                        type={f.number ? 'number' : 'text'}
                        value={String(selected.props[f.key] ?? '')}
                        onChange={(e) =>
                          setProp(f.key, f.number ? Number(e.target.value) : e.target.value)
                        }
                      />
                    )}
                  </div>
                ))}

                {selected.type === 'hero' && (
                  <>
                    <div className="cms-inspector-field">
                      <label>Buton 1 etiket / URL</label>
                      <input
                        value={String((selected.props.button1 as { label?: string })?.label ?? '')}
                        placeholder="Etiket"
                        onChange={(e) =>
                          setProp('button1', {
                            ...((selected.props.button1 as object) || {}),
                            label: e.target.value,
                          })
                        }
                      />
                      <input
                        style={{ marginTop: 4 }}
                        value={String((selected.props.button1 as { url?: string })?.url ?? '')}
                        placeholder="URL"
                        onChange={(e) =>
                          setProp('button1', {
                            ...((selected.props.button1 as object) || {}),
                            url: e.target.value,
                          })
                        }
                      />
                    </div>
                  </>
                )}

                <div className="cms-inspector-field">
                  <label>Gelişmiş (JSON)</label>
                  <textarea
                    style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, minHeight: 140 }}
                    defaultValue={JSON.stringify(selected.props, null, 2)}
                    key={selected.id + '-json'}
                    onBlur={(e) => setPropsJson(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
