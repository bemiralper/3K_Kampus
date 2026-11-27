'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Flame, Search, X } from 'lucide-react';
import {
  studentPortalApi,
  type CommandPaletteItem,
  type CourseNoteItem,
} from '@/lib/student-portal-api';
import { useStudentPortal } from '@/lib/student-portal-context';

const STATIC_COMMANDS: CommandPaletteItem[] = [
  {
    id: 'nav-home',
    category: 'Hızlı Geçiş',
    title: 'Bugün (Yaşayan Ana Ekran)',
    subtitle: 'Canlı ders akışı, sınav biniş kartı ve kampüs özeti',
    href: '/ogrenci',
  },
  {
    id: 'nav-focus-25',
    category: 'Hızlı Eylem',
    title: '25 dk Pomodoro Odak Başlat',
    subtitle: 'Tam ekran odak sayacını hemen başlat',
    href: '#start-focus-25',
  },
  {
    id: 'nav-schedule',
    category: 'Hızlı Geçiş',
    title: 'Birleşik Takvim & Yoklama',
    subtitle: 'Grup dersleri, özel dersler, sınavlar ve devamsızlık',
    href: '/ogrenci/takvim',
  },
  {
    id: 'nav-study',
    category: 'Hızlı Geçiş',
    title: 'Çalışma Planı, Odak & Rozetler',
    subtitle: 'Koçunun haftalık programı ve gün sonu check-in',
    href: '/ogrenci/calisma',
  },
  {
    id: 'nav-exams',
    category: 'Hızlı Geçiş',
    title: 'Sınav Radarı & Konu Isı Haritası',
    subtitle: 'Net gelişimi, en kolay net artışı radarı ve Karne PDF',
    href: '/ogrenci/sinavlar',
  },
  {
    id: 'nav-courses',
    category: 'Hızlı Geçiş',
    title: 'Ders Notları, İşlenen Konular & Kaynaklarım',
    subtitle: 'Google Drive ders PDF notları ve atanan kitaplar',
    href: '/ogrenci/dersler',
  },
  {
    id: 'nav-coach',
    category: 'Hızlı Geçiş',
    title: 'Koçumla Mesajlaş & Duyurular',
    subtitle: 'Birincil koçuna mesaj yaz ve kurum duyurularını gör',
    href: '/ogrenci/iletisim',
  },
];

export default function CommandPaletteModal() {
  const router = useRouter();
  const { identity, paletteOpen, setPaletteOpen, startFocus, openSplitNote } = useStudentPortal();
  const defaultFocusMins = identity?.preferences?.focus_minutes || 25;
  const [query, setQuery] = useState('');
  const [dynamicItems, setDynamicItems] = useState<CommandPaletteItem[]>([]);
  const [notesCache, setNotesCache] = useState<Record<number, CourseNoteItem>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!paletteOpen) return;
    setQuery('');
    window.setTimeout(() => inputRef.current?.focus(), 20);

    studentPortalApi
      .commandPalette()
      .then((res) => setDynamicItems(res.items || []))
      .catch(() => undefined);

    studentPortalApi
      .courses()
      .then((res) => {
        const map: Record<number, CourseNoteItem> = {};
        for (const n of res.notes || []) map[n.id] = n;
        setNotesCache(map);
      })
      .catch(() => undefined);
  }, [paletteOpen]);

  useEffect(() => {
    if (!paletteOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, setPaletteOpen]);

  const filtered = useMemo(() => {
    const dynamicStatic = STATIC_COMMANDS.map((cmd) =>
      cmd.id === 'nav-focus-25'
        ? {
            ...cmd,
            title: `${defaultFocusMins} dk Pomodoro Odak Başlat`,
            subtitle: `Varsayılan odak sürenle (${defaultFocusMins} dk) tam ekran sayacı başlat`,
          }
        : cmd,
    );
    const all = [...dynamicStatic, ...dynamicItems];
    const q = query.trim().toLowerCase();
    if (!q) return all.slice(0, 14);
    return all
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q),
      )
      .slice(0, 18);
  }, [dynamicItems, query]);

  if (!paletteOpen) return null;

  const handleSelect = (item: CommandPaletteItem) => {
    setPaletteOpen(false);
    if (item.href === '#start-focus-25') {
      startFocus({
        mode: 'pomodoro',
        minutes: defaultFocusMins,
        customTitle: `${defaultFocusMins} dk Hızlı Pomodoro`,
      });
      return;
    }
    if (item.focus_block) {
      startFocus({ block: item.focus_block, mode: 'pomodoro' });
      return;
    }
    if (item.note_id && notesCache[item.note_id]) {
      openSplitNote(notesCache[item.note_id]);
      return;
    }
    router.push(item.href);
  };

  return (
    <div
      className="sp-cmd-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) setPaletteOpen(false);
      }}
    >
      <div className="sp-cmd-dialog" role="dialog" aria-modal="true" aria-label="Hızlı Komut Paleti">
        <div className="sp-cmd-input-row">
          <Search size={18} className="sp-cmd-search-icon" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sınav, ders notu, işlenen konu veya çalışma görevi ara…"
          />
          <button
            type="button"
            className="sp-icon-btn"
            onClick={() => setPaletteOpen(false)}
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>

        <div className="sp-cmd-list">
          {filtered.length === 0 ? (
            <div className="sp-cmd-empty">Eşleşen sonuç bulunamadı.</div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                className="sp-cmd-item"
                onClick={() => handleSelect(item)}
              >
                <div className="sp-cmd-item-copy">
                  <span className="sp-cmd-cat">{item.category}</span>
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </div>
                {item.focus_block ? (
                  <span className="sp-chip sp-chip-accent">
                    <Flame size={13} /> Odak Başlat
                  </span>
                ) : (
                  <ArrowRight size={16} />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
