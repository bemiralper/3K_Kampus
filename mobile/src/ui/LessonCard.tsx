import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import type { LessonCell } from '@/api/types';
import { Icon } from '@/design/icons';
import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { Press } from '@/flow/motion';
import {
  lessonKind,
  lessonKindLabel,
  lessonPlace,
  lessonSpan,
  lessonStatusText,
  lessonTitle,
  sessionQuiet,
  type LessonKind,
} from '@/ui/LessonDetail';

const SUBJECT_TONES = [
  { bg: '#EEF0FF', ink: '#343E9A', bar: '#5B6AD6' },
  { bg: '#FFF4E8', ink: '#9A4D08', bar: '#F59E0B' },
  { bg: '#F3E8FF', ink: '#6D28D9', bar: '#A78BFA' },
  { bg: '#E8F1FF', ink: '#1D4ED8', bar: '#3B82F6' },
  { bg: '#FDECEC', ink: '#B91C1C', bar: '#F07167' },
  { bg: '#F1F5F9', ink: '#334155', bar: '#64748B' },
];

const PRIVATE_TONE = { bg: '#EAF7F5', ink: '#0F766E', bar: '#159A8C' };

function toneFor(cell: LessonCell) {
  if (lessonKind(cell) === 'private') return PRIVATE_TONE;
  const name = lessonTitle(cell);
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) hash = (hash + name.charCodeAt(index) * (index + 1)) % SUBJECT_TONES.length;
  return SUBJECT_TONES[hash] ?? SUBJECT_TONES[0];
}

function agendaKind(kind: LessonKind) {
  if (kind === 'class') return 'Grup dersi';
  if (kind === 'private') return 'Özel ders';
  return lessonKindLabel(kind);
}

export function LessonCard({
  cell,
  dayName,
  selected,
  live,
  compact,
  nativeID,
  onPress,
  layout = 'grid',
}: {
  cell: LessonCell;
  dayName: string;
  selected: boolean;
  live: boolean;
  compact: boolean;
  nativeID: string;
  onPress: () => void;
  layout?: 'grid' | 'agenda';
}) {
  const palette = usePalette();
  const [focused, setFocused] = useState(false);
  const kind = lessonKind(cell);
  const quiet = sessionQuiet(cell.session);
  const status = lessonStatusText(cell, live);
  const tone = toneFor(cell);
  const place = lessonPlace(cell);
  const span = lessonSpan(cell);
  const [startClock, endClock] = span ? span.split('–') : [];
  const title = lessonTitle(cell);
  const room = cell.room?.name;
  const label = [dayName, agendaKind(kind), status, title, place, span, room, cell.topic?.name].filter(Boolean).join(', ');

  if (layout === 'agenda') {
    return (
      <Press
        nativeID={nativeID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Ders ayrıntısını açar"
        accessibilityState={{ selected }}
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        scaleTo={0.99}
        style={{
          minHeight: 76,
          borderRadius: 16,
          backgroundColor: palette.surface,
          borderWidth: selected || focused ? 1.5 : StyleSheet.hairlineWidth,
          borderColor: selected || focused ? tone.bar : palette.line,
          flexDirection: 'row',
          alignItems: 'stretch',
          overflow: 'hidden',
          opacity: quiet ? 0.62 : 1,
        }}
      >
        <View style={{ width: 4, backgroundColor: tone.bar }} />
        <View style={{ width: 64, justifyContent: 'center', paddingLeft: 12, gap: 2 }}>
          <AppText weight="bold" color={palette.ink} style={{ fontSize: 15, fontVariant: ['tabular-nums'], textDecorationLine: quiet ? 'line-through' : 'none' }}>
            {span?.split('–')[0] || '—'}
          </AppText>
          <AppText variant="caption" color={palette.muted} style={{ fontVariant: ['tabular-nums'] }}>
            {span?.split('–')[1] || ''}
          </AppText>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 12, gap: 4, minWidth: 0 }}>
          <AppText weight="bold" color={palette.ink} lines={1} style={{ textDecorationLine: quiet ? 'line-through' : 'none' }}>
            {title}
          </AppText>
          <AppText variant="caption" color={palette.muted} lines={1}>
            {place}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: tone.bg }}>
              <AppText variant="caption" weight="bold" color={tone.ink} style={{ fontSize: 11 }}>
                {agendaKind(kind)}
              </AppText>
            </View>
            {room ? (
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: palette.paper }}>
                <AppText variant="caption" weight="semibold" color={palette.muted} style={{ fontSize: 11 }} lines={1}>
                  {room}
                </AppText>
              </View>
            ) : null}
            {status ? (
              <AppText variant="caption" weight="bold" color={status === 'Şimdi' ? palette.ok : palette.danger} style={{ fontSize: 11 }}>
                {status}
              </AppText>
            ) : null}
          </View>
        </View>
        <View style={{ width: 36, alignItems: 'center', justifyContent: 'center' }}>
          <Icon icon={ChevronRight} size={18} color={palette.muted} />
        </View>
      </Press>
    );
  }

  return (
    <Press
      nativeID={nativeID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Ders ayrıntısını açar"
      accessibilityState={{ selected }}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      scaleTo={0.98}
      style={{
        alignSelf: 'stretch',
        minHeight: 44,
        borderRadius: 12,
        paddingVertical: 8,
        paddingHorizontal: compact ? 6 : 10,
        gap: 2,
        backgroundColor: tone.bg,
        borderWidth: selected || focused || live ? 1.5 : 0,
        borderColor: selected || focused || live ? tone.bar : 'transparent',
        opacity: quiet ? 0.55 : 1,
      }}
    >
      <AppText weight="bold" color={tone.ink} style={{ fontSize: compact ? 12 : 13, textDecorationLine: quiet ? 'line-through' : 'none' }}>
        {title}
      </AppText>
      {place ? (
        <AppText variant="caption" color={tone.ink} style={{ fontSize: 11, opacity: 0.85 }}>
          {place}
        </AppText>
      ) : null}
      {startClock ? (
        <AppText variant="caption" weight="semibold" color={tone.ink} style={{ fontSize: 11, fontVariant: ['tabular-nums'] }}>
          {endClock ? `${startClock}\n${endClock}` : startClock}
        </AppText>
      ) : null}
      {kind !== 'class' ? (
        <AppText variant="caption" weight="bold" color={tone.ink} style={{ fontSize: 11 }}>
          {agendaKind(kind)}
        </AppText>
      ) : null}
      {status ? (
        <AppText variant="caption" weight="bold" color={status === 'Şimdi' ? palette.ok : palette.danger} style={{ fontSize: 11 }}>
          {status}
        </AppText>
      ) : null}
    </Press>
  );
}
