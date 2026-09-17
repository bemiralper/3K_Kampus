'use client';

/**
 * Öğrenci Çalışma Merkezi — yatay bölüm çubuğu.
 *
 * Tek seviyeli, kaydırılabilir; grup ayraçları ile Akademik / İletişim /
 * Kayıt blokları görsel olarak ayrılır. Ödevler sekmesi geciken sayısını
 * rozet olarak taşır. Aktif sekme mobilde otomatik görünüme kaydırılır.
 */

import { useEffect, useRef } from 'react';
import type { Student360TabId } from '@/lib/coach-api';
import Student360Icon, {
  type Student360IconName,
} from '@/components/coach/Student360Icon';

type PanelId = Exclude<Student360TabId, 'genel'>;

interface NavItem {
  id: PanelId;
  label: string;
  icon: Student360IconName;
  /** Yeni grup başlangıcı — soluna ayraç çizilir */
  groupStart?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'ozet', label: 'Genel Bakış', icon: 'overview' },
  { id: 'odevler', label: 'Ödevler', icon: 'homework', groupStart: true },
  { id: 'sinavlar', label: 'Sınavlar', icon: 'exam' },
  { id: 'program', label: 'Program', icon: 'calendar' },
  { id: 'gorusmeler', label: 'Görüşmeler', icon: 'meeting', groupStart: true },
  { id: 'mesajlar', label: 'Mesajlar', icon: 'message' },
  { id: 'veli', label: 'Veli', icon: 'family' },
  { id: 'bilgi', label: 'Profil', icon: 'profile', groupStart: true },
  { id: 'kutuphane', label: 'Kütüphane', icon: 'library' },
  { id: 'belgeler', label: 'Belgeler', icon: 'document' },
];

interface WorkspaceNavProps {
  activeTab: PanelId;
  onTabChange: (tab: PanelId) => void;
  /** Ödevler sekmesinde gösterilecek geciken ödev sayısı */
  overdueCount?: number;
  disabled?: boolean;
}

export default function WorkspaceNav({
  activeTab,
  onTabChange,
  overdueCount = 0,
  disabled = false,
}: WorkspaceNavProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Aktif sekme dar ekranda görünür alana gelsin
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const active = scroller.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!active) return;
    const sLeft = scroller.scrollLeft;
    const sRight = sLeft + scroller.clientWidth;
    const aLeft = active.offsetLeft;
    const aRight = aLeft + active.offsetWidth;
    if (aLeft < sLeft || aRight > sRight) {
      scroller.scrollTo({ left: aLeft - 24, behavior: 'smooth' });
    }
  }, [activeTab]);

  return (
    <nav className="s360w-nav" aria-label="Öğrenci bölümleri">
      <div className="s360w-nav-scroller" ref={scrollerRef} role="tablist">
        {NAV_ITEMS.map((item) => (
          <span key={item.id} className="s360w-nav-cell">
            {item.groupStart && <span className="s360w-nav-divider" aria-hidden />}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === item.id}
              className={`s360w-nav-item${activeTab === item.id ? ' active' : ''}`}
              disabled={disabled}
              onClick={() => onTabChange(item.id)}
            >
              <Student360Icon name={item.icon} size={16} />
              <span>{item.label}</span>
              {item.id === 'odevler' && overdueCount > 0 && (
                <span className="s360w-nav-badge" aria-label={`${overdueCount} geciken ödev`}>
                  {overdueCount}
                </span>
              )}
            </button>
          </span>
        ))}
      </div>
    </nav>
  );
}
