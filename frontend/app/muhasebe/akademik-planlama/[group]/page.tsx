import { notFound, redirect } from 'next/navigation';
import {
  MUHASEBE_AKADEMIK_BASE,
  akademikTabHref,
  findAkademikGroup,
} from '@/lib/akademik-routes';

type PageProps = {
  params: { group: string };
};

export default function MuhasebeAkademikGroupIndexPage({ params }: PageProps) {
  const group = findAkademikGroup(params.group);
  if (!group || group.tabs.length === 0) {
    notFound();
  }

  redirect(akademikTabHref(group.slug, group.tabs[0].segment, MUHASEBE_AKADEMIK_BASE));
}
