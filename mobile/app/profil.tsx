import { useState } from 'react';
import { Image, TextInput, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { ArrowLeft, Briefcase, CalendarDays, HeartPulse, Mail, MapPin, Phone, Smartphone, UserRound } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, API_URL, api, logoutRemote } from '@/api/client';
import { useTeacherProfile } from '@/api/teacher';
import { useSession } from '@/auth/store';
import { useFontState } from '@/design/fonts';
import { Icon } from '@/design/icons';
import { Logo } from '@/design/logo';
import { AppText } from '@/design/text';
import { usePalette, useThemePreference } from '@/design/theme';
import type { ThemePreference } from '@/design/theme-storage';
import { font, space } from '@/design/tokens';
import { Appear, Press } from '@/flow/motion';
import { Button, Card, Heading, Label, Page, Segmented, State } from '@/flow/ui';

function photoUri(photo: string) {
  if (photo.startsWith('http://') || photo.startsWith('https://')) return photo;
  return `${API_URL}${photo.startsWith('/') ? '' : '/'}${photo}`;
}

function shownDate(iso: string) {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${day}.${month}.${year}` : iso;
}

function Portrait({ uri }: { uri: string | null }) {
  if (uri) {
    return <Image accessible={false} source={{ uri: photoUri(uri) }} style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: '#FFFFFF' }} />;
  }
  return (
    <View style={{ height: 112, paddingHorizontal: 22, borderRadius: 28, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
      <Logo height={76} />
    </View>
  );
}

function Fact({ icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  const palette = usePalette();
  const empty = value.trim() === '';
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 48 }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: palette.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
        <Icon icon={icon} color={palette.midnight} size={18} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AppText variant="caption" color={palette.muted}>
          {label}
        </AppText>
        <AppText weight="semibold" color={empty ? palette.muted : palette.ink}>
          {empty ? 'Kayıtlı değil' : value}
        </AppText>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const palette = usePalette();
  const fonts = useFontState();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const access = useSession((state) => state.access);
  const account = useSession((state) => state.account);
  const kurumlar = useSession((state) => state.kurumlar);
  const subeler = useSession((state) => state.subeler);
  const yillar = useSession((state) => state.yillar);
  const kurumId = useSession((state) => state.kurumId);
  const subeId = useSession((state) => state.subeId);
  const yilId = useSession((state) => state.yilId);
  const clear = useSession((state) => state.clear);
  const profile = useTeacherProfile();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const { preference, setPreference } = useThemePreference();
  const kurum = kurumlar.find((row) => row.id === kurumId);
  const sube = subeler.find((row) => row.id === subeId && row.egitim_yili_id === yilId);
  const yil = yillar.find((row) => row.id === yilId);
  const person = profile.data;
  const name = person ? `${person.ad} ${person.soyad}` : account ? `${account.ad} ${account.soyad}` : 'Profil';
  const place = [kurum?.ad, sube?.ad, yil?.ad].filter((part, index, all): part is string => Boolean(part) && part !== all[index - 1]).join(' · ');
  const roleLine = [person?.rol || 'Öğretmen', person?.brans].filter(Boolean).join(' · ');
  const address = [person?.adres, person?.ilce, person?.il].filter(Boolean).join(', ');

  async function changePassword() {
    setMessage(null);
    try {
      await api('/api/mobile/auth/change-password/', {
        method: 'POST',
        body: JSON.stringify({ current_password: current, new_password: next, new_password_confirm: confirm }),
      });
      await clear();
      router.replace('/login');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Şifre güncellenemedi.');
    }
  }

  async function logout() {
    await logoutRemote();
    await clear();
    router.replace('/login');
  }

  if (!access) return <Redirect href="/login" />;

  const field = {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paper,
    color: palette.ink,
    fontSize: 16,
    fontFamily: fonts.active ? font.regular : undefined,
    paddingHorizontal: 16,
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.paper }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: space.md, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Press
          accessibilityRole="button"
          accessibilityLabel="Geri"
          onPress={() => (router.canGoBack() ? router.back() : router.replace(kurumId ? '/ana' : '/baglam'))}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon icon={ArrowLeft} color={palette.ink} />
        </Press>
        <AppText variant="section" weight="bold" color={palette.ink}>
          Profil
        </AppText>
      </View>
      <Page>
        <Appear index={0}>
          <Card style={{ padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            {person?.fotograf ? (
              <Image accessible={false} source={{ uri: photoUri(person.fotograf) }} style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: palette.primaryContainer }} />
            ) : (
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: palette.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
                <Logo height={34} />
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <AppText variant="section" weight="bold" color={palette.ink} lines={2}>
                {name}
              </AppText>
              <AppText variant="support" weight="medium" color={palette.midnight} lines={1}>
                {roleLine}
              </AppText>
              {place ? (
                <AppText variant="caption" color={palette.muted} lines={2}>
                  {place}
                </AppText>
              ) : null}
            </View>
          </Card>
        </Appear>
        <State loading={profile.isLoading} error={profile.error instanceof Error ? profile.error.message : null}>
          <Appear index={1}>
            <Card style={{ padding: space.lg, gap: space.sm }}>
              <Label>Kimlik</Label>
              <Fact icon={UserRound} label="TC kimlik no" value={person?.tc_kimlik_no ?? ''} />
              <Fact icon={CalendarDays} label="Doğum tarihi" value={person?.dogum_tarihi ? shownDate(person.dogum_tarihi) : ''} />
              <Fact icon={UserRound} label="Cinsiyet" value={person?.cinsiyet ?? ''} />
            </Card>
          </Appear>
          <Appear index={2}>
            <Card style={{ padding: space.lg, gap: space.sm }}>
              <Label>İletişim</Label>
              <Fact icon={Smartphone} label="Cep telefonu" value={person?.cep_telefon ?? ''} />
              <Fact icon={Phone} label="Telefon" value={person?.telefon ?? ''} />
              <Fact icon={Mail} label="E-posta" value={person?.email ?? ''} />
              <Fact icon={MapPin} label="Adres" value={address} />
            </Card>
          </Appear>
          <Appear index={3}>
            <Card style={{ padding: space.lg, gap: space.sm }}>
              <Label>Görev</Label>
              <Fact icon={Briefcase} label="Branş" value={person?.brans ?? ''} />
              <Fact icon={Briefcase} label="Rol" value={person?.rol ?? ''} />
              <Fact icon={CalendarDays} label="Görev başlangıcı" value={person?.gorev_baslangic ? shownDate(person.gorev_baslangic) : ''} />
              <Fact icon={MapPin} label="Kurum" value={place} />
            </Card>
          </Appear>
          <Appear index={4}>
            <Card style={{ padding: space.lg, gap: space.sm }}>
              <Label>Acil durum</Label>
              <Fact icon={HeartPulse} label="Kişi" value={person?.acil_durum_kisi ?? ''} />
              <Fact icon={Phone} label="Telefon" value={person?.acil_durum_telefon ?? ''} />
            </Card>
          </Appear>
        </State>
        <Appear index={5}>
          <Card style={{ padding: space.lg, gap: space.sm }}>
            <Label>Görünüm</Label>
            <Segmented
              items={[
                { key: 'system', label: 'Sistem' },
                { key: 'light', label: 'Açık' },
                { key: 'dark', label: 'Koyu' },
              ]}
              value={preference}
              onChange={(key) => setPreference(key as ThemePreference)}
            />
          </Card>
        </Appear>
        <Appear index={6}>
          <Card style={{ padding: space.lg, gap: space.sm }}>
            <Label>Şifre</Label>
            <TextInput accessibilityLabel="Mevcut şifre" secureTextEntry value={current} onChangeText={setCurrent} placeholder="Mevcut şifre" placeholderTextColor={palette.muted} style={field} />
            <TextInput accessibilityLabel="Yeni şifre" secureTextEntry value={next} onChangeText={setNext} placeholder="Yeni şifre" placeholderTextColor={palette.muted} style={field} />
            <TextInput accessibilityLabel="Yeni şifre tekrar" secureTextEntry value={confirm} onChangeText={setConfirm} placeholder="Yeni şifre tekrar" placeholderTextColor={palette.muted} style={field} />
            {message ? (
              <AppText variant="support" color={palette.danger}>
                {message}
              </AppText>
            ) : null}
            <Button label="Şifreyi güncelle" onPress={changePassword} />
          </Card>
        </Appear>
        <Appear index={7}>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {kurumId ? (
              <View style={{ flex: 1 }}>
                <Button label="Derse dön" tone="ghost" onPress={() => router.replace('/ana')} />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Button label="Çıkış" tone="ghost" onPress={logout} />
            </View>
          </View>
        </Appear>
      </Page>
    </View>
  );
}
