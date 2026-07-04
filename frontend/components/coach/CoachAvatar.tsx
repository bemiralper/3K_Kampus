"use client";

import { resolveMediaUrl } from "@/lib/resolve-media-url";

type CoachAvatarProps = {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const SIZE_MAP = {
  sm: 36,
  md: 40,
  lg: 48,
  xl: 112,
};

export default function CoachAvatar({
  src,
  name,
  size = "md",
  className = "",
}: CoachAvatarProps) {
  const px = SIZE_MAP[size];
  const resolved = resolveMediaUrl(src);
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  if (resolved) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolved}
        alt={name}
        width={px}
        height={px}
        className={`coach-avatar-img coach-avatar-${size}${className ? ` ${className}` : ""}`}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <span
      className={`coach-avatar-fallback coach-avatar-${size}${className ? ` ${className}` : ""}`}
      aria-hidden
    >
      {initial}
    </span>
  );
}
