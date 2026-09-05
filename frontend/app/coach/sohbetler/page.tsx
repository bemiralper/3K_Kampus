import { Suspense } from "react";

import CoachSohbetlerContent from "./CoachSohbetlerContent";
import "@/app/coach/coach.css";
import "@/components/chat/chat-page.css";

export const metadata = {
  title: "Sohbetler | 3K Kampüs",
};

function Loading() {
  return <div className="chat-page-loading">Sohbetler yükleniyor…</div>;
}

export default function CoachSohbetlerPage() {
  return (
    <div className="chat-page chat-page--coach">
      <Suspense fallback={<Loading />}>
        <CoachSohbetlerContent />
      </Suspense>
    </div>
  );
}
