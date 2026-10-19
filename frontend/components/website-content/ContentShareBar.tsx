'use client';

import { useState } from 'react';
import { absoluteSiteUrl } from '@/lib/site-url';

type Props = {
  title: string;
  text?: string;
  path: string;
  compact?: boolean;
};

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.04 2C6.58 2 2.15 6.4 2.15 11.83c0 1.74.46 3.44 1.34 4.94L2 22l5.39-1.4a10 10 0 0 0 4.65 1.18h.01c5.46 0 9.89-4.4 9.89-9.83C21.94 6.4 17.5 2 12.04 2zm5.76 13.9c-.24.68-1.4 1.3-1.94 1.38-.5.08-1.12.11-1.81-.11-.42-.14-.95-.31-1.64-.6-2.88-1.24-4.76-4.14-4.9-4.33-.14-.19-1.16-1.54-1.16-2.94s.73-2.08 1-2.37c.24-.28.64-.41 1.02-.41h.24c.24 0 .36-.01.52.4.2.48.68 1.66.74 1.78.06.12.1.27.02.43-.08.16-.12.26-.24.4-.12.14-.25.31-.36.42-.12.12-.24.24-.1.47.14.23.62 1.02 1.33 1.66.92.82 1.69 1.07 1.93 1.19.24.12.38.1.52-.06.14-.16.6-.7.76-.94.16-.24.32-.2.54-.12.22.08 1.4.66 1.64.78.24.12.4.18.46.28.06.1.06.58-.18 1.26z"
      />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10.5 5.5M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 0 0 7.07 7.07L13.5 18.5"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 12.5 9.5 17 19 7.5"
      />
    </svg>
  );
}

export default function ContentShareBar({ title, text, path, compact = false }: Props) {
  const [copied, setCopied] = useState(false);
  const url = absoluteSiteUrl(path);
  const message = [title, (text || '').trim(), url].filter(Boolean).join('\n');
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(message)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement('textarea');
      input.value = url;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className={compact ? 'wc-share wc-share--compact' : 'wc-share'}>
      <a
        className="wc-share__btn wc-share__btn--wa"
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="WhatsApp ile paylaş"
        title="WhatsApp ile paylaş"
      >
        <WhatsAppIcon />
      </a>
      <button
        type="button"
        className={copied ? 'wc-share__btn wc-share__btn--ok' : 'wc-share__btn'}
        onClick={copyLink}
        aria-label={copied ? 'Bağlantı kopyalandı' : 'Bağlantıyı kopyala'}
        title={copied ? 'Kopyalandı' : 'Bağlantıyı kopyala'}
      >
        {copied ? <CheckIcon /> : <LinkIcon />}
      </button>
    </div>
  );
}
