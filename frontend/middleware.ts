import fs from 'fs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const MAINTENANCE_FLAG = process.env.LMS_MAINTENANCE_FLAG || '/var/lib/3k/maintenance.enable';
const MAINTENANCE_HTML =
  process.env.LMS_MAINTENANCE_HTML ||
  `${process.cwd()}/../deploy/maintenance.html`;

function maintenanceResponse(): NextResponse | null {
  if (process.env.LMS_MAINTENANCE === '1') {
    return renderMaintenance();
  }
  try {
    if (fs.existsSync(MAINTENANCE_FLAG)) {
      return renderMaintenance();
    }
  } catch {
    /* dev / sandbox — flag okunamazsa normal akış */
  }
  return null;
}

function renderMaintenance(): NextResponse {
  try {
    const html = fs.readFileSync(MAINTENANCE_HTML, 'utf-8');
    return new NextResponse(html, {
      status: 503,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Retry-After': '120',
      },
    });
  } catch {
    return new NextResponse(
      '<!DOCTYPE html><html lang="tr"><body><h1>Sistem güncelleniyor</h1><p>Lütfen birkaç dakika sonra tekrar deneyin.</p></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

export function middleware(request: NextRequest) {
  const blocked = maintenanceResponse();
  if (blocked) {
    return blocked;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
