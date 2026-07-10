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

/** Giriş başarılı olduktan sonra gidilecek path. */
export async function resolvePostLoginRedirect(user: User | null): Promise<string> {
  if (!user) return "/?giris=1";

  if (isCoachOnlyUser(user) || isMuhasebeOnlyUser(user)) {
    return getDefaultHomePath(user);
  }

  try {
    const storedKurumRaw = localStorage.getItem(STORAGE_KURUM);
    const storedKurumId = storedKurumRaw ? parseInt(storedKurumRaw, 10) : NaN;
    const hasStoredKurum = Number.isFinite(storedKurumId);

    const kurumRes = await personelAccessService.myKurumlar();

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
    }

    const subeRes = await personelAccessService.mySubeler(
      kurumId ? { kurum_id: kurumId } : undefined,
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

  try {
    const subeRes = await personelAccessService.mySubeler({ kurum_id: kurumId });

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
