'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  fetchAtamalar, updateAtama, fetchGorevDashboardOzet, fetchGorevFilterOptions,
  ONCELIK_LABELS, DURUM_LABELS, YAPILMA_LABELS, formatGorevTarih,
  type GorevAtama, type GorevDurum, type GorevOncelik, type GorevFilterAssignee,
} from '@/lib/gorev-api';
import GorevDetailDrawer from './GorevDetailDrawer';
import GorevAdminDetailDrawer from './GorevAdminDetailDrawer';

type Tab = 'bugun' | 'geciken' | 'tumu';

type Props = {
  basePath?: string;
  takvimHref?: string;
  showCreateLink?: boolean;
  createHref?: string;
  adminView?: boolean;
};

function adminDurumClass(durum: GorevDurum, gecikti: boolean): string {
  if (durum === 'TAMAMLANDI') return 'gorev-admin-durum--done';
  if (durum === 'TAMAMLANMADI') return 'gorev-admin-durum--failed';
  if (durum === 'IPTAL') return 'gorev-admin-durum--cancel';
  if (gecikti) return 'gorev-admin-durum--late';
  return 'gorev-admin-durum--pending';
}

const DURUM_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tüm durumlar' },
  { value: 'BEKLIYOR', label: 'Bekliyor' },
  { value: 'BASLADI', label: 'Devam ediyor' },
  { value: 'DEVAM_EDIYOR', label: 'Devam ediyor' },
  { value: 'TAMAMLANDI', label: 'Yapıldı' },
  { value: 'TAMAMLANMADI', label: 'Yapılmadı' },
  { value: 'IPTAL', label: 'İptal' },
];

const ONCELIK_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tüm öncelikler' },
  ...(Object.keys(ONCELIK_LABELS) as GorevOncelik[]).map(k => ({
    value: k,
    label: ONCELIK_LABELS[k],
  })),
];

export default function GorevListClient({
  basePath = '',
  takvimHref,
  showCreateLink = false,
  createHref = '/admin/gorevler/yeni',
  adminView = false,
}: Props) {
  const [tab, setTab] = useState<Tab>('bugun');
  const [atamalar, setAtamalar] = useState<GorevAtama[]>([]);
  const [ozet, setOzet] = useState<{ bugun: number; geciken: number; bekleyen: number; tamamlanan?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GorevAtama | null>(null);

  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [coachFilter, setCoachFilter] = useState('');
  const [durumFilter, setDurumFilter] = useState('');
  const [oncelikFilter, setOncelikFilter] = useState('');
  const [assignees, setAssignees] = useState<GorevFilterAssignee[]>([]);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayEnd = useMemo(() => {
    const d = new Date(todayStart);
    d.setDate(d.getDate() + 1);
    return d;
  }, [todayStart]);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!adminView) return;
    fetchGorevFilterOptions().then(res => {
      if (res.success && res.data) setAssignees(res.data);
    });
  }, [adminView]);

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (tab === 'geciken') params.geciken = 'true';
    if (tab === 'bugun') {
      params.baslangic = todayStart.toISOString();
      params.bitis = todayEnd.toISOString();
    }
    if (adminView) {
      params.tum = 'true';
      if (searchDebounced) params.search = searchDebounced;
      if (coachFilter) params.user_id = coachFilter;
      if (durumFilter) params.durum = durumFilter;
      if (oncelikFilter) params.oncelik = oncelikFilter;
    }
    const [listRes, ozetRes] = await Promise.all([
      fetchAtamalar(params),
      fetchGorevDashboardOzet(),
    ]);
    if (listRes.success && listRes.data) setAtamalar(listRes.data);
    if (ozetRes.success && ozetRes.data) setOzet(ozetRes.data);
    setLoading(false);
  }, [tab, adminView, searchDebounced, coachFilter, durumFilter, oncelikFilter, todayStart, todayEnd]);

  useEffect(() => { load(); }, [load]);

  const filtered = atamalar.filter(a => {
    if (!adminView && tab === 'bugun' && a.gorev) {
      const d = new Date(a.gorev.son_tarih);
      return d >= todayStart && d < todayEnd;
    }
    return true;
  });

  const hasActiveFilters = Boolean(search || coachFilter || durumFilter || oncelikFilter);

  const clearFilters = () => {
    setSearch('');
    setCoachFilter('');
    setDurumFilter('');
    setOncelikFilter('');
  };

  const handleCoachClick = (atama: GorevAtama) => {
    setSelected(atama);
    if (!atama.ilk_acilma_at) updateAtama(atama.id, {});
  };

  return (
    <div className={`gorev-page${adminView ? ' gorev-page--admin' : ''}`}>
      {ozet && (
        <div className={`gorev-stats${adminView ? ' gorev-stats--admin' : ''}`}>
          <div className="gorev-stat gorev-stat--primary">
            <span className="gorev-stat-icon">📅</span>
            <span className="gorev-stat-value">{ozet.bugun}</span>
            <span className="gorev-stat-label">Bugün</span>
          </div>
          <div className="gorev-stat gorev-stat-danger">
            <span className="gorev-stat-icon">⏰</span>
            <span className="gorev-stat-value">{ozet.geciken}</span>
            <span className="gorev-stat-label">Geciken</span>
          </div>
          <div className="gorev-stat">
            <span className="gorev-stat-icon">📋</span>
            <span className="gorev-stat-value">{ozet.bekleyen}</span>
            <span className="gorev-stat-label">Bekleyen</span>
          </div>
          {adminView && ozet.tamamlanan != null && (
            <div className="gorev-stat gorev-stat--success">
              <span className="gorev-stat-icon">✅</span>
              <span className="gorev-stat-value">{ozet.tamamlanan}</span>
              <span className="gorev-stat-label">Tamamlanan</span>
            </div>
          )}
        </div>
      )}

      <div className="gorev-toolbar">
        <div className="gorev-tabs">
          {(['bugun', 'geciken', 'tumu'] as Tab[]).map(t => (
            <button
              key={t}
              type="button"
              className={`gorev-tab${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'bugun' ? 'Bugün' : t === 'geciken' ? 'Geciken' : 'Tümü'}
            </button>
          ))}
        </div>
        <div className="gorev-toolbar-actions">
          {showCreateLink && (
            <Link href={createHref} className="gorev-btn gorev-btn-primary">
              + Yeni Görev
            </Link>
          )}
          {showCreateLink && (
            <Link href="/admin/gorevler/analitik" className="gorev-btn gorev-btn-ghost">
              Analitik
            </Link>
          )}
          <Link href={takvimHref || `${basePath}/takvim`} className="gorev-btn gorev-btn-ghost">
            Takvim
          </Link>
        </div>
      </div>

      {adminView && (
        <div className="gorev-admin-filters">
          <div className="gorev-admin-filters-row">
            <label className="gorev-filter-field gorev-filter-field--search">
              <span className="gorev-filter-label">Görev ara</span>
              <input
                type="search"
                placeholder="Başlık veya açıklama…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </label>
            <label className="gorev-filter-field">
              <span className="gorev-filter-label">Koç / Atanan</span>
              <select value={coachFilter} onChange={e => setCoachFilter(e.target.value)}>
                <option value="">Tümü</option>
                {assignees.map(a => (
                  <option key={a.user_id} value={String(a.user_id)}>{a.ad}</option>
                ))}
              </select>
            </label>
            <label className="gorev-filter-field">
              <span className="gorev-filter-label">Durum</span>
              <select value={durumFilter} onChange={e => setDurumFilter(e.target.value)}>
                {DURUM_FILTER_OPTIONS.map(o => (
                  <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="gorev-filter-field">
              <span className="gorev-filter-label">Öncelik</span>
              <select value={oncelikFilter} onChange={e => setOncelikFilter(e.target.value)}>
                {ONCELIK_FILTER_OPTIONS.map(o => (
                  <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            {hasActiveFilters && (
              <button type="button" className="gorev-btn gorev-btn-ghost gorev-filter-clear" onClick={clearFilters}>
                Filtreleri temizle
              </button>
            )}
          </div>
          <p className="gorev-admin-result-count">
            {loading ? 'Yükleniyor…' : `${filtered.length} görev listeleniyor`}
          </p>
        </div>
      )}

      {loading ? (
        <div className="gorev-skeleton-list">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="gorev-skeleton-row" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="gorev-empty-state">
          <span className="gorev-empty-icon">📭</span>
          <p>Görev bulunamadı.</p>
          {hasActiveFilters && (
            <button type="button" className="gorev-btn gorev-btn-ghost" onClick={clearFilters}>
              Filtreleri temizle
            </button>
          )}
        </div>
      ) : adminView ? (
        <div className="gorev-admin-list">
          {filtered.map(atama => {
            const g = atama.gorev!;
            const tip = g.gorev_tipi;
            return (
              <button
                key={atama.id}
                type="button"
                className={`gorev-admin-card${atama.gecikti_mi ? ' gorev-admin-card--late' : ''}`}
                onClick={() => setSelected(atama)}
              >
                <div
                  className="gorev-admin-card-accent"
                  style={{ background: g.renk || tip?.renk || '#3b82f6' }}
                />
                <div className="gorev-admin-card-icon">{tip?.ikon || '📋'}</div>
                <div className="gorev-admin-card-body">
                  <strong className="gorev-admin-card-title">{g.baslik}</strong>
                  <span className="gorev-admin-card-meta">
                    {tip?.ad} · {formatGorevTarih(g.son_tarih, g.tum_gun)}
                  </span>
                  <span className="gorev-admin-card-assignee">
                    {atama.atanan_ad || `Kullanıcı #${atama.atanan_user_id}`}
                  </span>
                </div>
                <div className="gorev-admin-card-badges">
                  <span className={`gorev-badge gorev-badge-${g.oncelik.toLowerCase()}`}>
                    {ONCELIK_LABELS[g.oncelik]}
                  </span>
                  <span className={`gorev-admin-durum ${adminDurumClass(atama.durum, atama.gecikti_mi)}`}>
                    {YAPILMA_LABELS[atama.durum]}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <ul className="gorev-list">
          {filtered.map(atama => {
            const g = atama.gorev!;
            const tip = g.gorev_tipi;
            return (
              <li key={atama.id}>
                <button
                  type="button"
                  className={`gorev-card${atama.gecikti_mi ? ' gorev-card-late' : ''}`}
                  onClick={() => handleCoachClick(atama)}
                >
                  <span className="gorev-card-icon" style={{ background: g.renk || tip?.renk }}>
                    {tip?.ikon || '📋'}
                  </span>
                  <div className="gorev-card-body">
                    <strong>{g.baslik}</strong>
                    <span className="gorev-card-meta">
                      {tip?.ad} · {formatGorevTarih(g.son_tarih, g.tum_gun)}
                    </span>
                  </div>
                  <div className="gorev-card-badges">
                    <span className={`gorev-badge gorev-badge-${g.oncelik.toLowerCase()}`}>
                      {ONCELIK_LABELS[g.oncelik]}
                    </span>
                    <span className="gorev-badge gorev-badge-durum">
                      {DURUM_LABELS[atama.durum]}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && selected.gorev && adminView && (
        <GorevAdminDetailDrawer
          atama={selected}
          onClose={() => setSelected(null)}
          onUpdated={load}
        />
      )}

      {selected && selected.gorev && !adminView && (
        <GorevDetailDrawer
          atama={selected}
          onClose={() => setSelected(null)}
          onUpdated={load}
        />
      )}
    </div>
  );
}
