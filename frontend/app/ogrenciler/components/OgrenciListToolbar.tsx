'use client';

import React, { useEffect, useRef } from 'react';

export type StatusFilter = 'all' | 'aktif' | 'pasif';
export type SortOption = 'name_asc' | 'name_desc';

interface OgrenciListToolbarProps {
  title: string;
  subtitle?: string;
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
}

export default function OgrenciListToolbar({
  title,
  subtitle,
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
}: OgrenciListToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

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
        <div className="ogrenci-list-card-header-top">
          <div>
            <h3 className="ogrenci-list-card-title">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              {title}
            </h3>
            {subtitle && <p className="ogrenci-list-card-subtitle">{subtitle}</p>}
          </div>
        </div>

        <div className={`ogrenci-search-shell${loading ? ' is-searching' : ''}`}>
          <span className="ogrenci-search-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="search"
            className="ogrenci-search-input"
            placeholder="Ad, soyad, okul no veya TC ile ara..."
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <span className="ogrenci-search-kbd">⌘K</span>
          <div className="ogrenci-search-actions">
            {loading && (
              <span className="ogrenci-search-spinner" aria-hidden />
            )}
            {searchInput && (
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
            )}
            <button
              type="button"
              className="ogrenci-search-btn refresh"
              onClick={onRefresh}
              title="Listeyi yenile"
              aria-label="Yenile"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="ogrenci-toolbar">
        <div className="ogrenci-filter-pills">
          {pills.map((pill) => (
            <button
              key={pill.key}
              type="button"
              className={`ogrenci-filter-pill${statusFilter === pill.key ? ' active' : ''}`}
              onClick={() => onStatusFilterChange(pill.key)}
            >
              {pill.label}
              <span className="pill-count">{pill.count}</span>
            </button>
          ))}
        </div>
        <div className="ogrenci-toolbar-right">
          {selectedCount > 0 && onExportSelected && (
            <button type="button" className="ogrenci-toolbar-btn" onClick={onExportSelected}>
              Seçilileri Aktar ({selectedCount})
            </button>
          )}
          {onOpenFilters && (
            <button type="button" className="ogrenci-toolbar-btn" onClick={onOpenFilters}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filtreler
              {advancedFilterCount > 0 && (
                <span className="ogrenci-toolbar-badge">{advancedFilterCount}</span>
              )}
            </button>
          )}
          {onOpenExport && (
            <button type="button" className="ogrenci-toolbar-btn primary" onClick={onOpenExport}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Dışa Aktar
            </button>
          )}
          <select
            className="ogrenci-sort-select"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            aria-label="Sıralama"
          >
            <option value="name_asc">Ad (A → Z)</option>
            <option value="name_desc">Ad (Z → A)</option>
          </select>
        </div>
      </div>

      <div className="ogrenci-results-meta">
        <div className="ogrenci-results-meta-left">
          <span>
            <span className="ogrenci-results-count">{displayedCount}</span>
            {' '}sonuç
            {displayedCount !== totalFetched && (
              <span> · {totalFetched} kayıttan filtrelendi</span>
            )}
          </span>
          {searchInput.trim() && (
            <span className="ogrenci-search-tag">
              &quot;{searchInput.trim()}&quot;
              <button type="button" onClick={onSearchClear} aria-label="Arama etiketini kaldır">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          )}
        </div>
        {hasActiveFilters && (
          <button type="button" className="ogrenci-clear-filters" onClick={onClearFilters}>
            Filtreleri temizle
          </button>
        )}
      </div>

      {activeFilterChips.length > 0 && (
        <div className="ogrenci-active-filters">
          {activeFilterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="ogrenci-filter-chip"
              onClick={() => onRemoveFilter?.(chip.key)}
              aria-label={`${chip.label} filtresini kaldır`}
            >
              <span>{chip.label}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
