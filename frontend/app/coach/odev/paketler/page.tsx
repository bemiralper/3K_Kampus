"use client";

import { OdevPaketleriPageContent } from "@/components/odev/OdevPaketleriContent";

export default function CoachOdevPaketleriPage() {
  return (
    <div className="coach-paketler-page">
      <OdevPaketleriPageContent verBasePath="/coach/odev/ver" />
    </div>
  );
}
