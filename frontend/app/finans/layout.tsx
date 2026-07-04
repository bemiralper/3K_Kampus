"use client";

import type { ReactNode } from "react";
import { FinansPathProvider } from "@/components/finans/FinansPathProvider";
import { FinansLayoutInner } from "@/components/finans/FinansLayoutInner";

export default function FinansLayout({ children }: { children: ReactNode }) {
  return (
    <FinansPathProvider>
      <FinansLayoutInner>{children}</FinansLayoutInner>
    </FinansPathProvider>
  );
}
