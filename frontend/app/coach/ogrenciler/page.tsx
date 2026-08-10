import { Suspense } from "react";
import CoachOgrencilerClient from "./CoachOgrencilerClient";

function OgrencilerLoading() {
  return (
    <div className="coach-page">
      <div className="coach-loading">Öğrenciler yükleniyor…</div>
    </div>
  );
}

export default function CoachOgrencilerPage() {
  return (
    <Suspense fallback={<OgrencilerLoading />}>
      <CoachOgrencilerClient />
    </Suspense>
  );
}
