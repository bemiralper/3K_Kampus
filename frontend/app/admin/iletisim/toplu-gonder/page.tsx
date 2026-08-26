import { Suspense } from "react";
import TopluGonderClient from "./TopluGonderClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Toplu Gönderim — 3K Kampüs",
};

export default function TopluGonderPage() {
  return (
    <Suspense fallback={<p style={{ color: "#667781", padding: "1rem" }}>Toplu gönderim yükleniyor…</p>}>
      <TopluGonderClient />
    </Suspense>
  );
}
