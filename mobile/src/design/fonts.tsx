import { createContext, useContext, type ReactNode } from 'react';
import { useFonts } from 'expo-font';

import { font } from './tokens';

type FontState = { settled: boolean; active: boolean };

const FontContext = createContext<FontState>({ settled: false, active: false });

export function FontProvider({ children }: { children: ReactNode }) {
  const [loaded, error] = useFonts({
    [font.regular]: require('../../assets/fonts/IBMPlexSans_400Regular.ttf'),
    [font.medium]: require('../../assets/fonts/IBMPlexSans_500Medium.ttf'),
    [font.semibold]: require('../../assets/fonts/IBMPlexSans_600SemiBold.ttf'),
    [font.bold]: require('../../assets/fonts/IBMPlexSans_700Bold.ttf'),
  });
  const settled = loaded || error != null;
  const active = loaded && error == null;
  return <FontContext.Provider value={{ settled, active }}>{children}</FontContext.Provider>;
}

export function useFontState() {
  return useContext(FontContext);
}
