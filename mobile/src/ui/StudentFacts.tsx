import { Image, View } from 'react-native';

import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { space } from '@/design/tokens';
import { Avatar } from '@/flow/ui';

export function StudentFacts({
  ad,
  soyad,
  okulNo,
  sinif,
  grup,
  photo,
  lessons,
}: {
  ad: string;
  soyad: string;
  okulNo: string;
  sinif: string;
  grup: string;
  photo: string | null;
  lessons: { key: string; label: string }[];
}) {
  const palette = usePalette();
  const place = [sinif, grup].filter(Boolean).join(' · ');
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        {photo ? (
          <Image accessible={false} source={{ uri: photo }} style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: palette.primaryContainer }} />
        ) : (
          <Avatar label={`${ad} ${soyad}`} size={64} />
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <AppText variant="section" weight="bold" color={palette.ink} lines={2}>
            {ad} {soyad}
          </AppText>
          <AppText variant="support" color={palette.muted} lines={1}>
            {okulNo ? `Okul no ${okulNo}` : 'Okul no yok'}
          </AppText>
          {place ? (
            <AppText variant="support" color={palette.muted} lines={1}>
              {place}
            </AppText>
          ) : null}
        </View>
      </View>
      {lessons.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {lessons.map((lesson) => (
            <View key={lesson.key} style={{ paddingHorizontal: 12, height: 30, borderRadius: 999, justifyContent: 'center', backgroundColor: palette.primaryContainer }}>
              <AppText variant="caption" weight="semibold" color={palette.midnight}>
                {lesson.label}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
