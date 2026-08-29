'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { examApi } from '../api';
import type { ExamDetail, ExamParticipantRow, ExamRoomItem, ExamSessionItem, ParticipantSearchHit, SeatingMode } from '../types';
import Icon from '../ui/Icon';
import RosterExportModal from './RosterExportModal';
import r from './roster.module.css';

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
    const bySeat = new Map<number, ExamParticipantRow>();
    const extras: ExamParticipantRow[] = [];
    for (const row of inRoom) {
      const n = row.seat_no;
      if (n && n >= 1 && n <= room.capacity && !bySeat.has(n)) bySeat.set(n, row);
      else extras.push(row);
    }
    const lines: SeatLine[] = [];
    let empty = 0;
    for (let seat = 1; seat <= room.capacity; seat++) {
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
  const [exportOpen, setExportOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [waEvent, setWaEvent] = useState<'sinav.hatirlatma' | 'sinav.yoklama'>('sinav.hatirlatma');
  const [waPreview, setWaPreview] = useState<Awaited<ReturnType<typeof examApi.hatirlatmaPreview>> | null>(null);
  const [waVeli, setWaVeli] = useState<number[]>([]);
  const [waStudent, setWaStudent] = useState(false);

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

  const visible = useMemo(() => {
    if (!sessionId || sessions.length < 2) return rows;
    return rows.filter(x => x.exam_session_id === sessionId);
  }, [rows, sessionId, sessions.length]);

  const cap = rooms.reduce((a, rm) => a + (rm.capacity || 0), 0);
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
      setWaVeli(
        preview.students.flatMap(st =>
          st.recipients.filter(rec => rec.recipient_type === 'veli' && rec.veli_id && !rec.skip_reason)
            .map(rec => rec.veli_id as number),
        ),
      );
      setWaStudent(true);
      setWaOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Önizleme alınamadı.');
    } finally { setBusy(''); }
  };

  const sendWa = async () => {
    if (!waPreview) return;
    setBusy('send');
    try {
      const res = await examApi.hatirlatmaSend(exam.id, {
        participant_ids: waPreview.students.map(st => st.participant_id),
        veli_ids: waVeli,
        include_student: waStudent,
        event_key: waEvent,
      });
      setWaOpen(false);
      setError(res.sent ? `${res.sent} mesaj kuyruğa alındı.` : (res.errors[0] || 'Gönderilemedi.'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gönderilemedi.');
    } finally { setBusy(''); }
  };

  const roomBlocks = useMemo(() => buildRoomBlocks(rooms, visible), [rooms, visible]);
  const emptySeats = roomBlocks.reduce((n, b) => n + b.empty, 0);

  if (loading) {
    return <p className={r.meta}>Katılımcı listesi yükleniyor…</p>;
  }

  return (
    <div className={r.page}>
      {error && (
        <div style={{
          padding: '12px 16px',
          background: overflow ? '#fef2f2' : '#f8fafc',
          border: `1px solid ${overflow ? '#fecaca' : '#e2e8f0'}`,
          borderRadius: 12, color: overflow ? '#991b1b' : '#334155', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <div className={r.hero}>
        <div className={r.heroCopy}>
          <h2>Katılımcılar</h2>
          <p>Yoklama alın, oturmayı karıştırın, listeleri indirin veya öğrenci / veliye sınav mesajı gönderin.</p>
        </div>
        <div className={r.toolbar}>
          <button type="button" className="btn-modern btn-secondary" onClick={() => setExportOpen(true)}>
            <Icon name="download" size={14} /> Dışa aktar
          </button>
          <button
            type="button"
            className="btn-modern btn-primary"
            onClick={() => openWa('sinav.hatirlatma')}
            disabled={busy === 'wa' || visible.length === 0}
          >
            Sınav bilgisi
          </button>
          <button
            type="button"
            className="btn-modern btn-secondary"
            onClick={() => openWa('sinav.yoklama')}
            disabled={busy === 'wa' || absent === 0}
          >
            Yoklama bildir{absent > 0 ? ` (${absent})` : ''}
          </button>
        </div>
      </div>

      {sessions.length > 1 && (
        <div className={r.sessionTabs}>
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
                className={sessionId === sess.id ? r.sessionOn : r.sessionTab}
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

      <div className={r.stats}>
        <div className={r.stat}><span className={r.statValue}>{visible.length}</span><span className={r.statLabel}>Katılımcı</span></div>
        <div className={r.stat}><span className={r.statValue}>{cap}</span><span className={r.statLabel}>Kapasite</span></div>
        <div className={r.stat}><span className={r.statValue}>{present}</span><span className={r.statLabel}>Geldi</span></div>
        <div className={r.stat}><span className={r.statValue}>{absent}</span><span className={r.statLabel}>Gelmedi</span></div>
        <div className={r.stat}><span className={r.statValue}>{unassigned}</span><span className={r.statLabel}>Salonsuz</span></div>
      </div>

      <div className={r.grid3} style={{ gridTemplateColumns: '1.2fr 1fr' }}>
        <section className={r.card}>
          <div className={r.cardHead}>
            <div>
              <h3>Salonlar</h3>
              <p>{visible.length} öğrenci · {cap} kişilik{overflow ? ' — kapasite yetersiz' : ''}</p>
            </div>
          </div>
          <div className={r.cardBody}>
            {rooms.map((room, i) => {
              const used = room.id ? (usedByRoom.get(room.id) || 0) : 0;
              return (
                <div key={room.id ?? `new-${i}`} className={r.roomEdit}>
                  <label className={r.field}>
                    <span>Salon adı</span>
                    <input value={room.name}
                      onChange={e => setRooms(p => p.map((item, j) => j === i ? { ...item, name: e.target.value } : item))} />
                  </label>
                  <label className={r.field}>
                    <span>Kapasite</span>
                    <input type="number" min={1} value={room.capacity}
                      onChange={e => setRooms(p => p.map((item, j) => j === i ? { ...item, capacity: Number(e.target.value) || 1 } : item))} />
                  </label>
                  <span className={r.occ}>{used}/{room.capacity}</span>
                  <button type="button" className={r.ghost} onClick={() => setRooms(p => p.filter((_, j) => j !== i))}>×</button>
                </div>
              );
            })}
            <div className={r.toolbar}>
              <button type="button" className="btn-modern btn-secondary"
                onClick={() => setRooms(p => [...p, { name: `Salon ${p.length + 1}`, capacity: 30, order: p.length }])}>
                + Salon
              </button>
              <button type="button" className="btn-modern btn-primary" disabled={busy === 'rooms'}
                onClick={() => saveRooms(rooms)}>
                {busy === 'rooms' ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        </section>

        <section className={r.card}>
          <div className={r.cardHead}>
            <div>
              <h3>Oturma</h3>
              <p>
                {unassigned
                  ? `${unassigned} öğrenci salon bekliyor. Sonradan eklenenler boş sıralara oturur.`
                  : 'Herkes bir salona yerleşti. Çıkarılanların yeri boş kalır; yeni eklenen oraya oturur.'}
              </p>
            </div>
          </div>
          <div className={r.cardBody}>
            <div className={r.modeGrid} style={{ gridTemplateColumns: '1fr' }}>
              {([
                ['shuffle', 'Karışık'],
                ['cross', 'Çapraz'],
                ['sequential', 'Sıralı'],
              ] as const).map(([mode, label]) => (
                <button key={mode} type="button"
                  className={seatingMode === mode ? r.modeOn : r.mode}
                  onClick={() => setSeatingMode(mode)}>
                  <b>{label}</b>
                </button>
              ))}
            </div>
            <div className={r.toolbar} style={{ marginTop: 12 }}>
              <button type="button" className="btn-modern btn-primary"
                disabled={busy === 'fill' || unassigned === 0}
                onClick={() => seat(true)}>
                {busy === 'fill' ? 'Yerleştiriliyor…' : 'Atamasızları yerleştir'}
              </button>
              <button type="button" className="btn-modern btn-secondary"
                disabled={busy === 'seat'} onClick={() => seat(false)}>
                Tümünü yeniden karıştır
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className={r.card}>
        <div className={r.cardHead}>
          <div>
            <h3>Öğrenci listesi</h3>
            <p>
              {emptySeats
                ? `${emptySeats} boş sıra var. Boş sıraya tıklayıp öğrenci ekleyin.`
                : 'Salon sütunundan atayın. Mesaj giden sıralar kilitli kalır.'}
            </p>
          </div>
          <div className={r.search} style={{ minWidth: 260 }}>
            <input placeholder="Öğrenci ara ve ekle…" value={q} onChange={e => search(e.target.value)} />
            {hits.length > 0 && (
              <div className={r.hits}>
                {hits.map(h => (
                  <button key={h.id} type="button" className={r.hit} onClick={() => addStudent(h.id)}>
                    <span>{h.full_name}</span>
                    {h.in_other_session && <span className={r.hitNote}>{otherSessionLabel(h)}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className={r.cardBody} style={{ paddingTop: 0 }}>
          {roomBlocks.length === 0 ? (
            <div className={r.empty}><b>Liste boş</b>Önce salon ekleyin veya yukarıdan öğrenci ekleyin.</div>
          ) : roomBlocks.map(block => (
            <div key={block.roomId ?? 'unassigned'} className={r.roomBlock} style={{ marginTop: 12 }}>
              <div className={r.roomHead}>
                <strong>{block.roomName}</strong>
                <span>
                  {block.filled} öğrenci
                  {block.empty ? ` · ${block.empty} boş` : ''}
                </span>
                {block.roomId === null && unassigned > 0 && (
                  <button type="button" className="btn-modern btn-primary" style={{ marginLeft: 'auto' }}
                    disabled={busy === 'fill'} onClick={() => seat(true)}>
                    Boş sıralara yerleştir
                  </button>
                )}
              </div>
              <div className={r.list}>
                <div className={r.listHead}>
                  <span>Sıra</span>
                  <span>Öğrenci</span>
                  <span>Salon</span>
                  <span>Geldi</span>
                  <span>Gelmedi</span>
                  <span />
                </div>
                {block.lines.map(line => {
                  if (line.type === 'empty') {
                    const open = seatPick?.roomId === line.roomId && seatPick.seatNo === line.seat;
                    return (
                      <div key={`empty-${line.roomId}-${line.seat}`} className={`${r.row} ${r.emptyRow}${open ? ` ${r.emptyRowOn}` : ''}`}>
                        <span className={`${r.seat} ${r.seatEmpty}`}>{line.seat}</span>
                        {open ? (
                          <div className={r.search}>
                            <input
                              autoFocus
                              placeholder="Ad veya soyad yazın…"
                              value={seatQ}
                              onChange={e => searchSeat(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Escape') closeSeatPick(); }}
                              aria-label={`${block.roomName} sıra ${line.seat} için öğrenci ara`}
                            />
                            {seatHits.length > 0 && (
                              <div className={r.hits}>
                                {seatHits.map(h => (
                                  <button
                                    key={h.id}
                                    type="button"
                                    className={r.hit}
                                    disabled={busy === 'add'}
                                    onClick={() => addStudent(h.id, { room_id: line.roomId, seat_no: line.seat })}
                                  >
                                    <span>{h.full_name}</span>
                                    {h.in_other_session && <span className={r.hitNote}>{otherSessionLabel(h)}</span>}
                                  </button>
                                ))}
                              </div>
                            )}
                            {seatQ.trim().length >= 2 && seatHits.length === 0 && (
                              <div className={r.hits}><div className={r.hitMuted}>Öğrenci bulunamadı</div></div>
                            )}
                          </div>
                        ) : (
                          <button type="button" className={r.emptyAdd} onClick={() => openSeatPick(line.roomId, line.seat)}>
                            <span className={r.nameMuted}>Boş sıra</span>
                            <span className={r.meta}>Öğrenci eklemek için tıklayın</span>
                          </button>
                        )}
                        <span className={r.meta}>{block.roomName}</span>
                        <span />
                        <span />
                        {open ? (
                          <button type="button" className={r.ghost} onClick={closeSeatPick}>Vazgeç</button>
                        ) : (
                          <span />
                        )}
                      </div>
                    );
                  }
                  const row = line.row;
                  return (
                  <div key={row.id} className={r.row}>
                    <label className={`${r.seat} ${row.seat_locked ? r.seatLocked : ''}`} style={{ cursor: 'pointer' }}>
                      <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)}
                        style={{ position: 'absolute', opacity: 0 }} />
                      {row.seat_no ?? '·'}
                      {row.seat_locked && <span className={r.lockDot} title="Sıra kilitli — mesaj gönderildi"><Icon name="lock" size={9} /></span>}
                    </label>
                    <div>
                      <div className={r.name}>
                        {row.full_name}
                        {row.seat_stale && <span className={r.stale}>Mesajı güncelle</span>}
                      </div>
                      <div className={r.meta}>
                        {row.okul_no ? `#${row.okul_no} · ` : ''}
                        {row.sinif || row.sinif_seviyesi || '—'}
                        {row.telefon ? ` · ${row.telefon}` : ''}
                        {row.source === 'manual' ? ' · Manuel' : ''}
                      </div>
                      {sessions.length > 1 && (
                        <select
                          className={r.sessionPick}
                          value={row.exam_session_id ?? ''}
                          onChange={e => changeSession(row.id, e.target.value)}
                          aria-label="Oturum"
                        >
                          {sessions.map(sess => (
                            <option key={sess.id} value={sess.id}>
                              {sess.name}
                              {sess.schedule_preference_display ? ` · ${sess.schedule_preference_display}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <select
                      className={r.roomPick}
                      value={row.room_id ?? ''}
                      onChange={e => assignRoom(row.id, e.target.value)}
                    >
                      <option value="">Salon seç</option>
                      {rooms.filter(rm => rm.id).map(rm => {
                        const used = usedByRoom.get(rm.id!) || 0;
                        const full = used >= rm.capacity && row.room_id !== rm.id;
                        return (
                          <option key={rm.id} value={rm.id} disabled={full}>
                            {rm.name} ({used}/{rm.capacity}{full ? ' dolu' : ''})
                          </option>
                        );
                      })}
                    </select>
                    <label className={`${r.check} ${row.attendance === 'present' ? r.checkOn : ''}`}>
                      <input
                        type="checkbox"
                        checked={row.attendance === 'present'}
                        onChange={() => patchAtt(row.id, row.attendance === 'present' ? '' : 'present')}
                      />
                    </label>
                    <label className={`${r.check} ${row.attendance === 'absent' ? r.checkOff : ''}`}>
                      <input
                        type="checkbox"
                        checked={row.attendance === 'absent'}
                        onChange={() => patchAtt(row.id, row.attendance === 'absent' ? '' : 'absent')}
                      />
                    </label>
                    <button type="button" className={r.ghost} onClick={() => remove(row.id)}>Çıkar</button>
                  </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {exportOpen && (
        <RosterExportModal exam={exam} rows={visible} rooms={rooms} onClose={() => setExportOpen(false)} />
      )}

      {waOpen && waPreview && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div className={r.card} style={{ width: 'min(560px, 100%)', maxHeight: '80vh', overflow: 'auto' }}>
            <div className={r.cardHead}>
              <div>
                <h3>{waPreview.event_label || (waEvent === 'sinav.yoklama' ? 'Sınav yoklama bildirimi' : 'Sınav bilgilendirmesi')}</h3>
                <p>
                  {waEvent === 'sinav.yoklama'
                    ? 'Gelmedi işaretlenen öğrenci ve velisine katılmama mesajı gider.'
                    : 'Salon, sıra, tarih ve saat öğrenci ile veliye yazılır.'}
                </p>
              </div>
              <button type="button" className={r.ghost} onClick={() => setWaOpen(false)}>Kapat</button>
            </div>
            <div className={r.cardBody}>
              {waPreview.students.map(st => (
                <div key={st.participant_id} style={{ marginBottom: 12 }}>
                  <strong>{st.full_name}</strong>
                  <span className={r.meta} style={{ marginLeft: 8 }}>{st.salon_ad} · sıra {st.sira}</span>
                  {st.recipients.filter(rec => rec.recipient_type === 'veli').map(rec => (
                    <label key={`${st.participant_id}-${rec.veli_id}`} style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        disabled={!rec.veli_id || !!rec.skip_reason}
                        checked={!!rec.veli_id && waVeli.includes(rec.veli_id)}
                        onChange={() => {
                          if (!rec.veli_id) return;
                          setWaVeli(p => p.includes(rec.veli_id!) ? p.filter(x => x !== rec.veli_id) : [...p, rec.veli_id!]);
                        }}
                      />
                      {rec.display_name || 'Veli'} {rec.telefon && `(${rec.telefon})`}
                      {rec.skip_reason && <em style={{ color: '#b45309' }}> — {rec.skip_reason}</em>}
                    </label>
                  ))}
                </div>
              ))}
              <label style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={waStudent} onChange={e => setWaStudent(e.target.checked)} />
                Öğrenciye de gönder
              </label>
              <div className={r.toolbar} style={{ marginTop: 14, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-modern btn-secondary" onClick={() => setWaOpen(false)}>Vazgeç</button>
                <button type="button" className="btn-modern btn-primary" disabled={busy === 'send'} onClick={sendWa}>Gönder</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
