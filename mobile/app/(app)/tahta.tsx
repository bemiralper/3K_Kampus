import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Monitor } from 'lucide-react-native';

import { endBoard, pairBoard, showOnBoard, useBoards, useClasses, useTermId } from '@/api/teacher';
import { useFontState } from '@/design/fonts';
import { Icon } from '@/design/icons';
import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { font, space } from '@/design/tokens';
import { Press } from '@/flow/motion';
import { Button, Card, Heading, Label, Page, State } from '@/flow/ui';

export default function BoardScreen() {
  const palette = usePalette();
  const fonts = useFontState();
  const queryClient = useQueryClient();
  const boards = useBoards();
  const { termId, terms } = useTermId();
  const classes = useClasses(termId);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const mine = boards.data?.results.find((row) => row.mine && row.state === 'busy');
  const others = (boards.data?.results ?? []).filter((row) => !row.mine);
  const failure = boards.error instanceof Error ? boards.error.message : terms.error instanceof Error ? terms.error.message : null;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['teacher-boards'] });
  }

  async function connect() {
    setPending(true);
    setMessage('');
    try {
      await pairBoard(code.trim());
      setCode('');
      setMessage('Tahtaya bağlandı.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bağlantı kurulamadı.');
    } finally {
      setPending(false);
    }
  }

  async function openLesson(planId: number) {
    if (!mine || termId == null) return;
    setPending(true);
    setMessage('');
    try {
      await showOnBoard(mine.id, termId, planId);
      setMessage('Ders tahtada açıldı.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ders açılamadı.');
    } finally {
      setPending(false);
    }
  }

  async function finish() {
    if (!mine) return;
    setPending(true);
    try {
      await endBoard(mine.id);
      setMessage('Bağlantı sonlandı.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bağlantı kapanmadı.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Page>
      <Heading title="Akıllı tahta" sub="Sınıftaki tahtada görünen 8 haneli kodu girip dersi yansıtın." />
      <State loading={boards.isLoading || terms.isLoading} error={failure}>
        <View style={{ maxWidth: 560, width: '100%', gap: space.md }}>
          {mine ? (
            <Card style={{ gap: space.md, padding: space.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.ok }} />
                  <AppText variant="caption" weight="bold" color={palette.ok} style={{ textTransform: 'uppercase', letterSpacing: 0.7 }}>
                    Tahta bağlı
                  </AppText>
                </View>
                <Press
                  accessibilityRole="button"
                  accessibilityLabel="Bağlantıyı bitir"
                  disabled={pending}
                  onPress={finish}
                  style={{ height: 36, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center', backgroundColor: palette.paper }}
                >
                  <AppText variant="caption" weight="bold" color={palette.danger}>
                    Bağlantıyı bitir
                  </AppText>
                </Press>
              </View>
              <AppText variant="section" weight="bold" color={palette.ink} lines={2}>
                {mine.lesson || 'Ders seçin'}
              </AppText>
              <View style={{ gap: 8 }}>
                <Label>Tahtada gösterilecek ders</Label>
                {(classes.data?.results ?? []).map((row) => (
                  <Press
                    key={row.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${row.ders.ad} · ${row.sinif.ad}`}
                    disabled={pending}
                    onPress={() => openLesson(row.id)}
                    style={{
                      minHeight: 54,
                      borderRadius: 14,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      backgroundColor: palette.paper,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: palette.line,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <AppText weight="bold" color={palette.ink} lines={1}>
                        {row.sinif.ad}
                      </AppText>
                      <AppText variant="caption" color={palette.muted} lines={1}>
                        {row.ders.ad}
                      </AppText>
                    </View>
                    <Icon icon={ArrowUpRight} color={palette.midnight} size={18} />
                  </Press>
                ))}
              </View>
            </Card>
          ) : (
            <Card style={{ gap: space.md, padding: space.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: palette.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon icon={Monitor} color={palette.midnight} size={20} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText weight="bold" color={palette.ink}>
                    Tahta eşleştirme
                  </AppText>
                  <AppText variant="caption" color={palette.muted}>
                    Tahtada görünen 8 karakterlik kodu girin.
                  </AppText>
                </View>
              </View>
              <TextInput
                value={code}
                onChangeText={(value) => setCode(value.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
                accessibilityLabel="Eşleştirme kodu"
                placeholder="Örn. 3K8A9B2C"
                placeholderTextColor={palette.muted}
                maxLength={8}
                style={{
                  height: 56,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: palette.line,
                  backgroundColor: palette.paper,
                  color: palette.ink,
                  fontSize: 22,
                  letterSpacing: 4,
                  textAlign: 'center',
                  fontFamily: fonts.active ? font.bold : undefined,
                  paddingHorizontal: 16,
                }}
              />
              <Button label="Tahtaya bağlan" disabled={pending || code.trim().length !== 8} onPress={connect} />
            </Card>
          )}
          {message ? (
            <AppText variant="support" weight="semibold" color={palette.midnight}>
              {message}
            </AppText>
          ) : null}
          {others.map((row) => (
            <AppText key={row.id} variant="caption" color={palette.muted}>
              {row.state === 'busy' ? 'Şubede başka bir tahta kullanımda.' : 'Şubede boş tahta hazır.'}
            </AppText>
          ))}
        </View>
      </State>
    </Page>
  );
}
