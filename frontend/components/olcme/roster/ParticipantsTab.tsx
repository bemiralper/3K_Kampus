'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { examApi } from '../api';
import type { DenemeSalon, ExamDetail, ExamParticipantRow, ExamRoomItem, ExamSessionItem, ParticipantSearchHit, SeatingMode } from '../types';
import { resolveCoachPhotoUrl } from '@/lib/coach-media';
import { seatNumbers } from './seating';
import Icon from '../ui/Icon';
import DenemeSalonCatalog from './DenemeSalonCatalog';
import RosterExportModal from './RosterExportModal';
import SinavRosterNotifyModal from './SinavRosterNotifyModal';
import p from './participants.module.css';

function scrollRoster(dir: 'up' | 'down') {
  const start = document.querySelector('[data-roster-page]');
  let node: HTMLElement | null = start instanceof HTMLElement ? start.parentElement : null;
  let scroller: HTMLElement | null = null;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 8) {
      scroller = node;
      break;
    }
    node = node.parentElement;
  }
  const target = scroller || document.scrollingElement;
  if (!target) return;
  target.scrollTo({ top: dir === 'up' ? 0 : target.scrollHeight, behavior: 'smooth' });
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
  | { type: 'empty'; seat: number; roomId: number };

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
    const plan = new Set(seatNumbers(room));
    const bySeat = new Map<number, ExamParticipantRow>();
    const extras: ExamParticipantRow[] = [];
    for (const row of inRoom) {
      const n = row.seat_no;
      if (n && plan.has(n) && !bySeat.has(n)) bySeat.set(n, row);
      else extras.push(row);
    }
    const lines: SeatLine[] = [];
    let empty = 0;
    for (const seat of seatNumbers(room)) {
      const row = bySeat.get(seat);
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

function otherSessionLabel(hit: ParticipantSearchHit) {
  const other = hit.other_session;
  if (!other) return '';
  const day = other.schedule_preference_display || other.exam_session_name || 'Diğer oturum';
  const seat = other.seat_no ? ` · sıra ${other.seat_no}` : '';
  const salon = other.room_name ? ` · ${other.room_name}` : '';
  const extra = (hit.other_session_count || 1) > 1 ? ` · +${(hit.other_session_count || 1) - 1} oturum` : '';
  return `${day}${salon}${seat}${extra} — bu oturuma al`;
}

export default function ParticipantsTab({ exam }: { exam: ExamDetail }) {
  const [rows, setRows] = useState<ExamParticipantRow[]>([]);
  const [rooms, setRooms] = useState<ExamRoomItem[]>([]);
  const [salonlar, setSalonlar] = useState<DenemeSalon[]>([]);
  const [sessions, setSessions] = useState<ExamSessionItem[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ParticipantSearchHit[]>([]);
  const [seatPick, setSeatPick] = useState<{ roomId: number; seatNo: number } | null>(null);
  const [seatQ, setSeatQ] = useState('');
  const [seatHits, setSeatHits] = useState<ParticipantSearchHit[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [seatingMode, setSeatingMode] = useState<SeatingMode>('shuffle');
  const [busy, setBusy] = useState('');
  const [salonOpen, setSalonOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [waEvent, setWaEvent] = useState<'sinav.hatirlatma' | 'sinav.yoklama'>('sinav.hatirlatma');
  const [waPreview, setWaPreview] = useState<Awaited<ReturnType<typeof examApi.hatirlatmaPreview>> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Liste yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [exam.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { examApi.denemeSalonlari().then(setSalonlar).catch(() => {}); }, []);

  const rememberSalon = async (room: ExamRoomItem) => {
    const name = room.name.trim();
    if (!name) return;
    try {
      const saved = await examApi.saveDenemeSalon(name, Number(room.capacity) || 30);
      setSalonlar(prev => [...prev.filter(s => s.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, 'tr')));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salon kaydedilemedi.');
    }
  };

  const visible = useMemo(() => {
    if (!sessionId || sessions.length < 2) return rows;
    return rows.filter(x => x.exam_session_id === sessionId);
  }, [rows, sessionId, sessions.length]);

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
    setSelected(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  const search = async (value: string) => {
    setQ(value);
    if (value.trim().length < 2) { setHits([]); return; }
    try { setHits(await examApi.searchParticipants(exam.id, value.trim(), sessionId)); }
    catch { setHits([]); }
  };

  const searchSeat = async (value: string) => {
    setSeatQ(value);
    if (value.trim().length < 2) { setSeatHits([]); return; }
    try { setSeatHits(await examApi.searchParticipants(exam.id, value.trim(), sessionId)); }
    catch { setSeatHits([]); }
  };

  const closeSeatPick = () => {
    setSeatPick(null);
    setSeatQ('');
    setSeatHits([]);
  };

  const openSeatPick = (roomId: number, seatNo: number) => {
    setSeatPick({ roomId, seatNo });
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
      setQ(''); setHits([]);
      closeSeatPick();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi.');
    } finally { setBusy(''); }
  };

  const remove = async (id: number) => {
    if (!confirm('Bu öğrenciyi listeden çıkarayım mı?')) return;
    setError('');
    try {
      await examApi.removeParticipant(exam.id, id);
      setSelected(p => p.filter(x => x !== id));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi.');
    }
  };

  const bulkAtt = async (attendance: 'present' | 'absent') => {
    const targetIds = selected.length ? selected : visible.map(x => x.id);
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toplu yoklama kaydedilemedi.');
    } finally { setBusy(''); }
  };

  const patchAtt = async (id: number, attendance: string) => {
    try {
      const row = await examApi.patchParticipant(exam.id, id, { attendance });
      setRows(p => p.map(x => (x.id === id ? row : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yoklama kaydedilemedi.');
    }
  };

  const saveRooms = async (next: ExamRoomItem[]) => {
    setBusy('rooms');
    setError('');
    try {
      const data = await examApi.saveRooms(exam.id, next);
      setRooms(data.rooms);
      setError(data.warning || '');
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
      await load();
      if (res.unplaced) setError(`${res.unplaced} öğrenci yerleştirilemedi.`);
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
      await load();
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
      setRows(p => p.map(x => (x.id === participantId ? row : x)));
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
  const emptySeats = roomBlocks.reduce((n, b) => n + b.empty, 0);

  if (loading) {
    return <p className={p.hint}>Katılımcı listesi yükleniyor…</p>;
  }

  const showSalon = salonOpen || rooms.length === 0;

  return (
    <div className={p.page} data-roster-page>
      {error && (
        <div className={`${p.toast} mobile-above-nav`} role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Kapat">×</button>
        </div>
      )}

      {sessions.length > 1 && (
        <div className={p.sessions}>
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
                className={sessionId === sess.id ? p.sessionOn : p.session}
                onClick={() => { setSessionId(sess.id); setSelected([]); }}
              >
                <b>{sess.name}</b>
                <span>
                  {sess.schedule_preference_display}
                  {date ? ` · ${date}` : ''}
                  {time ? ` · ${time}` : ''}
                  {` · ${count}`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className={p.stats}>
        <div className={p.stat}><b>{visible.length}</b><span>Katılımcı</span></div>
        <div className={p.stat}><b>{cap}</b><span>Kapasite</span></div>
        <div className={p.stat}><b>{present}</b><span>Geldi</span></div>
        <div className={p.stat}><b>{absent}</b><span>Gelmedi</span></div>
        <div className={p.stat}><b>{unassigned}</b><span>Salonsuz</span></div>
      </div>

      <div className={p.workspace}>
        <section className={`${p.panel} ${p.main}`}>
          <div className={p.tools}>
            <div className={p.toolsTop}>
              <div>
                <h3>Öğrenciler</h3>
                <p>
                  {emptySeats
                    ? `${emptySeats} boş sıra var.`
                    : 'Salonu listeden seç. Mesaj giden sıra kilitli kalır.'}
                </p>
              </div>
            </div>
            <div className={p.search}>
              <input placeholder="Öğrenci ara ve ekle…" value={q} onChange={e => search(e.target.value)} />
              {hits.length > 0 && (
                <div className={p.hits}>
                  {hits.map(h => (
                    <button key={h.id} type="button" className={p.hit} onClick={() => addStudent(h.id)}>
                      <span>{h.full_name}</span>
                      {h.in_other_session && <span className={p.hitNote}>{otherSessionLabel(h)}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className={p.actions}>
              <button type="button" className={p.act} onClick={() => setExportOpen(true)}>
                <Icon name="download" size={14} />
                <span className={p.full}>Dışa aktar</span>
                <span className={p.short}>Aktar</span>
              </button>
              <button type="button" className={p.actPrimary} onClick={() => openWa('sinav.hatirlatma')} disabled={busy === 'wa' || visible.length === 0}>
                <span className={p.full}>Sınav bilgisi</span>
                <span className={p.short}>Bilgi</span>
              </button>
              <button type="button" className={p.act} onClick={() => openWa('sinav.yoklama')} disabled={busy === 'wa' || absent === 0}>
                <span className={p.full}>Yoklama bildir{absent > 0 ? ` (${absent})` : ''}</span>
                <span className={p.short}>Yoklama{absent > 0 ? ` ${absent}` : ''}</span>
              </button>
              <button type="button" className={p.act} onClick={() => bulkAtt('present')} disabled={busy === 'bulk' || visible.length === 0}>
                {selected.length ? 'Seçilenler geldi' : (<><span className={p.full}>Tümü geldi</span><span className={p.short}>Geldi</span></>)}
              </button>
              <button type="button" className={p.act} onClick={() => bulkAtt('absent')} disabled={busy === 'bulk' || visible.length === 0}>
                {selected.length ? 'Seçilenler gelmedi' : (<><span className={p.full}>Tümü gelmedi</span><span className={p.short}>Gelmedi</span></>)}
              </button>
            </div>
          </div>

          <div className={p.list}>
            {roomBlocks.length === 0 ? (
              <div className={p.blank}><b>Liste boş</b>Salon ekleyin veya öğrenci arayın.</div>
            ) : roomBlocks.map(block => (
              <div key={block.roomId ?? 'none'} className={p.block}>
                <div className={p.blockHead}>
                  <strong>{block.roomName}</strong>
                  <span>{block.filled} öğrenci{block.empty ? ` · ${block.empty} boş` : ''}</span>
                  {block.roomId === null && unassigned > 0 && (
                    <button type="button" className={p.textBtn} disabled={busy === 'fill'} onClick={() => seat(true)}>
                      Boş sıralara yerleştir
                    </button>
                  )}
                </div>
                <div className={p.head} aria-hidden>
                  <span /><span /><span>Öğrenci</span><span>Oturum</span><span>Salon</span><span>Geldi</span><span>Gelmedi</span><span />
                </div>
                {block.lines.map(line => {
                  if (line.type === 'empty') {
                    const open = seatPick?.roomId === line.roomId && seatPick.seatNo === line.seat;
                    return (
                      <div key={`e-${line.roomId}-${line.seat}`} className={p.empty}>
                        <span className={`${p.seat} ${p.seatEmpty}`}>{line.seat}</span>
                        <span className={p.photo} />
                        {open ? (
                          <div className={p.search}>
                            <input
                              autoFocus
                              placeholder="Ad veya soyad"
                              value={seatQ}
                              onChange={e => searchSeat(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Escape') closeSeatPick(); }}
                              aria-label={`${block.roomName} sıra ${line.seat}`}
                            />
                            {seatHits.length > 0 && (
                              <div className={p.hits}>
                                {seatHits.map(h => (
                                  <button key={h.id} type="button" className={p.hit} disabled={busy === 'add'}
                                    onClick={() => addStudent(h.id, { room_id: line.roomId, seat_no: line.seat })}>
                                    <span>{h.full_name}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <button type="button" className={p.emptyAdd} onClick={() => openSeatPick(line.roomId, line.seat)}>
                            <b>Boş sıra</b>
                            <span>Öğrenci eklemek için tıklayın</span>
                          </button>
                        )}
                        {open ? (
                          <button type="button" className={p.remove} onClick={closeSeatPick}>Vazgeç</button>
                        ) : <span />}
                      </div>
                    );
                  }
                  const row = line.row;
                  return (
                    <div key={row.id} className={p.person}>
                      <label className={`${p.seat} ${row.seat_locked ? p.seatLocked : ''}`}>
                        <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} style={{ position: 'absolute', opacity: 0 }} />
                        {row.seat_no ?? '·'}
                        {row.seat_locked && <span className={p.lock}><Icon name="lock" size={9} /></span>}
                      </label>
                      <span className={p.photo}><StudentPhoto foto={row.profil_foto} name={row.full_name} /></span>
                      <div className={p.who}>
                        <div className={p.name}>
                          {row.full_name}
                          {row.seat_stale && <span className={p.stale}>Mesajı güncelle</span>}
                        </div>
                        <div className={p.meta}>
                          {row.okul_no ? `#${row.okul_no} · ` : ''}
                          {row.sinif || row.sinif_seviyesi || '—'}
                          {row.telefon ? ` · ${row.telefon}` : ''}
                          {row.source === 'manual' ? ' · Manuel' : ''}
                        </div>
                      </div>
                      {sessions.length > 1 && (
                        <select className={p.sessionPick} value={row.exam_session_id ?? ''} onChange={e => changeSession(row.id, e.target.value)} aria-label="Oturum">
                          {sessions.map(sess => (
                            <option key={sess.id} value={sess.id}>
                              {sess.name}{sess.schedule_preference_display ? ` · ${sess.schedule_preference_display}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                      <select className={p.salon} value={row.room_id ?? ''} onChange={e => assignRoom(row.id, e.target.value)} aria-label="Salon">
                        <option value="">Salon seç</option>
                        {roomsForView.filter(rm => rm.id).map(rm => {
                          const used = usedByRoom.get(rm.id!) || 0;
                          const slots = seatNumbers(rm).length;
                          const full = used >= slots && row.room_id !== rm.id;
                          return (
                            <option key={rm.id} value={rm.id} disabled={full}>
                              {rm.name} ({used}/{slots}{full ? ' dolu' : ''})
                            </option>
                          );
                        })}
                      </select>
                      <label data-label="Geldi" className={`${p.mark} ${p.ok} ${row.attendance === 'present' ? p.markOn : ''}`}>
                        <input type="checkbox" checked={row.attendance === 'present'} onChange={() => patchAtt(row.id, row.attendance === 'present' ? '' : 'present')} />
                        <span className={p.short}>Geldi</span>
                      </label>
                      <label data-label="Gelmedi" className={`${p.mark} ${p.miss} ${row.attendance === 'absent' ? p.markOff : ''}`}>
                        <input type="checkbox" checked={row.attendance === 'absent'} onChange={() => patchAtt(row.id, row.attendance === 'absent' ? '' : 'absent')} />
                        <span className={p.short}>Gelmedi</span>
                      </label>
                      <button type="button" className={p.remove} onClick={() => remove(row.id)}>Çıkar</button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <aside className={p.side}>
          <section className={`${p.panel} ${p.salonPanel}`}>
            <div className={p.sideHead}>
              <h3>Salonlar</h3>
              <button type="button" className={p.textBtn} onClick={() => setSalonOpen(v => !v)}>
                {showSalon ? 'Gizle' : 'Düzenle'}
              </button>
            </div>
            {showSalon && (
              <div className={p.sideBody}>
                <p className={p.hint}>
                  Kapasite numaralı yer sayısıdır. Kayıtlı salonu seçince ad ve kapasite dolar. Oturum, ilk sıra ve ara boşluk bu sınava aittir.
                </p>
                <DenemeSalonCatalog salonlar={salonlar} onChange={next => { setSalonlar(next); setError(''); }} onError={setError} />
                {rooms.map((room, i) => {
                  const used = room.id ? (usedByRoom.get(room.id) || 0) : 0;
                  return (
                    <div key={room.id ?? `new-${i}`} className={p.room}>
                      <label className={p.field}>
                        <span>Kayıtlı salon</span>
                        <select
                          value={salonlar.find(s => s.name === room.name)?.id ?? ''}
                          onChange={e => {
                            const salon = salonlar.find(s => s.id === Number(e.target.value));
                            if (!salon) return;
                            setRooms(prev => prev.map((item, j) => j === i ? { ...item, name: salon.name, capacity: salon.capacity } : item));
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
                      <div className={p.roomBar}>
                        <span className={p.occ}>{used}/{seatNumbers(room).length}</span>
                        <span>
                          <button type="button" className={p.textBtn} onClick={() => rememberSalon(room)}>Listeye kaydet</button>
                          <button type="button" className={p.remove} onClick={() => setRooms(prev => prev.filter((_, j) => j !== i))}>Sil</button>
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div className={p.actions}>
                  <button type="button" className={p.act} onClick={() => setRooms(prev => [...prev, { name: `Salon ${prev.length + 1}`, capacity: 30, seat_start: 1, seat_gap: 0, order: prev.length }])}>+ Salon</button>
                  <button type="button" className={p.actPrimary} disabled={busy === 'rooms'} onClick={() => saveRooms(rooms)}>
                    {busy === 'rooms' ? 'Kaydediliyor…' : 'Salonları kaydet'}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className={`${p.panel} ${p.seatPanel}`}>
            <div className={p.sideHead}><h3>Oturma</h3></div>
            <div className={p.sideBody}>
              <div className={p.modes}>
                {([
                  ['shuffle', 'Karışık'],
                  ['cross', 'Çapraz'],
                  ['sequential', 'Sıralı'],
                ] as const).map(([mode, label]) => (
                  <button key={mode} type="button" className={seatingMode === mode ? p.modeOn : p.mode} onClick={() => setSeatingMode(mode)}>
                    {label}
                  </button>
                ))}
              </div>
              <div className={p.actions}>
                <button type="button" className={p.actPrimary} disabled={busy === 'fill' || unassigned === 0} onClick={() => seat(true)}>
                  {busy === 'fill' ? 'Yerleştiriliyor…' : 'Atamasızlar'}
                </button>
                <button type="button" className={p.act} disabled={busy === 'seat'} onClick={() => seat(false)}>Yeniden karıştır</button>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {exportOpen && (
        <RosterExportModal exam={exam} rows={visible} rooms={rooms} onClose={() => setExportOpen(false)} />
      )}
      {waOpen && waPreview && (
        <SinavRosterNotifyModal
          examId={exam.id}
          examName={exam.name}
          eventKey={waEvent}
          preview={waPreview}
          onClose={() => setWaOpen(false)}
          onSent={(sent, errors) => {
            setError(sent
              ? `${sent} mesaj kuyruğa alındı.${errors.length ? ` ${errors[0]}` : ''}`
              : (errors[0] || 'Gönderilemedi.'));
            load();
          }}
        />
      )}
      <div className={p.jumps}>
        <button type="button" className={p.jump} onClick={() => scrollRoster('up')} aria-label="Sayfanın başına git">↑</button>
        <button type="button" className={p.jump} onClick={() => scrollRoster('down')} aria-label="Sayfanın sonuna git">↓</button>
      </div>
    </div>
  );
}
