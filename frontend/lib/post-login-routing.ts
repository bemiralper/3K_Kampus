/**
 * Giriş sonrası kurum / şube seçim yönlendirmesi.
 *
 * Akış:
 * 1. Birden fazla kurum → /kurum-sec
 * 2. Tek kurum → localStorage'a yaz, şube adımına geç
 * 3. kurum_yoneticisi / süper kullanıcı veya çok şubeli personel → /sube-sec
 * 4. Tek şube → otomatik seç, ana sayfaya git
 */

import type { User } from "@/lib/contexts/AuthContext";
import {
  getDefaultHomePath,
  isCoachOnlyUser,
  isMuhasebeOnlyUser,
} from "@/lib/auth-routes";
import { setActiveContext } from "@/lib/api";
import { personelAccessService } from "@/lib/personel-access-api";

export const STORAGE_KURUM = "3k_active_kurum";
export const STORAGE_SUBE = "3k_active_sube";
export const STORAGE_CONTEXT_GATE = "3k_context_gate";
/** LoginForm yönlendirmesi bitene kadar AppShell'in ana sayfaya atlamasını engeller */
export const STORAGE_POST_LOGIN_ROUTING = "3k_post_login_routing";

const LOGIN_FETCH = { omitContextHeaders: true } as const;

export type ContextGate = "kurum" | "sube";

export function setContextGate(gate: ContextGate | null): void {
  if (typeof window === "undefined") return;
  if (gate) {
    sessionStorage.setItem(STORAGE_CONTEXT_GATE, gate);
  } else {
    sessionStorage.removeItem(STORAGE_CONTEXT_GATE);
  }
}

export function getContextGate(): ContextGate | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_CONTEXT_GATE);
  return raw === "kurum" || raw === "sube" ? raw : null;
}

export function clearContextGate(): void {
  setContextGate(null);
}

async function persistSingleSube(
  sube: { id: number; kurum_id: number },
): Promise<void> {
  localStorage.setItem(STORAGE_SUBE, String(sube.id));
  localStorage.setItem(STORAGE_KURUM, String(sube.kurum_id));
  await setActiveContext(sube.kurum_id, sube.id, null);
}

/** Koç / muhasebe portalı: finans API'leri için kurum+şube bağlamını oturum açılışında yaz. */
async function ensureContextForPortalUser(_user: User): Promise<void> {
  const storedKurumRaw = localStorage.getItem(STORAGE_KURUM);
  const storedKurumId = storedKurumRaw ? parseInt(storedKurumRaw, 10) : NaN;
  const hasStoredKurum = Number.isFinite(storedKurumId);

  const kurumRes = await personelAccessService.myKurumlar(LOGIN_FETCH);
  const kurumId =
    kurumRes.kurumlar.length === 1
      ? kurumRes.kurumlar[0].id
      : hasStoredKurum && kurumRes.kurumlar.some((k) => k.id === storedKurumId)
        ? storedKurumId
        : kurumRes.kurumlar[0]?.id;

  if (kurumId) {
    localStorage.setItem(STORAGE_KURUM, String(kurumId));
  }

  const subeRes = await personelAccessService.mySubeler(
    kurumId ? { kurum_id: kurumId } : undefined,
    LOGIN_FETCH,
  );

  if (subeRes.subeler.length === 1) {
    await persistSingleSube(subeRes.subeler[0]);
    return;
  }

  const storedSubeRaw = localStorage.getItem(STORAGE_SUBE);
  const storedSubeId = storedSubeRaw ? parseInt(storedSubeRaw, 10) : NaN;
  const matched = Number.isFinite(storedSubeId)
    ? subeRes.subeler.find((s) => s.id === storedSubeId)
    : undefined;
  if (matched) {
    await persistSingleSube(matched);
  }
}

/** Giriş başarılı olduktan sonra gidilecek path. */
export async function resolvePostLoginRedirect(user: User | null): Promise<string> {
  if (!user) return "/?giris=1";

  const home = getDefaultHomePath(user);

  if (isCoachOnlyUser(user) || isMuhasebeOnlyUser(user)) {
    try {
      await ensureContextForPortalUser(user);
    } catch {
      /* portal home yine de açılır */
    }
    return home;
  }

  try {
    // Önceki oturumdan kalan şube; picker kararını ve session'ı bozmasın
    localStorage.removeItem(STORAGE_SUBE);

    const storedKurumRaw = localStorage.getItem(STORAGE_KURUM);
    const storedKurumId = storedKurumRaw ? parseInt(storedKurumRaw, 10) : NaN;
    const hasStoredKurum = Number.isFinite(storedKurumId);

    const kurumRes = await personelAccessService.myKurumlar(LOGIN_FETCH);

    if (kurumRes.needs_kurum_picker && kurumRes.kurumlar.length > 1) {
      localStorage.removeItem(STORAGE_SUBE);
      setContextGate("kurum");
      return "/kurum-sec";
    }

    const kurumId =
      kurumRes.kurumlar.length === 1
        ? kurumRes.kurumlar[0].id
        : hasStoredKurum && kurumRes.kurumlar.some((k) => k.id === storedKurumId)
          ? storedKurumId
          : kurumRes.kurumlar[0]?.id;

    if (kurumId) {
      localStorage.setItem(STORAGE_KURUM, String(kurumId));
      try {
        await setActiveContext(kurumId, null, null);
      } catch {
        /* session şube temizliği — picker kararı için */
      }
    }

    const subeRes = await personelAccessService.mySubeler(
      kurumId ? { kurum_id: kurumId } : undefined,
      LOGIN_FETCH,
    );

    const mustSelectSube =
      subeRes.requires_login_sube_selection || subeRes.needs_sube_picker;

    if (mustSelectSube && subeRes.subeler.length > 1) {
      localStorage.removeItem(STORAGE_SUBE);
      setContextGate("sube");
      return "/sube-sec";
    }

    if (subeRes.subeler.length === 1) {
      await persistSingleSube(subeRes.subeler[0]);
    }

    clearContextGate();
    return getDefaultHomePath(user);
  } catch {
    return getDefaultHomePath(user);
  }
}

/** Kurum seçildikten sonra gidilecek path. */
export async function resolvePostKurumRedirect(
  user: User | null,
  kurumId: number,
): Promise<string> {
  if (!user) return "/login";

  localStorage.setItem(STORAGE_KURUM, String(kurumId));
  localStorage.removeItem(STORAGE_SUBE);

  try {
    const subeRes = await personelAccessService.mySubeler({ kurum_id: kurumId }, LOGIN_FETCH);

    const mustSelectSube =
      subeRes.requires_login_sube_selection || subeRes.needs_sube_picker;

    if (mustSelectSube && subeRes.subeler.length > 1) {
      localStorage.removeItem(STORAGE_SUBE);
      setContextGate("sube");
      return "/sube-sec";
    }

    if (subeRes.subeler.length === 1) {
      await persistSingleSube(subeRes.subeler[0]);
    }

    clearContextGate();
    return getDefaultHomePath(user);
  } catch {
    return getDefaultHomePath(user);
  }
}
