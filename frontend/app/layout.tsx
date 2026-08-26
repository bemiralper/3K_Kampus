import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/contexts/AuthContext";
import AppShellWithAuth from "@/components/layout/AppShellWithAuth";
import ChunkLoadRecovery from "@/components/ChunkLoadRecovery";
import PublicMarketingIntegrations from "@/components/landing/PublicMarketingIntegrations";
import { getLandingPageData } from "@/lib/landing-page-data";

/**
 * Meta Business domain verification (https://3kkampus.com/)
 *
 * Doğrulama tamamlandıktan sonra kaldırmak için:
 * 1) Bu sabiti `null` yapın veya silin, ya da
 * 2) Production env'de `NEXT_PUBLIC_FACEBOOK_DOMAIN_VERIFICATION=off` set edip redeploy edin.
 */
const FACEBOOK_DOMAIN_VERIFICATION: string | null =
  process.env.NEXT_PUBLIC_FACEBOOK_DOMAIN_VERIFICATION === "off"
    ? null
    : process.env.NEXT_PUBLIC_FACEBOOK_DOMAIN_VERIFICATION?.trim() ||
      "rzjoujm3azogd4hc17sr0l3x3s2ofo";

/** Env yedek — asıl kaynak aktif WhatsApp hesabındaki Meta App ID (landing API). */
const FACEBOOK_APP_ID_ENV =
  process.env.NEXT_PUBLIC_FACEBOOK_APP_ID?.trim() || "";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "3K Kampüs",
  description: "3K Kampüs Eğitim Yönetim Sistemi",
  // Varsayılan icon'u kapat — ActiveKurumBranding şube/kurum favicon'unu uygular.
  // (public/favicon.svg yine fallback dosya olarak kalır; <link> client tarafında yönetilir.)
  icons: {},
  ...(FACEBOOK_DOMAIN_VERIFICATION
    ? {
        other: {
          "facebook-domain-verification": FACEBOOK_DOMAIN_VERIFICATION,
        },
      }
    : {}),
};

async function resolveFacebookAppId(): Promise<string> {
  if (FACEBOOK_APP_ID_ENV) return FACEBOOK_APP_ID_ENV;
  // Her sayfa bu layout’u prerender eder; build’de Django çağrısı worker’ı 60s kilitler.
  if (process.env.NEXT_PHASE === "phase-production-build") return "";
  try {
    const data = await getLandingPageData();
    return data?.facebook_app_id?.trim() || "";
  } catch {
    return "";
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const facebookAppId = await resolveFacebookAppId();

  return (
    <html lang="tr">
      <head>
        {/* property= zorunlu — metadata.other name= üretir; Sharing Debugger property arar */}
        {facebookAppId ? (
          <meta property="fb:app_id" content={facebookAppId} />
        ) : null}
      </head>
      <body>
        <PublicMarketingIntegrations />
        <ChunkLoadRecovery />
        <AuthProvider>
          <AppShellWithAuth>{children}</AppShellWithAuth>
        </AuthProvider>
      </body>
    </html>
  );
}
