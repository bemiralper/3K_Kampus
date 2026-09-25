import type { ExamRoomItem, PreviewStudent, SeatingMode } from '../types';

export function seatNumbers(room: Pick<ExamRoomItem, 'capacity' | 'seat_start' | 'seat_gap'>): number[] {
  const cap = Math.max(0, Math.floor(Number(room.capacity) || 0));
  const start = Math.max(1, Math.floor(Number(room.seat_start) || 1));
  const gap = Math.max(0, Math.floor(Number(room.seat_gap) || 0));
  if (cap === 0) return [];
  const end = start + cap - 1;
  const out: number[] = [];
  for (let n = start; n <= end; n += gap + 1) out.push(n);
  return out;
}

export type SeatedStudent = PreviewStudent & {
  room_name: string;
  room_index: number;
  seat_no: number;
  session_index?: number;
};

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function orderStudents(students: PreviewStudent[], mode: SeatingMode): PreviewStudent[] {
  if (mode === 'sequential') {
    return [...students].sort((a, b) =>
      `${a.soyad} ${a.ad}`.localeCompare(`${b.soyad} ${b.ad}`, 'tr'),
    );
  }
  if (mode === 'cross') {
    const buckets = new Map<string, PreviewStudent[]>();
    for (const st of shuffle(students)) {
      const key = String(st.sinif_seviyesi_id || st.deneme_paketi_id || 'x');
      buckets.set(key, [...(buckets.get(key) || []), st]);
    }
    const ordered: PreviewStudent[] = [];
    const keys = [...buckets.keys()];
    while (ordered.length < students.length) {
      for (const key of keys) {
        const next = buckets.get(key)?.shift();
        if (next) ordered.push(next);
      }
    }
    return ordered;
  }
  return shuffle(students);
}

function placeStudents(
  students: PreviewStudent[],
  rooms: { room: ExamRoomItem; roomIndex: number }[],
  sessionIndex: number | undefined,
  fallbackMode: SeatingMode,
): SeatedStudent[] {
  const queue = [...students].sort((a, b) =>
    `${a.soyad} ${a.ad}`.localeCompare(`${b.soyad} ${b.ad}`, 'tr'),
  );
  const out: SeatedStudent[] = [];
  let cursor = 0;
  for (const { room, roomIndex } of rooms) {
    const seats = seatNumbers(room);
    const chunk = queue.slice(cursor, cursor + seats.length);
    cursor += chunk.length;
    const ordered = orderStudents(chunk, room.seating_mode || fallbackMode);
    ordered.forEach((st, i) => {
      out.push({
        ...st,
        room_name: room.name,
        room_index: roomIndex,
        seat_no: seats[i],
        session_index: sessionIndex,
      });
    });
  }
  return out;
}

export function previewSeating(
  students: PreviewStudent[],
  rooms: ExamRoomItem[],
  mode: SeatingMode,
  sessions?: { schedule_preference?: string }[],
): SeatedStudent[] {
  const usable = rooms
    .map((room, roomIndex) => ({ room, roomIndex }))
    .filter(x => x.room.name.trim() && x.room.capacity > 0);
  if (!students.length || !usable.length) return [];

  if (!sessions || sessions.length < 2) {
    return placeStudents(students, usable, undefined, mode);
  }

  const out: SeatedStudent[] = [];
  sessions.forEach((sess, si) => {
    const pref = sess.schedule_preference || 'FARKETMEZ';
    const cohort = students.filter(st => {
      const group = st.schedule_group || 'HAFTA_ICI';
      return pref === 'FARKETMEZ' || group === pref;
    });
    const sessionRooms = usable.filter(x => x.room.session_index == null || x.room.session_index === si);
    out.push(...placeStudents(cohort, sessionRooms, si, mode));
  });
  return out;
}

export function groupSeated(rows: SeatedStudent[]) {
  const map = new Map<string, SeatedStudent[]>();
  for (const r of rows) {
    map.set(r.room_name, [...(map.get(r.room_name) || []), r]);
  }
  return [...map.entries()];
}
