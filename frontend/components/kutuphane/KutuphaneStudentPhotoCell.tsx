"use client";

import { useState } from "react";
import ProfilFotoUpload from "@/app/ogrenciler/[id]/components/ProfilFotoUpload";
import CoachPhotoLightbox from "@/components/coach/CoachPhotoLightbox";

interface Props {
  ogrenciId: number;
  ogrenciAdi: string;
  profilFoto?: string | null;
  accent: string;
  onUpdated: (url: string | null) => void;
}

export default function KutuphaneStudentPhotoCell({
  ogrenciId,
  ogrenciAdi,
  profilFoto,
  accent,
  onUpdated,
}: Props) {
  const [lightbox, setLightbox] = useState(false);

  return (
    <div className="kutuphane-photo-cell">
      {profilFoto ? (
        <button
          type="button"
          className="kutuphane-photo-open"
          onClick={() => setLightbox(true)}
          title="Fotoğrafı büyüt"
          aria-label={`${ogrenciAdi} — fotoğrafı büyüt`}
          style={{ borderColor: accent }}
        >
          <img
            src={profilFoto}
            alt=""
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              (e.target as HTMLImageElement).parentElement?.nextElementSibling?.classList.remove("hidden-avatar");
            }}
          />
        </button>
      ) : null}
      <div
        className={`avatar-circle ${profilFoto ? "hidden-avatar" : ""}`}
        style={{
          width: 42,
          height: 42,
          borderRadius: 10,
          background: accent === "#22c55e"
            ? "linear-gradient(135deg, #22c55e, #16a34a)"
            : accent === "#3b82f6"
              ? "linear-gradient(135deg, #60a5fa, #3b82f6)"
              : "linear-gradient(135deg, #cbd5e1, #94a3b8)",
          color: "#fff",
        }}
      >
        {ogrenciAdi.charAt(0).toUpperCase()}
      </div>
      <ProfilFotoUpload
        ogrenciId={ogrenciId}
        currentPhoto={profilFoto}
        studentName={ogrenciAdi}
        variant="cell"
        onSuccess={onUpdated}
      />
      {lightbox && profilFoto && (
        <CoachPhotoLightbox
          photoUrl={profilFoto}
          alt={ogrenciAdi}
          onClose={() => setLightbox(false)}
        />
      )}
      <style jsx>{`
        .kutuphane-photo-cell {
          position: relative;
          width: 42px;
          height: 42px;
          flex-shrink: 0;
        }
        .kutuphane-photo-open {
          width: 42px;
          height: 42px;
          padding: 0;
          border: 2px solid #e5e7eb;
          border-radius: 10px;
          overflow: hidden;
          background: #fff;
          cursor: zoom-in;
          display: block;
        }
        .kutuphane-photo-open img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
      `}</style>
    </div>
  );
}
