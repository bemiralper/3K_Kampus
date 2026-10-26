import Constants from 'expo-constants';

import { useSession } from '@/auth/store';

function packagerHost() {
  const hostUri = Constants.expoConfig?.hostUri || Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1') return null;
  return host;
}

function apiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${window.location.hostname}:8000`;
  }
  const host = packagerHost();
  if (host) return `http://${host}:8000`;
  return (Constants.expoConfig?.extra?.apiUrl as string | undefined) || 'http://Taner-Alper.local:8000';
}

export const API_URL = apiUrl();

export function sessionHeaders(): Record<string, string> {
  const state = useSession.getState();
  const headers: Record<string, string> = {};
  if (!state.access) return headers;
  headers.Authorization = `Bearer ${state.access}`;
  headers['X-Portal'] = 'teacher';
  if (state.kurumId) headers['X-Kurum-ID'] = String(state.kurumId);
  if (state.subeId) headers['X-Sube-ID'] = String(state.subeId);
  if (state.yilId) headers['X-EgitimYili-ID'] = String(state.yilId);
  return headers;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

type Options = RequestInit & { auth?: boolean; retry?: boolean };

let refreshTask: Promise<boolean> | null = null;

async function readFailure(response: Response): Promise<ApiError> {
  try {
    const body = await response.json();
    return new ApiError(
      body.message || body.error || 'İstek tamamlanamadı.',
      response.status,
      body.code,
    );
  } catch {
    return new ApiError('İstek tamamlanamadı.', response.status);
  }
}

async function refreshSession(): Promise<boolean> {
  if (!refreshTask) {
    refreshTask = (async () => {
      const { refresh, setTokens, clear } = useSession.getState();
      if (!refresh) return false;
      const response = await fetch(`${API_URL}/api/mobile/auth/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refresh }),
      });
      if (!response.ok) {
        await clear();
        return false;
      }
      const body = await response.json();
      await setTokens(body.access, body.refresh);
      return true;
    })().finally(() => {
      refreshTask = null;
    });
  }
  return refreshTask;
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { auth = true, retry = false, headers, ...rest } = options;
  const state = useSession.getState();
  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(headers as Record<string, string> | undefined),
  };
  const formBody = typeof FormData !== 'undefined' && rest.body instanceof FormData;
  if (rest.body && !formBody && !requestHeaders['Content-Type']) {
    requestHeaders['Content-Type'] = 'application/json';
  }
  if (auth && state.access) Object.assign(requestHeaders, sessionHeaders());
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...rest, headers: requestHeaders });
  } catch {
    throw new ApiError('Sunucuya ulaşılamadı.', 0, 'network');
  }
  if (response.status === 401 && auth && !retry && !path.includes('/auth/token')) {
    const renewed = await refreshSession();
    if (renewed) return api<T>(path, { ...options, retry: true });
    throw new ApiError('Oturum sona erdi.', 401, 'unauthenticated');
  }
  if (!response.ok) throw await readFailure(response);
  return response.json() as Promise<T>;
}

export async function apiBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = { Accept: '*/*', ...sessionHeaders() };
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { headers });
  } catch {
    throw new ApiError('Sunucuya ulaşılamadı.', 0, 'network');
  }
  if (!response.ok) throw await readFailure(response);
  return response.blob();
}

export async function login(username: string, password: string) {
  const deviceId = useSession.getState().deviceId;
  return api<{ access: string; refresh: string; expires_in: number }>(
    '/api/mobile/auth/token/',
    {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ username, password, device_id: deviceId }),
    },
  );
}

export async function logoutRemote() {
  const refresh = useSession.getState().refresh;
  if (!refresh) return;
  try {
    await api('/api/mobile/auth/logout/', {
      method: 'POST',
      body: JSON.stringify({ refresh }),
    });
  } catch {
    // Yerel kimlik her durumda silinir.
  }
}
