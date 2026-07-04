'use client';

import React from 'react';
import Link from 'next/link';
import { useOgrenciPath } from '@/components/ogrenci/OgrenciPathProvider';
import type { EgitimKalemiRow } from '../lib/ogrenci-list-utils';
import OgrenciBelgeMenu, { type OgrenciBelgeTipi } from './OgrenciBelgeMenu';

export type OgrenciRow = {
  id: number;
  kayit_id?: number;
  ad: string;
  soyad: string;
  tam_ad?: string;
  tc_kimlik_no: string;
  aktif_mi: boolean;
  cinsiyet?: string;
  okul_no?: string;
  profil_foto?: string | null;
  sube_ad?: string;
  sinif_seviyesi?: string;
  kayit_tarihi?: string;
  giris_turu?: string;
  giris_turu_display?: string;
  egitim_yili?: string;
  egitim_kalemleri?: EgitimKalemiRow[];
  kalem_ozet?: string;
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

function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="ogrenci-skeleton-row">
          <td><div className="ogrenci-skeleton line short" /></td>
          <td>
            <div className="cell-with-icon">
              <div className="ogrenci-skeleton avatar" />
              <div style={{ flex: 1 }}>
                <div className="ogrenci-skeleton line medium" />
                <div className="ogrenci-skeleton line short" />
              </div>
            </div>
          </td>
          <td><div className="ogrenci-skeleton line short" /></td>
        </tr>
      ))}
    </>
  );
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
}: OgrenciListResultsProps) {
  const { href } = useOgrenciPath();
  const allIds = students.map((s) => s.id);
  const allSelected =
    allIds.length > 0 && selectedIds && allIds.every((id) => selectedIds.has(id));

  if (loading) {
    return (
      <div className="ogrenci-table-wrap">
        <table className="table-modern ogrenci-desktop-table">
          <thead>
            <tr>
              <th style={{ width: 40 }} />
              <th>Öğrenci Bilgisi</th>
              {filterMode === 'yillik' && <th>Şube</th>}
              {filterMode === 'yillik' && <th>Sınıf</th>}
              <th>{hasKalemFilter ? 'Eşleşen Kalemler' : 'Eğitim Kalemleri'}</th>
              {filterMode === 'yillik' && <th>Giriş Tarihi</th>}
              {filterMode === 'yillik' && <th>Giriş Türü</th>}
              {filterMode === 'tum_yillar' && <th>Eğitim Yılı</th>}
              <th>Durum</th>
              <th style={{ width: 148 }}>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            <SkeletonRows />
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

  const renderStudentRow = (ogrenci: OgrenciRow, index: number) => (
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
      <td>
        <div className="cell-with-icon">
          {ogrenci.profil_foto ? (
            <div className="avatar-circle avatar-photo">
              <img src={ogrenci.profil_foto} alt={`${ogrenci.ad} ${ogrenci.soyad}`} />
            </div>
          ) : (
            <div className={`avatar-circle ${getAvatarColor(index)}`}>
              {getInitials(ogrenci.ad, ogrenci.soyad)}
            </div>
          )}
          <div className="cell-info">
            <div className="cell-primary-row">
              <Link href={href(String(ogrenci.id))} className="cell-primary cell-link">
                {highlightText(`${ogrenci.ad} ${ogrenci.soyad}`, searchQuery)}
              </Link>
              <button
                type="button"
                className="ogrenci-quick-info-btn"
                onClick={() => onQuickInfo(ogrenci)}
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
                  {highlightText(ogrenci.okul_no, searchQuery)}
                </>
              )}
            </span>
          </div>
        </div>
      </td>
      {filterMode === 'yillik' && (
        <td>
          <span className="badge-modern info">{ogrenci.sube_ad || '-'}</span>
        </td>
      )}
      {filterMode === 'yillik' && (
        <td>
          <span className="badge-modern purple">{ogrenci.sinif_seviyesi || '-'}</span>
        </td>
      )}
      <td className="ogrenci-kalem-cell">{renderKalemChips(ogrenci)}</td>
      {filterMode === 'yillik' && (
        <td>
          <span className="date-text">{ogrenci.kayit_tarihi || '-'}</span>
        </td>
      )}
      {filterMode === 'yillik' && (
        <td>
          <span className={`badge-modern ${ogrenci.giris_turu === 'yeni_kayit' ? 'success' : 'warning'}`}>
            {ogrenci.giris_turu_display || '-'}
          </span>
        </td>
      )}
      {filterMode === 'tum_yillar' && (
        <td>
          <span className="badge-modern info">{ogrenci.egitim_yili || '-'}</span>
        </td>
      )}
      <td>
        <span className={`badge-modern ${ogrenci.aktif_mi ? 'success' : 'danger'}`}>
          {ogrenci.aktif_mi ? 'Aktif' : 'Pasif'}
        </span>
      </td>
      <td>
        <div className="row-actions">
          <Link href={href(String(ogrenci.id))} className="row-action-btn" title="Görüntüle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
          {onBelge && <OgrenciBelgeMenu student={ogrenci} onSelect={onBelge} />}
          <button
            className="row-action-btn danger"
            title="Pasife Al"
            type="button"
            onClick={() => onDelete(ogrenci)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );

  return (
    <>
      <div className="ogrenci-mobile-list">
        {students.map((ogrenci, index) => (
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
                <span className="ogrenci-mobile-meta">
                  {ogrenci.okul_no ? `No: ${ogrenci.okul_no}` : ''}
                  {ogrenci.sinif_seviyesi ? ` · ${ogrenci.sinif_seviyesi}` : ''}
                </span>
                <div className="ogrenci-mobile-kalemler">{renderKalemChips(ogrenci)}</div>
              </div>
              <span className={`badge-modern small ${ogrenci.aktif_mi ? 'success' : 'danger'}`}>
                {ogrenci.aktif_mi ? 'Aktif' : 'Pasif'}
              </span>
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
        ))}
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
              <th>Öğrenci Bilgisi</th>
              {filterMode === 'yillik' && <th>Şube</th>}
              {filterMode === 'yillik' && <th>Sınıf Seviyesi</th>}
              <th>{hasKalemFilter ? 'Eşleşen Kalemler' : 'Eğitim Kalemleri'}</th>
              {filterMode === 'yillik' && <th>Giriş Tarihi</th>}
              {filterMode === 'yillik' && <th>Giriş Türü</th>}
              {filterMode === 'tum_yillar' && <th>Eğitim Yılı</th>}
              <th>Durum</th>
              <th style={{ width: 148 }}>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {students.map((ogrenci, index) => renderStudentRow(ogrenci, index))}
          </tbody>
        </table>
      </div>
    </>
  );
}
