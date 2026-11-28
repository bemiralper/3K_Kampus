'use client';

import type { ReactNode } from 'react';

const HTML_ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

function normalizeIncomingText(raw: string): string {
  if (!raw) return '';
  let text = String(raw);

  if (text.includes('<') || text.includes('&')) {
    text = text
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
      .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, '_$2_')
      .replace(/<li\b[^>]*>\s*/gi, '\n• ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, '');

    text = text.replace(
      /&(nbsp|amp|lt|gt|quot|#39|apos);/gi,
      (m) => HTML_ENTITY_MAP[m.toLowerCase()] ?? m,
    );
  }

  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const INLINE_TOKEN_RE =
  /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|(?<!\w)_[^_\n]+_(?!\w)|~[^~\n]+~|`[^`\n]+`|https?:\/\/[^\s<]+)/g;

function renderInlineSegments(line: string, lineKey: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  INLINE_TOKEN_RE.lastIndex = 0;

  while ((match = INLINE_TOKEN_RE.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${lineKey}-${match.index}`;

    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      parts.push(<strong key={key}>{token.slice(1, -1)}</strong>);
    } else if (token.startsWith('_') && token.endsWith('_') && token.length > 2) {
      parts.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('~') && token.endsWith('~') && token.length > 2) {
      parts.push(<s key={key}>{token.slice(1, -1)}</s>);
    } else if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      parts.push(
        <code
          key={key}
          style={{
            padding: '1px 5px',
            borderRadius: 5,
            fontSize: '0.9em',
            background: 'rgba(99, 102, 241, 0.12)',
          }}
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (/^https?:\/\//i.test(token)) {
      parts.push(
        <a
          key={key}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--sp-accent)', textDecoration: 'underline', wordBreak: 'break-all' }}
        >
          {token}
        </a>,
      );
    } else {
      parts.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }

  return parts;
}

export default function FormattedPortalText({
  text,
  compact = false,
}: {
  text: string;
  compact?: boolean;
}) {
  const normalized = normalizeIncomingText(text);
  if (!normalized) return null;

  const lines = normalized.split('\n');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 3 : 5,
        lineHeight: compact ? 1.45 : 1.58,
        wordBreak: 'break-word',
      }}
    >
      {lines.map((rawLine, idx) => {
        const trimmed = rawLine.trim();
        const key = `ln-${idx}`;

        if (!trimmed) {
          return <div key={key} style={{ height: compact ? 2 : 5 }} />;
        }

        if (trimmed.startsWith('> ')) {
          return (
            <blockquote
              key={key}
              style={{
                margin: 0,
                padding: '4px 10px',
                borderLeft: '3px solid var(--sp-accent)',
                background: 'var(--sp-accent-soft)',
                borderRadius: '0 8px 8px 0',
                color: 'var(--sp-ink-2)',
              }}
            >
              {renderInlineSegments(trimmed.slice(2), key)}
            </blockquote>
          );
        }

        const bulletMatch = trimmed.match(/^([•\-–])\s+(.*)$/);
        if (bulletMatch) {
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
              <span style={{ color: 'var(--sp-accent)', fontWeight: 700, flexShrink: 0 }}>•</span>
              <span>{renderInlineSegments(bulletMatch[2], key)}</span>
            </div>
          );
        }

        const numMatch = trimmed.match(/^(\d{1,2}\.)\s+(.*)$/);
        if (numMatch) {
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
              <span style={{ color: 'var(--sp-accent)', fontWeight: 700, flexShrink: 0 }}>
                {numMatch[1]}
              </span>
              <span>{renderInlineSegments(numMatch[2], key)}</span>
            </div>
          );
        }

        return <div key={key}>{renderInlineSegments(trimmed, key)}</div>;
      })}
    </div>
  );
}
