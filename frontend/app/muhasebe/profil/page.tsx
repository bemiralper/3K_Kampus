"use client";

import { useAuth } from "@/lib/contexts/AuthContext";
import UserProfilPanel from "@/components/profile/UserProfilPanel";
import "@/app/coach/coach.css";

export default function MuhasebeProfilPage() {
  const { user } = useAuth();
  return (
    <UserProfilPanel
      portalLabel="Muhasebe"
      backHref="/muhasebe/dashboard"
      showPortalSwitch={!!(user?.is_staff || user?.is_superuser)}
    />
  );
}
