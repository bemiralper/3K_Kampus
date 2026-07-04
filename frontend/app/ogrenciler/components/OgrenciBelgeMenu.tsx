'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { OgrenciRow } from './OgrenciListResults';

export type OgrenciBelgeTipi = 'ogrenci_belgesi' | 'ogrenci_izin_belgesi';

interface OgrenciBelgeMenuProps {
  student: OgrenciRow;
  onSelect: (student: OgrenciRow, tip: OgrenciBelgeTipi) => void;
}

type DropdownPos = {
  top: number;
  left: number;
  minWidth: number;
  placement: 'bottom' | 'top';
};

const DROPDOWN_GAP = 6;
const DROPDOWN_EST_HEIGHT = 96;

function computeDropdownPos(trigger: HTMLElement): DropdownPos {
  const rect = trigger.getBoundingClientRect();
  const minWidth = Math.max(rect.width, 210);
  const spaceBelow = window.innerHeight - rect.bottom - DROPDOWN_GAP;
  const spaceAbove = rect.top - DROPDOWN_GAP;
  const openUp = spaceBelow < DROPDOWN_EST_HEIGHT && spaceAbove > spaceBelow;

  let top: number;
  if (openUp) {
    top = rect.top - DROPDOWN_GAP;
  } else {
    top = rect.bottom + DROPDOWN_GAP;
  }

  let left = rect.right - minWidth;
  left = Math.max(8, Math.min(left, window.innerWidth - minWidth - 8));

  return { top, left, minWidth, placement: openUp ? 'top' : 'bottom' };
}

export default function OgrenciBelgeMenu({ student, onSelect }: OgrenciBelgeMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    if (!btnRef.current) return;
    setPos(computeDropdownPos(btnRef.current));
  }, []);

  useEffect(() => {
    if (!open) return;

    updatePosition();

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        rootRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    const handleReposition = () => updatePosition();

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, updatePosition]);

  const pick = (tip: OgrenciBelgeTipi) => {
    setOpen(false);
    onSelect(student, tip);
  };

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (next && btnRef.current) {
        setPos(computeDropdownPos(btnRef.current));
      }
      return next;
    });
  };

  const dropdown =
    open && pos && mounted
      ? createPortal(
          <div
            ref={dropdownRef}
            className={`ogrenci-belge-dropdown ogrenci-belge-dropdown--portal ogrenci-belge-dropdown--${pos.placement}`}
            role="menu"
            style={{
              position: 'fixed',
              top: pos.placement === 'bottom' ? pos.top : undefined,
              bottom: pos.placement === 'top' ? window.innerHeight - pos.top : undefined,
              left: pos.left,
              minWidth: pos.minWidth,
              zIndex: 3000,
            }}
          >
            <button type="button" role="menuitem" onClick={() => pick('ogrenci_belgesi')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Öğrenci Belgesi
            </button>
            <button type="button" role="menuitem" onClick={() => pick('ogrenci_izin_belgesi')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Öğrenci İzin Belgesi
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="ogrenci-belge-menu" ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className="row-action-btn"
        title="Belgeler"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={toggle}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      </button>
      {dropdown}
    </div>
  );
}
