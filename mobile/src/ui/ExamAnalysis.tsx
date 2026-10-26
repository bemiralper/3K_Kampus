import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import type { ExamGroup, ExamPoint, StudentExams } from '@/api/types';
import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { space } from '@/design/tokens';
import { Appear, Fade, Press, Progress } from '@/flow/motion';
import { Card, Label, Segmented, State } from '@/flow/ui';

function netText(value: number) {
  const sign = value < 0 ? '-' : '';
  const [whole, frac] = Math.abs(value).toFixed(2).split('.');
  return `${sign}${whole},${frac}`;
}

function deltaText(value: number) {
  return `${value > 0 ? '+' : ''}${netText(value)}`;
}

function dayText(value: string | null) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

function Chart({
  exams,
  selectedId,
  onSelect,
}: {
  exams: ExamPoint[];
  selectedId: number;
  onSelect: (id: number) => void;
}) {
  const palette = usePalette();
  const [width, setWidth] = useState(0);
  const height = 104;
  const nets = exams.map((exam) => exam.net);
  const min = Math.min(...nets);
  const max = Math.max(...nets);
  const span = max - min || 1;
  const padX = 18;
  const padY = 18;
  const plotted = exams.map((exam, index) => {
    const x =
      exams.length === 1 || width === 0
        ? width / 2
        : padX + (index / (exams.length - 1)) * (width - padX * 2);
    const y = padY + (1 - (exam.net - min) / span) * (height - padY * 2);
    return { exam, x, y };
  });
  const line = plotted.map((point) => `${point.x},${point.y}`).join(' ');
  return (
    <View onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))} style={{ height, marginTop: 4 }}>
      {width > 0 ? (
        <Fade>
          <Svg width={width} height={height}>
            <Polyline points={line} fill="none" stroke={palette.midnight} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {plotted.map((point) => {
              const selected = point.exam.id === selectedId;
              return (
                <Circle
                  key={point.exam.id}
                  cx={point.x}
                  cy={point.y}
                  r={selected ? 6 : 4}
                  fill={selected ? palette.midnight : palette.surface}
                  stroke={palette.midnight}
                  strokeWidth={2}
                />
              );
            })}
          </Svg>
          {plotted.map((point) => (
            <Press
              key={point.exam.id}
              accessibilityRole="button"
              accessibilityLabel={`${point.exam.name} ${netText(point.exam.net)} net`}
              accessibilityState={{ selected: point.exam.id === selectedId }}
              onPress={() => onSelect(point.exam.id)}
              style={{ position: 'absolute', left: point.x - 18, top: point.y - 18, width: 36, height: 36 }}
            >
              <View />
            </Press>
          ))}
        </Fade>
      ) : null}
    </View>
  );
}

function GroupView({ group }: { group: ExamGroup }) {
  const palette = usePalette();
  const [picked, setPicked] = useState<number | null>(null);
  const exam = group.exams.find((row) => row.id === picked) ?? group.exams[group.exams.length - 1];
  const delta = group.delta;
  const deltaColor = delta == null ? palette.muted : delta > 0 ? palette.ok : delta < 0 ? palette.danger : palette.muted;
  return (
    <Fade key={group.code}>
      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md }}>
          <View style={{ gap: 2 }}>
            <AppText variant="caption" color={palette.muted}>
              Son net
            </AppText>
            <AppText variant="display" weight="bold" color={palette.ink}>
              {netText(group.last_net)}
            </AppText>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            {delta != null ? (
              <AppText variant="card" weight="bold" color={deltaColor}>
                {deltaText(delta)}
              </AppText>
            ) : null}
            <AppText variant="caption" color={palette.muted}>
              Ortalama {netText(group.average_net)}
            </AppText>
          </View>
        </View>
        <Chart exams={group.exams} selectedId={exam.id} onSelect={setPicked} />
        <View style={{ gap: 4 }}>
          <AppText weight="semibold" color={palette.ink} lines={1}>
            {exam.name}
          </AppText>
          <AppText variant="caption" color={palette.muted}>
            {[dayText(exam.date), `${netText(exam.net)} net`, exam.delta != null ? deltaText(exam.delta) : '']
              .filter(Boolean)
              .join(' · ')}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {[
            ['Doğru', String(exam.correct)],
            ['Yanlış', String(exam.wrong)],
            ['Boş', String(exam.empty)],
          ].map(([label, value]) => (
            <View key={label} style={{ flex: 1, borderRadius: 14, backgroundColor: palette.primaryContainer, paddingVertical: 10, alignItems: 'center', gap: 2 }}>
              <AppText variant="card" weight="bold" color={palette.midnight}>
                {value}
              </AppText>
              <AppText variant="caption" color={palette.muted}>
                {label}
              </AppText>
            </View>
          ))}
        </View>
        {group.topics.length > 0 ? (
          <View style={{ gap: 10 }}>
            <Label>Konular</Label>
            {group.topics.map((topic, index) => (
              <Appear key={topic.name} index={index}>
                <View style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <AppText variant="caption" weight="semibold" color={palette.ink} lines={1} style={{ flex: 1 }}>
                      {topic.name}
                    </AppText>
                    <AppText variant="caption" color={palette.muted}>
                      {topic.correct}/{topic.question_count}
                    </AppText>
                  </View>
                  <Progress value={topic.mastery / 100} color={topic.mastery >= 70 ? palette.ok : palette.midnight} track={palette.primaryContainer} height={6} />
                </View>
              </Appear>
            ))}
          </View>
        ) : null}
      </View>
    </Fade>
  );
}

export function ExamAnalysis({
  ders,
  data,
  loading,
  error,
}: {
  ders: string;
  data?: StudentExams;
  loading: boolean;
  error: string | null;
}) {
  const palette = usePalette();
  const groups = data?.groups ?? [];
  const [code, setCode] = useState('');
  const group = groups.find((item) => item.code === code) ?? groups[0];
  const subject = data?.ders || ders;
  return (
    <Card style={{ padding: space.lg, gap: space.md }}>
      <View style={{ gap: 2 }}>
        <Label>Sınav analizi</Label>
        {subject ? (
          <AppText variant="caption" color={palette.muted}>
            {subject}
          </AppText>
        ) : null}
      </View>
      <State loading={loading} error={error} empty={!loading && !error && groups.length === 0 ? 'Bu dersten sınav sonucu yok.' : null}>
        {group ? (
          <View style={{ gap: space.md }}>
            {groups.length > 1 ? (
              <Segmented items={groups.map((item) => ({ key: item.code, label: item.label }))} value={group.code} onChange={setCode} />
            ) : (
              <AppText weight="bold" color={palette.midnight}>
                {group.label}
              </AppText>
            )}
            <GroupView key={group.code} group={group} />
          </View>
        ) : null}
      </State>
    </Card>
  );
}
