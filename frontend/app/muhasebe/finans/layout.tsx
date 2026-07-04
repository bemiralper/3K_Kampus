"use client";

import type { ReactNode } from "react";
import { FinansPathProvider } from "@/components/finans/FinansPathProvider";
import { FinansLayoutInner } from "@/components/finans/FinansLayoutInner";
import { OdemePathProvider } from "@/components/odeme-takip/OdemePathProvider";
import { OgrenciPathProvider } from "@/components/ogrenci/OgrenciPathProvider";
import {
  MUHASEBE_FINANS_BASE,
  MUHASEBE_ODEME_TAKIP_BASE,
  MUHASEBE_OGRENCI_BASE,
} from "@/lib/muhasebe-routes";

export default function MuhasebeFinansLayout({ children }: { children: ReactNode }) {
  return (
    <OgrenciPathProvider basePath={MUHASEBE_OGRENCI_BASE}>
      <OdemePathProvider basePath={MUHASEBE_ODEME_TAKIP_BASE}>
        <FinansPathProvider basePath={MUHASEBE_FINANS_BASE}>
          <FinansLayoutInner>{children}</FinansLayoutInner>
        </FinansPathProvider>
      </OdemePathProvider>
    </OgrenciPathProvider>
  );
}
