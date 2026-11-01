'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { examApi } from '../api';
import type { DenemeSalon, ExamDetail, ExamParticipantRow, ExamRoomItem, ExamSessionItem, ParticipantSearchHit, SeatingMode } from '../types';
import { resolveCoachPhotoUrl } from '@/lib/coach-media';
import { candidateSeats, seatNumbers } from './seating';
import PassiveSeatsField from './PassiveSeatsField';
import Icon from '../ui/Icon';
import DenemeSalonCatalog from './DenemeSalonCatalog';
import RosterExportModal from './RosterExportModal';
import OptikYazdirModal from './OptikYazdirModal';
import SinavRosterNotifyModal from './SinavRosterNotifyModal';
import ExamYoklamaScreen from './ExamYoklamaScreen';
import p from './participants.module.css';
import { useOlcmePath } from '../useOlcmePath';

function StudentFace({ foto }: { foto?: string | null }) {
  const src = resolveCoachPhotoUrl(foto);
  if (src) {
    return (
      <span className={p.face}>
        <img src={src} alt="" />
      </span>
    );
  }
  return (
    <span className={`${p.face} ${p.faceEmpty}`} aria-hidden>
      <img src="/img/3k-logo.png" alt="" />
    </span>
  );
}

function StudentPhoto({ foto, name }: { foto?: string | null; name: string }) {
  const [open, setOpen] = useState(false);
  const src = resolveCoachPhotoUrl(foto);
  return (
    <>
      {src ? (
        <button type="button" className={p.thumb} onClick={() => setOpen(true)} aria-label={`${name} fotoğrafını büyüt`}>
          <img src={src} alt="" />
        </button>
      ) : (
        <span className={p.logo} aria-hidden>
          <img src="/img/3k-logo.png" alt="" />
        </span>
      )}
      {open && src && (
        <button type="button" className={p.zoom} onClick={() => setOpen(false)} aria-label="Kapat">
          <img src={src} alt={name} />
        </button>
      )}
    </>
  );
}

type SeatLine =
  | { type: 'student'; seat: number | null; row: ExamParticipantRow }
  | { type: 'empty'; seat: number; roomId: number }
  | { type: 'passive'; seat: number };

type RoomBlock = {
  roomId: number | null;
  roomName: string;
  filled: number;
  empty: number;
  lines: SeatLine[];
};

function buildRoomBlocks(rooms: ExamRoomItem[], visible: ExamParticipantRow[]): RoomBlock[] {
  const saved = rooms.filter((rm): rm is ExamRoomItem & { id: number } => !!rm.id);
  const used = new Set<number>();
  const blocks: RoomBlock[] = [];

  for (const room of saved) {
    const inRoom = visible.filter(x => x.room_id === room.id);
    inRoom.forEach(x => used.add(x.id));
    const candidates = candidateSeats(room);
    const assignable = new Set(seatNumbers(room));
    const plan = new Set(candidates);
    const bySeat = new Map<number, ExamParticipantRow>();
    const extras: ExamParticipantRow[] = [];
    for (const row of inRoom) {
      const n = row.seat_no;
      if (n && plan.has(n) && !bySeat.has(n)) bySeat.set(n, row);
      else extras.push(row);
    }
    const lines: SeatLine[] = [];
    let empty = 0;
    for (const seat of candidates) {
      const row = bySeat.get(seat);
      if (!assignable.has(seat)) {
        if (row) lines.push({ type: 'student', seat, row });
        else lines.push({ type: 'passive', seat });
        continue;
      }
      if (row) lines.push({ type: 'student', seat, row });
      else {
        lines.push({ type: 'empty', seat, roomId: room.id });
        empty += 1;
      }
    }
    extras.forEach(row => lines.push({ type: 'student', seat: row.seat_no, row }));
    blocks.push({ roomId: room.id, roomName: room.name, filled: inRoom.length, empty, lines });
  }

  const leftover = visible.filter(x => !used.has(x.id));
  if (leftover.length) {
    blocks.unshift({
      roomId: null,
      roomName: 'Salon atanmadı',
      filled: leftover.length,
      empty: 0,
      lines: leftover.map(row => ({ type: 'student', seat: row.seat_no, row })),
    });
  }
  return blocks;
}

function foldTr(value: string) {
  return value
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i');
}

function attendanceQueryMatches(row: ExamParticipantRow, query: string) {
  const tokens = foldTr(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const hay = foldTr([
    row.full_name,
    row.okul_no,
    row.sinif,
    row.sinif_seviyesi,
    row.room_name,
    row.seat_no != null ? String(row.seat_no) : '',
  ].filter(Boolean).join(' '));
  return tokens.every(token => hay.includes(token));
}

function otherSessionLabel(hit: ParticipantSearchHit) {
  const other = hit.other_session;
  if (!other) return '';
  const day = other.schedule_preference_display || other.exam_session_name || 'Diğer oturum';
  const seat = other.seat_no ? ` · sıra ${other.seat_no}` : '';
  const salon = other.room_name ? ` · ${other.room_name}` : '';
  const extra = (hit.other_session_count || 1) > 1 ? ` · +${(hit.other_session_count || 1) - 1} oturum` : '';
  return `${day}${salon}${seat}${extra} — bu oturuma al`;
}

type Panel =
  | { kind: 'add' }
  | { kind: 'rooms' }
  | { kind: 'seating' }
  | { kind: 'actions' }
  | { kind: 'student'; id: number }
  | { kind: 'seat'; roomId: number; seatNo: number; roomName: string }
  | { kind: 'missing' };

type MissingStudent = {
  student_id: number;
  full_name: string;
  okul_no: string;
  sinif: string;
  sinif_seviyesi: string;
  deneme_paketi: string;
  profil_foto?: string | null;
};

function Window({
  title,
  hint,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  hint?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => { setRoot(document.body); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!root) return null;
  return createPortal(
    <div className={p.overlay} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        className={wide ? `${p.window} ${p.windowWide}` : p.window}
        role="dialog"
        aria-modal="true"
        aria-labelledby="roster-window-title"
      >
        <header className={p.windowHead}>
          <div>
            <h3 id="roster-window-title">{title}</h3>
            {hint ? <p>{hint}</p> : null}
          </div>
          <button type="button" className={p.windowClose} onClick={onClose} aria-label="Kapat">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className={p.windowBody}>{children}</div>
        {footer ? <footer className={p.windowFoot}>{footer}</footer> : null}
      </div>
    </div>,
    root,
  );
}

export default function ParticipantsTab({ exam }: { exam: ExamDetail }) {
  const { isMuhasebe } = useOlcmePath();
  const [rows, setRows] = useState<ExamParticipantRow[]>([]);
  const [rooms, setRooms] = useState<ExamRoomItem[]>([]);
  const [salonlar, setSalonlar] = useState<DenemeSalon[]>([]);
  const [sessions, setSessions] = useState<ExamSessionItem[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const setError = (text: string) => setToast(text ? { kind: 'err', text } : null);
  const setOk = (text: string) => setToast({ kind: 'ok', text });
  const [q, setQ] = useState('');
  const [findQ, setFindQ] = useState('');
  const [hits, setHits] = useState<ParticipantSearchHit[]>([]);
  const [seatQ, setSeatQ] = useState('');
  const [seatHits, setSeatHits] = useState<ParticipantSearchHit[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [seatingMode, setSeatingMode] = useState<SeatingMode>('shuffle');
  const [busy, setBusy] = useState('');
  const [panel, setPanel] = useState<Panel | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [optikOpen, setOptikOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [waEvent, setWaEvent] = useState<'sinav.hatirlatma' | 'sinav.yoklama'>('sinav.hatirlatma');
  const [waPreview, setWaPreview] = useState<Awaited<ReturnType<typeof examApi.hatirlatmaPreview>> | null>(null);
  const [yoklama, setYoklama] = useState<{ focusId: number | null } | null>(null);
  const [missing, setMissing] = useState<MissingStudent[]>([]);
  const [missingPick, setMissingPick] = useState<number[]>([]);
  const [missingQ, setMissingQ] = useState('');
  const [roomTab, setRoomTab] = useState<'exam' | 'catalog'>('exam');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await examApi.participants(exam.id);
      setRows(data.participants);
      setRooms(data.rooms);
      const sess = data.sessions || exam.exam_sessions || [];
      setSessions(sess);
      setSessionId(prev => {
        if (prev && sess.some(x => x.id === prev)) return prev;
        return sess.length ? sess[0].id : null;
      });
      try {
        const gap = await examApi.missingParticipants(exam.id);
        setMissing(gap.students);
        return gap.students;
      } catch {
        setMissing([]);
        return [] as MissingStudent[];
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Liste yüklenemedi.');
      return [] as MissingStudent[];
    } finally {
      setLoading(false);
    }
  }, [exam.id, exam.exam_sessions]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { examApi.denemeSalonlari().then(setSalonlar).catch(() => {}); }, []);
  useEffect(() => {
    if (!toast || toast.kind === 'err') return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const rememberSalon = async (room: ExamRoomItem) => {
    const name = room.name.trim();
    if (!name) {
      setError('Salon adı yazın.');
      return;
    }
    try {
      const saved = await examApi.saveDenemeSalon(name, Number(room.capacity) || 30, room.inactive_seats || []);
      setSalonlar(prev => [...prev.filter(s => s.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, 'tr')));
      setOk(`${name} salon listesine kaydedildi.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salon kaydedilemedi.');
    }
  };

  const visible = useMemo(() => {
    if (!sessionId || sessions.length < 2) return rows;
    return rows.filter(x => x.exam_session_id === sessionId);
  }, [rows, sessionId, sessions.length]);

  const exportScope = useMemo(() => {
    if (selected.length) {
      const ids = new Set(selected);
      const picked = visible.filter(row => ids.has(row.id));
      if (picked.length) return { rows: picked, label: 'Seçilen' };
    }
    const query = findQ.trim();
    if (query) return { rows: visible.filter(row => attendanceQueryMatches(row, query)), label: 'Arama sonucu' };
    return { rows: visible, label: '' };
  }, [selected, visible, findQ]);

  const roomsForView = useMemo(() => {
    if (sessions.length < 2 || sessionId == null) return rooms;
    return rooms.filter(rm => !rm.exam_session_id || rm.exam_session_id === sessionId);
  }, [rooms, sessions.length, sessionId]);
  const cap = roomsForView.reduce((a, rm) => a + seatNumbers(rm).length, 0);
  const overflow = rooms.length > 0 && visible.length > cap;
  const present = visible.filter(x => x.attendance === 'present').length;
  const absent = visible.filter(x => x.attendance === 'absent').length;
  const unassigned = visible.filter(x => !x.room_id).length;
  const usedByRoom = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of visible) {
      if (row.room_id) map.set(row.room_id, (map.get(row.room_id) || 0) + 1);
    }
    return map;
  }, [visible]);

  const toggle = (id: number) =>
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const searchSeq = useRef(0);
  const runSearch = async (value: string, apply: (list: ParticipantSearchHit[]) => void) => {
    const seq = ++searchSeq.current;
    if (value.trim().length < 2) { apply([]); return; }
    let list: ParticipantSearchHit[] = [];
    try { list = await examApi.searchParticipants(exam.id, value.trim(), sessionId); }
    catch { list = []; }
    if (seq === searchSeq.current) apply(list);
  };

  const search = (value: string) => {
    setQ(value);
    void runSearch(value, setHits);
  };

  const searchSeat = (value: string) => {
    setSeatQ(value);
    void runSearch(value, setSeatHits);
  };

  const placeOnSeat = async (row: ExamParticipantRow) => {
    if (panel?.kind !== 'seat') return;
    if (row.seat_locked && !confirm(`${row.full_name} için sınav mesajı gönderilmiş. Yeni sıraya alayım mı?`)) return;
    const { roomId, seatNo } = panel;
    setBusy('move');
    setError('');
    try {
      await examApi.patchParticipant(exam.id, row.id, { room_id: roomId, seat_no: seatNo });
      closePanel();
      await load(true);
      setOk(`${row.full_name} ${seatNo}. sıraya alındı.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sıraya alınamadı.');
    } finally { setBusy(''); }
  };

  const closePanel = () => {
    setPanel(null);
    setSeatQ('');
    setSeatHits([]);
    setQ('');
    setHits([]);
    setMissingQ('');
    setMissingPick([]);
    setRoomTab('exam');
  };

  const addMissing = async (ids: number[]) => {
    const unique = [...new Set(ids)];
    if (!unique.length) return;
    if (unique.length > 30 && !confirm(`${unique.length} öğrenci listeye eklensin mi?`)) return;
    setBusy('missing');
    setError('');
    try {
      const byGroup = sessions.length > 1;
      const res = await examApi.addMissingParticipants(exam.id, unique, byGroup ? null : sessionId);
      setMissingPick([]);
      const left = await load(true);
      if (!left.length) setPanel(current => (current?.kind === 'missing' ? null : current));
      if (res.errors[0]) setToast({ kind: 'warn', text: res.errors[0] });
      else if (!res.added) setOk('Eklenecek öğrenci kalmadı.');
      else setOk(byGroup
        ? `${res.added} öğrenci, hafta içi / hafta sonu grubuna göre oturumuna eklendi.`
        : `${res.added} öğrenci listeye eklendi.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Öğrenciler eklenemedi.');
    } finally { setBusy(''); }
  };

  const openSeatPick = (roomId: number, seatNo: number, roomName: string) => {
    setPanel({ kind: 'seat', roomId, seatNo, roomName });
    setSeatQ('');
    setSeatHits([]);
    setQ('');
    setHits([]);
  };

  const addStudent = async (id: number, seat?: { room_id: number; seat_no: number }) => {
    setBusy('add');
    setError('');
    try {
      await examApi.addParticipant(exam.id, id, sessionId, seat);
      closePanel();
      await load(true);
      setOk(seat ? `Öğrenci ${seat.seat_no}. sıraya oturtuldu.` : 'Öğrenci eklendi.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi.');
    } finally { setBusy(''); }
  };

  const remove = async (id: number) => {
    if (!confirm('Bu öğrenciyi listeden çıkarayım mı?')) return;
    setError('');
    try {
      await examApi.removeParticipant(exam.id, id);
      setSelected(prev => prev.filter(x => x !== id));
      setPanel(current => (current?.kind === 'student' && current.id === id ? null : current));
      await load(true);
      setOk('Öğrenci listeden çıkarıldı.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi.');
    }
  };

  const bulkAtt = async (attendance: 'present' | 'absent', ids: number[]) => {
    const targetIds = ids;
    if (!targetIds.length) {
      setError('Toplu yoklama için katılımcı yok.');
      return;
    }
    if (attendance === 'absent') {
      const n = targetIds.length;
      if (!confirm(`${n} öğrenci gelmedi işaretlensin mi?`)) return;
    }
    setBusy('bulk');
    setError('');
    try {
      await examApi.bulkAttendance(exam.id, {
        attendance,
        participant_ids: targetIds,
        session_id: sessionId,
      });
      await load(true);
      setOk(`${targetIds.length} öğrencinin yoklaması kaydedildi.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toplu yoklama kaydedilemedi.');
    } finally { setBusy(''); }
  };

  const patchAtt = async (id: number, attendance: string) => {
    try {
      const row = await examApi.patchParticipant(exam.id, id, { attendance });
      setRows(prev => prev.map(x => (x.id === id ? row : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yoklama kaydedilemedi.');
    }
  };

  const saveRooms = async (next: ExamRoomItem[]) => {
    setBusy('rooms');
    setError('');
    try {
      const data = await examApi.saveRooms(exam.id, next);
      const fresh = await examApi.participants(exam.id);
      setRows(fresh.participants);
      setRooms(fresh.rooms);
      if (data.warning) setToast({ kind: 'warn', text: data.warning });
      else setOk('Salonlar kaydedildi.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salonlar kaydedilemedi.');
    } finally { setBusy(''); }
  };

  const seat = async (onlyUnassigned = false) => {
    if (!rooms.length) {
      setError('Önce salon ekleyip kaydedin.');
      return;
    }
    if (!onlyUnassigned && overflow) {
      setError(`${visible.length} öğrenci için toplam kapasite ${cap}. Önce salon ekleyin.`);
      return;
    }
    if (!onlyUnassigned) {
      const locked = visible.filter(x => x.seat_locked).length;
      const msg = locked
        ? `${locked} öğrencinin sırası mesaj gönderildiği için kilitli. Onlar yerinde kalır; diğerleri boş sıralara yerleşir. Devam?`
        : 'Tüm oturma düzeni yeniden karışacak. Devam edeyim mi?';
      if (!confirm(msg)) return;
    }
    setBusy(onlyUnassigned ? 'fill' : 'seat');
    setError('');
    try {
      const res = await examApi.seating(exam.id, seatingMode, onlyUnassigned, sessionId);
      await load(true);
      if (res.unplaced) setToast({ kind: 'warn', text: `${res.unplaced} öğrenci yerleştirilemedi.` });
      else setOk(onlyUnassigned ? 'Salonsuz öğrenciler yerleştirildi.' : 'Oturma düzeni kuruldu.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yerleştirme yapılamadı.');
    } finally { setBusy(''); }
  };

  const changeSession = async (participantId: number, nextSessionId: string) => {
    if (!nextSessionId) return;
    setError('');
    try {
      await examApi.patchParticipant(exam.id, participantId, {
        exam_session_id: Number(nextSessionId),
      });
      await load(true);
      setOk('Oturum güncellendi.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Oturum değiştirilemedi.');
    }
  };

  const assignRoom = async (participantId: number, roomId: string) => {
    setError('');
    try {
      const row = await examApi.patchParticipant(exam.id, participantId, {
        room_id: roomId === '' ? null : Number(roomId),
      });
      setRows(prev => prev.map(x => (x.id === participantId ? row : x)));
      setOk(roomId ? 'Salon atandı.' : 'Salon kaldırıldı.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salon atanamadı.');
    }
  };

  const openWa = async (eventKey: 'sinav.hatirlatma' | 'sinav.yoklama') => {
    const eligible = eventKey === 'sinav.yoklama'
      ? visible.filter(x => x.attendance === 'absent')
      : visible;
    const targetIds = selected.length
      ? selected.filter(id => eligible.some(x => x.id === id))
      : eligible.map(x => x.id);
    if (targetIds.length === 0) {
      setError(eventKey === 'sinav.yoklama'
        ? 'Yoklama bildirimi için önce öğrencileri Gelmedi olarak işaretleyin.'
        : 'Gönderilecek katılımcı yok.');
      return;
    }
    setBusy('wa');
    setError('');
    setWaEvent(eventKey);
    try {
      const preview = await examApi.hatirlatmaPreview(exam.id, targetIds, eventKey);
      setWaPreview(preview);
      setWaOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Önizleme alınamadı.');
    } finally { setBusy(''); }
  };

  const roomBlocks = useMemo(() => buildRoomBlocks(roomsForView, visible), [roomsForView, visible]);
  const shownBlocks = useMemo(() => {
    const query = findQ.trim();
    if (!query) return roomBlocks;
    return roomBlocks
      .map(block => ({
        ...block,
        lines: block.lines.filter(line => line.type === 'student' && attendanceQueryMatches(line.row, query)),
      }))
      .filter(block => block.lines.length > 0);
  }, [roomBlocks, findQ]);
  const findCount = findQ.trim()
    ? shownBlocks.reduce((n, block) => n + block.lines.length, 0)
    : 0;
  const shownIds = useMemo(() => {
    const ids: number[] = [];
    for (const block of shownBlocks) {
      for (const line of block.lines) {
        if (line.type === 'student') ids.push(line.row.id);
      }
    }
    return ids;
  }, [shownBlocks]);
  const allPicked = shownIds.length > 0 && shownIds.every(id => selected.includes(id));
  const toggleShown = () => {
    setSelected(prev => (
      allPicked
        ? prev.filter(id => !shownIds.includes(id))
        : [...new Set([...prev, ...shownIds])]
    ));
  };
  const detailRow = panel?.kind === 'student'
    ? rows.find(row => row.id === panel.id) ?? null
    : null;
  const shownMissing = useMemo(() => {
    const query = missingQ.trim().toLocaleLowerCase('tr');
    if (!query) return missing;
    return missing.filter(row => [row.full_name, row.okul_no, row.sinif, row.sinif_seviyesi, row.deneme_paketi]
      .join(' ')
      .toLocaleLowerCase('tr')
      .includes(query));
  }, [missing, missingQ]);

  const roomChoices = (currentId: number | null) => roomsForView.filter(rm => rm.id).map(rm => {
    const used = usedByRoom.get(rm.id!) || 0;
    const slots = seatNumbers(rm).length;
    return { rm, used, slots, full: used >= slots && currentId !== rm.id };
  });

  if (loading) {
    return <p className={p.hint}>Katılımcı listesi yükleniyor…</p>;
  }

  const guestHref = `${isMuhasebe ? '/muhasebe/ogrenci/misafir/yeni' : '/ogrenciler/misafir/yeni'}?exam=${exam.id}`;
  const seatPanel = panel?.kind === 'seat' ? panel : null;
  const seatQuery = seatQ.trim().toLocaleLowerCase('tr');
  const seatGap = seatPanel
    ? missing.filter(row => {
      if (!seatQuery) return true;
      return [row.full_name, row.okul_no, row.sinif, row.sinif_seviyesi, row.deneme_paketi]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('tr')
        .includes(seatQuery);
    })
    : [];
  const seatListed = seatPanel && seatQuery.length >= 2
    ? visible.filter(row => [row.full_name, row.okul_no, row.sinif, row.room_name, row.seat_no ? String(row.seat_no) : '']
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('tr')
      .includes(seatQuery))
    : [];
  const listedStudentIds = new Set(visible.map(row => row.student_id));
  const gapStudentIds = new Set(missing.map(row => row.student_id));
  const seatNewHits = seatHits.filter(hit => !hit.on_list && !listedStudentIds.has(hit.id) && !gapStudentIds.has(hit.id));

  return (
    <div className={p.page}>
      {toast && (
        <div
          className={`${p.toast} ${toast.kind === 'ok' ? p.toastOk : ''} ${toast.kind === 'warn' ? p.toastWarn : ''}`}
          role={toast.kind === 'err' ? 'alert' : 'status'}
        >
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Kapat">×</button>
        </div>
      )}

      {sessions.length > 1 && (
        <div className={p.sessions} role="tablist" aria-label="Oturum">
          {sessions.map(sess => {
            const count = rows.filter(x => x.exam_session_id === sess.id).length;
            const date = sess.session_date
              ? new Date(`${sess.session_date}T00:00:00`).toLocaleDateString('tr-TR')
              : '';
            const time = [sess.start_time, sess.end_time].filter(Boolean).join('–');
            return (
              <button
                key={sess.id}
                type="button"
                role="tab"
                aria-selected={sessionId === sess.id}
                className={sessionId === sess.id ? p.sessionOn : p.session}
                onClick={() => { setSessionId(sess.id); setSelected([]); }}
              >
                <b>{sess.name}</b>
                <span>
                  {sess.schedule_preference_display}
                  {date ? ` · ${date}` : ''}
                  {time ? ` · ${time}` : ''}
                  {` · ${count} kişi`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <section className={p.status} aria-label="Özet">
        <div><b>{visible.length}</b><span>Katılımcı</span></div>
        <div><b>{cap}</b><span>Kapasite</span></div>
        <div><b>{present}</b><span>Geldi</span></div>
        <div><b>{absent}</b><span>Gelmedi</span></div>
        <div><b>{unassigned}</b><span>Salonsuz</span></div>
      </section>

      {missing.length > 0 && (
        <button type="button" className={p.missingBar} onClick={() => setPanel({ kind: 'missing' })}>
          <span>{missing.length} öğrenci seçime uyuyor, listede yok.</span>
          <b>Göster</b>
        </button>
      )}

      {overflow && (
        <p className={p.notice}>
          {visible.length} öğrenci var, salon kapasitesi {cap}. Yerleştirmeden önce salon ekleyin.
        </p>
      )}

      <section className={p.bar}>
        <div className={p.search}>
          <Icon name="search" size={16} />
          <input
            placeholder="İsim, numara veya sınıf ara"
            value={findQ}
            onChange={e => setFindQ(e.target.value)}
            aria-label="Listede ara"
          />
          {findQ.trim() && (
            <button type="button" className={p.clear} onClick={() => setFindQ('')}>Temizle</button>
          )}
        </div>
        <div className={p.barActions}>
          <button type="button" className={p.actPrimary} disabled={visible.length === 0} onClick={() => setYoklama({ focusId: null })}>
            <Icon name="checkCircle" size={16} /> Yoklama
          </button>
          <button type="button" className={p.actPrimary} onClick={() => setPanel({ kind: 'add' })}>
            <Icon name="plus" size={16} /> Öğrenci ekle
          </button>
          <button type="button" className={p.act} onClick={() => setPanel({ kind: 'rooms' })}>
            <Icon name="building" size={16} /> Salonlar
          </button>
          <button type="button" className={p.act} onClick={() => setPanel({ kind: 'seating' })}>
            <Icon name="layers" size={16} /> Oturma
          </button>
          <button type="button" className={p.act} onClick={() => setPanel({ kind: 'actions' })}>
            <Icon name="more" size={16} /> İşlemler
          </button>
        </div>
        {findQ.trim() && (
          <p className={p.barNote}>{findCount} öğrenci listeleniyor.</p>
        )}
      </section>

      {visible.length > 0 && (
        <div className={p.pickBar}>
          <label>
            <input type="checkbox" checked={allPicked} onChange={toggleShown} />
            <span>{allPicked ? 'Seçimi kaldır' : 'Görünenlerin tümünü seç'}</span>
          </label>
          {selected.length > 0 && (
            <div className={p.pickActions}>
              <b>{selected.length} seçili</b>
            </div>
          )}
        </div>
      )}

      {roomBlocks.length === 0 ? (
        <div className={p.blank}>
          <b>Liste boş</b>
          <span>Öğrenci ekleyin ya da salonu hazırlayın. Salon kaydı, boş sıraları da açar.</span>
          <div className={p.barActions}>
            <button type="button" className={p.actPrimary} onClick={() => setPanel({ kind: 'add' })}>Öğrenci ekle</button>
            <button type="button" className={p.act} onClick={() => setPanel({ kind: 'rooms' })}>Salon ekle</button>
          </div>
        </div>
      ) : findQ.trim() && shownBlocks.length === 0 ? (
        <div className={p.blank}>
          <b>Eşleşme yok</b>
          <span>Ad, soyad, numara veya salonla tekrar deneyin.</span>
        </div>
      ) : shownBlocks.map(block => (
        <section key={block.roomId ?? 'none'} className={p.roomCard}>
          <header className={p.roomHead}>
            <div>
              <h3>{block.roomName}</h3>
              <p>
                {findQ.trim()
                  ? `${block.lines.length} eşleşme`
                  : `${block.filled} öğrenci${block.empty ? ` · ${block.empty} boş sıra` : ''}`}
              </p>
            </div>
            {block.roomId === null && unassigned > 0 && !findQ.trim() && (
              <button type="button" className={p.act} disabled={busy === 'fill'} onClick={() => seat(true)}>
                {busy === 'fill' ? 'Yerleştiriliyor…' : 'Boş sıralara yerleştir'}
              </button>
            )}
          </header>
          <div>
            {block.lines.filter(line => line.type === 'student').map(line => {
              if (line.type !== 'student') return null;
              const row = line.row;
              return (
                <div key={row.id} className={selected.includes(row.id) ? `${p.person} ${p.personOn}` : p.person}>
                  <label className={p.check}>
                    <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} aria-label={`${row.full_name} seç`} />
                  </label>
                  <span className={`${p.seat} ${row.seat_locked ? p.seatLocked : ''}`}>
                    {row.seat_no ?? '·'}
                    {row.seat_locked && <span className={p.lock}><Icon name="lock" size={9} /></span>}
                  </span>
                  <span className={p.photo}><StudentPhoto foto={row.profil_foto} name={row.full_name} /></span>
                  <button type="button" className={p.who} onClick={() => setPanel({ kind: 'student', id: row.id })}>
                    <span className={p.name}>
                      <span className={p.nameText}>{row.full_name}</span>
                      {row.kayit_pasif && <span className={p.inactive}>Kaydı pasif</span>}
                      {row.seat_stale && <span className={p.stale}>Mesajı güncelle</span>}
                    </span>
                    <span className={p.meta}>
                      {[
                        row.okul_no ? `#${row.okul_no}` : '',
                        row.sinif || row.sinif_seviyesi || '',
                        row.telefon || '',
                        row.source === 'manual' ? 'Manuel' : '',
                      ].filter(Boolean).join(' · ') || 'Ayrıntı'}
                    </span>
                  </button>
                  <div className={p.att}>
                    <span className={row.attendance === 'present' ? p.attOn : row.attendance === 'absent' ? p.attOff : p.attIdle}>
                      {row.attendance === 'present' ? 'Geldi' : row.attendance === 'absent' ? 'Gelmedi' : 'İşaretsiz'}
                    </span>
                  </div>
                </div>
              );
            })}
            {block.lines.some(line => line.type === 'empty') && (
              <div className={p.seatBank}>
                <span>Boş sıralar</span>
                <div>
                  {block.lines.map(line => line.type === 'empty' ? (
                    <button
                      key={`e-${line.roomId}-${line.seat}`}
                      type="button"
                      className={p.chip}
                      onClick={() => openSeatPick(line.roomId, line.seat, block.roomName)}
                    >
                      {line.seat}
                    </button>
                  ) : null)}
                </div>
              </div>
            )}
            {block.lines.some(line => line.type === 'passive') && (
              <p className={p.passiveLine}>
                Pasif sıralar: {block.lines.filter(line => line.type === 'passive').map(line => line.seat).join(', ')}
              </p>
            )}
          </div>
        </section>
      ))}

      {panel?.kind === 'missing' && (
        <Window
          title="Listede olmayanlar"
          hint="Sınıf seviyesi ve deneme paketine uyup listede olmayanlar. Eklenen öğrenci salonsuz kalır."
          wide
          onClose={closePanel}
          footer={(
            <button
              type="button"
              className={p.actPrimary}
              disabled={busy === 'missing' || (missingPick.length === 0 && shownMissing.length === 0)}
              onClick={() => addMissing(missingPick.length ? missingPick : shownMissing.map(row => row.student_id))}
            >
              {busy === 'missing'
                ? 'Ekleniyor…'
                : missingPick.length
                  ? `Seçilen ${missingPick.length} öğrenciyi ekle`
                  : 'Tümünü ekle'}
            </button>
          )}
        >
          <div className={p.search}>
            <Icon name="search" size={16} />
            <input
              placeholder="Ad, numara veya sınıf"
              value={missingQ}
              onChange={event => setMissingQ(event.target.value)}
              aria-label="Eksik öğrencilerde ara"
            />
          </div>
          <div className={p.results}>
            {shownMissing.map(row => (
              <div key={row.student_id} className={p.missingRow}>
                <label className={p.check}>
                  <input
                    type="checkbox"
                    checked={missingPick.includes(row.student_id)}
                    onChange={() => setMissingPick(prev => (
                      prev.includes(row.student_id)
                        ? prev.filter(id => id !== row.student_id)
                        : [...prev, row.student_id]
                    ))}
                    aria-label={`${row.full_name} seç`}
                  />
                </label>
                <StudentFace foto={row.profil_foto} />
                <span className={p.resultText}>
                  <b>{row.full_name}</b>
                  <span>
                    {[
                      row.okul_no ? `#${row.okul_no}` : '',
                      row.sinif || row.sinif_seviyesi || '',
                      row.deneme_paketi || '',
                    ].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
                <button
                  type="button"
                  className={p.act}
                  disabled={busy === 'missing'}
                  onClick={() => addMissing([row.student_id])}
                >
                  Ekle
                </button>
              </div>
            ))}
            {missing.length > 0 && shownMissing.length === 0 && <p className={p.hint}>Eşleşen öğrenci yok.</p>}
          </div>
        </Window>
      )}

      {panel?.kind === 'add' && (
        <Window title="Öğrenci ekle" hint="Seçilen sınıf seviyesine uyan öğrenciler çıkar. Listede olan aramada işaretlenir." onClose={closePanel}>
          <div className={p.search}>
            <Icon name="search" size={16} />
            <input
              autoFocus
              placeholder="Ad veya soyad"
              value={q}
              onChange={e => search(e.target.value)}
              aria-label="Öğrenci ara"
            />
          </div>
          <div className={p.results}>
            {q.trim().length >= 2 && hits.length === 0 && <p className={p.hint}>Eşleşen öğrenci yok.</p>}
            {hits.map(hit => hit.on_list ? (
              <div key={hit.id} className={p.result}>
                <StudentFace foto={hit.profil_foto} />
                <span className={p.resultText}>
                  <b>{hit.full_name}</b>
                  <span>{hit.sinif_seviyesi || 'Bu oturumda'}</span>
                </span>
                <span className={p.listed}>Listede{hit.seat_no ? ` · sıra ${hit.seat_no}` : ''}</span>
              </div>
            ) : (
              <button key={hit.id} type="button" className={p.result} disabled={busy === 'add'} onClick={() => addStudent(hit.id)}>
                <StudentFace foto={hit.profil_foto} />
                <span className={p.resultText}>
                  <b>{hit.full_name}</b>
                  <span>
                    {[
                      hit.sinif_seviyesi || '',
                      hit.in_other_session ? otherSessionLabel(hit) : '',
                    ].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <Link href={guestHref} className={p.guest}>Kayıtlı değilse tek deneme öğrencisi ekle</Link>
        </Window>
      )}

      {seatPanel && (
        <Window
          title={`${seatPanel.roomName} · sıra ${seatPanel.seatNo}`}
          hint="Seçime uyup listede olmayanlar. Listede olan yalnız aramada çıkar."
          onClose={closePanel}
        >
          <div className={p.search}>
            <Icon name="search" size={16} />
            <input
              autoFocus
              placeholder="Ad, numara veya sıra"
              value={seatQ}
              onChange={e => searchSeat(e.target.value)}
              aria-label="Sıraya öğrenci ara"
            />
          </div>
          <div className={p.results}>
            {seatGap.length > 0 && <p className={p.hint}>Seçime uyuyor, listede yok</p>}
            {seatGap.map(row => (
              <button
                key={row.student_id}
                type="button"
                className={p.result}
                disabled={busy === 'add'}
                onClick={() => addStudent(row.student_id, { room_id: seatPanel.roomId, seat_no: seatPanel.seatNo })}
              >
                <StudentFace foto={row.profil_foto} />
                <span className={p.resultText}>
                  <b>{row.full_name}</b>
                  <span>
                    {[
                      row.okul_no ? `#${row.okul_no}` : '',
                      row.sinif || row.sinif_seviyesi || '',
                      row.deneme_paketi || '',
                    ].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
              </button>
            ))}
            {seatListed.length > 0 && <p className={p.hint}>Aramada listede olanlar</p>}
            {seatListed.map(row => (
              <button
                key={row.id}
                type="button"
                className={p.result}
                disabled={busy === 'move'}
                onClick={() => placeOnSeat(row)}
              >
                <StudentFace foto={row.profil_foto} />
                <span className={p.resultText}>
                  <b>{row.full_name}</b>
                  <span>
                    {row.seat_no
                      ? `${row.room_name || 'Salon'} · sıra ${row.seat_no}`
                      : 'Salonsuz'}
                  </span>
                </span>
                <span className={p.listed}>Listede</span>
              </button>
            ))}
            {seatNewHits.map(hit => (
              <button
                key={hit.id}
                type="button"
                className={p.result}
                disabled={busy === 'add'}
                onClick={() => addStudent(hit.id, { room_id: seatPanel.roomId, seat_no: seatPanel.seatNo })}
              >
                <StudentFace foto={hit.profil_foto} />
                <span className={p.resultText}>
                  <b>{hit.full_name}</b>
                  <span>
                    {[
                      hit.sinif_seviyesi || '',
                      hit.in_other_session ? otherSessionLabel(hit) : '',
                    ].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            ))}
            {seatGap.length === 0 && seatListed.length === 0 && seatNewHits.length === 0 && (
              <p className={p.hint}>
                {seatQuery.length >= 2 ? 'Eşleşen öğrenci yok.' : 'Seçime uyan eksik öğrenci yok.'}
              </p>
            )}
          </div>
        </Window>
      )}

      {panel?.kind === 'student' && detailRow && (
        <Window title={detailRow.full_name} hint="Salon, oturum ve listeden çıkarma burada." onClose={closePanel}>
          <div className={p.identity}>
            <StudentPhoto foto={detailRow.profil_foto} name={detailRow.full_name} />
            <div>
              <b>{detailRow.full_name}</b>
              <span>
                {[
                  detailRow.okul_no ? `#${detailRow.okul_no}` : '',
                  detailRow.sinif || detailRow.sinif_seviyesi || '',
                  detailRow.telefon || '',
                ].filter(Boolean).join(' · ') || '—'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className={p.actPrimary}
            onClick={() => { closePanel(); setYoklama({ focusId: detailRow.id }); }}
          >
            {detailRow.attendance === 'present' ? 'Geldi' : detailRow.attendance === 'absent' ? 'Gelmedi' : 'İşaretsiz'} · yoklamada aç
          </button>
          {detailRow.seat_locked && (
            <p className={p.hint}>Bu sıraya mesaj gönderildiği için yer kilitli. Yeniden karıştırınca yerinde kalır.</p>
          )}
          {detailRow.seat_stale && (
            <p className={p.hint}>Sıra değişti. Öğrenciye giden sınav mesajını güncelleyin.</p>
          )}
          {detailRow.kayit_pasif && (
            <p className={p.hint}>Bu öğrencinin bu yıl için aktif kaydı yok. Sınava girmeyecekse listeden çıkarın.</p>
          )}
          {sessions.length > 1 && (
            <label className={p.field}>
              <span>Oturum</span>
              <select value={detailRow.exam_session_id ?? ''} onChange={e => changeSession(detailRow.id, e.target.value)}>
                {sessions.map(sess => (
                  <option key={sess.id} value={sess.id}>
                    {sess.name}{sess.schedule_preference_display ? ` · ${sess.schedule_preference_display}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={p.field}>
            <span>Salon</span>
            <select value={detailRow.room_id ?? ''} onChange={e => assignRoom(detailRow.id, e.target.value)}>
              <option value="">Salon seç</option>
              {roomChoices(detailRow.room_id).map(({ rm, used, slots, full }) => (
                <option key={rm.id} value={rm.id} disabled={full}>
                  {rm.name} ({used}/{slots}{full ? ' dolu' : ''})
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={p.remove} onClick={() => remove(detailRow.id)}>Listeden çıkar</button>
        </Window>
      )}

      {panel?.kind === 'rooms' && (
        <Window
          title="Salonlar"
          hint="Kapasite, öğrencinin oturacağı sıra sayısıdır. Pasif sıraya kimse yerleşmez. Kaydetmeden liste değişmez."
          wide
          onClose={closePanel}
          footer={roomTab === 'exam' ? (
            <>
              <button
                type="button"
                className={p.act}
                onClick={() => {
                  setRooms(prev => [...prev, { name: `Salon ${prev.length + 1}`, capacity: 30, seat_start: 1, seat_gap: 0, order: prev.length }]);
                  setOk('Salon forma eklendi. Kalıcı olması için Salonları kaydet.');
                }}
              >
                Salon ekle
              </button>
              <button type="button" className={p.actPrimary} disabled={busy === 'rooms'} onClick={() => saveRooms(rooms)}>
                {busy === 'rooms' ? 'Kaydediliyor…' : 'Salonları kaydet'}
              </button>
            </>
          ) : undefined}
        >
          <div className={p.tabs} role="tablist" aria-label="Salon görünümü">
            <button type="button" role="tab" aria-selected={roomTab === 'exam'} className={roomTab === 'exam' ? p.tabOn : p.tab} onClick={() => setRoomTab('exam')}>
              Bu sınavın salonları
            </button>
            <button type="button" role="tab" aria-selected={roomTab === 'catalog'} className={roomTab === 'catalog' ? p.tabOn : p.tab} onClick={() => setRoomTab('catalog')}>
              Kayıtlı salonlar
            </button>
          </div>
          {roomTab === 'catalog' && (
            <DenemeSalonCatalog
              salonlar={salonlar}
              onChange={setSalonlar}
              onError={setError}
              onNotice={setOk}
            />
          )}
          {roomTab === 'exam' && rooms.length === 0 && <p className={p.hint}>Bu sınava henüz salon eklenmedi.</p>}
          {roomTab === 'exam' && rooms.map((room, i) => {
            const used = room.id ? (usedByRoom.get(room.id) || 0) : 0;
            return (
              <div key={room.id ?? `new-${i}`} className={p.roomForm}>
                <label className={p.field}>
                  <span>Kayıtlı salon</span>
                  <select
                    value={salonlar.find(s => foldTr(s.name.trim()) === foldTr(room.name.trim()))?.id ?? ''}
                    onChange={e => {
                      const salon = salonlar.find(s => s.id === Number(e.target.value));
                      if (!salon) return;
                      setRooms(prev => prev.map((item, j) => j === i ? {
                        ...item,
                        name: salon.name,
                        capacity: salon.capacity,
                        inactive_seats: salon.inactive_seats || [],
                      } : item));
                    }}
                  >
                    <option value="">Seç veya yeni yaz</option>
                    {salonlar.map(s => <option key={s.id} value={s.id}>{s.name} · {s.capacity}</option>)}
                  </select>
                </label>
                <label className={p.field}>
                  <span>Salon adı</span>
                  <input value={room.name} onChange={e => setRooms(prev => prev.map((item, j) => j === i ? { ...item, name: e.target.value } : item))} />
                </label>
                {sessions.length > 1 && (
                  <label className={p.field}>
                    <span>Oturum</span>
                    <select
                      value={room.exam_session_id ?? ''}
                      onChange={e => setRooms(prev => prev.map((item, j) => j === i ? { ...item, exam_session_id: e.target.value ? Number(e.target.value) : null } : item))}
                    >
                      <option value="">Tüm oturumlar</option>
                      {sessions.map(sess => (
                        <option key={sess.id} value={sess.id}>{sess.name}{sess.schedule_preference_display ? ` · ${sess.schedule_preference_display}` : ''}</option>
                      ))}
                    </select>
                  </label>
                )}
                <div className={p.roomGrid}>
                  <label className={p.field}>
                    <span>Kapasite</span>
                    <input type="number" min={1} value={room.capacity} onChange={e => setRooms(prev => prev.map((item, j) => j === i ? { ...item, capacity: Number(e.target.value) || 1 } : item))} />
                  </label>
                  <label className={p.field}>
                    <span>İlk sıra</span>
                    <input type="number" min={1} value={room.seat_start ?? 1} onChange={e => setRooms(prev => prev.map((item, j) => j === i ? { ...item, seat_start: Math.max(1, Number(e.target.value) || 1) } : item))} />
                  </label>
                  <label className={p.field}>
                    <span>Ara boşluk</span>
                    <input type="number" min={0} value={room.seat_gap ?? 0} onChange={e => setRooms(prev => prev.map((item, j) => j === i ? { ...item, seat_gap: Math.max(0, Number(e.target.value) || 0) } : item))} />
                  </label>
                </div>
                <PassiveSeatsField
                  room={room}
                  onChange={seats => setRooms(prev => prev.map((item, j) => j === i ? { ...item, inactive_seats: seats } : item))}
                />
                <div className={p.roomBar}>
                  <span className={p.occ}>
                    {used}/{seatNumbers(room).length} dolu
                    {candidateSeats(room).length - seatNumbers(room).length > 0
                      ? ` · ${candidateSeats(room).length - seatNumbers(room).length} pasif`
                      : ''}
                  </span>
                  <span className={p.roomLinks}>
                    <button type="button" className={p.textBtn} onClick={() => rememberSalon(room)}>Listeye kaydet</button>
                    <button
                      type="button"
                      className={p.remove}
                      onClick={() => {
                        const seated = room.id ? rows.filter(r => r.room_id === room.id).length : 0;
                        if (seated && !confirm(`${room.name} salonunda ${seated} öğrenci oturuyor. Kaydedince bu öğrenciler salonsuz kalır. Salonu çıkarayım mı?`)) return;
                        setRooms(prev => prev.filter((_, j) => j !== i));
                        setOk('Salon formdan çıkarıldı. Kalıcı olması için Salonları kaydet.');
                      }}
                    >
                      Sil
                    </button>
                  </span>
                </div>
              </div>
            );
          })}
        </Window>
      )}

      {panel?.kind === 'seating' && (
        <Window
          title="Oturma"
          hint="Kilitli sıralar yerinde kalır. Mesaj gönderilmiş öğrencinin sırası değişmez."
          onClose={closePanel}
        >
          <div className={p.modes}>
            {([
              ['shuffle', 'Karışık', 'Sıralar rastgele dağılır.'],
              ['cross', 'Çapraz', 'Aynı sınıf yan yana gelmesin.'],
              ['sequential', 'Sıralı', 'Soyad sırasıyla yerleşir.'],
            ] as const).map(([mode, label, note]) => (
              <button key={mode} type="button" className={seatingMode === mode ? p.modeOn : p.mode} onClick={() => setSeatingMode(mode)}>
                <b>{label}</b>
                <span>{note}</span>
              </button>
            ))}
          </div>
          <div className={p.stack}>
            <button type="button" className={p.actPrimary} disabled={busy === 'fill' || unassigned === 0} onClick={() => seat(true)}>
              {busy === 'fill' ? 'Yerleştiriliyor…' : 'Yalnız salonsuzları yerleştir'}
            </button>
            <button type="button" className={p.act} disabled={busy === 'seat'} onClick={() => seat(false)}>
              {busy === 'seat' ? 'Karıştırılıyor…' : 'Tüm oturmayı yeniden kur'}
            </button>
          </div>
          {!rooms.length && <p className={p.hint}>Önce salon ekleyip kaydedin.</p>}
        </Window>
      )}

      {panel?.kind === 'actions' && (
        <Window title="İşlemler" hint={selected.length ? `${selected.length} öğrenci seçili. İşlem onlara uygulanır.` : 'Seçim yoksa listedeki herkese uygulanır.'} onClose={closePanel}>
          <div className={p.stack}>
            <button type="button" className={p.actionItem} onClick={() => { setPanel(null); setExportOpen(true); }}>
              <b>Dışa aktar</b>
              <span>Listeyi PDF veya Excel olarak indir</span>
            </button>
            <button type="button" className={p.actionItem} disabled={visible.length === 0} onClick={() => { setPanel(null); setOptikOpen(true); }}>
              <b>Optik yazdır</b>
              <span>Seçilen ya da listedeki öğrencilerin formunu bas</span>
            </button>
            <button type="button" className={p.actionItem} disabled={busy === 'wa' || visible.length === 0} onClick={() => { setPanel(null); void openWa('sinav.hatirlatma'); }}>
              <b>Sınav bilgisi gönder</b>
              <span>Salon ve sıra WhatsApp ile gider</span>
            </button>
          </div>
        </Window>
      )}

      {yoklama && (
        <ExamYoklamaScreen
          title={exam.name}
          subtitle={[
            exam.exam_date
              ? new Date(`${exam.exam_date}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
              : '',
            sessions.length > 1 ? (sessions.find(sess => sess.id === sessionId)?.name || '') : '',
          ].filter(Boolean).join(' · ') || 'Bu oturum'}
          groups={roomBlocks
            .map(block => ({
              name: block.roomName,
              rows: block.lines.flatMap(line => (line.type === 'student' ? [line.row] : [])),
            }))
            .filter(group => group.rows.length > 0)}
          focusId={yoklama.focusId}
          paused={waOpen}
          onClose={() => setYoklama(null)}
          onMark={patchAtt}
          onAllPresent={() => { void bulkAtt('present', visible.map(row => row.id)); }}
          onAllAbsent={() => { void bulkAtt('absent', visible.map(row => row.id)); }}
          marking={busy === 'bulk'}
          onNotify={() => { void openWa('sinav.yoklama'); }}
        />
      )}

      {exportOpen && (
        <RosterExportModal
          exam={exam}
          rows={exportScope.rows}
          rooms={roomsForView}
          scopeLabel={exportScope.label}
          onClose={() => setExportOpen(false)}
        />
      )}
      {optikOpen && (
        <OptikYazdirModal
          examId={exam.id}
          participantIds={selected.length ? selected : visible.map(row => row.id)}
          selectionLabel={selected.length ? `Seçilen ${selected.length} öğrenci` : `Listedeki ${visible.length} öğrenci`}
          onClose={() => setOptikOpen(false)}
        />
      )}
      {waOpen && waPreview && (
        <SinavRosterNotifyModal
          examId={exam.id}
          examName={exam.name}
          eventKey={waEvent}
          preview={waPreview}
          onClose={() => setWaOpen(false)}
          onSent={(sent, errors) => {
            if (sent && errors.length) setToast({ kind: 'warn', text: `${sent} mesaj kuyruğa alındı. ${errors[0]}` });
            else if (sent) setOk(`${sent} mesaj kuyruğa alındı.`);
            else setError(errors[0] || 'Gönderilemedi.');
            load(true);
          }}
        />
      )}
    </div>
  );
}
