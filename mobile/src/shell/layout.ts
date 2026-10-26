import { useState } from 'react';
import { useWindowDimensions, type LayoutChangeEvent } from 'react-native';

import { band } from '@/design/tokens';

export type ShellWidth = 'phone' | 'compact' | 'wide';

export function useShellWidth(): ShellWidth {
  const { width } = useWindowDimensions();
  if (width >= band.wide) return 'wide';
  if (width >= band.compact) return 'compact';
  return 'phone';
}

export function railWidth(mode: ShellWidth) {
  return mode === 'phone' ? 0 : band.rail;
}

export function panelsFit(width: number, rail = 0) {
  return width - rail >= band.listMin + band.detailMin;
}

export function useMeasuredWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((current) => (current === next ? current : next));
  };
  return { width, onLayout };
}
