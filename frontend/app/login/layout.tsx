import type { ReactNode } from "react";

export const metadata = {
  title: "Giriş - 3K Kampüs LMS",
  description: "3K Kampüs Eğitim Yönetim Sistemi Giriş",
};

// Login sayfasının kendi layout'u - AuthProvider zaten root layout'ta var
export default function LoginLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
