'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ExamParticipantRow } from '../types';
import { resolveCoachPhotoUrl } from '@/lib/coach-media';
import y from './exam-yoklama.module.css';

export type YoklamaGroup = {
  name: string;
  rows: ExamParticipantRow[];
};

type Attendance = '' | 'present' | 'absent';

type Props = {
  title: string;
  subtitle: string;
  groups: YoklamaGroup[];
  focusId: number | null;
  paused?: boolean;
  onClose: () => void;
  onMark: (id: number, attendance: Attendance) => Promise<void> | void;
  onAllPresent: () => void;
  onAllAbsent: () => void;
  marking?: boolean;
  onNotify: () => void;
};

const LABEL: Record<Attendance, string> = {
  present: 'Geldi',
  absent: 'Gelmedi',
  '': 'İşaretsiz',
};

function matches(row: ExamParticipantRow, query: string) {
  if (!query) return true;
  const hay = [row.full_name, row.okul_no, row.sinif, row.sinif_seviyesi, row.seat_no ? String(row.seat_no) : '']
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('tr');
  return hay.includes(query);
}

export default function ExamYoklamaScreen({
  title,
  subtitle,
  groups,
  focusId,
  paused,
  onClose,
  onMark,
  onAllPresent,
  onAllAbsent,
  marking,
  onNotify,
}: Props) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<number | null>(focusId);
  const [narrow, setNarrow] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setRoot(document.body); }, []);
  useEffect(() => { if (focusId) setActiveId(focusId); }, [focusId]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const all = useMemo(() => groups.flatMap(group => group.rows), [groups]);
  const q = query.trim().toLocaleLowerCase('tr');
  const visibleGroups = useMemo(
    () => groups
      .map(group => ({ ...group, rows: group.rows.filter(row => matches(row, q)) }))
      .filter(group => group.rows.length),
    [groups, q],
  );
  const nav = useMemo(() => visibleGroups.flatMap(group => group.rows), [visibleGroups]);
  const active = all.find(row => row.id === activeId) || nav[0] || null;

  useEffect(() => {
    if (activeId != null && nav.some(row => row.id === activeId)) return;
    if (nav[0]) setActiveId(nav[0].id);
  }, [activeId, nav]);

  useEffect(() => {
    if (!activeId) return;
    document.getElementById(`yok-seat-${activeId}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const present = all.filter(row => row.attendance === 'present').length;
  const absent = all.filter(row => row.attendance === 'absent').length;
  const openCount = all.length - present - absent;

  const mark = async (attendance: Attendance) => {
    if (!active) return;
    const next: Attendance = active.attendance === attendance ? '' : attendance;
    await onMark(active.id, next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  const step = (dir: -1 | 1) => {
    if (!active) return;
    const i = nav.findIndex(row => row.id === active.id);
    const next = nav[Math.min(nav.length - 1, Math.max(0, i + dir))];
    if (next) setActiveId(next.id);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (paused) return;
      if (event.key === 'Escape') {
        if (photo) { setPhoto(false); return; }
        if (narrow && sheet) { setSheet(false); return; }
        onClose();
        return;
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.repeat) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { step(1); return; }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { step(-1); return; }
      if (event.key === '1') void mark('present');
      if (event.key === '2') void mark('absent');
      if (event.key === '0' || event.key === 'Backspace') {
        if (active?.attendance) void mark(active.attendance);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const openStudent = (id: number) => {
    setActiveId(id);
    if (narrow) setSheet(true);
  };

  const photoSrc = active ? resolveCoachPhotoUrl(active.profil_foto) : null;
  const call = active?.veli_telefon?.replace(/[^\d+]/g, '');

  if (!root) return null;

  return createPortal(
    <div className={y.root} role="dialog" aria-modal="true" aria-labelledby="exam-yoklama-title">
      <header className={y.top}>
        <div className={y.topMain}>
          <p className={y.kicker}>Yoklama</p>
          <h1 id="exam-yoklama-title" className={y.title}>{title}</h1>
          <p className={y.sub}>
            {subtitle} · {all.length} öğrenci
            <span> · oklarla gez, 1 geldi, 2 gelmedi</span>
          </p>
        </div>
        <div className={y.topSide}>
          <div className={y.meters}>
            <div className={`${y.meter} ${y.meterOn}`}><b>{present}</b><span>Geldi</span></div>
            <div className={`${y.meter} ${y.meterOff}`}><b>{absent}</b><span>Gelmedi</span></div>
            <div className={y.meter}><b>{openCount}</b><span>İşaretsiz</span></div>
          </div>
          <button type="button" className={y.exit} onClick={onClose}>Çık</button>
        </div>
      </header>

      <div className={y.stage}>
        <section className={y.floor}>
          <label className={y.search}>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="İsim, numara veya sıra"
              aria-label="Yoklamada ara"
            />
          </label>
          {visibleGroups.length === 0 ? (
            <p className={y.empty}>{all.length ? 'Eşleşen öğrenci yok.' : 'Bu oturumda öğrenci yok.'}</p>
          ) : visibleGroups.map(group => (
            <div key={group.name} className={y.room}>
              <h2>{group.name}</h2>
              <div className={y.mosaic}>
                {group.rows.map(row => (
                  <button
                    key={row.id}
                    id={`yok-seat-${row.id}`}
                    type="button"
                    className={`${y.tile} ${row.attendance === 'present' ? y.tileOn : ''} ${row.attendance === 'absent' ? y.tileOff : ''} ${active?.id === row.id ? y.tileActive : ''}`}
                    onClick={() => openStudent(row.id)}
                  >
                    <em>{row.seat_no ? `Sıra ${row.seat_no}` : 'Sırasız'}</em>
                    <strong>{row.full_name}</strong>
                    <span>{LABEL[row.attendance] || 'İşaretsiz'}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        {narrow && sheet && <button type="button" className={y.scrim} aria-label="Kapat" onClick={() => setSheet(false)} />}
        <aside className={`${y.inspect} ${narrow ? y.inspectSheet : ''} ${!narrow || sheet ? y.inspectOpen : ''}`}>
          {!active ? (
            <p className={y.empty}>Soldan bir öğrenci seç.</p>
          ) : (
            <>
              <div className={y.who}>
                {photoSrc ? (
                  <button type="button" className={y.faceBtn} onClick={() => setPhoto(true)} aria-label="Fotoğrafı büyüt">
                    <img src={photoSrc} alt="" />
                  </button>
                ) : (
                  <span className={y.faceEmpty} aria-hidden>{active.full_name.slice(0, 1)}</span>
                )}
                <div>
                  <p className={y.seatLine}>{active.seat_no ? `Sıra ${active.seat_no}` : 'Sırasız'}{active.room_name ? ` · ${active.room_name}` : ''}</p>
                  <h2>{active.full_name}</h2>
                  <p>
                    {[
                      active.okul_no ? `#${active.okul_no}` : '',
                      active.sinif || active.sinif_seviyesi || '',
                      active.telefon || '',
                    ].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <div className={y.stepper}>
                  <button type="button" onClick={() => step(-1)} aria-label="Önceki">‹</button>
                  <button type="button" onClick={() => step(1)} aria-label="Sonraki">›</button>
                </div>
              </div>
              <div className={y.keys}>
                <button type="button" className={active.attendance === 'present' ? y.keyOn : y.key} onClick={() => void mark('present')}>
                  <small>1</small><b>Geldi</b>
                </button>
                <button type="button" className={active.attendance === 'absent' ? y.keyOff : y.key} onClick={() => void mark('absent')}>
                  <small>2</small><b>Gelmedi</b>
                </button>
              </div>
              {call ? (
                <a className={y.call} href={`tel:${call}`}>
                  <span>Veliyi ara</span>
                  <b>{active.veli_ad_soyad || active.veli_telefon}</b>
                </a>
              ) : (
                <p className={y.noCall}>Veli telefonu yok</p>
              )}
            </>
          )}
        </aside>
      </div>

      <footer className={y.dock}>
        <div className={y.dockLeft}>
          <button type="button" className={`${y.plain} ${y.dockExit}`} onClick={onClose}>Çık</button>
          <button type="button" className={y.good} onClick={onAllPresent} disabled={marking || !all.length}>Tümü geldi</button>
          <button type="button" className={y.bad} onClick={onAllAbsent} disabled={marking || !all.length}>Tümü gelmedi</button>
          <button type="button" className={y.plain} onClick={onNotify} disabled={absent === 0}>
            <span className={y.wideOnly}>Yoklama bildir</span>
            <span className={y.narrowOnly}>Bildir</span>
            {absent ? ` (${absent})` : ''}
          </button>
        </div>
        <p className={y.saved} role="status">{saved ? 'Kaydedildi' : ''}</p>
      </footer>

      {photo && photoSrc && active && (
        <button type="button" className={y.zoom} onClick={() => setPhoto(false)} aria-label="Kapat">
          <img src={photoSrc} alt={active.full_name} />
        </button>
      )}
    </div>,
    root,
  );
}
