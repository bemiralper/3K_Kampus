import { redirect } from 'next/navigation';
import { MUHASEBE_COACHING_BASE } from '@/lib/coaching-routes';

export default function MuhasebeCoachingIndexPage() {
  redirect(`${MUHASEBE_COACHING_BASE}/coaches`);
}
