import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, login } from '@/api/client';
import { loadProfile } from '@/auth/profile';
import { useSession } from '@/auth/store';
import { useFontState } from '@/design/fonts';
import { Icon } from '@/design/icons';
import { Logo } from '@/design/logo';
import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { font, space } from '@/design/tokens';
import { Press } from '@/flow/motion';
import { useShellWidth } from '@/shell/layout';

const NAVY = '#1E3A5F';
const NAVY_MID = '#2D5A87';
const WORDS = ['KURS', 'KÜTÜPHANE', 'KOÇLUK'];
const FEATURES = ['5 kişilik grup dersleri', 'Birebir özel ders', 'Deneme analizleri', 'Bireysel koçluk'];

export default function LoginScreen() {
  const palette = usePalette();
  const fonts = useFontState();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const wide = useShellWidth() === 'wide';
  const reduce = useReducedMotion();
  const access = useSession((state) => state.access);
  const setTokens = useSession((state) => state.setTokens);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const timer = setInterval(() => setWordIndex((index) => (index + 1) % WORDS.length), 2200);
    return () => clearInterval(timer);
  }, [reduce]);

  if (access) return <Redirect href="/baglam" />;

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const tokens = await login(username.trim(), password);
      await setTokens(tokens.access, tokens.refresh);
      await loadProfile();
      router.replace('/baglam');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Giriş tamamlanamadı.');
    } finally {
      setPending(false);
    }
  }

  const field = {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    color: palette.ink,
    fontSize: 16,
    fontFamily: fonts.active ? font.regular : undefined,
    paddingHorizontal: 14,
  };

  const hero = (
    <View style={{ flex: wide ? 1 : undefined, minHeight: wide ? undefined : 360, backgroundColor: NAVY, overflow: 'hidden', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', right: -80, top: -60, width: 280, height: 280, borderRadius: 140, backgroundColor: NAVY_MID, opacity: 0.55 }} />
      <View style={{ position: 'absolute', left: -40, bottom: -70, width: 220, height: 220, borderRadius: 110, backgroundColor: '#0262A7', opacity: 0.35 }} />
      <View
        style={{
          width: '100%',
          paddingTop: insets.top + (wide ? 20 : 12),
          paddingBottom: wide ? 48 : 36,
          paddingHorizontal: wide ? 48 : space.lg,
          gap: space.lg,
        }}
      >
        <View style={{ alignItems: 'center', marginTop: wide ? -88 : -48 }}>
          <Logo variant="white" height={wide ? 156 : 112} />
        </View>
        <View style={{ gap: 8, maxWidth: 640 }}>
          <AppText variant="caption" weight="semibold" color="rgba(255,255,255,0.72)" style={{ letterSpacing: 1.4 }}>
            EĞİTİM MERKEZİ
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <AppText weight="bold" color="#FFFFFF" style={{ fontSize: wide ? 40 : 32, letterSpacing: 1 }}>
              3K
            </AppText>
            <View style={{ width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.35)' }} />
            <AppText weight="bold" color="#FFFFFF" style={{ fontSize: wide ? 40 : 32, letterSpacing: 1, minWidth: wide ? 280 : 220 }}>
              {WORDS[wordIndex]}
            </AppText>
          </View>
          <AppText weight="bold" color="#FFFFFF" style={{ fontSize: wide ? 28 : 22, marginTop: 4 }}>
            3K Kampüs
          </AppText>
          <AppText variant="support" weight="semibold" color="rgba(255,255,255,0.9)">
            LGS · YKS · Okul destek programları
          </AppText>
          <AppText variant="support" color="rgba(255,255,255,0.78)" style={{ maxWidth: 460, marginTop: 4 }}>
            Başarıya giden yolun dijital takip sistemi. Program, sınıflar ve kayıtlar aynı hesapta.
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, maxWidth: 640 }}>
          {FEATURES.map((item) => (
            <View
              key={item}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                minWidth: wide ? '46%' : '100%',
                paddingVertical: 8,
              }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon icon={Check} color="#FFFFFF" size={13} />
              </View>
              <AppText variant="support" color="rgba(255,255,255,0.92)">
                {item}
              </AppText>
            </View>
          ))}
        </View>
      </View>
    </View>
  );

  const form = (
    <View style={{ width: '100%', maxWidth: 400, alignSelf: 'center', gap: space.lg }}>
      <View style={{ gap: 6 }}>
        <AppText variant="page" weight="bold" color={NAVY}>
          Giriş yap
        </AppText>
        <AppText variant="support" color={palette.muted}>
          3K Kampüs hesabınızla devam edin.
        </AppText>
      </View>
      <View style={{ gap: space.md }}>
        <View style={{ gap: 6 }}>
          <AppText variant="caption" weight="semibold" color={palette.ink}>
            Kullanıcı adı
          </AppText>
          <TextInput
            accessibilityLabel="Kullanıcı adı"
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
            placeholder="Kullanıcı adınız"
            placeholderTextColor={palette.muted}
            style={field}
          />
        </View>
        <View style={{ gap: 6 }}>
          <AppText variant="caption" weight="semibold" color={palette.ink}>
            Şifre
          </AppText>
          <TextInput
            accessibilityLabel="Şifre"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="Şifreniz"
            placeholderTextColor={palette.muted}
            onSubmitEditing={submit}
            style={field}
          />
        </View>
        {error ? (
          <AppText variant="support" color={palette.danger}>
            {error}
          </AppText>
        ) : null}
        <Press
          accessibilityRole="button"
          accessibilityLabel="Giriş yap"
          disabled={pending}
          onPress={submit}
          style={{
            height: 52,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pending ? palette.line : NAVY,
          }}
        >
          <AppText variant="button" weight="bold" color={pending ? palette.muted : '#FFFFFF'}>
            {pending ? 'Giriş yapılıyor' : 'Giriş yap'}
          </AppText>
        </Press>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#FFFFFF' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {wide ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {hero}
          <View
            style={{
              width: 460,
              justifyContent: 'center',
              paddingHorizontal: 40,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
              backgroundColor: '#FFFFFF',
              borderLeftWidth: StyleSheet.hairlineWidth,
              borderLeftColor: '#E2E8F0',
            }}
          >
            {form}
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: '#F8FAFC' }} keyboardShouldPersistTaps="handled">
          {hero}
          <View
            style={{
              marginTop: -28,
              marginHorizontal: space.lg,
              marginBottom: insets.bottom + space.lg,
              padding: space.lg,
              borderRadius: 20,
              backgroundColor: '#FFFFFF',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: '#E2E8F0',
            }}
          >
            {form}
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}
