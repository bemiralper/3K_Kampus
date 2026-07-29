'use client';

import AkademikPlaceholderPanel from './AkademikPlaceholderPanel';

export default function SinifDersleriPanel() {
  return (
    <AkademikPlaceholderPanel
      title="Sınıf Dersleri"
      description="Grup dersi programı, yoklama ve branş özeti bu alanda toplanacak. Şimdilik sınıf programına Akademik Planlama üzerinden ulaşabilirsiniz."
      actionLabel="Sınıf Programına Git"
      actionHref="/akademik-planlama/goruntuleme/sinif-programi"
    />
  );
}
