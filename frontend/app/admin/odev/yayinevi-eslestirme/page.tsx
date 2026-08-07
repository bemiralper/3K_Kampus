"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Eski rota → birleşik Kaynak Yönetimi hub */
export default function YayineviEslestirmeRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/odev/analizler?tab=eslestirme");
  }, [router]);
  return null;
}
