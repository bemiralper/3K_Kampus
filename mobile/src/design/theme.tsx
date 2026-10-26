import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { readThemePreference, writeThemePreference, type ThemePreference } from './theme-storage';
import { dark, light, type Palette } from './tokens';

const PaletteContext = createContext<Palette>(light);

const PreferenceContext = createContext<{
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
}>({
  preference: 'system',
  setPreference: () => undefined,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const setPreference = useCallback((value: ThemePreference) => {
    setPreferenceState(value);
    writeThemePreference(value).catch(() => undefined);
  }, []);
  useEffect(() => {
    let active = true;
    readThemePreference()
      .then((value) => {
        if (active) setPreferenceState(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  return (
    <PreferenceContext.Provider value={{ preference, setPreference }}>
      <PaletteContext.Provider value={scheme === 'dark' ? dark : light}>{children}</PaletteContext.Provider>
    </PreferenceContext.Provider>
  );
}

export function usePalette() {
  return useContext(PaletteContext);
}

export function useThemePreference() {
  return useContext(PreferenceContext);
}
