import { api } from '@/api/client';
import { useSession, type PortalRow, type SubeRow } from '@/auth/store';

export async function loadProfile() {
  const token = useSession.getState().access;
  const [me, context] = await Promise.all([
    api<{ account: { id: number; ad: string; soyad: string }; portals: PortalRow[] }>('/api/mobile/me/'),
    api<{
      yillar: { id: number; ad: string; aktif_mi: boolean }[];
      kurumlar: { id: number; ad: string; kod: string; aktif_mi: boolean }[];
      subeler: SubeRow[];
    }>('/api/mobile/context/'),
  ]);
  if (useSession.getState().access !== token) return;
  useSession.getState().setProfile({
    account: me.account,
    portals: me.portals,
    yillar: context.yillar,
    kurumlar: context.kurumlar,
    subeler: context.subeler,
  });
}
