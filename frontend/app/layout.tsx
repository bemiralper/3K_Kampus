import "./globals.css";
import type { ReactNode } from "react";
import type { Viewport } from "next";
import { AuthProvider } from "@/lib/contexts/AuthContext";
import AppShellWithAuth from "@/components/layout/AppShellWithAuth";
import ChunkLoadRecovery from "@/components/ChunkLoadRecovery";
import PublicGoogleAnalytics from "@/components/landing/PublicGoogleAnalytics";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata = {
  title: '3K Kampüs',
  description: '3K Kampüs Eğitim Yönetim Sistemi',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <PublicGoogleAnalytics />
        <ChunkLoadRecovery />
        <AuthProvider>
          <AppShellWithAuth>{children}</AppShellWithAuth>
        </AuthProvider>
      </body>
    </html>
  );
}
