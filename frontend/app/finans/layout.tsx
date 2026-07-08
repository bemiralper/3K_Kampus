"use client";

import type { ReactNode } from "react";
import { OdemePathProvider } from "@/components/odeme-takip/OdemePathProvider";
import { FinansPathProvider } from "@/components/finans/FinansPathProvider";
import { FinansLayoutInner } from "@/components/finans/FinansLayoutInner";

export default function FinansLayout({ children }: { children: ReactNode }) {
  return (
    <OdemePathProvider>
      <FinansPathProvider>
        <FinansLayoutInner>{children}</FinansLayoutInner>
      </FinansPathProvider>
    </OdemePathProvider>
  );
}
