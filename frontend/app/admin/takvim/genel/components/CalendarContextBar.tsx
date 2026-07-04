'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useKurum, type Sube, type EgitimYili } from '@/lib/contexts/KurumContext';
import { apiGet } from '@/lib/api';

/* ════════════════════════════════════════════
   DÖNEM TİPİ
   ════════════════════════════════════════════ */

interface Term {
  id: number;
  name: string;
  code: string;
  term_type: string;
  term_type_display: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  egitim_yili: { id: number; display: string };
}

/* ════════════════════════════════════════════
   DROPDOWN BİLEŞENİ
   ════════════════════════════════════════════ */

interface DropdownProps<T> {
  label: string;
  icon: string;
  items: T[];
  value: T | null;
  getKey: (item: T) => string | number;
  getLabel: (item: T) => string;
  onChange: (item: T) => void;
  disabled?: boolean;
  allLabel?: string;
  onSelectAll?: () => void;
}

function ContextDropdown<T>({
  label, icon, items, value, getKey, getLabel, onChange, disabled, allLabel, onSelectAll,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="tkv-ctx-dropdown" style={{ position: 'relative' }}>
      <button
        className="tkv-ctx-btn"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        type="button"
      >
        <span className="tkv-ctx-icon">{icon}</span>
        <span className="tkv-ctx-label">{label}:</span>
        <span className="tkv-ctx-value">
          {value ? getLabel(value) : (allLabel || 'Tümü')}
        </span>
        <span className="tkv-ctx-chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="tkv-ctx-menu">
          {allLabel && onSelectAll && (
            <button
              className={`tkv-ctx-item ${!value ? 'active' : ''}`}
              onClick={() => { onSelectAll(); setOpen(false); }}
              type="button"
            >
              {allLabel}
            </button>
          )}
          {(items || []).map(item => (
            <button
              key={getKey(item)}
              className={`tkv-ctx-item ${value && getKey(value) === getKey(item) ? 'active' : ''}`}
              onClick={() => { onChange(item); setOpen(false); }}
              type="button"
            >
              {getLabel(item)}
            </button>
          ))}
          {(!items || items.length === 0) && (
            <div className="tkv-ctx-item disabled">Veri bulunamadı</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   CALENDAR CONTEXT BAR
   ════════════════════════════════════════════ */

interface CalendarContextBarProps {
  selectedDonemId: number | null;
  onDonemChange: (donemId: number | null) => void;
}

export default function CalendarContextBar({
  selectedDonemId,
  onDonemChange,
}: CalendarContextBarProps) {
  const {
    activeSube,
    activeEgitimYili,
    filteredSubeler,
    filteredEgitimYillari,
    setActiveSube,
    setActiveEgitimYili,
  } = useKurum();

  const [donemler, setDonemler] = useState<Term[]>([]);
  const [selectedDonem, setSelectedDonem] = useState<Term | null>(null);
  const [loadingDonem, setLoadingDonem] = useState(false);

  // Stale closure sorununu önlemek için ref'ler
  const onDonemChangeRef = useRef(onDonemChange);
  onDonemChangeRef.current = onDonemChange;

  // ── Dönem listesini çek ──
  const fetchDonemler = useCallback(async () => {
    // sube ve egitim_yili gerekli
    if (!activeSube || !activeEgitimYili) {
      setDonemler([]);
      setSelectedDonem(null);
      onDonemChangeRef.current(null);
      return;
    }

    setLoadingDonem(true);
    try {
      // Backend { success: true, terms: [...] } döndürüyor
      const res = await apiGet<{ terms?: Term[] }>('/api/terms/');
      const termList: Term[] = (res.success && res.data)
        ? (Array.isArray(res.data) ? res.data : (res.data as { terms?: Term[] }).terms || [])
        : [];
      if (termList.length >= 0) {
        setDonemler(termList);
        // localStorage'dan kayıtlı dönem ID'sini oku
        const storedId = typeof window !== 'undefined'
          ? parseInt(localStorage.getItem('3k_active_donem') || '', 10) || null
          : null;

        if (storedId) {
          const found = termList.find(d => d.id === storedId);
          if (found) {
            setSelectedDonem(found);
            onDonemChangeRef.current(found.id);
          } else {
            // Kayıtlı dönem bu listede yok — temizle
            localStorage.removeItem('3k_active_donem');
            onDonemChangeRef.current(null);
          }
        } else {
          // Hiç seçim yoksa aktif dönemi otomatik seç
          const active = termList.find(d => d.is_active);
          if (active) {
            setSelectedDonem(active);
            onDonemChangeRef.current(active.id);
            localStorage.setItem('3k_active_donem', active.id.toString());
          }
        }
      }
    } catch {
      /* */
    }
    setLoadingDonem(false);
  }, [activeSube, activeEgitimYili]);

  useEffect(() => {
    fetchDonemler();
  }, [fetchDonemler]);

  // ── Şube değişim (sadece local, reload tetiklemez) ──
  const handleSubeChange = useCallback((sube: Sube) => {
    // KurumContext.setActiveSube zaten localStorage + reload yapıyor
    setActiveSube(sube);
  }, [setActiveSube]);

  // ── Eğitim yılı değişim ──
  const handleEgitimYiliChange = useCallback((yil: EgitimYili) => {
    setActiveEgitimYili(yil);
  }, [setActiveEgitimYili]);

  // ── Dönem değişim (localStorage'a kaydet) ──
  const handleDonemChange = useCallback((donem: Term) => {
    setSelectedDonem(donem);
    onDonemChange(donem.id);
    localStorage.setItem('3k_active_donem', donem.id.toString());
  }, [onDonemChange]);

  const handleDonemAll = useCallback(() => {
    setSelectedDonem(null);
    onDonemChange(null);
    localStorage.removeItem('3k_active_donem');
  }, [onDonemChange]);

  return (
    <div className="tkv-context-bar">
      {/* Şube */}
      <ContextDropdown<Sube>
        label="Şube"
        icon="🏫"
        items={filteredSubeler}
        value={activeSube}
        getKey={s => s.id}
        getLabel={s => s.ad}
        onChange={handleSubeChange}
      />

      {/* Eğitim Yılı */}
      <ContextDropdown<EgitimYili>
        label="Eğitim Yılı"
        icon="📅"
        items={filteredEgitimYillari}
        value={activeEgitimYili}
        getKey={y => y.id}
        getLabel={y => `${y.baslangic_yil}-${y.bitis_yil}`}
        onChange={handleEgitimYiliChange}
      />

      {/* Dönem */}
      <ContextDropdown<Term>
        label="Dönem"
        icon="📆"
        items={donemler}
        value={selectedDonem}
        getKey={d => d.id}
        getLabel={d => d.name}
        onChange={handleDonemChange}
        disabled={loadingDonem}
        allLabel="Tüm Dönemler"
        onSelectAll={handleDonemAll}
      />
    </div>
  );
}
