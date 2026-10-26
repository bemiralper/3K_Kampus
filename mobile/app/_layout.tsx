import 'react-native-gesture-handler';

import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { loadProfile } from '@/auth/profile';
import { useSession } from '@/auth/store';
import { FontProvider, useFontState } from '@/design/fonts';
import { ThemeProvider, usePalette } from '@/design/theme';

const queryClient = new QueryClient();

function Boot() {
  const palette = usePalette();
  const { settled } = useFontState();
  const hydrate = useSession((state) => state.hydrate);
  const ready = useSession((state) => state.ready);
  const access = useSession((state) => state.access);
  const account = useSession((state) => state.account);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  useEffect(() => {
    if (!ready || !access || account) return;
    loadProfile().catch(() => undefined);
  }, [ready, access, account]);
  if (!ready || !settled) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paper }}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <FontProvider>
            <Boot />
          </FontProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
