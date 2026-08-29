import type { ExamRoomItem, PreviewStudent, SeatingMode } from '../types';

export type SeatedStudent = PreviewStudent & {
  room_name: string;
  room_index: number;
  seat_no: number;
};

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function previewSeating(
  students: PreviewStudent[],
  rooms: ExamRoomItem[],
  mode: SeatingMode,
): SeatedStudent[] {
  const usable = rooms.filter(r => r.name.trim() && r.capacity > 0);
  if (!students.length || !usable.length) return [];

  let ordered = [...students];
  if (mode === 'sequential') {
    ordered.sort((a, b) =>
      `${a.soyad} ${a.ad}`.localeCompare(`${b.soyad} ${b.ad}`, 'tr'),
    );
  } else if (mode === 'cross') {
    const buckets = new Map<string, PreviewStudent[]>();
    for (const st of shuffle(students)) {
      const key = String(st.sinif_seviyesi_id || st.deneme_paketi_id || 'x');
      buckets.set(key, [...(buckets.get(key) || []), st]);
    }
    ordered = [];
    const keys = [...buckets.keys()];
    while (ordered.length < students.length) {
      for (const key of keys) {
        const next = buckets.get(key)?.shift();
        if (next) ordered.push(next);
      }
    }
  } else {
    ordered = shuffle(students);
  }

  const out: SeatedStudent[] = [];
  let idx = 0;
  usable.forEach((room, roomIndex) => {
    for (let seat = 1; seat <= room.capacity && idx < ordered.length; seat++) {
      out.push({
        ...ordered[idx],
        room_name: room.name,
        room_index: roomIndex,
        seat_no: seat,
      });
      idx += 1;
    }
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
