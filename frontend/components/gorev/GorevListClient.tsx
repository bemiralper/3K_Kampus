'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  fetchAtamalar, updateAtama, fetchGorevDashboardOzet, fetchGorevFilterOptions, deleteGorevler,
  ONCELIK_LABELS, isBilgilendirme, formatGorevTarih,
  type GorevAtama, type GorevOncelik, type GorevFilterAssignee,
} from '@/lib/gorev-api';
import YoklamaFollowupPanel from './YoklamaFollowupPanel';

type Tab = 'bugun' | 'geciken' | 'tumu' | 'yoklama';

type Props = {
  basePath?: string;
  takvimHref?: string;
  showCreateLink?: boolean;
  createHref?: string;
  adminView?: boolean;
};

type AdminGorevRow = {
  id: string;
  gorev: NonNullable<GorevAtama['gorev']>;
  atamalar: GorevAtama[];
};

function groupAdminGorevler(items: GorevAtama[]): AdminGorevRow[] {
  const rows = new Map<string, AdminGorevRow>();
  for (const atama of items) {
    const gorev = atama.gorev;
    if (!gorev?.id) continue;
    const existing = rows.get(gorev.id);
    if (existing) existing.atamalar.push(atama);
    else rows.set(gorev.id, { id: gorev.id, gorev, atamalar: [atama] });
  }
  return [...rows.values()];
}

function byCreatedDesc(a: GorevAtama, b: GorevAtama): number {
  const ta = a.gorev?.created_at || '';
  const tb = b.gorev?.created_at || '';
  if (ta !== tb) return tb.localeCompare(ta);
  return b.id.localeCompare(a.id);
}

function listStatus(rows: GorevAtama[], bilgi: boolean): { text: string; cls: string } {
  if (bilgi) {
    const seen = rows.filter(item => item.ilk_acilma_at).length;
    if (seen === rows.length) return { text: 'Görüldü', cls: 'gorev-admin-durum--done' };
    if (seen === 0) return { text: 'Görülmedi', cls: 'gorev-admin-durum--pending' };
    return { text: `${seen}/${rows.length} görüldü`, cls: 'gorev-admin-durum--pending' };
  }
  if (rows.every(item => item.durum === 'IPTAL')) return { text: 'İptal', cls: 'gorev-admin-durum--cancel' };
  const done = rows.filter(item => item.durum === 'TAMAMLANDI').length;
  const failed = rows.filter(item => item.durum === 'TAMAMLANMADI').length;
  if (done === rows.length) return { text: 'Tamamlandı', cls: 'gorev-admin-durum--done' };
  if (failed === rows.length) return { text: 'Tamamlanamadı', cls: 'gorev-admin-durum--failed' };
  if (done === 0 && failed === 0) return { text: 'Bekliyor', cls: 'gorev-admin-durum--pending' };
  if (done > 0) return { text: `${done}/${rows.length} tamamlandı`, cls: 'gorev-admin-durum--pending' };
  return { text: `${failed}/${rows.length} tamamlanamadı`, cls: 'gorev-admin-durum--failed' };
}

function assigneeSummary(rows: GorevAtama[], bilgi = false): string {
  if (rows.length === 1) return rows[0].atanan_ad || `Kullanıcı #${rows[0].atanan_user_id}`;
  if (bilgi) {
    const seen = rows.filter(item => item.ilk_acilma_at).length;
    return `${rows.length} kişi · ${seen} görüldü`;
  }
  const done = rows.filter(item => item.durum === 'TAMAMLANDI').length;
  const failed = rows.filter(item => item.durum === 'TAMAMLANMADI').length;
  const cancelled = rows.filter(item => item.durum === 'IPTAL').length;
  const waiting = rows.length - done - failed - cancelled;
  const parts = [`${rows.length} kişi`];
  if (done) parts.push(`${done} yapıldı`);
  if (failed) parts.push(`${failed} yapılmadı`);
  if (waiting) parts.push(`${waiting} bekliyor`);
  if (cancelled) parts.push(`${cancelled} iptal`);
  return parts.join(' · ');
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
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return adminView ? 'tumu' : 'bugun';
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (requested === 'yoklama') return 'yoklama';
    if (requested === 'tumu' || requested === 'geciken' || requested === 'bugun') return requested;
    return adminView ? 'tumu' : 'bugun';
  });
  const [yoklamaDate, setYoklamaDate] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('date') || '';
  });
  const [atamalar, setAtamalar] = useState<GorevAtama[]>([]);
  const [ozet, setOzet] = useState<{ bugun: number; geciken: number; bekleyen: number; tamamlanan?: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [coachFilter, setCoachFilter] = useState('');
  const [durumFilter, setDurumFilter] = useState('');
  const [oncelikFilter, setOncelikFilter] = useState('');
  const [assignees, setAssignees] = useState<GorevFilterAssignee[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const selectAllRef = React.useRef<HTMLInputElement>(null);

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

  const selectTab = (next: Tab) => {
    setTab(next);
    if (adminView || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (next === 'yoklama') url.searchParams.set('tab', 'yoklama');
    else url.searchParams.delete('tab');
    window.history.replaceState({}, '', url);
  };

  const handleYoklamaDate = (next: string) => {
    setYoklamaDate(next);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'yoklama');
    if (next) url.searchParams.set('date', next);
    window.history.replaceState({}, '', url);
  };

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
      params.bugun = 'true';
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
    setSelected(new Set());
    setLoading(false);
  }, [tab, adminView, searchDebounced, coachFilter, durumFilter, oncelikFilter, todayStart, todayEnd]);

  useEffect(() => { load(); }, [load]);

  const filtered = atamalar.filter(a => {
    if (!adminView && tab === 'bugun' && a.gorev) {
      const due = new Date(a.gorev.son_tarih);
      const created = a.gorev.created_at ? new Date(a.gorev.created_at) : null;
      const dueToday = due >= todayStart && due < todayEnd;
      const createdToday = Boolean(created && created >= todayStart && created < todayEnd);
      return dueToday || createdToday;
    }
    return true;
  }).sort(byCreatedDesc);

  const adminRows = useMemo(
    () => (adminView ? groupAdminGorevler(filtered) : []),
    [adminView, filtered],
  );
  const listedCount = adminView ? adminRows.length : filtered.length;
  const allSelected = adminRows.length > 0 && adminRows.every(row => selected.has(row.id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selected.size > 0 && !allSelected;
    }
  }, [selected, allSelected]);

  const toggleRow = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(adminRows.map(row => row.id)));
  };

  const deleteSelected = async () => {
    const ids = [...selected];
    if (!ids.length || deleting) return;
    if (!confirm(`${ids.length} görev silinsin mi? Atanan kişilerin kayıtları da kalkar.`)) return;
    setDeleting(true);
    const res = await deleteGorevler(ids);
    setDeleting(false);
    if (!res.success) {
      alert(res.error || 'Görevler silinemedi.');
      return;
    }
    await load();
  };

  const hasActiveFilters = Boolean(search || coachFilter || durumFilter || oncelikFilter);

  const clearFilters = () => {
    setSearch('');
    setCoachFilter('');
    setDurumFilter('');
    setOncelikFilter('');
  };

  const openTask = (atama: GorevAtama) => {
    if (!atama.gorev?.id) return;
    if (!adminView && !atama.ilk_acilma_at) void updateAtama(atama.id, {});
    router.push(`${basePath}/${atama.gorev.id}`);
  };

  const headerActions = (
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
  );

  return (
    <div className={`gorev-page${adminView ? ' gorev-page--admin' : ' gorev-page--coach'}`}>
      {adminView && (
        <header className="gorev-admin-header">
          <div className="gorev-admin-header-copy">
            <h1>Görev Yönetimi</h1>
            <p>Kurum genelinde görevleri takip edin, filtreleyin ve yönetin.</p>
          </div>
          {headerActions}
        </header>
      )}
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
          {(adminView ? (['bugun', 'geciken', 'tumu'] as Tab[]) : (['bugun', 'geciken', 'yoklama', 'tumu'] as Tab[])).map(t => (
            <button
              key={t}
              type="button"
              className={`gorev-tab${tab === t ? ' active' : ''}`}
              onClick={() => selectTab(t)}
            >
              {t === 'bugun' ? 'Bugün' : t === 'geciken' ? 'Geciken' : t === 'yoklama' ? 'Yoklama' : 'Tümü'}
            </button>
          ))}
        </div>
        {adminView ? null : headerActions}
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
            {loading ? 'Yükleniyor…' : `${listedCount} görev listeleniyor`}
          </p>
        </div>
      )}

      {!adminView && tab === 'yoklama' ? (
        <YoklamaFollowupPanel
          initialDate={yoklamaDate}
          onDateChange={handleYoklamaDate}
        />
      ) : loading ? (
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
          <div className="gorev-bulk-bar">
            <label className="gorev-bulk-all">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Listedeki görevlerin tümünü seç"
              />
              <span>{selected.size ? `${selected.size} görev seçili` : 'Tümünü seç'}</span>
            </label>
            <button
              type="button"
              className="gorev-btn gorev-btn-danger"
              disabled={!selected.size || deleting}
              onClick={() => void deleteSelected()}
            >
              {deleting ? 'Siliniyor…' : 'Seçilenleri sil'}
            </button>
          </div>
          {adminRows.map(row => {
            const g = row.gorev;
            const tip = g.gorev_tipi;
            const bilgi = isBilgilendirme(tip);
            const late = !bilgi && row.atamalar.some(item => item.gecikti_mi && item.durum !== 'TAMAMLANDI');
            const status = listStatus(row.atamalar, bilgi);
            return (
              <div
                key={row.id}
                className={`gorev-admin-card${late ? ' gorev-admin-card--late' : ''}${selected.has(row.id) ? ' gorev-admin-card--selected' : ''}`}
              >
                <label className="gorev-admin-check">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    aria-label={`${g.baslik} görevini seç`}
                    onChange={() => toggleRow(row.id)}
                  />
                </label>
                <button type="button" className="gorev-admin-card-open" onClick={() => openTask(row.atamalar[0])}>
                  <div
                    className="gorev-admin-card-accent"
                    style={{ background: g.renk || tip?.renk || '#3b82f6' }}
                  />
                  <div className="gorev-admin-card-icon">{tip?.ikon || '📋'}</div>
                  <div className="gorev-admin-card-body">
                    <strong className="gorev-admin-card-title">{g.baslik}</strong>
                    <span className="gorev-admin-card-meta">
                      {bilgi ? 'Bilgilendirme' : `Görev${tip?.ad ? ` · ${tip.ad}` : ''}`}
                      {' · '}
                      {formatGorevTarih(g.son_tarih, g.tum_gun)}
                    </span>
                    <span className="gorev-admin-card-assignee">{assigneeSummary(row.atamalar, bilgi)}</span>
                  </div>
                  <div className="gorev-admin-card-badges">
                    <span className={`gorev-kind ${bilgi ? 'gorev-kind--info' : 'gorev-kind--task'}`}>
                      {bilgi ? 'Bilgilendirme' : 'Görev'}
                    </span>
                    <span className={`gorev-badge gorev-badge-${g.oncelik.toLowerCase()}`}>
                      {ONCELIK_LABELS[g.oncelik]}
                    </span>
                    <span className={`gorev-admin-durum ${status.cls}`}>{status.text}</span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <ul className="gorev-list">
          {filtered.map(atama => {
            const g = atama.gorev!;
            const tip = g.gorev_tipi;
            const bilgi = isBilgilendirme(tip);
            const status = listStatus([atama], bilgi);
            return (
              <li key={atama.id}>
                <button
                  type="button"
                  className={`gorev-card gorev-card--coach${atama.gecikti_mi ? ' gorev-card-late' : ''}`}
                  onClick={() => openTask(atama)}
                >
                  <span className="gorev-card-icon" style={{ background: g.renk || tip?.renk }}>
                    {tip?.ikon || '📋'}
                  </span>
                  <div className="gorev-card-body">
                    <div className="gorev-card-title-row">
                      <strong>{g.baslik}</strong>
                      <span className="gorev-card-badges">
                        <span className={`gorev-kind ${bilgi ? 'gorev-kind--info' : 'gorev-kind--task'}`}>
                          {bilgi ? 'Bilgilendirme' : 'Görev'}
                        </span>
                        <span className={`gorev-badge gorev-badge-${g.oncelik.toLowerCase()}`}>
                          {ONCELIK_LABELS[g.oncelik]}
                        </span>
                        <span className={`gorev-admin-durum ${status.cls}`}>{status.text}</span>
                      </span>
                    </div>
                    <span className="gorev-card-meta">
                      {bilgi ? 'Bilgilendirme' : (tip?.ad || 'Görev')}
                      {' · '}
                      {formatGorevTarih(g.son_tarih, g.tum_gun)}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

    </div>
  );
}
