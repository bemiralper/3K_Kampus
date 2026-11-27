"use client";

import { useParams } from "next/navigation";
import GGProvider from "../../gelir-gider-v2/GGProvider";
import CariV2DetailClient from "./CariV2DetailClient";

export default function CariHesapV2DetailPage() {
  const params = useParams();
  const id = Number(params.id);
  if (!id || Number.isNaN(id)) {
    return <div className="cv2-empty">Geçersiz cari kimliği.</div>;
  }
  // Gelir/gider çekmeceleri antd App bağlamındaki message API'sini kullanır.
  return (
    <GGProvider>
      <CariV2DetailClient cariId={id} />
    </GGProvider>
  );
}
