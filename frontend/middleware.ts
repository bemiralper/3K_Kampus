import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Edge runtime — fs kullanılamaz; nginx + Django flag dosyasını okur. */
const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="30" />
  <title>3K Kampüs — Güncelleme</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px}
    .c{max-width:480px;text-align:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:32px}
    h1{font-size:1.4rem;margin:0 0 12px}
    p{line-height:1.6;color:#cbd5e1}
  </style>
</head>
<body>
  <div class="c">
    <h1>Sistem güncelleniyor</h1>
    <p>3K Kampüs kısa süreli güncelleme alıyor. Genellikle 2–5 dakika sürer; lütfen sayfayı biraz sonra yenileyin.</p>
  </div>
</body>
</html>`;

function maintenanceResponse(): NextResponse | null {
  if (process.env.LMS_MAINTENANCE === '1') {
    return new NextResponse(MAINTENANCE_HTML, {
      status: 503,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Retry-After': '120',
      },
    });
  }
  return null;
}

export function middleware(_request: NextRequest) {
  const blocked = maintenanceResponse();
  if (blocked) {
    return blocked;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
