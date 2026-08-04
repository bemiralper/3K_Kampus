/** Yeni bildirim geldiğinde kısa çift bip sesi (harici dosya gerekmez). */

const MUTE_STORAGE_KEY = '3k_notification_sound_muted';

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

function playTone(ctx: AudioContext, frequency: number, startAt: number, duration = 0.12) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

export function playNotificationSound() {
  if (isNotificationSoundMuted()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const run = () => {
      const t = ctx.currentTime;
      playTone(ctx, 880, t);
      playTone(ctx, 1174, t + 0.16);
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
