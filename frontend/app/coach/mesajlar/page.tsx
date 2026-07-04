import { Suspense } from "react";
import CoachMesajlarContent from "./CoachMesajlarContent";
import "@/app/coach/coach.css";

function MesajlarLoading() {
  return (
    <div className="coach-mesajlar-page">
      <div className="coach-mesajlar-body">
        <div className="comm-inbox comm-inbox--loading" aria-busy="true">
          <aside className="comm-inbox-sidebar">
            <div className="comm-inbox-skeleton comm-inbox-skeleton--filters" />
            <div className="comm-inbox-skeleton comm-inbox-skeleton--search" />
          </aside>
          <section className="comm-thread-panel" />
        </div>
      </div>
    </div>
  );
}

export default function CoachMesajlarPage() {
  return (
    <Suspense fallback={<MesajlarLoading />}>
      <CoachMesajlarContent />
    </Suspense>
  );
}
