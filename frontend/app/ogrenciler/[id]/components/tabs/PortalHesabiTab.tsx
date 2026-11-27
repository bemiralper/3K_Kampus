"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { useAuth } from "@/lib/contexts/AuthContext";
import { PermissionChecks } from "@/app/roles/role.permissions";
import type { OgrenciDetay } from "../../types";

interface PortalAccountInfo {
  has_account: boolean;
  username?: string;
  suggested_username?: string;
  is_enabled?: boolean;
  user_is_active?: boolean;
  can_login?: boolean;
  block_reason?: string | null;
  must_change_password?: boolean;
  last_login?: string | null;
  last_seen_at?: string | null;
  created_at?: string | null;
  tc_kimlik_no?: string;
  okul_no?: string;
  student_active?: boolean;
  temp_password?: string;
}

function unwrapPortalAccount(raw: unknown): PortalAccountInfo | null {
  if (!raw || typeof raw !== "object") return null;
  if ("has_account" in raw) return raw as PortalAccountInfo;
  if ("data" in raw && raw.data && typeof raw.data === "object" && "has_account" in raw.data) {
    return raw.data as PortalAccountInfo;
  }
  return null;
}

interface PortalHesabiTabProps {
  data: OgrenciDetay;
}

function formatIsoDate(iso?: string | null): string {
  if (!iso) return "Henüz yok";
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function PortalHesabiTab({ data }: PortalHesabiTabProps) {
  const { user } = useAuth();
  const perms = user?.permissions || [];
  const canManage = Boolean(
    user?.is_superuser || PermissionChecks.canWrite(perms, "ogrenci"),
  );

  const [info, setInfo] = useState<PortalAccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [customUsername, setCustomUsername] = useState("");
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    const res = await apiGet<PortalAccountInfo>(
      `/ogrenciler/api/${data.id}/portal-account/`,
    );
    const payload = unwrapPortalAccount(res.data);
    if (res.success && payload) {
      setInfo(payload);
      if (!payload.has_account && payload.suggested_username) {
        setCustomUsername(payload.suggested_username);
      }
    } else {
      setNotice({ kind: "err", text: res.error || "Portal hesap bilgisi alınamadı." });
    }
    setLoading(false);
  }, [data.id]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  const handleCreate = async () => {
    setSubmitting(true);
    setNotice(null);
    const res = await apiPost<PortalAccountInfo>(
      `/ogrenciler/api/${data.id}/portal-account/`,
      { action: "create", username: customUsername.trim() },
    );
    const payload = unwrapPortalAccount(res.data);
    if (res.success && payload) {
      setInfo(payload);
      if (payload.username && payload.temp_password) {
        setCredentials({ username: payload.username, password: payload.temp_password });
      }
      setNotice({ kind: "ok", text: "Öğrenci portal hesabı oluşturuldu." });
    } else {
      setNotice({ kind: "err", text: res.error || "Hesap oluşturulamadı." });
    }
    setSubmitting(false);
  };

  const handleResetPassword = async () => {
    if (!confirm("Öğrenci için yeni bir geçici şifre üretilecek ve ilk girişte şifre değişimi istenecek. Onaylıyor musunuz?")) {
      return;
    }
    setSubmitting(true);
    setNotice(null);
    const res = await apiPost<PortalAccountInfo>(
      `/ogrenciler/api/${data.id}/portal-account/`,
      { action: "reset_password" },
    );
    const payload = unwrapPortalAccount(res.data);
    if (res.success && payload) {
      setInfo(payload);
      if (payload.username && payload.temp_password) {
        setCredentials({ username: payload.username, password: payload.temp_password });
      }
      setNotice({ kind: "ok", text: "Yeni geçici şifre üretildi." });
    } else {
      setNotice({ kind: "err", text: res.error || "Şifre sıfırlanamadı." });
    }
    setSubmitting(false);
  };

  const handleToggleAccess = async () => {
    if (!info) return;
    const nextState = !info.is_enabled;
    setSubmitting(true);
    setNotice(null);
    const res = await apiPatch<PortalAccountInfo>(
      `/ogrenciler/api/${data.id}/portal-account/`,
      { is_enabled: nextState },
    );
    const payload = unwrapPortalAccount(res.data);
    if (res.success && payload) {
      setInfo(payload);
      setNotice({
        kind: "ok",
        text: nextState ? "Portal erişimi yeniden açıldı." : "Portal erişimi durduruldu.",
      });
    } else {
      setNotice({ kind: "err", text: res.error || "Durum güncellenemedi." });
    }
    setSubmitting(false);
  };

  const copyShareText = () => {
    if (!credentials) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const text = [
      `3K Kampüs Öğrenci Portalı Giriş Bilgilerin`,
      `Giriş Adresi: ${origin}/login`,
      `Kullanıcı Adı: ${credentials.username}`,
      `Geçici Şifre: ${credentials.password}`,
      `Not: İlk girişte kendi şifreni belirlemen istenecektir.`,
    ].join("\n");
    navigator.clipboard.writeText(text);
    setNotice({ kind: "ok", text: "Giriş bilgileri panoya kopyalandı." });
  };

  if (loading) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <p style={{ color: "#64748b", margin: 0 }}>Portal hesap durumu yükleniyor…</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {notice && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 500,
            background: notice.kind === "ok" ? "#ecfdf5" : "#fef2f2",
            color: notice.kind === "ok" ? "#065f46" : "#991b1b",
            border: `1px solid ${notice.kind === "ok" ? "#a7f3d0" : "#fecaca"}`,
          }}
        >
          {notice.text}
        </div>
      )}

      {credentials && (
        <div
          style={{
            padding: 20,
            borderRadius: 16,
            background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)",
            color: "#f8fafc",
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.8 }}>
                Tek Seferlik Gösterim
              </span>
              <h4 style={{ margin: "4px 0 0", fontSize: 17, color: "#fff" }}>
                Öğrenci Geçici Giriş Bilgileri
              </h4>
            </div>
            <button
              type="button"
              onClick={copyShareText}
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                background: "#38bdf8",
                color: "#0f172a",
                fontWeight: 600,
                fontSize: 13,
                border: 0,
                cursor: "pointer",
              }}
            >
              Paylaşım Metnini Kopyala
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <div style={{ background: "rgba(255,255,255,0.1)", padding: "10px 14px", borderRadius: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Kullanıcı Adı</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", marginTop: 2 }}>
                {credentials.username}
              </div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.1)", padding: "10px 14px", borderRadius: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Geçici Şifre</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", marginTop: 2 }}>
                {credentials.password}
              </div>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, opacity: 0.82 }}>
            Öğrenci ilk girişinde bu geçici şifreyi değiştirerek kendi şifresini belirlemek zorundadır.
          </p>
        </div>
      )}

      {!info?.has_account ? (
        <div className="card" style={{ padding: 24, display: "grid", gap: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18 }}>Öğrenci Portal Hesabı</h3>
            <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
              {data.tam_ad} için henüz bir öğrenci portalı hesabı oluşturulmamış. Hesap açıldığında öğrenci ders programını, sınav analizlerini, ders notlarını ve koçunun haftalık çalışma programını telefon, tablet ve bilgisayarından takip edebilir.
            </p>
          </div>

          {info !== null && !info.student_active && (
            <div style={{ padding: 12, borderRadius: 10, background: "#fffbeb", color: "#92400e", fontSize: 13.5 }}>
              Öğrencinin aktif eğitim yılı kaydı veya aktiflik durumu kapalı olduğu için hesap oluşturulamaz.
            </div>
          )}

          {canManage && info?.student_active && (
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <label style={{ display: "grid", gap: 6, flex: "1 1 240px", maxWidth: 360 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Kullanıcı Adı</span>
                <input
                  type="text"
                  value={customUsername}
                  onChange={(e) => setCustomUsername(e.target.value)}
                  className="form-control"
                  placeholder="Örn: TC kimlik no veya kurum.okulno"
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1" }}
                />
              </label>
              <button
                type="button"
                className="btn-modern btn-primary"
                disabled={submitting || !customUsername.trim()}
                onClick={handleCreate}
              >
                {submitting ? "Oluşturuluyor…" : "Portal Hesabı Oluştur"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{ padding: 24, display: "grid", gap: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18 }}>Öğrenci Portal Hesabı Aktif</h3>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13.5 }}>
                Öğrenci kullanıcı adı{info.tc_kimlik_no ? ", TC Kimlik No" : ""}{info.okul_no ? ` veya okul numarası (${info.okul_no})` : ""} ile giriş yapabilir.
              </p>
            </div>
            <span
              style={{
                padding: "5px 12px",
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 600,
                background: info.can_login ? "#dcfce7" : "#fee2e2",
                color: info.can_login ? "#166534" : "#991b1b",
              }}
            >
              {info.can_login ? "Girişe Açık" : "Erişim Kapalı"}
            </span>
          </div>

          {info.block_reason && (
            <div style={{ padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b", fontSize: 13.5 }}>
              {info.block_reason}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
            <div style={{ padding: 14, borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 12, color: "#64748b" }}>Kullanıcı Adı</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{info.username}</div>
            </div>
            <div style={{ padding: 14, borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 12, color: "#64748b" }}>Şifre Durumu</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, color: info.must_change_password ? "#b45309" : "#0f766e" }}>
                {info.must_change_password ? "İlk girişte değiştirecek" : "Kendi şifresini belirledi"}
              </div>
            </div>
            <div style={{ padding: 14, borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 12, color: "#64748b" }}>Son Giriş</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{formatIsoDate(info.last_login)}</div>
            </div>
            <div style={{ padding: 14, borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 12, color: "#64748b" }}>Portalda Son Görülme</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{formatIsoDate(info.last_seen_at)}</div>
            </div>
          </div>

          {canManage && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 4 }}>
              <button
                type="button"
                className="btn-modern btn-primary"
                disabled={submitting}
                onClick={handleResetPassword}
              >
                Geçici Şifre Sıfırla
              </button>
              <button
                type="button"
                className="btn-modern btn-secondary"
                disabled={submitting}
                onClick={handleToggleAccess}
              >
                {info.is_enabled ? "Portal Erişimini Durdur" : "Portal Erişimini Aç"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
