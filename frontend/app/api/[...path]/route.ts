import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// Django URL yapısında bazı path'ler api/ prefix'i ile tanımlı (api/coaching/..., api/terms/...),
// bazıları ise prefix'siz (auth/..., ogrenciler/api/..., personel/..., vb.).
// Bu set, Django urls.py'de "api/<prefix>/" şeklinde tanımlı olan path segment'lerini listeler.
const API_PREFIXED_PATHS = new Set([
  'coaching', 'terms', 'academic', 'resources', 'student-resources',
  'legacy', 'ogrenci-kayit', 'communication', 'kimlik',
]);

/** undici fetch rejects hop-by-hop headers forwarded from the browser/nginx chain */
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'upgrade',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'proxy-connection',
  'proxy-authenticate',
  'proxy-authorization',
]);

/** PDF, Excel vb. binary yanıtlar text() ile okunursa dosya bozulur (boş sayfa). */
function isBinaryResponse(contentType: string, disposition: string | null): boolean {
  const ct = contentType.toLowerCase();
  if (ct.includes('application/pdf')) return true;
  if (ct.includes('text/csv')) return true;
  if (ct.includes('spreadsheetml')) return true;
  if (ct.includes('application/vnd.ms-excel')) return true;
  if (ct.includes('application/octet-stream')) return true;
  if (ct.includes('application/gzip') || ct.includes('application/x-gzip')) return true;
  if (ct.includes('application/zip') || ct.includes('application/x-tar')) return true;
  if (disposition?.toLowerCase().includes('attachment') && ct.startsWith('application/')) {
    return true;
  }
  return false;
}

async function proxyRequest(request: NextRequest, path: string) {
  // /api/[...path] route'u path'i api/ prefix'i olmadan alır.
  // Django URL'leri karma yapıda: bazıları api/ ile başlar, bazıları başlamaz.
  // İlk segment'e bakarak api/ prefix'ini sadece gerektiğinde ekliyoruz.
  const firstSegment = path.split('/')[0];
  const resolvedPath = API_PREFIXED_PATHS.has(firstSegment) ? `api/${path}` : path;
  const normalizedPath = resolvedPath.endsWith('/') ? resolvedPath : `${resolvedPath}/`;
  // Query string'i de ekle (?q=xxx gibi parametreler)
  const queryString = request.nextUrl.search || '';
  const url = `${BACKEND_URL}/${normalizedPath}${queryString}`;
  
  // Get content type to determine how to handle body
  const contentType = request.headers.get('content-type') || '';
  
  // Get request body for POST/PUT/PATCH
  let body: BodyInit | undefined;
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    // Check if it's a multipart form (file upload)
    if (contentType.includes('multipart/form-data')) {
      // For multipart, we need to forward the raw body
      body = await request.arrayBuffer();
    } else {
      body = await request.text();
    }
  }

  // Forward headers — skip host + hop-by-hop (undici: invalid connection header)
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'host' || HOP_BY_HOP_HEADERS.has(lower)) return;
    headers.set(key, value);
  });

  const forwardedProto = request.headers.get('x-forwarded-proto') || 'http';
  headers.set('X-Forwarded-Proto', forwardedProto);
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (forwardedHost) {
    headers.set('X-Forwarded-Host', forwardedHost);
  }

  // Forward cookies
  const cookies = request.cookies.getAll();
  if (cookies.length > 0) {
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    headers.set('Cookie', cookieString);
  }

  const isEventStream = path.includes('events/stream');
  if (isEventStream) {
    headers.set('Accept', 'text/event-stream');
  }

  console.log(`[API Proxy] ${request.method} ${url}`);
  console.log(`[API Proxy] Forwarding cookies:`, headers.get('Cookie'));

  try {
    const response = await fetch(url, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
    });

    // Handle 204 No Content — NextResponse cannot have a body with status 204
    if (response.status === 204) {
      const proxyResponse204 = new NextResponse(null, { status: 204 });
      response.headers.forEach((value, key) => {
        const lowerKey = key.toLowerCase();
        if (['content-encoding', 'transfer-encoding', 'content-length'].includes(lowerKey)) return;
        if (lowerKey === 'set-cookie') {
          proxyResponse204.headers.append('Set-Cookie', value);
        } else {
          proxyResponse204.headers.set(key, value);
        }
      });
      return proxyResponse204;
    }

    // SSE — stream body without buffering
    if (isEventStream && response.body) {
      const streamResponse = new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
      });
      response.headers.forEach((value, key) => {
        const lowerKey = key.toLowerCase();
        if (['content-encoding', 'transfer-encoding', 'content-length'].includes(lowerKey)) return;
        if (lowerKey === 'set-cookie') {
          streamResponse.headers.append('Set-Cookie', value);
        } else {
          streamResponse.headers.set(key, value);
        }
      });
      streamResponse.headers.set('Content-Type', 'text/event-stream');
      streamResponse.headers.set('Cache-Control', 'no-cache');
      streamResponse.headers.set('X-Accel-Buffering', 'no');
      return streamResponse;
    }

    // Binary export (PDF, Excel) — arrayBuffer ile ilet; text() bozar
    const responseContentType = response.headers.get('content-type') || '';
    const disposition = response.headers.get('content-disposition');
    const binary = isBinaryResponse(responseContentType, disposition);

    const responseBody = binary
      ? await response.arrayBuffer()
      : await response.text();

    const proxyResponse = new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
    });

    // Forward response headers
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      // Skip problematic headers
      if (['content-encoding', 'transfer-encoding', 'content-length'].includes(lowerKey)) {
        return;
      }
      // Forward Set-Cookie headers (may be multiple)
      if (lowerKey === 'set-cookie') {
        console.log(`[API Proxy] Set-Cookie: ${value}`);
        proxyResponse.headers.append('Set-Cookie', value);
      } else {
        proxyResponse.headers.set(key, value);
      }
    });

    // Set content type
    if (responseContentType) {
      proxyResponse.headers.set('Content-Type', responseContentType);
    }

    return proxyResponse;
  } catch (error) {
    console.error('[API Proxy] Error:', error);
    return NextResponse.json(
      { error: 'Proxy error', details: String(error) },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: pathSegments } = await context.params;
  const path = pathSegments.join('/');
  return proxyRequest(request, path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: pathSegments } = await context.params;
  const path = pathSegments.join('/');
  return proxyRequest(request, path);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: pathSegments } = await context.params;
  const path = pathSegments.join('/');
  return proxyRequest(request, path);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: pathSegments } = await context.params;
  const path = pathSegments.join('/');
  return proxyRequest(request, path);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: pathSegments } = await context.params;
  const path = pathSegments.join('/');
  return proxyRequest(request, path);
}

export async function OPTIONS(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: pathSegments } = await context.params;
  const path = pathSegments.join('/');
  return proxyRequest(request, path);
}
