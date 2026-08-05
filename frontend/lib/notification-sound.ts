/** Yeni bildirim geldiğinde kısa çift bip sesi (harici dosya gerekmez). */

const MUTE_STORAGE_KEY = '3k_notification_sound_muted';
const VOLUME_STORAGE_KEY = '3k_notification_sound_volume';

/** Varsayılan seviye (0–100). Önceki sabit ses biraz kısık kaldığı için yüksek. */
const DEFAULT_VOLUME = 85;
/** peak=1 iken kulaklıkta bozulmadan duyulur üst sınır */
const MAX_PEAK = 0.72;

let audioCtx: AudioContext | null = null;
let unlockBound = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

export function isNotificationSoundMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setNotificationSoundMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
    window.dispatchEvent(new CustomEvent('lms:notification-sound-muted', { detail: { muted } }));
  } catch {
    /* ignore */
  }
}

export function toggleNotificationSoundMuted(): boolean {
  const next = !isNotificationSoundMuted();
  setNotificationSoundMuted(next);
  return next;
}

/** 0–100 arası bildirim ses seviyesi (cihaz / kullanıcı tercihi). */
export function getNotificationSoundVolume(): number {
  if (typeof window === 'undefined') return DEFAULT_VOLUME;
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw == null) return DEFAULT_VOLUME;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_VOLUME;
    return Math.min(100, Math.max(0, Math.round(n)));
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function setNotificationSoundVolume(volume: number): void {
  if (typeof window === 'undefined') return;
  const next = Math.min(100, Math.max(0, Math.round(volume)));
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(next));
    if (next > 0 && isNotificationSoundMuted()) {
      setNotificationSoundMuted(false);
    }
    if (next === 0) {
      setNotificationSoundMuted(true);
    }
    window.dispatchEvent(
      new CustomEvent('lms:notification-sound-volume', { detail: { volume: next } }),
    );
  } catch {
    /* ignore */
  }
}

/** Tarayıcı autoplay kilidini açmak için ilk kullanıcı etkileşiminde çağırın. */
export function unlockNotificationAudio() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
  } catch {
    /* ignore */
  }
}

/** Belge genelinde bir kez dinleyici bağla (header çanı için). */
export function bindNotificationAudioUnlock() {
  if (typeof window === 'undefined' || unlockBound) return;
  unlockBound = true;
  const once = () => {
    unlockNotificationAudio();
    window.removeEventListener('pointerdown', once);
    window.removeEventListener('keydown', once);
  };
  window.addEventListener('pointerdown', once, { passive: true });
  window.addEventListener('keydown', once);
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  duration: number,
  peak: number,
) {
  const osc = ctx.createOscillator();
  const harmonic = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = frequency;
  harmonic.type = 'sine';
  harmonic.frequency.value = frequency * 2;
  const safePeak = Math.max(0.0001, Math.min(MAX_PEAK, peak));
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(safePeak, startAt + 0.018);
  gain.gain.exponentialRampToValueAtTime(safePeak * 0.55, startAt + duration * 0.45);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  harmonic.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  harmonic.start(startAt);
  osc.stop(startAt + duration + 0.02);
  harmonic.stop(startAt + duration + 0.02);
}

export function playNotificationSound() {
  if (isNotificationSoundMuted()) return;
  const volume = getNotificationSoundVolume();
  if (volume <= 0) return;
  const scale = volume / 100;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const run = () => {
      const t = ctx.currentTime;
      playTone(ctx, 880, t, 0.16, 0.55 * scale);
      playTone(ctx, 1174, t + 0.18, 0.18, 0.68 * scale);
    };
    if (ctx.state === 'suspended') {
      void ctx.resume().then(run).catch(() => {});
      return;
    }
    run();
  } catch {
    /* sessizce geç */
  }
}

export function isGorevNotification(baslik: string, url?: string | null): boolean {
  if (baslik.startsWith('Yeni Görev:')) return true;
  if (baslik.startsWith('Görev Tamamlandı:')) return true;
  if (baslik.startsWith('Görev Tamamlanamadı:')) return true;
  if (baslik.startsWith('Görev Gecikti:')) return true;
  if (baslik.startsWith('Görev Hatırlatması:')) return true;
  if (url && /gorev/i.test(url)) return true;
  return false;
}
