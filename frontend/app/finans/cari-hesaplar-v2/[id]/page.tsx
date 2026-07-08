"use client";

import { useParams } from "next/navigation";
import CariV2DetailClient from "./CariV2DetailClient";

export default function CariHesapV2DetailPage() {
  const params = useParams();
  const id = Number(params.id);
  if (!id || Number.isNaN(id)) {
    return <div className="cv2-empty">Geçersiz cari kimliği.</div>;
  }
  return <CariV2DetailClient cariId={id} />;
}
