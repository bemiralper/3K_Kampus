import { Suspense } from "react";

import AdminSohbetlerContent from "./AdminSohbetlerContent";
import "@/components/chat/chat-page.css";

export const metadata = {
  title: "Sohbetler | 3K Kampüs",
};

function Loading() {
  return <div className="chat-page-loading">Sohbetler yükleniyor…</div>;
}

export default function AdminSohbetlerPage() {
  return (
    <div className="chat-page">
      <Suspense fallback={<Loading />}>
        <AdminSohbetlerContent />
      </Suspense>
    </div>
  );
}
