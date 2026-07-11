'use client';

import React, { useMemo, useState } from 'react';

export type FilterListItem = {
  id: string | number;
  label: string;
  meta?: string;
  group?: string;
};

type Props = {
  items: FilterListItem[];
  selectedIds: Set<string | number>;
  onToggle: (id: string | number) => void;
  searchPlaceholder?: string;
  emptyLabel?: string;
  emptySearchLabel?: string;
  maxHeight?: number;
  showSelectVisible?: boolean;
  onSelectVisible?: (ids: Array<string | number>) => void;
  onClearVisible?: (ids: Array<string | number>) => void;
};

export default function FilterSearchableList({
  items,
  selectedIds,
  onToggle,
  searchPlaceholder = 'Ara…',
  emptyLabel = 'Seçenek yok.',
  emptySearchLabel = 'Aramanızla eşleşen sonuç yok.',
  maxHeight = 340,
  showSelectVisible = true,
  onSelectVisible,
  onClearVisible,
}: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLocaleLowerCase('tr').includes(q) ||
        (item.meta || '').toLocaleLowerCase('tr').includes(q) ||
        (item.group || '').toLocaleLowerCase('tr').includes(q),
    );
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, FilterListItem[]>();
    for (const item of filtered) {
      const key = item.group || '';
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [filtered]);

  const visibleIds = filtered.map((i) => i.id);
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;

  return (
    <div className="ogrenci-fsl">
      <div className="ogrenci-fsl-toolbar">
        <div className="ogrenci-fsl-search-wrap">
          <svg
            className="ogrenci-fsl-search-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            className="ogrenci-fsl-search"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={searchPlaceholder}
          />
          {query ? (
            <button
              type="button"
              className="ogrenci-fsl-search-clear"
              onClick={() => setQuery('')}
              aria-label="Aramayı temizle"
            >
              ×
            </button>
          ) : null}
        </div>
        {showSelectVisible && visibleIds.length > 0 ? (
          <div className="ogrenci-fsl-bulk">
            <button
              type="button"
              className="ogrenci-fsl-bulk-btn"
              onClick={() => onSelectVisible?.(visibleIds)}
              disabled={selectedVisibleCount === visibleIds.length}
            >
              Görünenleri seç
            </button>
            <button
              type="button"
              className="ogrenci-fsl-bulk-btn"
              onClick={() => onClearVisible?.(visibleIds)}
              disabled={selectedVisibleCount === 0}
            >
              Temizle
            </button>
          </div>
        ) : null}
      </div>

      <div className="ogrenci-fsl-meta">
        <span>
          {filtered.length} sonuç
          {query ? ` · “${query}”` : ''}
        </span>
        <span>{selectedVisibleCount} seçili</span>
      </div>

      {items.length === 0 ? (
        <p className="ogrenci-filter-empty-hint">{emptyLabel}</p>
      ) : filtered.length === 0 ? (
        <p className="ogrenci-filter-empty-hint">{emptySearchLabel}</p>
      ) : (
        <div className="ogrenci-fsl-list" style={{ maxHeight }}>
          {Array.from(grouped.entries()).map(([group, groupItems]) => (
            <div key={group || '__all'} className="ogrenci-fsl-group">
              {group ? <div className="ogrenci-fsl-group-label">{group}</div> : null}
              <ul className="ogrenci-fsl-ul">
                {groupItems.map((item) => {
                  const selected = selectedIds.has(item.id);
                  return (
                    <li key={String(item.id)}>
                      <label className={`ogrenci-fsl-row${selected ? ' selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => onToggle(item.id)}
                        />
                        <span className="ogrenci-fsl-check" aria-hidden>
                          {selected ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : null}
                        </span>
                        <span className="ogrenci-fsl-text">
                          <span className="ogrenci-fsl-label">{item.label}</span>
                          {item.meta ? <span className="ogrenci-fsl-item-meta">{item.meta}</span> : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
