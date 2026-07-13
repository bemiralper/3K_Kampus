'use client';

import { resolveMediaUrl } from '@/lib/website-api';

type Props = {
  src: string | null | undefined;
  alt?: string;
  /** card: 16:9 + contain/blur · detail: doğal oran */
  variant?: 'card' | 'detail';
  className?: string;
};

/**
 * card — sabit 16:9, contain + bulanık arka plan
 * detail — görselin kendi oranı, max yükseklik ile sınırlı
 */
export default function ContentCoverFrame({ src, alt = '', variant = 'card', className = '' }: Props) {
  const url = resolveMediaUrl(src);
  if (!url) return null;

  if (variant === 'detail') {
    return (
      <figure className={`wc-cover wc-cover--detail${className ? ` ${className}` : ''}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="wc-cover__natural" src={url} alt={alt} />
      </figure>
    );
  }

  return (
    <div className={`wc-cover wc-cover--card${className ? ` ${className}` : ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="wc-cover__blur" src={url} alt="" aria-hidden draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="wc-cover__img" src={url} alt={alt} loading="lazy" />
    </div>
  );
}
