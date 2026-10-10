import type { ExamRoomItem, PreviewStudent, SeatingMode } from '../types';

type SeatRoom = Pick<ExamRoomItem, 'capacity' | 'seat_start' | 'seat_gap' | 'inactive_seats'>;

/** Aralık ve tek numaralar: "5, 12, 18-20". */
export function parseInactiveSeats(text: string): number[] {
  const found: number[] = [];
  for (const raw of text.split(/[,;]+/)) {
    const token = raw.trim();
    if (!token) continue;
    const range = token.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (range) {
      let a = Number(range[1]);
      let b = Number(range[2]);
      if (a > b) [a, b] = [b, a];
      if (a < 1) a = 1;
      const last = Math.min(b, a + 500);
      for (let n = a; n <= last; n += 1) found.push(n);
      continue;
    }
    if (/^\d+$/.test(token)) {
      const n = Number(token);
      if (n >= 1) found.push(n);
    }
  }
  return [...new Set(found)].sort((a, b) => a - b).slice(0, 2000);
}

export function formatInactiveSeats(seats: number[] | undefined): string {
  const nums = [...new Set((seats || [])
    .map(n => Math.floor(Number(n)))
    .filter(n => n >= 1))].sort((a, b) => a - b);
  if (!nums.length) return '';
  const parts: string[] = [];
  let start = nums[0];
  let prev = nums[0];
  for (let i = 1; i <= nums.length; i += 1) {
    const n = nums[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? String(start) : `${start}-${prev}`);
    start = n;
    prev = n;
  }
  return parts.join(', ');
}

export function inactiveSeatSet(seats: number[] | undefined): Set<number> {
  return new Set(parseInactiveSeats(formatInactiveSeats(seats)));
}

/** Ara boşluk uygulanmış, pasifler dahil bütün numaralı yerler. */
export function candidateSeats(room: SeatRoom): number[] {
  const cap = Math.max(0, Math.floor(Number(room.capacity) || 0));
  const start = Math.max(1, Math.floor(Number(room.seat_start) || 1));
  const gap = Math.max(0, Math.floor(Number(room.seat_gap) || 0));
  if (cap === 0) return [];
  const end = start + cap - 1;
  const out: number[] = [];
  for (let n = start; n <= end; n += gap + 1) out.push(n);
  return out;
}

export function seatNumbers(room: SeatRoom): number[] {
  const skip = inactiveSeatSet(room.inactive_seats);
  return candidateSeats(room).filter(n => !skip.has(n));
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
