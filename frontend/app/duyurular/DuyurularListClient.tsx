'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchPublicContentList, resolveMediaUrl, type Duyuru } from '@/lib/website-api';
import { LANDING_KURUM_KOD } from '@/lib/landing-theme';
import { formatDateTR } from '@/lib/format-date';
import ContentBadge from '@/components/website-content/ContentBadge';
import { CONTENT_KIND_LABEL } from '@/lib/content-labels';
import '@/app/duyurular/content.css';

type Props = {
  initialItems: Duyuru[];
};

export default function DuyurularListClient({ initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const data = await fetchPublicContentList(LANDING_KURUM_KOD, {
          kind: kind || undefined,
          q: query || undefined,
          limit: 50,
        });
        if (!cancelled) setItems(data.items);
      } catch {
        if (!cancelled) setItems(initialItems);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [kind, query, initialItems]);

  const empty = useMemo(() => !loading && items.length === 0, [loading, items.length]);

  return (
    <>
      <div className="wc-list-toolbar wc-scope">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ara…"
          aria-label="İçerik ara"
        />
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tür filtresi">
          <option value="">Tümü (Duyuru + Haber)</option>
          <option value="duyuru">Duyuru</option>
          <option value="haber">Haber</option>
        </select>
      </div>
      {loading && <p className="text-sm text-slate-500">Yükleniyor…</p>}
      {empty ? (
        <p className="text-center text-slate-500">Eşleşen içerik bulunamadı.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {items.map((d) => {
            const cover = resolveMediaUrl(d.kapak_thumb_url || d.kapak_gorseli_url);
            return (
              <Link key={d.id} href={`/duyurular/${d.slug}`} className="wc-card wc-scope">
                {cover && (
                  <div className="wc-card__cover">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cover} alt="" loading="lazy" />
                  </div>
                )}
                <div className="wc-card__body">
                  <div className="wc-card__meta">
                    {d.kind && <span className="wc-kind">{CONTENT_KIND_LABEL[d.kind] || d.kind}</span>}
                    {d.oncelik && d.oncelik !== 'normal' && <ContentBadge priority={d.oncelik} />}
                    {d.yayin_tarihi && <time className="text-xs text-slate-400">{formatDateTR(d.yayin_tarihi)}</time>}
                  </div>
                  <h2 className="wc-card__title">{d.baslik}</h2>
                  <p className="wc-card__excerpt">{d.ozet}</p>
                  <span className="wc-card__link">Devamını Oku →</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
