'use client';

import React, { useState, useMemo } from 'react';
import type { Student } from '../types';

interface StudentStepProps {
  students: Student[];
  selectedStudent: Student | null;
  selectedStudents?: Student[];
  multiSelect?: boolean;
  onSelect: (s: Student) => void;
  onToggleMulti?: (s: Student) => void;
  onToggleMode?: () => void;
  getPhotoUrl: (path?: string | null) => string | undefined;
}

export default function StudentStep({ students, selectedStudent, selectedStudents = [], multiSelect = false, onSelect, onToggleMulti, onToggleMode, getPhotoUrl }: StudentStepProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.toLowerCase();
    return students.filter(s =>
      `${s.ad} ${s.soyad}`.toLowerCase().includes(q) ||
      (s.numara && s.numara.toLowerCase().includes(q)) ||
      (s.sinif_ad && s.sinif_ad.toLowerCase().includes(q))
    );
  }, [students, search]);

  const getInitials = (s: Student) => {
    return `${(s.ad || '').charAt(0)}${(s.soyad || '').charAt(0)}`.toUpperCase();
  };

  const colors = ['blue', 'green', 'purple', 'orange', 'pink', 'teal'];
  const getColor = (id: number) => colors[id % colors.length];

  return (
    <div>
      {/* Step Header */}
      <div className="step-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="step-icon blue">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div>
            <h3>Öğrenci Seçimi</h3>
            <p>{multiSelect ? 'Birden fazla öğrenci seçebilirsiniz' : 'Ödev vereceğiniz öğrenciyi seçin'}</p>
          </div>
        </div>
        {onToggleMode && (
          <button
            onClick={onToggleMode}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: multiSelect ? '2px solid #0262a7' : '1px solid #cbd5e1',
              background: multiSelect ? '#eff6ff' : '#f8fafc',
              color: multiSelect ? '#0262a7' : '#64748b',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
            }}
          >
            {multiSelect ? '👥 Çoklu Seçim Açık' : '👤 Tekli Seçim'}
            {multiSelect && selectedStudents.length > 0 && (
              <span style={{ background: '#0262a7', color: 'white', borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                {selectedStudents.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Search */}
      <div className="search-modern" style={{ marginBottom: 20, maxWidth: 480 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          placeholder="Öğrenci adı, numarası veya sınıfı ile arayın..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Count */}
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        {filtered.length} öğrenci bulundu
      </div>

      {/* Student Grid */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <h4>Öğrenci bulunamadı</h4>
          <p>Arama kriterlerinizi değiştirmeyi deneyin</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
        }}>
          {filtered.map(s => {
            const isSelected = multiSelect 
              ? selectedStudents.some(ss => ss.id === s.id)
              : selectedStudent?.id === s.id;
            return (
              <div
                key={s.id}
                onClick={() => multiSelect && onToggleMulti ? onToggleMulti(s) : onSelect(s)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 16px',
                  borderRadius: 12,
                  border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                  background: isSelected ? 'rgba(0,97,166,0.05)' : 'var(--card-bg)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {getPhotoUrl(s.profil_foto) ? (
                  <img
                    src={getPhotoUrl(s.profil_foto)}
                    alt={`${s.ad} ${s.soyad}`}
                    style={{
                      width: 44, height: 44, borderRadius: '50%',
                      objectFit: 'cover', border: '2px solid var(--border-color)',
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div className={`avatar-circle ${getColor(s.id)}`}>
                    {getInitials(s)}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-color)' }}>
                    {s.ad} {s.soyad}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 8, marginTop: 2 }}>
                    {s.sinif_ad && <span>{s.sinif_ad}</span>}
                    {s.numara && <span>#{s.numara}</span>}
                  </div>
                </div>
                {isSelected && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--primary)" stroke="var(--primary)" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" fill="none" stroke="white" strokeWidth="2.5" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
