'use client';

import type { SVGProps } from 'react';

export type Student360IconName =
  | 'overview'
  | 'academic'
  | 'communication'
  | 'record'
  | 'profile'
  | 'homework'
  | 'exam'
  | 'meeting'
  | 'message'
  | 'calendar'
  | 'library'
  | 'family'
  | 'document'
  | 'risk'
  | 'pin'
  | 'info'
  | 'refresh'
  | 'arrow'
  | 'target'
  | 'check';

interface Student360IconProps extends SVGProps<SVGSVGElement> {
  name: Student360IconName;
  size?: number;
}

const paths: Record<Student360IconName, React.ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  academic: (
    <>
      <path d="m3 10 9-5 9 5-9 5-9-5Z" />
      <path d="M7 12.5V17c2.8 2.2 7.2 2.2 10 0v-4.5" />
    </>
  ),
  communication: (
    <>
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />
      <path d="M8 9h8M8 13h5" />
    </>
  ),
  record: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <path d="M9 8h6M8 13h8M8 17h5" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  homework: (
    <>
      <path d="M9 4h6l1 2h3v15H5V6h3l1-2Z" />
      <path d="m9 14 2 2 4-5" />
    </>
  ),
  exam: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <path d="m15 9 5-5M16 4h4v4" />
    </>
  ),
  meeting: (
    <>
      <path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM16 11a3 3 0 1 0 0-6" />
      <path d="M2 21a6 6 0 0 1 12 0M14 15a5 5 0 0 1 8 4" />
    </>
  ),
  message: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m5 8 7 5 7-5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </>
  ),
  library: (
    <>
      <path d="M4 4h5v16H4zM9 6h5v14H9zM15 4l4-1 2 16-4 1-2-16Z" />
    </>
  ),
  family: (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M2 21a6 6 0 0 1 12 0M14 16a5 5 0 0 1 8 4" />
    </>
  ),
  document: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  risk: (
    <>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v5M12 17.5h.01" />
    </>
  ),
  pin: (
    <>
      <path d="m9 3 6 6M8 8l8-3-1 7 3 3-6 1-5 5 1-7-3-3 3-3Z" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6.1 8a7 7 0 0 1 11.7-2.2L20 8M4 16l2.2 2.2A7 7 0 0 0 17.9 16" />
    </>
  ),
  arrow: <path d="m15 18-6-6 6-6" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M15 9 21 3M17 3h4v4" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
};

export default function Student360Icon({
  name,
  size = 20,
  ...props
}: Student360IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
