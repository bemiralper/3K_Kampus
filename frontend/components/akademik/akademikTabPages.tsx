import DersSaatleriClient from '@/components/akademik/ders-saatleri/DersSaatleriClient';
import CalismaTakvimiClient from '@/components/akademik/calisma-takvimi/CalismaTakvimiClient';
import OgretmenUygunluguClient from '@/components/akademik/ogretmen-uygunlugu/OgretmenUygunluguClient';
import SinifDersPlanlariClient from '@/components/akademik/sinif-ders-planlari/SinifDersPlanlariClient';
import DersProgramiClient from '@/components/akademik/ders-programi/DersProgramiClient';
import BugunkuDerslerClient from '@/components/akademik/bugunku-dersler/BugunkuDerslerClient';
import DersOturumlariClient from '@/components/akademik/ders-oturumlari/DersOturumlariClient';
import OgretmenYoklamalariClient from '@/components/akademik/ogretmen-yoklamalari/OgretmenYoklamalariClient';
import OgrenciYoklamalariClient from '@/components/akademik/ogrenci-yoklamalari/OgrenciYoklamalariClient';
import OzelDerslerClient from '@/components/akademik/ozel-dersler/OzelDerslerClient';
import TelafiDersleriClient from '@/components/akademik/telafi-dersleri/TelafiDersleriClient';
import EkDerslerClient from '@/components/akademik/ek-dersler/EkDerslerClient';
import DersUcretleriClient from '@/components/akademik/ders-ucretleri/DersUcretleriClient';
import ProgramRevizyonlariClient from '@/components/akademik/program-revizyonlari/ProgramRevizyonlariClient';
import OgrenciProgramlariClient from '@/components/akademik/ozel-ders-yonetimi/OgrenciProgramlariClient';
import HaftalikSablonlariClient from '@/components/akademik/ozel-ders-yonetimi/HaftalikSablonlariClient';
import BirebirOturumlarClient from '@/components/akademik/ozel-ders-yonetimi/BirebirOturumlarClient';
import BirebirYoklamalarClient from '@/components/akademik/ozel-ders-yonetimi/BirebirYoklamalarClient';
import BirebirTelafiClient from '@/components/akademik/ozel-ders-yonetimi/BirebirTelafiClient';
import PremiumPaketlerClient from '@/components/akademik/ozel-ders-yonetimi/PremiumPaketlerClient';
import HakedisTakibiClient from '@/components/akademik/ozel-ders-yonetimi/HakedisTakibiClient';
import AkademikTabContent from '@/components/akademik/AkademikTabContent';
import {
  AKADEMIK_GROUPS,
  AKADEMIK_MODULE_LABEL,
  akademikTabHref,
  findAkademikTab,
} from '@/lib/akademik-routes';
import { notFound, redirect } from 'next/navigation';

export const AKADEMIK_TAB_PAGES: Record<string, React.ComponentType> = {
  'ders-saatleri': DersSaatleriClient,
  'haftalik-gun-yapilari': CalismaTakvimiClient,
  'ogretmen-uygunluklari': OgretmenUygunluguClient,
  'sinif-ders-planlari': SinifDersPlanlariClient,
  'ders-programi': DersProgramiClient,
  'bugunku-dersler': BugunkuDerslerClient,
  'ders-oturumlari': DersOturumlariClient,
  'ogretmen-yoklamalari': OgretmenYoklamalariClient,
  'ogrenci-yoklamalari': OgrenciYoklamalariClient,
  'ozel-dersler': OzelDerslerClient,
  'telafi-dersleri': TelafiDersleriClient,
  'ek-dersler': EkDerslerClient,
  'ders-ucretleri': DersUcretleriClient,
  'program-revizyonlari': ProgramRevizyonlariClient,
  'ogrenci-programlari': OgrenciProgramlariClient,
  'haftalik-program-sablonlari': HaftalikSablonlariClient,
  'birebir-ders-oturumlari': BirebirOturumlarClient,
  'birebir-yoklamalar': BirebirYoklamalarClient,
  'birebir-telafi-dersleri': BirebirTelafiClient,
  'premium-paketler': PremiumPaketlerClient,
  'hakedis-takibi': HakedisTakibiClient,
};

export function generateAkademikStaticParams() {
  return AKADEMIK_GROUPS.flatMap((group) =>
    group.tabs.map((tab) => ({
      group: group.slug,
      tab: tab.segment,
    })),
  );
}

export function akademikTabMetadata(params: { group: string; tab: string }) {
  if (params.group === 'planlama' && params.tab === 'ogretmen-atamalari') {
    return { title: `Sınıf Ders Planları | Planlama | ${AKADEMIK_MODULE_LABEL}` };
  }
  const match = findAkademikTab(params.group, params.tab);
  if (!match) {
    return { title: AKADEMIK_MODULE_LABEL };
  }
  return {
    title: `${match.tab.label} | ${match.group.label} | ${AKADEMIK_MODULE_LABEL}`,
  };
}

export function renderAkademikTabPage(
  params: { group: string; tab: string },
  basePath: string,
) {
  if (params.group === 'planlama' && params.tab === 'ogretmen-atamalari') {
    redirect(akademikTabHref('planlama', 'sinif-ders-planlari', basePath));
  }
  if (params.group === 'ozel-ders-yonetimi' && params.tab === 'resmi-tatiller') {
    redirect('/admin/takvim/resmi-tatiller');
  }

  const match = findAkademikTab(params.group, params.tab);
  if (!match) {
    notFound();
  }

  const TabComponent = AKADEMIK_TAB_PAGES[params.tab];
  if (TabComponent) {
    return <TabComponent />;
  }

  return <AkademikTabContent tabLabel={match.tab.label} groupLabel={match.group.label} />;
}
