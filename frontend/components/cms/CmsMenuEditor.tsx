'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { websiteCmsV2Api, type CmsMenu, type CmsNavItem } from '@/lib/website-api';
import { menuLocationLabel } from '@/lib/cms/cms-labels';
import SortableList from './SortableList';

type Props = {
  onMessage: (msg: string, type?: 'success' | 'error') => void;
};

function MenuItemRow({
  item,
  menuId,
  onReload,
  onMessage,
  handle,
  depth = 0,
}: {
  item: CmsNavItem;
  menuId: number;
  onReload: () => void;
  onMessage: (msg: string, type?: 'success' | 'error') => void;
  handle: React.ReactNode;
  depth?: number;
}) {
  const [label, setLabel] = useState(item.label);
  const [url, setUrl] = useState(item.url);

  useEffect(() => {
    setLabel(item.label);
    setUrl(item.url);
  }, [item.id, item.label, item.url]);

  const dirty = label !== item.label || url !== item.url;

  const save = async () => {
    const res = await websiteCmsV2Api.updateMenuItem(menuId, { id: item.id, label, url });
    if (res.success) {
      onMessage('Öğe güncellendi');
      onReload();
    } else onMessage(res.error || 'Güncelleme başarısız', 'error');
  };

  const remove = async () => {
    if (!confirm('Menü öğesi silinsin mi?')) return;
    const res = await websiteCmsV2Api.deleteMenuItem(menuId, item.id);
    if (res.success) {
      onMessage('Öğe silindi');
      onReload();
    } else onMessage(res.error || 'Silinemedi', 'error');
  };

  return (
    <div className="cms-menu-row" style={{ marginLeft: depth * 16 }}>
      {handle}
      <input
        className="cms-menu-input"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Etiket"
      />
      <input
        className="cms-menu-input"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="/sayfa veya #bölüm"
      />
      <button type="button" className="btn btn-secondary btn-sm" disabled={!dirty} onClick={() => void save()}>
        Kaydet
      </button>
      <button type="button" className="btn btn-danger btn-sm" onClick={() => void remove()}>
        Sil
      </button>
    </div>
  );
}

export default function CmsMenuEditor({ onMessage }: Props) {
  const [menus, setMenus] = useState<CmsMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('/');
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
  const [rootItems, setRootItems] = useState<CmsNavItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await websiteCmsV2Api.listMenus();
    setLoading(false);
    if (res.success && res.data) {
      setMenus(res.data);
      if (!activeMenuId && res.data[0]) setActiveMenuId(res.data[0].id);
    } else onMessage(res.error || 'Menüler yüklenemedi', 'error');
  }, [onMessage, activeMenuId]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const active = menus.find((m) => m.id === activeMenuId) || menus[0];

  useEffect(() => {
    setRootItems(active?.items ?? []);
  }, [active?.id, active?.items]);

  const ensureMenus = async () => {
    if (!menus.find((m) => m.location === 'header')) {
      await websiteCmsV2Api.createMenu({ name: 'Üst Menü', location: 'header' });
    }
    if (!menus.find((m) => m.location === 'footer')) {
      await websiteCmsV2Api.createMenu({ name: 'Alt Menü', location: 'footer' });
    }
    await load();
  };

  const addItem = async () => {
    const menuId = activeMenuId;
    if (!menuId || !newLabel.trim()) {
      onMessage('Etiket gerekli', 'error');
      return;
    }
    const res = await websiteCmsV2Api.createMenuItem(menuId, {
      label: newLabel.trim(),
      url: newUrl.trim() || '/',
      sira: rootItems.length,
      aktif: true,
    });
    if (res.success) {
      setNewLabel('');
      onMessage('Öğe eklendi');
      await load();
    } else onMessage(res.error || 'Eklenemedi', 'error');
  };

  const persistOrder = async (ordered: CmsNavItem[]) => {
    if (!active) return;
    const payload = ordered.map((it, idx) => ({
      id: it.id,
      parent_id: it.parent_id ?? null,
      sira: idx,
    }));
    const res = await websiteCmsV2Api.reorderMenuItems(active.id, payload);
    if (res.success) onMessage('Sıralama kaydedildi');
    else onMessage(res.error || 'Sıralama kaydedilemedi', 'error');
  };

  return (
    <div className="wam-panel">
      <div className="wam-panel-header">
        <div>
          <h3>Menü Editörü</h3>
          <p>⠿ tutamacından sürükleyerek sıralayın; üst ve alt menü bağlantılarını düzenleyin.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void ensureMenus()}>
          Üst &amp; Alt Menü Oluştur
        </button>
      </div>
      <div className="wam-panel-body">
        {loading ? (
          <div className="wam-empty">Yükleniyor…</div>
        ) : menus.length === 0 ? (
          <div className="wam-empty">Henüz menü yok. &quot;Üst &amp; Alt Menü Oluştur&quot; ile başlayın.</div>
        ) : (
          <>
            <div className="cms-tab-row">
              {menus.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`btn btn-sm ${active?.id === m.id ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveMenuId(m.id)}
                >
                  {m.name} ({menuLocationLabel(m.location)})
                </button>
              ))}
            </div>

            {active && (
              <>
                <div className="cms-inline-form">
                  <div className="wam-field">
                    <label>Etiket</label>
                    <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Menü adı" />
                  </div>
                  <div className="wam-field">
                    <label>URL</label>
                    <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="/sayfa" />
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => void addItem()}>+ Öğe</button>
                </div>

                <SortableList
                  items={rootItems}
                  getKey={(item) => item.id}
                  onChange={setRootItems}
                  onReorderComplete={(ordered) => void persistOrder(ordered)}
                  emptyMessage="Bu menüde henüz öğe yok"
                  renderItem={(item, _index, handle) => (
                    <div className="cms-sortable-item-inner">
                      <MenuItemRow
                        item={item}
                        menuId={active.id}
                        onReload={load}
                        onMessage={onMessage}
                        handle={handle}
                      />
                      {(item.children ?? []).map((child) => (
                        <MenuItemRow
                          key={child.id}
                          item={child}
                          menuId={active.id}
                          onReload={load}
                          onMessage={onMessage}
                          handle={<span className="cms-menu-child-dot" aria-hidden>↳</span>}
                          depth={1}
                        />
                      ))}
                    </div>
                  )}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
