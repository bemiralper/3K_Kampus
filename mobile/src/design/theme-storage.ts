import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'kampus.theme';
const memory = new Map<string, string>();

function isPreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

async function readRaw(): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') return memory.get(KEY) ?? null;
    return localStorage.getItem(KEY);
  }
  return SecureStore.getItemAsync(KEY);
}

async function writeRaw(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') {
      memory.set(KEY, value);
      return;
    }
    localStorage.setItem(KEY, value);
    return;
  }
  await SecureStore.setItemAsync(KEY, value);
}

export async function readThemePreference(): Promise<ThemePreference> {
  const value = await readRaw();
  return isPreference(value) ? value : 'system';
}

export async function writeThemePreference(value: ThemePreference): Promise<void> {
  await writeRaw(value);
}
