'use client';

import React, { useState, useCallback } from 'react';

interface Props {
  coachId: number;
}

interface Note {
  id: number;
  text: string;
  category: 'general' | 'student' | 'meeting' | 'reminder';
  pinned: boolean;
  createdAt: string;
}

const CATEGORY_CONFIG: Record<Note['category'], { label: string; icon: string; color: string; bg: string }> = {
  general: { label: 'Genel', icon: '📝', color: '#3b82f6', bg: '#dbeafe' },
  student: { label: 'Öğrenci', icon: '🎓', color: '#22c55e', bg: '#d1fae5' },
  meeting: { label: 'Görüşme', icon: '📅', color: '#8b5cf6', bg: '#ede9fe' },
  reminder: { label: 'Hatırlatma', icon: '🔔', color: '#f59e0b', bg: '#fef3c7' },
};

// Yerel notlar — backend API geldiğinde değiştirilecek
function loadLocalNotes(coachId: number): Note[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`coach_notes_${coachId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLocalNotes(coachId: number, notes: Note[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`coach_notes_${coachId}`, JSON.stringify(notes));
}

export default function CoachQuickNotes({ coachId }: Props) {
  const [notes, setNotes] = useState<Note[]>(() => loadLocalNotes(coachId));
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState<Note['category']>('general');
  const [filter, setFilter] = useState<'all' | Note['category']>('all');
  const [searchText, setSearchText] = useState('');

  const persist = useCallback((updated: Note[]) => {
    setNotes(updated);
    saveLocalNotes(coachId, updated);
  }, [coachId]);

  const addNote = () => {
    if (!newText.trim()) return;
    const note: Note = {
      id: Date.now(),
      text: newText.trim(),
      category: newCategory,
      pinned: false,
      createdAt: new Date().toLocaleString('tr-TR'),
    };
    persist([note, ...notes]);
    setNewText('');
  };

  const deleteNote = (id: number) => persist(notes.filter(n => n.id !== id));
  const togglePin = (id: number) => persist(notes.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n));

  const filtered = notes
    .filter(n => filter === 'all' || n.category === filter)
    .filter(n => !searchText || n.text.toLowerCase().includes(searchText.toLowerCase()))
    .sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', margin: '0 0 4px' }}>Hızlı Notlar</h3>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>Koçla ilgili önemli notları buraya ekleyin</p>
      </div>

      {/* Yeni Not Ekleme */}
      <div style={{ padding: '16px 24px', backgroundColor: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              value={newText}
              onChange={e => setNewText(e.target.value)}
              placeholder="Not ekle..."
              rows={2}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addNote(); } }}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px', resize: 'none', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(Object.entries(CATEGORY_CONFIG) as [Note['category'], typeof CATEGORY_CONFIG[Note['category']]][]).map(([key, cfg]) => (
              <button key={key} onClick={() => setNewCategory(key)}
                style={{ padding: '4px 10px', borderRadius: '6px', border: newCategory === key ? `2px solid ${cfg.color}` : '2px solid transparent', fontSize: '11px', fontWeight: 500, cursor: 'pointer', backgroundColor: newCategory === key ? cfg.bg : '#f3f4f6', color: newCategory === key ? cfg.color : '#6b7280', transition: 'all .2s', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>{cfg.icon}</span> {cfg.label}
              </button>
            ))}
          </div>
          <button onClick={addNote} disabled={!newText.trim()}
            style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: newText.trim() ? 'pointer' : 'not-allowed', backgroundColor: newText.trim() ? '#3b82f6' : '#e5e7eb', color: newText.trim() ? '#fff' : '#9ca3af', transition: 'all .2s' }}>
            Ekle
          </button>
        </div>
        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '6px' }}>⌘+Enter ile hızlı kayıt yapabilirsiniz</div>
      </div>

      {/* Filtre + Arama */}
      <div style={{ padding: '12px 24px', display: 'flex', gap: '8px', alignItems: 'center', borderBottom: '1px solid #f3f4f6', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '160px', maxWidth: '280px' }}>
          <svg style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          <input type="text" placeholder="Not ara..." value={searchText} onChange={e => setSearchText(e.target.value)}
            style={{ width: '100%', padding: '7px 10px 7px 32px', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '12px', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['all', 'general', 'student', 'meeting', 'reminder'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: 500, cursor: 'pointer', backgroundColor: filter === f ? '#111827' : '#f3f4f6', color: filter === f ? '#fff' : '#6b7280', transition: 'all .2s' }}>
              {f === 'all' ? 'Tümü' : CATEGORY_CONFIG[f].label}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#9ca3af' }}>{filtered.length} not</span>
      </div>

      {/* Not Listesi */}
      <div style={{ padding: '16px 24px', maxHeight: '500px', overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📌</div>
            <div style={{ fontSize: '14px', fontWeight: 500 }}>{notes.length === 0 ? 'Henüz not eklenmemiş' : 'Bu filtreye uygun not yok'}</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>Yukarıdaki kutudan yeni not ekleyebilirsiniz.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(note => {
              const cfg = CATEGORY_CONFIG[note.category];
              return (
                <div key={note.id} style={{ display: 'flex', gap: '12px', padding: '12px 14px', borderRadius: '10px', backgroundColor: note.pinned ? '#fffbeb' : '#f9fafb', border: note.pinned ? '1px solid #fde68a' : '1px solid transparent', transition: 'all .2s' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = note.pinned ? '#fef3c7' : '#f3f4f6')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = note.pinned ? '#fffbeb' : '#f9fafb')}>
                  {/* Kategori ikonu */}
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>
                    {cfg.icon}
                  </div>
                  {/* İçerik */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', color: '#111827', margin: '0 0 4px', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{note.text}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '10px', color: '#9ca3af' }}>{note.createdAt}</span>
                      <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', backgroundColor: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                    </div>
                  </div>
                  {/* Aksiyonlar */}
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button onClick={() => togglePin(note.id)} title={note.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}
                      style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: 'transparent', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .2s' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e5e7eb')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                      {note.pinned ? '📌' : '📍'}
                    </button>
                    <button onClick={() => deleteNote(note.id)} title="Sil"
                      style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: 'transparent', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .2s' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fee2e2')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
