import { Suspense } from "react";
import AdminMesajlarContent from "./AdminMesajlarContent";
import "@/components/communication/communication.css";

function Loading() {
  return <p style={{ color: "#667781", padding: "1rem" }}>Konuşmalar yükleniyor…</p>;
}

export default function AdminMesajlarPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AdminMesajlarContent />
    </Suspense>
  );
}
