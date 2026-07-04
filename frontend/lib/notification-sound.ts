/** Yeni bildirim geldiğinde kısa çift bip sesi (harici dosya gerekmez). */
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
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
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const t = ctx.currentTime;
    playTone(ctx, 880, t);
    playTone(ctx, 1174, t + 0.16);
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
