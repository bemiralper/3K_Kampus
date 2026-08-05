'use client';

import React from 'react';
import Link from 'next/link';
import { useOgrenciPath } from '@/components/ogrenci/OgrenciPathProvider';
import type { EgitimKalemiRow, OgrenciListColumnId } from '../lib/ogrenci-list-utils';
import { LIST_COLUMNS } from '../lib/ogrenci-list-utils';
import OgrenciBelgeMenu, { type OgrenciBelgeTipi } from './OgrenciBelgeMenu';

export type OgrenciRow = {
  id: number;
  kayit_id?: number;
  ad: string;
  soyad: string;
  tam_ad?: string;
  tc_kimlik_no: string;
  telefon?: string;
  aktif_mi: boolean;
  cinsiyet?: string;
  okul_no?: string;
  profil_foto?: string | null;
  sube_ad?: string;
  alan_ad?: string;
  sinif_id?: number;
  sinif_ad?: string;
  sinif_seviyesi?: string;
  kayit_tarihi?: string;
  giris_turu?: string;
  giris_turu_display?: string;
  egitim_yili?: string;
  egitim_kalemleri?: EgitimKalemiRow[];
  kalem_ozet?: string;
  koc_adi?: string;
  veli_ad_soyad?: string;
  veli_telefon?: string;
};

interface OgrenciListResultsProps {
  loading: boolean;
  students: OgrenciRow[];
  searchQuery: string;
  filterMode: 'yillik' | 'tum' | 'tum_yillar';
  activeEgitimYiliLabel?: string;
  getAvatarColor: (index: number) => string;
  getInitials: (ad: string, soyad: string) => string;
  onQuickInfo: (student: OgrenciRow) => void;
  onDelete: (student: OgrenciRow) => void;
  onBelge?: (student: OgrenciRow, tip: OgrenciBelgeTipi) => void;
  onClearSearch: () => void;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  onToggleSelectAll?: (ids: number[], checked: boolean) => void;
  hasKalemFilter?: boolean;
  visibleColumns: OgrenciListColumnId[];
}

function kalemChipClass(tur: string): string {
  const known = ['grup_dersi', 'ozel_ders', 'deneme', 'ek_hizmet'];
  return known.includes(tur) ? `ogrenci-kalem-chip--${tur}` : 'ogrenci-kalem-chip--default';
}

function renderKalemChips(ogrenci: OgrenciRow) {
  const kalemler = ogrenci.egitim_kalemleri || [];
  if (kalemler.length > 0) {
    return (
      <div className="ogrenci-kalem-chips">
        {kalemler.map((kalem) => (
          <span
            key={`${kalem.kalem_turu}-${kalem.kalem_id}`}
            className={`ogrenci-kalem-chip ${kalemChipClass(kalem.kalem_turu)}`}
            title={`${kalem.kalem_turu_display}: ${kalem.kalem_adi}`}
          >
            <span className="ogrenci-kalem-chip-type">{kalem.kalem_turu_display}</span>
            <span className="ogrenci-kalem-chip-name">{kalem.kalem_adi}</span>
          </span>
        ))}
      </div>
    );
  }
  if (ogrenci.kalem_ozet) {
    return <span className="ogrenci-kalem-fallback">{ogrenci.kalem_ozet}</span>;
  }
  return <span className="ogrenci-kalem-empty">—</span>;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim() || !text) return text;
  const parts = text.split(new RegExp(`(${escapeRegex(query.trim())})`, 'gi'));
  return parts.map((part, index) =>
    part.toLowerCase() === query.trim().toLowerCase() ? (
      <mark key={index} className="ogrenci-search-highlight">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function columnLabel(id: OgrenciListColumnId, hasKalemFilter: boolean): string {
  if (id === 'kalemler') return hasKalemFilter ? 'Eşleşen Kalemler' : 'Eğitim Kalemleri';
  return LIST_COLUMNS.find((c) => c.id === id)?.label || id;
}

function SkeletonRows({
  count = 6,
  colCount,
}: {
  count?: number;
  colCount: number;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="ogrenci-skeleton-row">
          <td><div className="ogrenci-skeleton line short" /></td>
          {Array.from({ length: colCount }).map((__, j) => (
            <td key={j}>
              {j === 0 ? (
                <div className="cell-with-icon">
                  <div className="ogrenci-skeleton avatar" />
                  <div style={{ flex: 1 }}>
                    <div className="ogrenci-skeleton line medium" />
                    <div className="ogrenci-skeleton line short" />
                  </div>
                </div>
              ) : (
                <div className="ogrenci-skeleton line short" />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function renderDataCell(
  colId: OgrenciListColumnId,
  ogrenci: OgrenciRow,
  ctx: {
    index: number;
    searchQuery: string;
    getAvatarColor: (index: number) => string;
    getInitials: (ad: string, soyad: string) => string;
    href: (path: string) => string;
    onQuickInfo: (student: OgrenciRow) => void;
    onDelete: (student: OgrenciRow) => void;
    onBelge?: (student: OgrenciRow, tip: OgrenciBelgeTipi) => void;
  },
) {
  switch (colId) {
    case 'student':
      return (
        <td key={colId}>
          <div className="cell-with-icon">
            {ogrenci.profil_foto ? (
              <div className="avatar-circle avatar-photo">
                <img src={ogrenci.profil_foto} alt={`${ogrenci.ad} ${ogrenci.soyad}`} />
              </div>
            ) : (
              <div className={`avatar-circle ${ctx.getAvatarColor(ctx.index)}`}>
                {ctx.getInitials(ogrenci.ad, ogrenci.soyad)}
              </div>
            )}
            <div className="cell-info">
              <div className="cell-primary-row">
                <Link href={ctx.href(String(ogrenci.id))} className="cell-primary cell-link">
                  {highlightText(`${ogrenci.ad} ${ogrenci.soyad}`, ctx.searchQuery)}
                </Link>
                <button
                  type="button"
                  className="ogrenci-quick-info-btn"
                  onClick={() => ctx.onQuickInfo(ogrenci)}
                  title="İletişim bilgileri"
                  aria-label={`${ogrenci.ad} ${ogrenci.soyad} iletişim bilgileri`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </button>
              </div>
              <span className="cell-secondary">
                {ogrenci.cinsiyet === 'E' ? 'Erkek' : ogrenci.cinsiyet === 'K' ? 'Kız' : 'Öğrenci'}
                {ogrenci.okul_no && (
                  <>
                    {' · No: '}
                    {highlightText(ogrenci.okul_no, ctx.searchQuery)}
                  </>
                )}
              </span>
            </div>
          </div>
        </td>
      );
    case 'alan':
      return (
        <td key={colId}>
          <span className="badge-modern info">{ogrenci.alan_ad || '-'}</span>
        </td>
      );
    case 'sinif_seviyesi':
      return (
        <td key={colId}>
          <span className="badge-modern purple">{ogrenci.sinif_seviyesi || '-'}</span>
        </td>
      );
    case 'kalemler':
      return (
        <td key={colId} className="ogrenci-kalem-cell">
          {renderKalemChips(ogrenci)}
        </td>
      );
    case 'kayit_tarihi':
      return (
        <td key={colId}>
          <span className="date-text">{ogrenci.kayit_tarihi || '-'}</span>
        </td>
      );
    case 'sinif':
      return (
        <td key={colId}>
          <span className="badge-modern info">{ogrenci.sinif_ad || '-'}</span>
        </td>
      );
    case 'egitim_yili':
      return (
        <td key={colId}>
          <span className="badge-modern info">{ogrenci.egitim_yili || '-'}</span>
        </td>
      );
    case 'koc':
      return (
        <td key={colId}>
          {ogrenci.koc_adi ? (
            <span className="ogrenci-koc-name">{ogrenci.koc_adi}</span>
          ) : (
            <span className="ogrenci-kalem-empty">—</span>
          )}
        </td>
      );
    case 'aktif_mi':
      return (
        <td key={colId}>
          <span className={`badge-modern ${ogrenci.aktif_mi ? 'success' : 'danger'}`}>
            {ogrenci.aktif_mi ? 'Aktif' : 'Pasif'}
          </span>
        </td>
      );
    case 'tc_kimlik_no':
      return (
        <td key={colId}>
          <span className="date-text">{ogrenci.tc_kimlik_no || '—'}</span>
        </td>
      );
    case 'telefon':
      return (
        <td key={colId}>
          <span className="date-text">{ogrenci.telefon || '—'}</span>
        </td>
      );
    case 'veli_ad_soyad':
      return (
        <td key={colId}>
          <span className="date-text">{ogrenci.veli_ad_soyad || '—'}</span>
        </td>
      );
    case 'veli_telefon':
      return (
        <td key={colId}>
          <span className="date-text">{ogrenci.veli_telefon || '—'}</span>
        </td>
      );
    case 'actions':
      return (
        <td key={colId}>
          <div className="row-actions">
            <Link href={ctx.href(String(ogrenci.id))} className="row-action-btn" title="Görüntüle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </Link>
            {ctx.onBelge && <OgrenciBelgeMenu student={ogrenci} onSelect={ctx.onBelge} />}
            <button
              className="row-action-btn danger"
              title="Pasife Al"
              type="button"
              onClick={() => ctx.onDelete(ogrenci)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
            </button>
          </div>
        </td>
      );
    default:
      return null;
  }
}

function mobileMetaParts(
  ogrenci: OgrenciRow,
  visible: Set<OgrenciListColumnId>,
): string[] {
  const parts: string[] = [];
  if (ogrenci.okul_no) parts.push(`No: ${ogrenci.okul_no}`);
  if (visible.has('sinif') && ogrenci.sinif_ad) parts.push(ogrenci.sinif_ad);
  else if (visible.has('sinif_seviyesi') && ogrenci.sinif_seviyesi) parts.push(ogrenci.sinif_seviyesi);
  if (visible.has('alan') && ogrenci.alan_ad) parts.push(ogrenci.alan_ad);
  if (visible.has('aktif_mi')) parts.push(ogrenci.aktif_mi ? 'Aktif' : 'Pasif');
  if (visible.has('egitim_yili') && ogrenci.egitim_yili) parts.push(ogrenci.egitim_yili);
  if (visible.has('kayit_tarihi') && ogrenci.kayit_tarihi) parts.push(ogrenci.kayit_tarihi);
  if (visible.has('telefon') && ogrenci.telefon) parts.push(ogrenci.telefon);
  if (visible.has('tc_kimlik_no') && ogrenci.tc_kimlik_no) parts.push(`TC: ${ogrenci.tc_kimlik_no}`);
  if (visible.has('veli_ad_soyad') && ogrenci.veli_ad_soyad) parts.push(`Veli: ${ogrenci.veli_ad_soyad}`);
  if (visible.has('veli_telefon') && ogrenci.veli_telefon) parts.push(`Veli tel: ${ogrenci.veli_telefon}`);
  return parts;
}

export default function OgrenciListResults({
  loading,
  students,
  searchQuery,
  filterMode,
  activeEgitimYiliLabel,
  getAvatarColor,
  getInitials,
  onQuickInfo,
  onDelete,
  onBelge,
  onClearSearch,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  hasKalemFilter = false,
  visibleColumns,
}: OgrenciListResultsProps) {
  const { href } = useOgrenciPath();
  const allIds = students.map((s) => s.id);
  const allSelected =
    allIds.length > 0 && selectedIds && allIds.every((id) => selectedIds.has(id));
  const visibleSet = new Set(visibleColumns);
  const orderedVisible = LIST_COLUMNS.map((c) => c.id).filter((id) => visibleSet.has(id));

  if (loading) {
    return (
      <div className="ogrenci-table-wrap">
        <table className="table-modern ogrenci-desktop-table">
          <thead>
            <tr>
              <th style={{ width: 40 }} />
              {orderedVisible.map((id) => (
                <th key={id} style={id === 'actions' ? { width: 148 } : undefined}>
                  {columnLabel(id, hasKalemFilter)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <SkeletonRows colCount={orderedVisible.length} />
          </tbody>
        </table>
      </div>
    );
  }

  if (students.length === 0) {
    const isSearch = Boolean(searchQuery.trim());
    return (
      <div className="ogrenci-empty">
        <div className="ogrenci-empty-visual">{isSearch ? '🔍' : '🎓'}</div>
        <h4>
          {isSearch
            ? 'Aramanızla eşleşen öğrenci yok'
            : filterMode === 'yillik'
              ? `${activeEgitimYiliLabel || 'Bu yıl'} kayıtlı öğrenci yok`
              : 'Henüz öğrenci eklenmemiş'}
        </h4>
        <p>
          {isSearch
            ? `"${searchQuery}" için sonuç bulunamadı. Farklı bir anahtar kelime deneyin veya filtreleri temizleyin.`
            : filterMode === 'yillik'
              ? 'Bu eğitim yılı için öğrenci kaydı yapın veya başka bir yıl seçin.'
              : 'İlk öğrencinizi ekleyerek başlayın.'}
        </p>
        <div className="ogrenci-empty-actions">
          {isSearch && (
            <button type="button" className="btn-modern btn-secondary" onClick={onClearSearch}>
              Aramayı Temizle
            </button>
          )}
          <Link href={href("yeni-kayit")} className="btn-modern btn-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Öğrenci Kayıt
          </Link>
        </div>
      </div>
    );
  }

  const cellCtx = {
    searchQuery,
    getAvatarColor,
    getInitials,
    href,
    onQuickInfo,
    onDelete,
    onBelge,
  };

  return (
    <>
      <div className="ogrenci-mobile-list">
        {students.map((ogrenci, index) => {
          const meta = mobileMetaParts(ogrenci, visibleSet);
          return (
            <div key={ogrenci.kayit_id || ogrenci.id} className="ogrenci-mobile-card">
              <div className="ogrenci-mobile-card-top">
                {onToggleSelect && (
                  <input
                    type="checkbox"
                    className="ogrenci-row-checkbox"
                    checked={selectedIds?.has(ogrenci.id) || false}
                    onChange={() => onToggleSelect(ogrenci.id)}
                  />
                )}
                {ogrenci.profil_foto ? (
                  <div className="avatar-circle avatar-photo small">
                    <img src={ogrenci.profil_foto} alt="" />
                  </div>
                ) : (
                  <div className={`avatar-circle small ${getAvatarColor(index)}`}>
                    {getInitials(ogrenci.ad, ogrenci.soyad)}
                  </div>
                )}
                <div className="ogrenci-mobile-card-info">
                  <Link href={href(String(ogrenci.id))} className="ogrenci-mobile-name">
                    {ogrenci.ad} {ogrenci.soyad}
                  </Link>
                  {meta.length > 0 && (
                    <span className="ogrenci-mobile-meta">{meta.join(' · ')}</span>
                  )}
                  {visibleSet.has('kalemler') && (
                    <div className="ogrenci-mobile-kalemler">{renderKalemChips(ogrenci)}</div>
                  )}
                  {visibleSet.has('koc') && (
                    <span className="ogrenci-mobile-meta">
                      Koç: {ogrenci.koc_adi || '—'}
                    </span>
                  )}
                </div>
              </div>
              <div className="ogrenci-mobile-card-actions">
                <button type="button" className="ogrenci-quick-info-btn" onClick={() => onQuickInfo(ogrenci)}>
                  İletişim
                </button>
                {onBelge && (
                  <button
                    type="button"
                    className="row-action-btn"
                    onClick={() => onBelge(ogrenci, 'ogrenci_belgesi')}
                  >
                    Belge
                  </button>
                )}
                <Link href={href(String(ogrenci.id))} className="row-action-btn">Detay</Link>
              </div>
            </div>
          );
        })}
      </div>

      <div className="ogrenci-table-wrap">
        <table className="table-modern ogrenci-desktop-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                {onToggleSelectAll && (
                  <input
                    type="checkbox"
                    className="ogrenci-row-checkbox"
                    checked={allSelected}
                    onChange={(e) => onToggleSelectAll(allIds, e.target.checked)}
                    aria-label="Tümünü seç"
                  />
                )}
              </th>
              {orderedVisible.map((id) => (
                <th key={id} style={id === 'actions' ? { width: 148 } : undefined}>
                  {columnLabel(id, hasKalemFilter)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((ogrenci, index) => (
              <tr key={ogrenci.kayit_id || ogrenci.id}>
                <td>
                  {onToggleSelect && (
                    <input
                      type="checkbox"
                      className="ogrenci-row-checkbox"
                      checked={selectedIds?.has(ogrenci.id) || false}
                      onChange={() => onToggleSelect(ogrenci.id)}
                      aria-label={`${ogrenci.ad} ${ogrenci.soyad} seç`}
                    />
                  )}
                </td>
                {orderedVisible.map((colId) =>
                  renderDataCell(colId, ogrenci, { ...cellCtx, index }),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
