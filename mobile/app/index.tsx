import { Redirect } from 'expo-router';

import { useSession } from '@/auth/store';

export default function Index() {
  const ready = useSession((state) => state.ready);
  const access = useSession((state) => state.access);
  const kurumId = useSession((state) => state.kurumId);
  if (!ready) return null;
  if (!access) return <Redirect href="/login" />;
  if (!kurumId) return <Redirect href="/baglam" />;
  return <Redirect href="/ana" />;
}
