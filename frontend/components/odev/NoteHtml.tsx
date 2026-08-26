'use client';

import type { CSSProperties } from 'react';
import { looksLikeNoteHtml, noteHtmlForDisplay } from '@/lib/note-html';

type Props = {
  html: string;
  className?: string;
  style?: CSSProperties;
};

export default function NoteHtml({ html, className, style }: Props) {
  if (!html) return null;
  if (!looksLikeNoteHtml(html)) {
    return <span className={className} style={{ whiteSpace: 'pre-wrap', ...style }}>{html}</span>;
  }
  return (
    <>
      <span
        className={`odev-note-html${className ? ` ${className}` : ''}`}
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...style }}
        dangerouslySetInnerHTML={{ __html: noteHtmlForDisplay(html) }}
      />
      <style jsx global>{`
        .odev-note-html b,
        .odev-note-html strong { font-weight: 700; }
        .odev-note-html i,
        .odev-note-html em { font-style: italic; }
        .odev-note-html u { text-decoration: underline; }
        .odev-note-html span[style] { font-style: inherit; }
      `}</style>
    </>
  );
}
