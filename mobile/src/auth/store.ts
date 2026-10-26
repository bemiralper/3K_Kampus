import { create } from 'zustand';

import { readSecret, writeSecret } from './storage';

export type PortalRow = { code: string; label: string; enterable: boolean };
export type YearRow = { id: number; ad: string; aktif_mi: boolean };
export type KurumRow = { id: number; ad: string; kod: string; aktif_mi: boolean };
export type SubeRow = KurumRow & { kurum_id: number; egitim_yili_id: number };

type SessionState = {
  ready: boolean;
  access: string | null;
  refresh: string | null;
  deviceId: string | null;
  account: { id: number; ad: string; soyad: string } | null;
  portals: PortalRow[];
  yillar: YearRow[];
  kurumlar: KurumRow[];
  subeler: SubeRow[];
  kurumId: number | null;
  subeId: number | null;
  yilId: number | null;
  hydrate: () => Promise<void>;
  setTokens: (access: string, refresh: string) => Promise<void>;
  setProfile: (profile: {
    account: SessionState['account'];
    portals: PortalRow[];
    yillar: YearRow[];
    kurumlar: KurumRow[];
    subeler: SubeRow[];
  }) => void;
  setContext: (kurumId: number, subeId: number, yilId: number) => Promise<void>;
  clear: () => Promise<void>;
};

async function numberKey(key: string): Promise<number | null> {
  const raw = await readSecret(key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export const useSession = create<SessionState>((set, get) => ({
  ready: false,
  access: null,
  refresh: null,
  deviceId: null,
  account: null,
  portals: [],
  yillar: [],
  kurumlar: [],
  subeler: [],
  kurumId: null,
  subeId: null,
  yilId: null,
  hydrate: async () => {
    let deviceId = await readSecret('device-id');
    if (!deviceId) {
      deviceId = `cihaz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      await writeSecret('device-id', deviceId);
    }
    const [access, refresh, kurumId, subeId, yilId] = await Promise.all([
      readSecret('access'),
      readSecret('refresh'),
      numberKey('kurum-id'),
      numberKey('sube-id'),
      numberKey('yil-id'),
    ]);
    set({ ready: true, access, refresh, deviceId, kurumId, subeId, yilId });
  },
  setTokens: async (access, refresh) => {
    await writeSecret('access', access);
    await writeSecret('refresh', refresh);
    set({ access, refresh });
  },
  setProfile: (profile) => set(profile),
  setContext: async (kurumId, subeId, yilId) => {
    await writeSecret('kurum-id', String(kurumId));
    await writeSecret('sube-id', String(subeId));
    await writeSecret('yil-id', String(yilId));
    set({ kurumId, subeId, yilId });
  },
  clear: async () => {
    const deviceId = get().deviceId;
    await Promise.all([
      writeSecret('access', null),
      writeSecret('refresh', null),
      writeSecret('kurum-id', null),
      writeSecret('sube-id', null),
      writeSecret('yil-id', null),
      writeSecret('topic-drafts', null),
    ]);
    set({
      access: null,
      refresh: null,
      account: null,
      portals: [],
      yillar: [],
      kurumlar: [],
      subeler: [],
      kurumId: null,
      subeId: null,
      yilId: null,
      deviceId,
    });
  },
}));
