'use client';

import { useState } from 'react';
import { resolveCoachPhotoUrl } from '@/lib/coach-media';
import CoachPhotoLightbox from '@/components/coach/CoachPhotoLightbox';

interface CoachStudentAvatarProps {
  ad: string;
  soyad: string;
  profilFoto?: string | null;
  size?: 'sm' | 'md' | 'lg';
  highRisk?: boolean;
  enableLightbox?: boolean;
  altName?: string;
}

function initials(ad: string, soyad: string): string {
  return `${ad.trim()[0] ?? ''}${soyad.trim()[0] ?? ''}`.toUpperCase() || '?';
}

export default function CoachStudentAvatar({
  ad,
  soyad,
  profilFoto,
  size = 'md',
  highRisk = false,
  enableLightbox = false,
  altName,
}: CoachStudentAvatarProps) {
  const [showLightbox, setShowLightbox] = useState(false);
  const photo = resolveCoachPhotoUrl(profilFoto);
  const displayName = altName || `${ad} ${soyad}`.trim();
  const className = [
    'coach-student-avatar',
    size === 'sm' ? 'is-sm' : '',
    size === 'lg' ? 'is-lg' : '',
    highRisk ? 'is-high-risk' : '',
    enableLightbox && photo ? 'is-clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const openLightbox = () => {
    if (enableLightbox && photo) setShowLightbox(true);
  };

  const avatarNode = photo ? (
    enableLightbox ? (
      <button
        type="button"
        className={`${className} coach-student-avatar-btn`}
        onClick={openLightbox}
        title="Fotoğrafı büyüt"
        aria-label={`${displayName} — fotoğrafı büyüt`}
      >
        <img src={photo} alt="" className="coach-student-avatar-img" />
      </button>
    ) : (
      <img src={photo} alt="" className={`${className} coach-student-avatar-img`} />
    )
  ) : (
    <div className={className}>{initials(ad, soyad)}</div>
  );

  return (
    <>
      {avatarNode}
      {showLightbox && photo && (
        <CoachPhotoLightbox
          photoUrl={photo}
          alt={displayName}
          onClose={() => setShowLightbox(false)}
        />
      )}
    </>
  );
}
