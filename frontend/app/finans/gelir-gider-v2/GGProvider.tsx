"use client";

import { ReactNode } from "react";
import { ConfigProvider, App as AntApp, theme } from "antd";
import trTR from "antd/locale/tr_TR";

// Kurumsal marka teması — Cari Hesap v2 ile aynı ana renk (#1F3C88).
const BRAND = "#1F3C88";

export default function GGProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      locale={trTR}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: BRAND,
          colorLink: BRAND,
          borderRadius: 10,
          fontFamily:
            "'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif",
        },
        components: {
          Card: { borderRadiusLG: 14 },
          Table: { headerBg: "#f8fafc", headerColor: "#334155", rowHoverBg: "#eff6ff" },
          Button: { fontWeight: 600 },
        },
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
