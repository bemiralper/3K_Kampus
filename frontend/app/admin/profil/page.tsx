"use client";

import UserProfilPanel from "@/components/profile/UserProfilPanel";
import "@/app/coach/coach.css";

export default function AdminProfilPage() {
  return (
    <UserProfilPanel
      portalLabel="Yönetici"
      backHref="/dashboard"
      showPortalSwitch
      showAuditNote
    />
  );
}
