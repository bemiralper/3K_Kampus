'use client';

import React from 'react';
import type { EventType, EventFilters } from '@/lib/takvim-api';

interface Props {
  eventTypes: EventType[];
  activeFilters: Set<string>;
  onToggle: (typeId: string) => void;
  filters: EventFilters;
  onFilterChange: (filters: EventFilters) => void;
  coaches?: { id: number; ad: string }[];
  classes?: { id: number; ad: string }[];
  salons?: { id: string; ad: string }[];
}

export default function CalendarFilterPanel({
  eventTypes, activeFilters, onToggle, filters, onFilterChange,
  coaches = [], classes = [], salons = [],
}: Props) {

  return (
    <>
      {/* ── Arama ── */}
      <div className="tkv-sidebar-section">
        <input
          type="text"
          className="tkv-search"
          placeholder="Etkinlik ara..."
          value={filters.search || ''}
          onChange={e => onFilterChange({ ...filters, search: e.target.value || undefined })}
        />
      </div>

      {/* ── Etkinlik Türleri ── */}
      <div className="tkv-sidebar-section">
        <div className="tkv-sidebar-title">
          <span>🏷️</span> Etkinlik Türleri
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {eventTypes.map(t => (
            <label key={t.id} className="tkv-filter-item">
              <input
                type="checkbox"
                checked={activeFilters.has(t.id)}
                onChange={() => onToggle(t.id)}
                style={{ accentColor: t.renk, width: 15, height: 15 }}
              />
              <span className="tkv-filter-dot" style={{ background: t.renk }} />
              <span style={{ flex: 1 }}>{t.ikon} {t.ad}</span>
              {t.etkinlik_sayisi !== undefined && (
                <span className="tkv-filter-count">{t.etkinlik_sayisi}</span>
              )}
            </label>
          ))}
        </div>
        <div className="tkv-filter-actions">
          <button onClick={() => eventTypes.forEach(t => { if (!activeFilters.has(t.id)) onToggle(t.id); })}>
            Tümü
          </button>
          <button onClick={() => eventTypes.forEach(t => { if (activeFilters.has(t.id)) onToggle(t.id); })}>
            Temizle
          </button>
        </div>
      </div>

      {/* ── Koç Filtresi ── */}
      <div className="tkv-sidebar-section">
        <div className="tkv-sidebar-title">
          <span>👨‍🏫</span> Koç / Öğretmen
        </div>
        <select
          className="tkv-input"
          value={filters.ogretmen_id ?? ''}
          onChange={e => onFilterChange({ ...filters, ogretmen_id: e.target.value ? Number(e.target.value) : undefined })}
        >
          <option value="">Tümü</option>
          {coaches.map(c => (
            <option key={c.id} value={c.id}>{c.ad}</option>
          ))}
        </select>
      </div>

      {/* ── Sınıf Filtresi ── */}
      <div className="tkv-sidebar-section">
        <div className="tkv-sidebar-title">
          <span>🏫</span> Sınıf
        </div>
        <select
          className="tkv-input"
          value={filters.sinif_id ?? ''}
          onChange={e => onFilterChange({ ...filters, sinif_id: e.target.value ? Number(e.target.value) : undefined })}
        >
          <option value="">Tümü</option>
          {classes.map(c => (
            <option key={c.id} value={c.id}>{c.ad}</option>
          ))}
        </select>
      </div>

      {/* ── Salon Filtresi ── */}
      <div className="tkv-sidebar-section">
        <div className="tkv-sidebar-title">
          <span>📍</span> Salon
        </div>
        <select
          className="tkv-input"
          value={filters.salon_id ?? ''}
          onChange={e => onFilterChange({ ...filters, salon_id: e.target.value || undefined })}
        >
          <option value="">Tümü</option>
          {salons.map(s => (
            <option key={s.id} value={s.id}>{s.ad}</option>
          ))}
        </select>
      </div>

      {/* ── Durum Filtresi ── */}
      <div className="tkv-sidebar-section">
        <div className="tkv-sidebar-title">
          <span>📊</span> Durum
        </div>
        <select
          className="tkv-input"
          value={filters.durum || ''}
          onChange={e => onFilterChange({ ...filters, durum: e.target.value || undefined })}
        >
          <option value="">Tümü</option>
          <option value="SCHEDULED">Planlandı</option>
          <option value="IN_PROGRESS">Devam Ediyor</option>
          <option value="COMPLETED">Tamamlandı</option>
          <option value="CANCELLED">İptal</option>
        </select>
      </div>
    </>
  );
}
