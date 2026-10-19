"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import OgrenciKayitClient from "../../yeni-kayit/OgrenciKayitClient";

function GunuBirlikKayit() {
  const exam = useSearchParams().get("exam") || "";
  return <OgrenciKayitClient mode="gunu_birlik" initialExamId={exam} />;
}

export default function GunuBirlikKayitPage() {
  return (
    <Suspense fallback={null}>
      <GunuBirlikKayit />
    </Suspense>
  );
}
