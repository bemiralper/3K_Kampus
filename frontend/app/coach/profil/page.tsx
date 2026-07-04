"use client";

import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/contexts/AuthContext";
import CoachProfilNav from "@/components/coach/CoachProfilNav";
import CoachAvatar from "@/components/coach/CoachAvatar";
import {
  fetchCoachMe,
  updateCoachMe,
  uploadCoachPhoto,
  deleteCoachPhoto,
  changePassword,
  type CoachMeProfile,
} from "@/lib/coach-profile-api";

export default function CoachProfilPage() {
  const { user, checkAuth } = useAuth();
  const [profile, setProfile] = useState<CoachMeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cepTelefon, setCepTelefon] = useState("");
  const [telefon, setTelefon] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCoachMe().then((res) => {
      if (res.success && res.data) {
        setProfile(res.data);
        setCepTelefon(res.data.cep_telefon || "");
        setTelefon(res.data.telefon || "");
        setEmail(res.data.email || "");
      } else {
        setError(res.error || "Profil yüklenemedi");
      }
      setLoading(false);
    });
  }, []);

  const photoSrc = profile?.teacher_fotograf || user?.personel_fotograf;

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await updateCoachMe({ cep_telefon: cepTelefon, telefon, email });
    setSaving(false);
    if (res.success && res.data) {
      setProfile(res.data);
      setMessage("Bilgileriniz kaydedildi.");
      await checkAuth();
    } else {
      setError(res.error || "Kaydedilemedi");
    }
  };

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.personel_id) return;
    setPhotoBusy(true);
    setError(null);
    const res = await uploadCoachPhoto(user.personel_id, file);
    setPhotoBusy(false);
    if (res.success) {
      setMessage("Fotoğraf güncellendi.");
      const refreshed = await fetchCoachMe();
      if (refreshed.success && refreshed.data) setProfile(refreshed.data);
      await checkAuth();
    } else {
      setError(res.error || "Fotoğraf yüklenemedi");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const handlePhotoDelete = async () => {
    if (!user?.personel_id || !confirm("Profil fotoğrafını silmek istiyor musunuz?")) return;
    setPhotoBusy(true);
    const res = await deleteCoachPhoto(user.personel_id);
    setPhotoBusy(false);
    if (res.success) {
      setMessage("Fotoğraf silindi.");
      const refreshed = await fetchCoachMe();
      if (refreshed.success && refreshed.data) setProfile(refreshed.data);
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

  if (loading) {
    return (
      <div className="coach-profil-page">
        <CoachProfilNav />
        <p className="coach-muted-text">Yükleniyor...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="coach-profil-page">
        <CoachProfilNav />
        <p className="coach-error-text">{error || "Koç profili bulunamadı."}</p>
      </div>
    );
  }

  return (
    <div className="coach-profil-page">
      <CoachProfilNav />

      {user?.must_change_password && (
        <div className="coach-profil-alert is-warn">
          Güvenliğiniz için lütfen varsayılan şifrenizi değiştirin.
        </div>
      )}
      {message && <div className="coach-profil-alert is-success">{message}</div>}
      {error && <div className="coach-profil-alert is-error">{error}</div>}

      <section className="coach-profil-hero">
        <div className="coach-profil-hero-photo">
          <CoachAvatar src={photoSrc} name={profile.teacher_full_name} size="xl" />
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
              {photoBusy ? "..." : "Fotoğraf"}
            </button>
            {photoSrc && (
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
        </div>

        <div className="coach-profil-hero-body">
          <p className="coach-profil-hero-kicker">Koç Profili</p>
          <h2 className="coach-profil-hero-name">{profile.teacher_full_name}</h2>
          <p className="coach-profil-hero-meta">@{user?.username}</p>

          <div className="coach-profil-hero-stats">
            <div className="coach-profil-stat">
              <strong>{profile.current_student_count}</strong>
              <span>Aktif öğrenci</span>
            </div>
            <div className="coach-profil-stat">
              <strong>{profile.capacity}</strong>
              <span>Kapasite</span>
            </div>
            <div className="coach-profil-stat">
              <strong>{profile.available_capacity}</strong>
              <span>Boş yer</span>
            </div>
          </div>

          <Link href="/coach/profil/istatistikler" className="coach-link-btn">
            İstatistiklerimi gör →
          </Link>
        </div>
      </section>

      <div className="coach-profil-layout">
        <section className="coach-profil-panel">
          <h3>İletişim</h3>
          <form onSubmit={handleSave} className="coach-profil-form">
            <label>
              Cep telefonu
              <input
                type="tel"
                value={cepTelefon}
                onChange={(e) => setCepTelefon(e.target.value)}
                placeholder="05xx xxx xx xx"
              />
            </label>
            <label>
              Sabit telefon
              <input type="tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} />
            </label>
            <label>
              E-posta
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button type="submit" className="coach-btn coach-btn-primary" disabled={saving}>
              {saving ? "Kaydediliyor..." : "İletişimi Kaydet"}
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
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              Yeni şifre
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <label>
              Yeni şifre (tekrar)
              <input
                type="password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <button type="submit" className="coach-btn coach-btn-primary" disabled={passwordSaving}>
              {passwordSaving ? "Güncelleniyor..." : "Şifreyi Güncelle"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
