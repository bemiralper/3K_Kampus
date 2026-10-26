import type { LucideIcon } from 'lucide-react-native';

import { usePalette } from './theme';
import { icon } from './tokens';

export function Icon({ icon: Glyph, color, size }: { icon: LucideIcon; color?: string; size?: number }) {
  const palette = usePalette();
  return <Glyph size={size ?? icon.size} strokeWidth={icon.stroke} color={color ?? palette.ink} accessible={false} />;
}
