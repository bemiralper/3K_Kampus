import { Suspense } from "react";
import MuhasebeMesajlarContent from "./MuhasebeMesajlarContent";
import "@/components/communication/communication.css";

function Loading() {
  return <p style={{ color: "#667781", padding: "1rem" }}>Konuşmalar yükleniyor…</p>;
}

export default function MuhasebeMesajlarPage() {
  return (
    <Suspense fallback={<Loading />}>
      <MuhasebeMesajlarContent />
    </Suspense>
  );
}
