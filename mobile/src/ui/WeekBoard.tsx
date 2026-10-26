import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';

import { clock, type LessonCell, type ScheduleSlot } from '@/api/types';
import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { Press } from '@/flow/motion';
import { LessonCard } from '@/ui/LessonCard';
import { lessonKey } from '@/ui/LessonDetail';

export const WEEK_GUTTER = 68;
export const WEEK_MIN_DAY = 128;

export type WeekColumn = {
  id: number;
  name: string;
  shortName: string;
  date: number | null;
  month: string | null;
};

export type WeekEdges = { overflows: boolean; atStart: boolean; atEnd: boolean };

export type WeekBoardHandle = {
  reveal: (index: number) => void;
  nudge: (direction: -1 | 1) => void;
};

function minutesOf(value: string | null | undefined) {
  const text = clock(value);
  if (!text || !text.includes(':')) return null;
  const [hour, minute] = text.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return hour * 60 + minute;
}

function nowFraction(slot: ScheduleSlot, minutes: number) {
  const start = minutesOf(slot.start);
  const end = minutesOf(slot.end);
  if (start == null || end == null || end <= start) return null;
  if (minutes < start || minutes >= end) return null;
  return (minutes - start) / (end - start);
}

function rowKey(slot: ScheduleSlot, index: number) {
  return `${clock(slot.start) || 'slot'}-${index}`;
}

export const WeekBoard = forwardRef<
  WeekBoardHandle,
  {
    columns: WeekColumn[];
    rows: ScheduleSlot[];
    cells: LessonCell[];
    todayId: number;
    selectedDayId: number;
    selectedKey: string | null;
    nowMinutes: number | null;
    isLive: (cell: LessonCell) => boolean;
    onSelectDay: (dayId: number) => void;
    onSelectCell: (cell: LessonCell) => void;
    onEdges: (edges: WeekEdges) => void;
    idPrefix: string;
  }
>(function WeekBoard(
  { columns, rows, cells, todayId, selectedDayId, selectedKey, nowMinutes, isLive, onSelectDay, onSelectCell, onEdges, idPrefix },
  ref,
) {
  const palette = usePalette();
  const reduce = useReducedMotion();
  const scroller = useRef<ScrollView>(null);
  const scrollX = useSharedValue(0);
  const scrollXRef = useRef(0);
  const edgesRef = useRef<WeekEdges>({ overflows: false, atStart: true, atEnd: true });
  const [width, setWidth] = useState(0);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const count = Math.max(columns.length, 1);
  const daysViewport = Math.max(0, width - WEEK_GUTTER);
  const fit = Math.floor(daysViewport / count);
  const dayWidth = fit > 0 ? fit : WEEK_MIN_DAY;
  const contentWidth = dayWidth * columns.length;
  const maxScroll = Math.max(0, contentWidth - daysViewport);
  const overflows = width > 0 && maxScroll > 8;
  const compact = dayWidth < 168;
  const headerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -scrollX.value }] }));

  function emit(x: number) {
    const next = { overflows, atStart: x <= 8, atEnd: !overflows || x >= maxScroll - 8 };
    const prev = edgesRef.current;
    if (prev.overflows === next.overflows && prev.atStart === next.atStart && prev.atEnd === next.atEnd) return;
    edgesRef.current = next;
    onEdges(next);
  }

  function scrollTo(x: number, animated: boolean) {
    const next = Math.max(0, Math.min(x, maxScroll));
    scrollXRef.current = next;
    scrollX.value = next;
    scroller.current?.scrollTo({ x: next, animated: animated && !reduce });
    emit(next);
  }

  useEffect(() => {
    emit(scrollXRef.current);
  }, [overflows, maxScroll]);

  useImperativeHandle(ref, () => ({
    reveal(index: number) {
      const start = Math.max(0, index) * dayWidth;
      const end = start + dayWidth;
      const x = scrollXRef.current;
      if (start >= x - 1 && end <= x + daysViewport + 1) return;
      scrollTo(start < x ? start : end - daysViewport, true);
    },
    nudge(direction: -1 | 1) {
      scrollTo(scrollXRef.current + direction * dayWidth, true);
    },
  }));

  function itemsFor(slot: ScheduleSlot, dayId: number) {
    const start = clock(slot.start);
    return cells.filter((cell) => cell.day_id === dayId && clock(cell.start) === start);
  }

  return (
    <View style={{ flex: 1, minHeight: 0 }} onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}>
      <View style={{ flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line }}>
        <View style={{ width: WEEK_GUTTER }} />
        <View style={{ flex: 1, overflow: 'hidden' }}>
          <Animated.View style={[{ flexDirection: 'row', width: contentWidth }, headerStyle]}>
            {columns.map((column, index) => {
              const today = column.id === todayId;
              const selected = column.id === selectedDayId;
              const previous = index > 0 ? columns[index - 1] : null;
              const showMonth = column.month != null && (index === 0 || previous?.month !== column.month);
              return (
                <Press
                  key={column.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${column.name}${column.date != null ? ` ${column.date}` : ''}${showMonth && column.month ? ` ${column.month}` : ''}`}
                  accessibilityState={{ selected }}
                  onPress={() => onSelectDay(column.id)}
                  scaleTo={1}
                  style={{
                    width: dayWidth,
                    minHeight: 64,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 10,
                    gap: 2,
                    backgroundColor: today ? '#F4F7FF' : 'transparent',
                  }}
                >
                  <AppText variant="caption" weight={today ? 'bold' : 'medium'} color={today ? '#3D4DB8' : palette.muted} lines={1}>
                    {column.shortName}
                  </AppText>
                  {column.date != null ? (
                    <AppText weight="bold" color={today ? '#3D4DB8' : palette.ink} style={{ fontSize: 18, lineHeight: 22, fontVariant: ['tabular-nums'] }}>
                      {column.date}
                    </AppText>
                  ) : (
                    <AppText weight="bold" color={today ? '#3D4DB8' : palette.ink} lines={1}>
                      {column.name}
                    </AppText>
                  )}
                  {showMonth ? (
                    <AppText variant="caption" color={palette.muted} lines={1} style={{ fontSize: 11 }}>
                      {column.month}
                    </AppText>
                  ) : null}
                  <View style={{ marginTop: 2, height: 2, width: 16, borderRadius: 1, backgroundColor: selected && !today ? palette.midnight : 'transparent' }} />
                </Press>
              );
            })}
          </Animated.View>
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View style={{ width: width || undefined, flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ width: WEEK_GUTTER }}>
            {rows.map((slot, index) => {
              const key = rowKey(slot, index);
              const occupied = columns.some((column) => itemsFor(slot, column.id).length > 0);
              return (
                <View
                  key={key}
                  style={{
                    height: heights[key] ?? (occupied ? 96 : 44),
                    paddingTop: 10,
                    paddingRight: 8,
                    borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                    borderTopColor: palette.line,
                  }}
                >
                  <AppText variant="caption" weight="medium" color={palette.muted} style={{ fontVariant: ['tabular-nums'] }}>
                    {clock(slot.start)}
                  </AppText>
                </View>
              );
            })}
          </View>
          <ScrollView
            ref={scroller}
            horizontal
            style={{ width: daysViewport }}
            showsHorizontalScrollIndicator={overflows}
            scrollEventThrottle={16}
            nestedScrollEnabled
            accessibilityHint="Haftanın diğer günleri için yana kaydırın"
            onScroll={(event) => {
              const x = event.nativeEvent.contentOffset.x;
              scrollXRef.current = x;
              scrollX.value = x;
              emit(x);
            }}
          >
            <View style={{ width: contentWidth }}>
              {rows.map((slot, index) => {
                const key = rowKey(slot, index);
                const fraction = nowMinutes == null ? null : nowFraction(slot, nowMinutes);
                return (
                  <View
                    key={key}
                    onLayout={(event) => {
                      const next = Math.round(event.nativeEvent.layout.height);
                      setHeights((current) => (current[key] === next ? current : { ...current, [key]: next }));
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'stretch',
                      borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderTopColor: palette.line,
                    }}
                  >
                    {columns.map((column) => {
                      const items = itemsFor(slot, column.id);
                      const showNow = fraction != null && column.id === todayId;
                      return (
                        <View
                          key={column.id}
                          style={{
                            width: dayWidth,
                            minHeight: items.length > 0 ? 0 : 52,
                            paddingHorizontal: 6,
                            paddingVertical: 6,
                            gap: 6,
                            backgroundColor: column.id === todayId ? '#F4F7FF' : palette.surface,
                            borderLeftWidth: StyleSheet.hairlineWidth,
                            borderLeftColor: palette.line,
                          }}
                        >
                          {items.map((cell) => (
                            <LessonCard
                              key={lessonKey(cell)}
                              cell={cell}
                              dayName={column.name}
                              selected={selectedKey === lessonKey(cell)}
                              live={isLive(cell)}
                              compact={compact}
                              layout="grid"
                              nativeID={`${idPrefix}-${lessonKey(cell)}`}
                              onPress={() => onSelectCell(cell)}
                            />
                          ))}
                          {showNow ? (
                            <View pointerEvents="none" style={{ position: 'absolute', left: 8, right: 8, top: `${fraction * 100}%`, marginTop: -1, zIndex: 2 }}>
                              <View style={{ height: 2, borderRadius: 1, backgroundColor: palette.ok }} />
                              {items.length === 0 ? (
                                <AppText variant="caption" weight="bold" color={palette.ok}>
                                  Şimdi
                                </AppText>
                              ) : null}
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
});
