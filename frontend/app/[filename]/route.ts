import { NextResponse } from 'next/server';
import { LANDING_KURUM_KOD } from '@/lib/landing-theme';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const GOOGLE_VERIFY = /^google[a-z0-9]+\.html$/i;

/**
 * Google Search Console HTML dosya doğrulaması.
 * CMS → Entegrasyonlar'dan yüklenen dosya backend'de saklanır; burada kök URL'den sunulur.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  const { filename } = await context.params;
  if (!GOOGLE_VERIFY.test(filename)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const res = await fetch(
      `${BACKEND}/website/api/public/${encodeURIComponent(LANDING_KURUM_KOD)}/v2/verification/${encodeURIComponent(filename)}/`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const body = await res.text();
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Verification unavailable' }, { status: 502 });
  }
}
