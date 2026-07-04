"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/contexts/AuthContext";
import CoachAvatar from "@/components/coach/CoachAvatar";
import { changePassword } from "@/lib/coach-profile-api";

export default function MuhasebeProfilPage() {
  const { user, checkAuth } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const displayName =
    `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username;

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setSaving(true);
    const res = await changePassword({
      current_password: currentPassword,
      new_password: newPassword,
      new_password_confirm: newPasswordConfirm,
    });
    setSaving(false);
    if (res.success) {
      setMessage("Şifreniz güncellendi.");
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      await checkAuth();
    } else {
      setError(res.error || "Şifre güncellenemedi.");
    }
  };

  return (
    <div className="muhasebe-widget" style={{ maxWidth: 560 }}>
      <h2 style={{ marginTop: 0 }}>Profilim</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <CoachAvatar src={user.personel_fotograf} name={displayName} size="lg" />
        <div>
          <strong>{displayName}</strong>
          <p style={{ margin: "4px 0 0", color: "#64748b" }}>{user.email || user.username}</p>
          <p style={{ margin: "4px 0 0", color: "#64748b" }}>Rol: Muhasebe</p>
        </div>
      </div>

      <form onSubmit={handlePasswordSubmit} style={{ display: "grid", gap: 12 }}>
        <h3 style={{ margin: "8px 0 0" }}>Şifre Değiştir</h3>
        <label>
          Mevcut şifre
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="form-input"
            style={{ width: "100%", marginTop: 4 }}
            required
          />
        </label>
        <label>
          Yeni şifre
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="form-input"
            style={{ width: "100%", marginTop: 4 }}
            required
          />
        </label>
        <label>
          Yeni şifre (tekrar)
          <input
            type="password"
            value={newPasswordConfirm}
            onChange={(e) => setNewPasswordConfirm(e.target.value)}
            className="form-input"
            style={{ width: "100%", marginTop: 4 }}
            required
          />
        </label>
        {message && <p style={{ color: "#047857", margin: 0 }}>{message}</p>}
        {error && <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p>}
        <button type="submit" className="btn-modern btn-primary" disabled={saving}>
          {saving ? "Kaydediliyor…" : "Şifreyi Güncelle"}
        </button>
      </form>

      <p style={{ marginTop: 24 }}>
        <Link href="/muhasebe/dashboard">← Dashboard&apos;a dön</Link>
      </p>
    </div>
  );
}
