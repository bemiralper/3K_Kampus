"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CommunicationPageShell } from "@/components/communication";
import "@/components/communication/communication.css";
import {
  BirthdayMediaAsset,
  deleteBirthdayMedia,
  fetchBirthdayMedia,
  updateBirthdayMedia,
  uploadBirthdayMedia,
} from "@/lib/communication-api";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DogumGunuClient() {
  const [assets, setAssets] = useState<BirthdayMediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchBirthdayMedia();
      setAssets(res.assets || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Görseller yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      await uploadBirthdayMedia(file);
      setMessage("Görsel eklendi.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yükleme başarısız");
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (asset: BirthdayMediaAsset) => {
    setError(null);
    try {
      await updateBirthdayMedia(asset.id, { is_active: !asset.is_active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Güncellenemedi");
    }
  };

  const onDelete = async (asset: BirthdayMediaAsset) => {
    if (!confirm(`“${asset.original_name}” silinsin mi?`)) return;
    setError(null);
    try {
      await deleteBirthdayMedia(asset.id);
      setMessage("Görsel silindi.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silinemedi");
    }
  };

  return (
    <CommunicationPageShell
      title="Doğum Günü Görselleri"
      subtitle="Gece 00:01’de doğum günü olan öğrenciye bu havuzdan seçilen görsel + bildirim şablonu gider."
    >
      <div className="comm-stack">
        {error && <div className="comm-alert comm-alert-error">{error}</div>}
        {message && <div className="comm-alert comm-alert-success">{message}</div>}

        <div className="comm-card">
          <p style={{ margin: "0 0 0.75rem", color: "var(--comm-muted, #64748b)", fontSize: "0.9rem" }}>
            1) Buraya birden fazla görsel yükleyin.{" "}
            2){" "}
            <Link href="/admin/iletisim/bildirim-sablonlari">Bildirim Şablonları</Link>
            {" "}→ Öğrenci → Doğum günü kutlaması için IMAGE Meta + uygulama şablonunu bağlayın.{" "}
            3) Sunucuda cron: <code>send_birthday_wishes</code> (00:01).
          </p>
          <label className="comm-btn-primary" style={{ display: "inline-flex", cursor: uploading ? "wait" : "pointer" }}>
            {uploading ? "Yükleniyor…" : "Görsel ekle"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                e.target.value = "";
                void onUpload(f);
              }}
            />
          </label>
        </div>

        {loading ? (
          <p className="tplx-field-hint">Yükleniyor…</p>
        ) : assets.length === 0 ? (
          <div className="comm-card">
            <p style={{ margin: 0 }}>Henüz görsel yok. En az bir aktif görsel olmadan doğum günü mesajı atılmaz.</p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: "0.85rem",
            }}
          >
            {assets.map((a) => (
              <div key={a.id} className="comm-card" style={{ padding: "0.75rem" }}>
                <div
                  style={{
                    aspectRatio: "1",
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "#f1f5f9",
                    marginBottom: "0.55rem",
                  }}
                >
                  {a.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.url}
                      alt={a.original_name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : null}
                </div>
                <div style={{ fontSize: "0.82rem", fontWeight: 600, wordBreak: "break-word" }}>
                  {a.original_name}
                </div>
                <div className="tplx-field-hint" style={{ margin: "0.2rem 0 0.55rem" }}>
                  {formatBytes(a.file_size)} · {a.is_active ? "Aktif" : "Pasif"}
                </div>
                <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                  <button type="button" className="tplx-mini-btn" onClick={() => void toggleActive(a)}>
                    {a.is_active ? "Pasifleştir" : "Aktifleştir"}
                  </button>
                  <button type="button" className="tplx-mini-btn is-danger" onClick={() => void onDelete(a)}>
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </CommunicationPageShell>
  );
}
