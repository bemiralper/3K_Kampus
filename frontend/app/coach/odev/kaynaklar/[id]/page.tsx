"use client";

import { KaynakPathProvider } from "@/components/kaynak/KaynakPathProvider";
import BookStructurePageClient from "@/app/admin/odev/kaynaklar/components/BookStructurePageClient";

export default function CoachKaynakKitapYapiPage() {
  return (
    <KaynakPathProvider basePath="coach">
      <BookStructurePageClient />
    </KaynakPathProvider>
  );
}
