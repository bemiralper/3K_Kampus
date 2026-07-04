'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

export type SelectedPersonel = {
  userId: number;
  tamAd: string;
  subeAd?: string;
};

type PersonelSearchHit = {
  id: number;
  tam_ad: string;
  sube_ad?: string;
  has_user_account?: boolean;
  user_id?: number | null;
  aktif_mi?: boolean;
};

type Props = {
  value: SelectedPersonel[];
  onChange: (selected: SelectedPersonel[]) => void;
  placeholder?: string;
};

function getContextHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof window === 'undefined') return headers;

  const read = (key: string) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'number') return String(parsed);
      if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
      if (parsed && typeof parsed === 'object' && parsed.id != null) return String(parsed.id);
    } catch {
      if (raw.trim()) return raw.trim();
    }
    return null;
  };

  const kurumId = read('3k_active_kurum');
  const subeId = read('3k_active_sube');
  const eyId = read('3k_active_egitim_yili');
  if (kurumId) headers['X-Kurum-ID'] = kurumId;
  if (subeId) headers['X-Sube-ID'] = subeId;
  if (eyId) headers['X-EgitimYili-ID'] = eyId;
  return headers;
}

export default function PersonelUserPicker({ value, onChange, placeholder }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonelSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedIds = new Set(value.map(v => v.userId));

  const search = useCallback(async (text: string) => {
    const q = text.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const res = await fetch(`/api/personel/api/list?q=${encodeURIComponent(q)}`, {
        credentials: 'include',
        headers: getContextHeaders(),
        signal: controller.signal,
      });
      if (!res.ok) {
        setResults([]);
        return;
      }
      const data = await res.json();
      const hits = (data.personeller || []) as PersonelSearchHit[];
      setResults(
        hits.filter(p => p.has_user_account && p.user_id && p.aktif_mi !== false).slice(0, 12),
      );
    } catch {
      if (!controller.signal.aborted) setResults([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => search(query), 250);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const addPerson = (p: PersonelSearchHit) => {
    const userId = p.user_id;
    if (!userId || selectedIds.has(userId)) return;
    onChange([
      ...value,
      { userId, tamAd: p.tam_ad, subeAd: p.sube_ad || undefined },
    ]);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const removePerson = (userId: number) => {
    onChange(value.filter(v => v.userId !== userId));
  };

  return (
    <div className="gorev-personel-picker" ref={wrapRef}>
      {value.length > 0 && (
        <div className="gorev-personel-chips">
          {value.map(p => (
            <span key={p.userId} className="gorev-personel-chip">
              {p.tamAd}
              {p.subeAd ? ` · ${p.subeAd}` : ''}
              <button
                type="button"
                className="gorev-personel-chip-remove"
                onClick={() => removePerson(p.userId)}
                aria-label={`${p.tamAd} kaldır`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="gorev-personel-search-wrap">
        <input
          type="text"
          className="gorev-personel-search"
          value={query}
          placeholder={placeholder || 'İsim yazarak personel ara…'}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {loading && <span className="gorev-personel-search-hint">Aranıyor…</span>}
      </div>

      {open && query.trim().length >= 2 && (
        <ul className="gorev-personel-dropdown" role="listbox">
          {results.length === 0 && !loading && (
            <li className="gorev-personel-dropdown-empty">Sonuç bulunamadı</li>
          )}
          {results.map(p => {
            const disabled = !p.user_id || selectedIds.has(p.user_id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className="gorev-personel-option"
                  disabled={disabled}
                  onClick={() => addPerson(p)}
                >
                  <span className="gorev-personel-option-name">{p.tam_ad}</span>
                  {p.sube_ad && (
                    <span className="gorev-personel-option-meta">{p.sube_ad}</span>
                  )}
                  {disabled && p.user_id && (
                    <span className="gorev-personel-option-meta">Seçili</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {value.length === 0 && (
        <p className="gorev-personel-help">En az bir kişi seçin. Sistem hesabı olmayan personel listelenmez.</p>
      )}
    </div>
  );
}
