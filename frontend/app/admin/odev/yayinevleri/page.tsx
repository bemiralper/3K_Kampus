"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Eski rota → birleşik Kaynak Yönetimi hub */
export default function YayinevleriRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/odev/analizler?tab=yayinevleri");
  }, [router]);
  return null;
}
