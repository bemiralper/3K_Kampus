/** Ekran pikseli kalıcı değildir. Kayıt sayfa milimetresidir. */

export function screenToMm(
  localX: number,
  localY: number,
  panX: number,
  panY: number,
  zoom: number,
  baseW: number,
  baseH: number,
  pageW: number,
  pageH: number,
) {
  const stageX = (localX - panX) / zoom;
  const stageY = (localY - panY) / zoom;
  return {
    x: (stageX / baseW) * pageW,
    y: (stageY / baseH) * pageH,
  };
}

export function mmToStage(mm: number, page: number, base: number) {
  return (mm / page) * base;
}

export function mmToScreen(
  xMm: number,
  yMm: number,
  panX: number,
  panY: number,
  zoom: number,
  baseW: number,
  baseH: number,
  pageW: number,
  pageH: number,
) {
  return {
    x: panX + mmToStage(xMm, pageW, baseW) * zoom,
    y: panY + mmToStage(yMm, pageH, baseH) * zoom,
  };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function roundMm(value: number) {
  return Math.round(value * 100) / 100;
}
