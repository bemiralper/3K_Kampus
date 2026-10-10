"use client";

import { useAuth } from "@/lib/contexts/AuthContext";
import { isStudentUser } from "@/lib/auth-routes";

export default function OgrenciPortalPage() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading || !isAuthenticated || !isStudentUser(user)) {
    return null;
  }

  return (
    <iframe
      title="Öğrenci portalı"
      src="/ogrenci-portali.html?oturum=1"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: 0,
        background: "#f5f7fb",
      }}
    />
  );
}
