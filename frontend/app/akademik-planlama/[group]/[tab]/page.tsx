import { notFound } from 'next/navigation';
import DersSaatleriClient from '@/components/akademik/ders-saatleri/DersSaatleriClient';
import CalismaTakvimiClient from '@/components/akademik/calisma-takvimi/CalismaTakvimiClient';
import OgretmenUygunluguClient from '@/components/akademik/ogretmen-uygunlugu/OgretmenUygunluguClient';
import AkademikTabContent from '@/components/akademik/AkademikTabContent';
import {
  AKADEMIK_GROUPS,
  AKADEMIK_MODULE_LABEL,
  findAkademikTab,
} from '@/lib/akademik-routes';

type PageProps = {
  params: { group: string; tab: string };
};

const TAB_PAGES: Record<string, React.ComponentType> = {
  'ders-saatleri': DersSaatleriClient,
  'haftalik-gun-yapilari': CalismaTakvimiClient,
  'ogretmen-uygunluklari': OgretmenUygunluguClient,
};

export function generateStaticParams() {
  return AKADEMIK_GROUPS.flatMap((group) =>
    group.tabs.map((tab) => ({
      group: group.slug,
      tab: tab.segment,
    })),
  );
}

export function generateMetadata({ params }: PageProps) {
  const match = findAkademikTab(params.group, params.tab);
  if (!match) {
    return { title: AKADEMIK_MODULE_LABEL };
  }
  return {
    title: `${match.tab.label} | ${match.group.label} | ${AKADEMIK_MODULE_LABEL}`,
  };
}

export default function AkademikTabPage({ params }: PageProps) {
  const match = findAkademikTab(params.group, params.tab);
  if (!match) {
    notFound();
  }

  const TabComponent = TAB_PAGES[params.tab];
  if (TabComponent) {
    return <TabComponent />;
  }

  return <AkademikTabContent tabLabel={match.tab.label} groupLabel={match.group.label} />;
}
