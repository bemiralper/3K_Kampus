'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { CmsBlock } from '@/lib/website-api';
import { getBlockLabel } from '@/lib/cms/block-types';
import { resolveMediaUrl } from '@/lib/website-api';
import { LANDING_KURUM_KOD } from '@/lib/landing-theme';
import CmsReveal from './CmsReveal';

type Props = {
  block: CmsBlock;
  preview?: boolean;
};

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : Number(v) || fallback;
}

function arr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

const ICON_PATHS: Record<string, ReactNode> = {
  chart: <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />,
  user: <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />,
  target: <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />,
  bell: <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />,
  star: <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />,
  book: <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z" />,
  device: <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z" />,
  chat: <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z" />,
  cert: <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />,
};

function Icon({ name }: { name: string }) {
  const key = name in ICON_PATHS ? name : 'star';
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {ICON_PATHS[key]}
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  );
}

function Btn({
  label,
  url,
  variant = 'primary',
}: {
  label: unknown;
  url: unknown;
  variant?: 'primary' | 'ghost' | 'solid' | 'link';
}) {
  const l = str(label);
  if (!l) return null;
  const cls =
    variant === 'ghost'
      ? 'cms-pub-btn cms-pub-btn-ghost'
      : variant === 'solid'
        ? 'cms-pub-btn cms-pub-btn-solid'
        : variant === 'link'
          ? 'cms-pub-btn cms-pub-btn-link'
          : 'cms-pub-btn cms-pub-btn-primary';
  return (
    <a href={str(url, '#')} className={cls}>
      {l}
    </a>
  );
}

function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLElement>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const match = value.match(/^(\D*)(\d+)(\D*)$/);
    if (!match) {
      setDisplay(value);
      return;
    }
    const [, prefix, numStr, suffix] = match;
    const target = Number(numStr);
    if (!Number.isFinite(target)) {
      setDisplay(value);
      return;
    }

    let raf = 0;
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      obs.disconnect();
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) {
        setDisplay(value);
        return;
      }
      const start = performance.now();
      const dur = 1200;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        const eased = 1 - (1 - t) ** 3;
        setDisplay(`${prefix}${Math.round(target * eased)}${suffix}`);
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });

    obs.observe(el);
    return () => {
      obs.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  return <strong ref={ref}>{display}</strong>;
}

function PublicFormBlock({ formSlug, title, preview }: { formSlug: string; title: string; preview?: boolean }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle');
  const [err, setErr] = useState('');

  if (preview) return <div className="cms-pub-fallback">Form: {formSlug || 'slug yok'}</div>;
  if (!formSlug) return <div className="cms-pub-fallback">Form slug tanımlı değil</div>;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, string> = {};
    fd.forEach((v, k) => { payload[k] = String(v); });
    setStatus('sending');
    setErr('');
    try {
      const res = await fetch(
        `/api/website/api/public/${LANDING_KURUM_KOD}/v2/forms/${encodeURIComponent(formSlug)}/submit/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        setStatus('err');
        setErr(json.error || 'Gönderilemedi');
        return;
      }
      setStatus('ok');
      e.currentTarget.reset();
    } catch {
      setStatus('err');
      setErr('Bağlantı hatası');
    }
  };

  return (
    <form className="cms-pub-form" onSubmit={onSubmit}>
      {title ? <h3>{title}</h3> : null}
      <label>
        Ad Soyad
        <input name="ad_soyad" required placeholder="Örn. Ayşe Yılmaz" />
      </label>
      <label>
        Telefon
        <input name="telefon" required placeholder="05xx xxx xx xx" />
      </label>
      <label>
        E-posta
        <input name="eposta" type="email" placeholder="ornek@email.com" />
      </label>
      <label>
        Mesajınız
        <textarea name="mesaj" required rows={4} placeholder="Kısaca talebinizi yazın…" />
      </label>
      <button type="submit" className="cms-pub-btn cms-pub-btn-primary" disabled={status === 'sending'}>
        {status === 'sending' ? 'Gönderiliyor…' : 'Gönder'}
      </button>
      {status === 'ok' && <p className="cms-form-ok">Mesajınız alındı. Teşekkürler!</p>}
      {status === 'err' && <p className="cms-form-err">{err}</p>}
    </form>
  );
}

function Section({
  preview,
  alt,
  children,
  from = 'up',
  delay = 0,
}: {
  preview?: boolean;
  alt?: boolean;
  children: ReactNode;
  from?: 'up' | 'left' | 'right' | 'zoom';
  delay?: number;
}) {
  if (preview) return <>{children}</>;
  return (
    <CmsReveal from={from} delay={delay}>
      <section className={`cms-pub-section${alt ? ' alt' : ''}`}>
        {alt ? <div className="cms-pub-section-inner">{children}</div> : children}
      </section>
    </CmsReveal>
  );
}

export default function BlockRenderer({ block, preview }: Props) {
  const p = block.props || {};
  const type = block.type;

  switch (type) {
    case 'hero': {
      const imageUrl = resolveMediaUrl(str(p.imageUrl)) || '';
      const b1 = (p.button1 || {}) as Record<string, unknown>;
      const b2 = (p.button2 || {}) as Record<string, unknown>;
      const checks = arr(p.checks).map((c) => str(c.label || c.text || c)).filter(Boolean);
      const defaultChecks = checks.length
        ? checks
        : ['Akademik takip', 'Bireysel koçluk', 'Deneme analizleri', 'Veli bilgilendirme'];
      const title = str(p.title, '3K Kampüs');
      const mark = str(p.highlightWord, 'Kampüs');
      const titleHtml = mark && title.includes(mark)
        ? title.replace(mark, `<span class="cms-pub-hero-mark">${mark}</span>`)
        : title;

      return (
        <>
          <section className="cms-pub-hero">
            <div className="cms-pub-hero-inner">
              <CmsReveal from="right" delay={0}>
                <div>
                  <p className="cms-pub-hero-kicker">{str(p.kicker, 'Eğitim Merkezi')}</p>
                  <h1 dangerouslySetInnerHTML={{ __html: titleHtml }} />
                  {str(p.subtitle) ? <p className="cms-pub-hero-sub">{str(p.subtitle)}</p> : null}
                  {str(p.description) ? <p className="cms-pub-hero-desc">{str(p.description)}</p> : null}
                  <ul className="cms-pub-hero-checks">
                    {defaultChecks.slice(0, 4).map((item) => (
                      <li key={item}>
                        <span className="cms-pub-check-dot"><CheckIcon /></span>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <div className="cms-pub-hero-actions">
                    <Btn label={b1.label} url={b1.url} variant="primary" />
                    <Btn label={b2.label} url={b2.url} variant="ghost" />
                  </div>
                </div>
              </CmsReveal>
              <CmsReveal from="left" delay={120}>
                <div className="cms-pub-hero-media">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt={title} />
                  ) : (
                    <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--cms-accent)' }}>
                      <Icon name="device" />
                    </div>
                  )}
                </div>
              </CmsReveal>
            </div>
          </section>
          {str(p.proof) ? (
            <div className="cms-pub-proof">
              <CmsReveal from="up" delay={200}>
                <div className="cms-pub-proof-bar">{str(p.proof)}</div>
              </CmsReveal>
            </div>
          ) : null}
        </>
      );
    }

    case 'heading':
      return (
        <Section preview={preview} alt={Boolean(p.alt)}>
          <div className={str(p.align, 'left') === 'center' ? 'cms-pub-center' : undefined}>
            {str(p.eyebrow) ? <p className="cms-pub-eyebrow">{str(p.eyebrow)}</p> : null}
            <h2 className="cms-pub-title">{str(p.text, 'Başlık')}</h2>
            {str(p.lead) ? <p className="cms-pub-lead">{str(p.lead)}</p> : null}
          </div>
        </Section>
      );

    case 'richText':
      return (
        <Section preview={preview}>
          <div className="cms-pub-rich" dangerouslySetInnerHTML={{ __html: str(p.html) || '<p></p>' }} />
        </Section>
      );

    case 'image': {
      const src = resolveMediaUrl(str(p.src));
      if (!src) return <div className="cms-pub-fallback">Resim yok</div>;
      return (
        <Section preview={preview}>
          <figure className="cms-pub-figure">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={str(p.alt)} />
            {str(p.caption) ? <figcaption>{str(p.caption)}</figcaption> : null}
          </figure>
        </Section>
      );
    }

    case 'iconBoxes': {
      const items = arr(p.items);
      const cols = Math.min(4, Math.max(2, num(p.columns, 4)));
      return (
        <Section preview={preview} alt>
          <div className="cms-pub-center">
            {str(p.eyebrow) ? <p className="cms-pub-eyebrow">{str(p.eyebrow)}</p> : null}
            <h2 className="cms-pub-title">{str(p.title, 'Neden 3K Kampüs?')}</h2>
            {str(p.lead) ? <p className="cms-pub-lead">{str(p.lead)}</p> : null}
          </div>
          <div className={`cms-pub-grid cols-${cols}`}>
            {items.map((item, i) => (
              <CmsReveal key={i} from="up" delay={i * 90}>
                <div className="cms-pub-card">
                  <span className="cms-pub-card-icon">
                    <Icon name={str(item.icon || item.ikon, 'star')} />
                  </span>
                  <h3>{str(item.title || item.baslik)}</h3>
                  <p>{str(item.description || item.aciklama)}</p>
                  {str(item.linkLabel) ? (
                    <a className="cms-pub-card-link" href={str(item.linkUrl, '#')}>
                      {str(item.linkLabel)}
                    </a>
                  ) : null}
                </div>
              </CmsReveal>
            ))}
          </div>
        </Section>
      );
    }

    case 'cards': {
      const items = arr(p.items);
      return (
        <Section preview={preview}>
          <div className="cms-pub-center">
            {str(p.eyebrow) ? <p className="cms-pub-eyebrow">{str(p.eyebrow)}</p> : null}
            <h2 className="cms-pub-title">{str(p.title, 'Programlar')}</h2>
            {str(p.lead) ? <p className="cms-pub-lead">{str(p.lead)}</p> : null}
          </div>
          <div className="cms-pub-grid cols-3">
            {items.map((item, i) => {
              const img = resolveMediaUrl(str(item.imageUrl || item.image));
              const href = str(item.linkUrl || item.url);
              const body = (
                <>
                  {img ? (
                    <div className="cms-pub-card-media">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt="" />
                    </div>
                  ) : null}
                  <div className="cms-pub-card-body">
                    <h3>{str(item.title || item.baslik)}</h3>
                    <p>{str(item.description || item.aciklama)}</p>
                  </div>
                </>
              );
              return (
                <CmsReveal key={i} from="up" delay={i * 100}>
                  {href ? (
                    <a href={href} className="cms-pub-card">{body}</a>
                  ) : (
                    <div className="cms-pub-card">{body}</div>
                  )}
                </CmsReveal>
              );
            })}
          </div>
          {str(p.footerText) ? (
            <p className="cms-pub-lead cms-pub-center" style={{ marginTop: '2rem', maxWidth: '42rem' }}>
              {str(p.footerText)}{' '}
              {str(p.footerLinkLabel) ? (
                <a href={str(p.footerLinkUrl, '#')} className="cms-pub-card-link">
                  {str(p.footerLinkLabel)}
                </a>
              ) : null}
            </p>
          ) : null}
        </Section>
      );
    }

    case 'counter': {
      const items = arr(p.items);
      return (
        <CmsReveal from="up">
          <div className="cms-pub-band">
            <div className="cms-pub-band-inner">
              <div className="cms-pub-center">
                <p className="cms-pub-eyebrow" style={{ color: 'rgba(255,255,255,0.8)' }}>
                  {str(p.eyebrow, 'Rakamlarla')}
                </p>
                <h2 className="cms-pub-title" style={{ color: '#fff' }}>
                  {str(p.title, 'Hedefine giden yol burada başlar')}
                </h2>
              </div>
              <div className="cms-pub-counters">
                {items.map((item, i) => (
                  <div key={i} className="cms-pub-counter">
                    <CountUp value={str(item.value || item.deger, '0')} />
                    <span>{str(item.label || item.etiket)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CmsReveal>
      );
    }

    case 'testimonials': {
      const items = arr(p.items);
      return (
        <Section preview={preview} alt>
          <div className="cms-pub-center">
            <p className="cms-pub-eyebrow">{str(p.eyebrow, 'Yorumlar')}</p>
            <h2 className="cms-pub-title">{str(p.title, 'Veliler ne diyor?')}</h2>
          </div>
          <div className="cms-pub-quotes">
            {items.map((item, i) => (
              <CmsReveal key={i} from="up" delay={i * 90}>
                <blockquote className="cms-pub-quote">
                  <p>“{str(item.text || item.yorum)}”</p>
                  <footer>
                    <strong>{str(item.name || item.ad)}</strong>
                    {str(item.role || item.rol) ? ` · ${str(item.role || item.rol)}` : ''}
                  </footer>
                </blockquote>
              </CmsReveal>
            ))}
          </div>
        </Section>
      );
    }

    case 'faq': {
      const items = arr(p.items);
      return (
        <Section preview={preview}>
          <div className="cms-pub-center">
            <p className="cms-pub-eyebrow">{str(p.eyebrow, 'SSS')}</p>
            <h2 className="cms-pub-title">{str(p.title, 'Sık sorulan sorular')}</h2>
          </div>
          <div className="cms-pub-faq">
            {items.map((item, i) => (
              <details key={i}>
                <summary>{str(item.question || item.soru)}</summary>
                <p>{str(item.answer || item.cevap)}</p>
              </details>
            ))}
          </div>
        </Section>
      );
    }

    case 'cta':
      return (
        <CmsReveal from="up">
          <section className="cms-pub-closing">
            <h2>{str(p.title, 'Hedefine birlikte yürüyelim')}</h2>
            {str(p.description) ? <p>{str(p.description)}</p> : null}
            <Btn label={p.buttonLabel} url={p.buttonUrl} variant="primary" />
          </section>
        </CmsReveal>
      );

    case 'map': {
      const embed = str(p.embedUrl);
      if (!embed) return preview ? <div className="cms-pub-fallback">Harita</div> : null;
      return (
        <Section preview={preview} alt>
          <div className="cms-pub-center" style={{ marginBottom: '1.5rem' }}>
            <h2 className="cms-pub-title">{str(p.title, 'Bizi ziyaret edin')}</h2>
          </div>
          <div className="cms-pub-map">
            <iframe title="Harita" src={embed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          </div>
        </Section>
      );
    }

    case 'form':
      return (
        <Section preview={preview} alt>
          <PublicFormBlock formSlug={str(p.formSlug)} title={str(p.title, 'İletişim formu')} preview={preview} />
        </Section>
      );

    case 'spacer':
      return <div style={{ height: num(p.height, 24) }} aria-hidden />;

    case 'divider':
      return <hr style={{ border: 'none', borderTop: `1px solid ${str(p.color, '#e2e8f0')}`, margin: 0 }} />;

    case 'duyurularList':
    case 'sinavTakvim':
      return preview ? (
        <div className="cms-pub-fallback">{getBlockLabel(type)} (canlı sitede listelenir)</div>
      ) : null;

    case 'html':
      return <div dangerouslySetInnerHTML={{ __html: str(p.html) }} />;

    case 'button':
      return (
        <div style={{ textAlign: str(p.align, 'center') as 'left' | 'center' | 'right', padding: '1rem' }}>
          <Btn label={p.label} url={p.url} variant="primary" />
        </div>
      );

    default:
      return preview ? <div className="cms-pub-fallback">{getBlockLabel(type)} bloğu</div> : null;
  }
}

export function BlocksRenderer({ blocks, preview }: { blocks: CmsBlock[]; preview?: boolean }) {
  if (!blocks?.length) return null;
  return (
    <div className="cms-blocks">
      {blocks.map((b) => (
        <BlockRenderer key={b.id} block={b} preview={preview} />
      ))}
    </div>
  );
}
