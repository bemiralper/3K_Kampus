/** Paket, hizmet veya kayıt türü kaydı aynı sekmedeki listeleri tazeler. */

export const ERISIM_OLAYI = 'lms-erisim-degisti';

export function bildirErisimDegisti() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ERISIM_OLAYI));
}
