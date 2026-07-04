"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import OdevPlanPrintClient from "@/components/odev/OdevPlanPrintClient";

function PrintOdevPlanContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const assignmentId = params.id as string;
  const token = searchParams.get("token") || "";

  if (!token) {
    return (
      <div style={{ padding: 40, fontFamily: "Poppins, sans-serif", color: "#dc2626" }}>
        Geçersiz veya eksik print token.
      </div>
    );
  }

  return (
    <OdevPlanPrintClient
      printToken={token}
      assignmentIdOverride={assignmentId}
    />
  );
}

export default function PrintOdevPlanPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Plan yükleniyor…</div>}>
      <PrintOdevPlanContent />
    </Suspense>
  );
}
