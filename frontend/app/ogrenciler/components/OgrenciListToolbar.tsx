'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import FloatingMenu from '@/components/finans/FloatingMenu';
import type { OgrenciListColumnDef, OgrenciListColumnId } from '../lib/ogrenci-list-utils';

export type StatusFilter = 'all' | 'aktif' | 'pasif';
export type SortOption = 'name_asc' | 'name_desc' | 'kayit_tarihi_desc' | 'kayit_tarihi_asc' | 'created_at_desc';

export type OgrenciColumnsApi = {
  toggleableColumns: OgrenciListColumnDef[];
  visibleColumns: OgrenciListColumnId[];
  toggleColumn: (id: OgrenciListColumnId) => void;
  resetColumns: () => void;
};

const EXTRA_COLUMN_IDS = new Set<OgrenciListColumnId>([
  'aktif_mi',
  'egitim_yili',
  'tc_kimlik_no',
  'telefon',
  'veli_ad_soyad',
  'veli_telefon',
]);

interface OgrenciListToolbarProps {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onSearchClear: () => void;
  onRefresh: () => void;
  loading: boolean;
  statusFilter: StatusFilter;
  onStatusFilterChange: (filter: StatusFilter) => void;
  counts: { all: number; aktif: number; pasif: number };
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  displayedCount: number;
  totalFetched: number;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onOpenFilters?: () => void;
  onOpenExport?: () => void;
  selectedCount?: number;
  onExportSelected?: () => void;
  advancedFilterCount?: number;
  activeFilterChips?: { key: string; label: string }[];
  onRemoveFilter?: (key: string) => void;
  rosterExport?: React.ReactNode;
  columnsApi?: OgrenciColumnsApi;
}

export default function OgrenciListToolbar({
  searchInput,
  onSearchInputChange,
  onSearchClear,
  onRefresh,
  loading,
  statusFilter,
  onStatusFilterChange,
  counts,
  sortBy,
  onSortChange,
  displayedCount,
  totalFetched,
  hasActiveFilters,
  onClearFilters,
  onOpenFilters,
  onOpenExport,
  selectedCount = 0,
  onExportSelected,
  advancedFilterCount = 0,
  activeFilterChips = [],
  onRemoveFilter,
  rosterExport,
  columnsApi,
}: OgrenciListToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const colBtnRef = useRef<HTMLButtonElement>(null);
  const [colOpen, setColOpen] = useState(false);

  const columnGroups = useMemo(() => {
    const cols = columnsApi?.toggleableColumns ?? [];
    return {
      core: cols.filter((c) => !EXTRA_COLUMN_IDS.has(c.id)),
      extra: cols.filter((c) => EXTRA_COLUMN_IDS.has(c.id)),
    };
  }, [columnsApi?.toggleableColumns]);

  const visibleToggleCount = useMemo(() => {
    if (!columnsApi) return 0;
    return columnsApi.toggleableColumns.filter((c) =>
      columnsApi.visibleColumns.includes(c.id),
    ).length;
  }, [columnsApi]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        onSearchClear();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSearchClear]);

  const pills: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: 'Tümü', count: counts.all },
    { key: 'aktif', label: 'Aktif', count: counts.aktif },
    { key: 'pasif', label: 'Pasif', count: counts.pasif },
  ];

  return (
    <>
      <div className="ogrenci-list-card-header">
        <div className={`ogrenci-search-shell${loading ? ' is-searching' : ''}`}>
          <span className="ogrenci-search-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            className="ogrenci-search-input"
            placeholder="Ad, soyad, okul no veya TC ile ara"
            aria-label="Öğrenci ara"
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <div className="ogrenci-search-actions">
            {loading && (
              <span className="ogrenci-search-spinner" aria-hidden />
            )}
            {searchInput ? (
              <button
                type="button"
                className="ogrenci-search-btn clear"
                onClick={onSearchClear}
                title="Aramayı temizle (Esc)"
                aria-label="Aramayı temizle"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            ) : (
              <span className="ogrenci-search-kbd" aria-hidden>⌘K</span>
            )}
          </div>
        </div>

        <div className="ogrenci-filter-pills" role="tablist" aria-label="Durum">
          {pills.map((pill) => (
            <button
              key={pill.key}
              type="button"
              role="tab"
              aria-selected={statusFilter === pill.key}
              className={`ogrenci-filter-pill${statusFilter === pill.key ? ' active' : ''}`}
              onClick={() => onStatusFilterChange(pill.key)}
            >
              {pill.label}
              <span className="pill-count">{pill.count}</span>
            </button>
          ))}
        </div>

        <div className="ogrenci-header-tools">
          <label className="ogrenci-sort-wrap">
            <span className="ogrenci-sort-label">Sırala</span>
            <select
              className="ogrenci-sort-select"
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              aria-label="Sıralama"
            >
              <option value="created_at_desc">En yeni kayıt</option>
              <option value="kayit_tarihi_desc">Kayıt tarihi (yeni → eski)</option>
              <option value="kayit_tarihi_asc">Kayıt tarihi (eski → yeni)</option>
              <option value="name_asc">Ad (A → Z)</option>
              <option value="name_desc">Ad (Z → A)</option>
            </select>
          </label>
          <button
            type="button"
            className="ogrenci-toolbar-btn ogrenci-toolbar-btn--icon"
            onClick={onRefresh}
            title="Listeyi yenile"
            aria-label="Listeyi yenile"
            disabled={loading}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={loading ? 'is-spinning' : undefined}
              aria-hidden
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
      </div>

      <div className="ogrenci-toolbar">
        <div className="ogrenci-toolbar-left">
          {onOpenFilters && (
            <button
              type="button"
              className={`ogrenci-toolbar-btn${advancedFilterCount > 0 ? ' has-badge' : ''}`}
              onClick={onOpenFilters}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="7" y1="12" x2="17" y2="12" />
                <line x1="10" y1="18" x2="14" y2="18" />
              </svg>
              Filtreler
              {advancedFilterCount > 0 && (
                <span className="ogrenci-toolbar-badge">{advancedFilterCount}</span>
              )}
            </button>
          )}
          {columnsApi && (
            <div className="ogrenci-col-picker-wrap">
              <button
                ref={colBtnRef}
                type="button"
                className={`ogrenci-toolbar-btn${colOpen ? ' is-active' : ''}`}
                aria-expanded={colOpen}
                aria-haspopup="menu"
                onClick={() => setColOpen((v) => !v)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <line x1="9" y1="4" x2="9" y2="20" />
                  <line x1="15" y1="4" x2="15" y2="20" />
                </svg>
                Sütunlar
                <span className="ogrenci-toolbar-badge soft">{visibleToggleCount}</span>
              </button>
              <FloatingMenu
                open={colOpen}
                anchorRef={colBtnRef}
                onClose={() => setColOpen(false)}
                className="ogrenci-col-picker-menu"
                minWidth={280}
              >
                <div className="ogrenci-col-picker-head">
                  <div>
                    <strong>Tablo sütunları</strong>
                    <p>Görünür alanları seçin</p>
                  </div>
                  <span className="ogrenci-col-picker-count">
                    {visibleToggleCount}/{columnsApi.toggleableColumns.length}
                  </span>
                </div>
                <div className="ogrenci-col-picker-body">
                  <div className="ogrenci-col-picker-group">
                    <span className="ogrenci-col-picker-group-label">Temel</span>
                    {columnGroups.core.map((col) => {
                      const checked = columnsApi.visibleColumns.includes(col.id);
                      return (
                        <label
                          key={col.id}
                          className={`ogrenci-col-picker-item${checked ? ' is-on' : ''}`}
                        >
                          <span className="ogrenci-col-picker-label">{col.label}</span>
                          <span className={`ogrenci-col-switch${checked ? ' is-on' : ''}`} aria-hidden>
                            <span className="ogrenci-col-switch-knob" />
                          </span>
                          <input
                            type="checkbox"
                            className="ogrenci-col-picker-input"
                            checked={checked}
                            onChange={() => columnsApi.toggleColumn(col.id)}
                          />
                        </label>
                      );
                    })}
                  </div>
                  {columnGroups.extra.length > 0 && (
                    <div className="ogrenci-col-picker-group">
                      <span className="ogrenci-col-picker-group-label">Ek alanlar</span>
                      {columnGroups.extra.map((col) => {
                        const checked = columnsApi.visibleColumns.includes(col.id);
                        return (
                          <label
                            key={col.id}
                            className={`ogrenci-col-picker-item${checked ? ' is-on' : ''}`}
                          >
                            <span className="ogrenci-col-picker-label">{col.label}</span>
                            <span className={`ogrenci-col-switch${checked ? ' is-on' : ''}`} aria-hidden>
                              <span className="ogrenci-col-switch-knob" />
                            </span>
                            <input
                              type="checkbox"
                              className="ogrenci-col-picker-input"
                              checked={checked}
                              onChange={() => columnsApi.toggleColumn(col.id)}
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="ogrenci-col-picker-foot">
                  <button
                    type="button"
                    className="ogrenci-col-picker-reset"
                    onClick={() => columnsApi.resetColumns()}
                  >
                    Varsayılana dön
                  </button>
                </div>
              </FloatingMenu>
            </div>
          )}
          {rosterExport}
        </div>
        <div className="ogrenci-toolbar-right">
          {selectedCount > 0 && onExportSelected && (
            <button type="button" className="ogrenci-toolbar-btn is-selection" onClick={onExportSelected}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Seçilileri aktar
              <span className="ogrenci-toolbar-badge">{selectedCount}</span>
            </button>
          )}
          {onOpenExport && (
            <button type="button" className="ogrenci-toolbar-btn primary" onClick={onOpenExport}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Dışa Aktar
            </button>
          )}
        </div>
      </div>

      <div className="ogrenci-results-meta">
        <div className="ogrenci-results-meta-left">
          <span className="ogrenci-results-text" aria-live="polite">
            <span className="ogrenci-results-count">{displayedCount}</span>
            {' '}sonuç
            {displayedCount !== totalFetched && (
              <span className="ogrenci-results-sub"> · {totalFetched} kayıttan filtrelendi</span>
            )}
          </span>
          {searchInput.trim() && (
            <span className="ogrenci-filter-chip ogrenci-filter-chip--search">
              <span>&ldquo;{searchInput.trim()}&rdquo;</span>
              <button type="button" onClick={onSearchClear} aria-label="Arama etiketini kaldır">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          )}
          {activeFilterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="ogrenci-filter-chip"
              onClick={() => onRemoveFilter?.(chip.key)}
              aria-label={`${chip.label} filtresini kaldır`}
            >
              <span>{chip.label}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          ))}
        </div>
        {hasActiveFilters && (
          <button type="button" className="ogrenci-clear-filters" onClick={onClearFilters}>
            Filtreleri temizle
          </button>
        )}
      </div>
    </>
  );
}
