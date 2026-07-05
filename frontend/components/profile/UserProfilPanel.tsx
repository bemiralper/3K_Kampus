"use client";

import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import CoachAvatar from "@/components/coach/CoachAvatar";
import {
  changePassword,
  fetchMyProfile,
  updateMyProfile,
  getAdminPortalView,
  setAdminPortalView,
  portalHomePath,
  type PortalView,
} from "@/lib/profile-api";
import { uploadCoachPhoto, deleteCoachPhoto } from "@/lib/coach-profile-api";
import "@/components/profile/profile-portal.css";

type UserProfilPanelProps = {
  portalLabel: string;
  backHref: string;
  showPortalSwitch?: boolean;
  showAuditNote?: boolean;
};

const PORTAL_LABELS: Record<PortalView, string> = {
  admin: "Yönetici",
  coach: "Koç",
  muhasebe: "Muhasebe",
};

export default function UserProfilPanel({
  portalLabel,
  backHref,
  showPortalSwitch = false,
  showAuditNote = false,
}: UserProfilPanelProps) {
  const { user, checkAuth } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [cepTelefon, setCepTelefon] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [portalView, setPortalView] = useState<PortalView>("admin");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showPortalSwitch) setPortalView(getAdminPortalView());
    fetchMyProfile().then((res) => {
      if (res.success && res.user) {
        setUsername(res.user.username || "");
        setFirstName(res.user.first_name || "");
        setLastName(res.user.last_name || "");
        setEmail(res.user.email || "");
        setTelefon(res.user.personel_telefon || "");
        setCepTelefon(res.user.personel_telefon || "");
      } else {
        setError(res.error || "Profil yüklenemedi");
      }
      setLoading(false);
    });
  }, [showPortalSwitch]);

  if (!user) return null;

  const displayName =
    `${firstName || user.first_name || ""} ${lastName || user.last_name || ""}`.trim() ||
    user.username;

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await updateMyProfile({
      username: username.trim(),
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      telefon: telefon.trim(),
      cep_telefon: cepTelefon.trim(),
      personel_email: email.trim(),
    });
    setSaving(false);
    if (res.success) {
      setMessage("Bilgileriniz kaydedildi.");
      await checkAuth();
    } else {
      setError(res.error || "Kaydedilemedi");
    }
  };

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user.personel_id) return;
    setPhotoBusy(true);
    setError(null);
    const res = await uploadCoachPhoto(user.personel_id, file);
    setPhotoBusy(false);
    if (res.success) {
      setMessage("Fotoğraf güncellendi.");
      await checkAuth();
    } else {
      setError(res.error || "Fotoğraf yüklenemedi");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const handlePhotoDelete = async () => {
    if (!user.personel_id || !confirm("Profil fotoğrafını silmek istiyor musunuz?")) return;
    setPhotoBusy(true);
    const res = await deleteCoachPhoto(user.personel_id);
    setPhotoBusy(false);
    if (res.success) {
      setMessage("Fotoğraf silindi.");
      await checkAuth();
    } else {
      setError(res.error || "Silinemedi");
    }
  };

  const handlePasswordSave = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordSaving(true);
    setError(null);
    setMessage(null);
    const res = await changePassword({
      current_password: currentPassword,
      new_password: newPassword,
      new_password_confirm: newPasswordConfirm,
    });
    setPasswordSaving(false);
    if (res.success) {
      setMessage("Şifreniz güncellendi.");
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      await checkAuth();
    } else {
      setError(res.error || "Şifre güncellenemedi");
    }
  };

  const handlePortalSwitch = (view: PortalView) => {
    setAdminPortalView(view);
    setPortalView(view);
    router.push(portalHomePath(view));
  };

  if (loading) {
    return (
      <div className="coach-profil-page">
        <p className="coach-muted-text">Profil yükleniyor…</p>
      </div>
    );
  }

  return (
    <div className="coach-profil-page">
      {message && <div className="coach-profil-alert is-success">{message}</div>}
      {error && <div className="coach-profil-alert is-error">{error}</div>}

      <section className="coach-profil-hero">
        <div className="coach-profil-hero-photo">
          <CoachAvatar src={user.personel_fotograf} name={displayName} size="xl" />
          {user.personel_id ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="coach-profil-file-input"
                onChange={handlePhotoChange}
              />
              <div className="coach-profil-hero-photo-actions">
                <button
                  type="button"
                  className="coach-btn coach-btn-secondary coach-btn-sm"
                  disabled={photoBusy}
                  onClick={() => fileRef.current?.click()}
                >
                  {photoBusy ? "…" : "Fotoğraf"}
                </button>
                {user.personel_fotograf && (
                  <button
                    type="button"
                    className="coach-btn coach-btn-ghost coach-btn-sm"
                    disabled={photoBusy}
                    onClick={handlePhotoDelete}
                  >
                    Sil
                  </button>
                )}
              </div>
            </>
          ) : null}
        </div>

        <div className="coach-profil-hero-body">
          <p className="coach-profil-hero-kicker">{portalLabel} Profili</p>
          <h2 className="coach-profil-hero-name">{displayName}</h2>
          <p className="coach-profil-hero-meta">@{username || user.username}</p>
          <Link href={backHref} className="coach-link-btn">
            ← Panele dön
          </Link>
        </div>
      </section>

      <div className="coach-profil-layout">
        <section className="coach-profil-panel">
          <h3>İletişim & Hesap</h3>
          <form onSubmit={handleSave} className="coach-profil-form">
            <label>
              Kullanıcı adı
              <input value={username} onChange={(e) => setUsername(e.target.value)} required />
            </label>
            <label>
              Ad
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </label>
            <label>
              Soyad
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </label>
            <label>
              E-posta
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Telefon
              <input type="tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} />
            </label>
            <label>
              Cep telefonu
              <input type="tel" value={cepTelefon} onChange={(e) => setCepTelefon(e.target.value)} />
            </label>
            <button type="submit" className="coach-btn coach-btn-primary" disabled={saving}>
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </form>
        </section>

        <section className="coach-profil-panel">
          <h3>Güvenlik</h3>
          <form onSubmit={handlePasswordSave} className="coach-profil-form">
            <label>
              Mevcut şifre
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </label>
            <label>
              Yeni şifre
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </label>
            <label>
              Yeni şifre (tekrar)
              <input
                type="password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="coach-btn coach-btn-primary" disabled={passwordSaving}>
              {passwordSaving ? "Güncelleniyor…" : "Şifreyi Güncelle"}
            </button>
          </form>
        </section>
      </div>

      {showPortalSwitch && (user.is_staff || user.is_superuser) && (
        <section className="coach-profil-panel coach-profil-card-wide">
          <h3>Portal Geçişi</h3>
          <p className="coach-muted-text" style={{ marginTop: 0, marginBottom: 14 }}>
            Yönetici olarak diğer portalları açabilir, aynı oturumla geri dönebilirsiniz.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["admin", "coach", "muhasebe"] as PortalView[]).map((view) => (
              <button
                key={view}
                type="button"
                className={`coach-btn coach-btn-sm ${portalView === view ? "coach-btn-primary" : "coach-btn-secondary"}`}
                onClick={() => handlePortalSwitch(view)}
              >
                {PORTAL_LABELS[view]}
              </button>
            ))}
          </div>
        </section>
      )}

      {showAuditNote && (
        <section className="coach-profil-panel coach-profil-card-wide">
          <h3>Dijital Sistem Verileri</h3>
          <p className="coach-muted-text" style={{ marginTop: 0 }}>
            Giriş kayıtları, oturum bilgileri, IP/tarayıcı/cihaz verileri, işlem ve güvenlik logları
            bir sonraki sürümde bu ekrandan görüntülenebilecek.
          </p>
        </section>
      )}
    </div>
  );
}
