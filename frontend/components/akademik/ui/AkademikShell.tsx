'use client';

/**
 * Akademik Operasyon modülünün arayüz kabuğu.
 *
 * İki işi var:
 *  1. Ant Design bileşenlerini marka rengine oturtur. Root layout'ta global
 *     bir ConfigProvider olmadığı için modül içindeki Table/Select/Button
 *     aksi halde Ant'ın varsayılan mavisiyle çiziliyordu.
 *  2. Tabloların telefonda kart listesine dönmesini sağlayan altyapıyı
 *     bağlar (öğrenci ve finans modüllerinde kullanılan mekanizma).
 */
import type { ReactNode } from 'react';
import { ConfigProvider, App as AntApp, theme } from 'antd';
import trTR from 'antd/locale/tr_TR';
import MobileTableCards from '@/components/mobile/MobileTableCards';

/** globals.css --primary ile aynı */
const BRAND = '#0262a7';

export const AKADEMIK_ANT_THEME = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: BRAND,
    colorLink: BRAND,
    colorLinkHover: '#01518c',
    colorText: '#1e3352',
    colorTextSecondary: '#7088a4',
    colorBorder: '#dfe6ef',
    colorBorderSecondary: '#dfe6ef',
    borderRadius: 8,
    fontFamily: 'inherit',
    controlHeight: 34,
  },
  components: {
    Table: {
      headerBg: '#f7f9fc',
      headerColor: '#7088a4',
      rowHoverBg: '#eef6fc',
      borderColor: '#dfe6ef',
      cellPaddingBlock: 10,
    },
    Button: { fontWeight: 600 },
    Card: { borderRadiusLG: 12 },
    Select: { optionSelectedBg: '#eef6fc' },
    Tag: { defaultBg: '#eef2f7' },
    Segmented: { itemSelectedBg: '#ffffff', itemSelectedColor: BRAND },
  },
} as const;

export default function AkademikShell({
  children,
  /**
   * Muhasebe portalı kabuğu MobileTableCards'ı kendi layout'unda zaten
   * bağlıyor; orada tekrar bağlamıyoruz.
   */
  mountMobileCards = true,
}: {
  children: ReactNode;
  mountMobileCards?: boolean;
}) {
  return (
    <ConfigProvider locale={trTR} theme={AKADEMIK_ANT_THEME}>
      <AntApp>
        <div className="mobile-cards">
          {mountMobileCards && <MobileTableCards />}
          {children}
        </div>
      </AntApp>
    </ConfigProvider>
  );
}
