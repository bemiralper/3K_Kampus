import { Suspense } from "react";

import MuhasebeSohbetlerContent from "./MuhasebeSohbetlerContent";
import "@/components/chat/chat-page.css";

export const metadata = {
  title: "Sohbetler | 3K Kampüs",
};

function Loading() {
  return <div className="chat-page-loading">Sohbetler yükleniyor…</div>;
}

export default function MuhasebeSohbetlerPage() {
  return (
    <div className="chat-page">
      <Suspense fallback={<Loading />}>
        <MuhasebeSohbetlerContent />
      </Suspense>
    </div>
  );
}
