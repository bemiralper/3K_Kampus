import { Image, View } from 'react-native';

import { API_URL } from '@/api/client';
import { ChevronRight } from 'lucide-react-native';

import type { ClassRow } from '@/api/types';
import { Icon } from '@/design/icons';
import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { space } from '@/design/tokens';
import { Appear } from '@/flow/motion';
import { SearchField } from '@/flow/SearchField';
import { Avatar, Button, Card, Chip, State } from '@/flow/ui';

export const EMPTY_CLASS = 'Bu derste yerleşmiş öğrenci yok.';

function photoUri(photo: string) {
  if (photo.startsWith('http://') || photo.startsWith('https://')) return photo;
  return `${API_URL}${photo.startsWith('/') ? '' : '/'}${photo}`;
}

export function Face({
  name,
  photo,
  tone = 'navy',
  size = 40,
}: {
  name: string;
  photo?: string | null;
  tone?: 'navy' | 'gold' | 'teal';
  size?: number;
}) {
  const palette = usePalette();
  if (photo) {
    return (
      <Image
        accessible={false}
        source={{ uri: photoUri(photo) }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: palette.primaryContainer }}
      />
    );
  }
  return <Avatar label={name} tone={tone} size={size} />;
}

function roleLabel(rol: string) {
  if (rol === 'PRIMARY') return 'Asıl';
  if (rol) return 'Yardımcı';
  return '';
}

export function ClassCard({ row, selected, onPress, index }: { row: ClassRow; selected: boolean; onPress: () => void; index: number }) {
  const palette = usePalette();
  const groups = row.groups.map((group) => group.name).filter(Boolean).join(', ');
  const role = roleLabel(row.rol);
  return (
    <Appear index={index} style={{ flex: 1 }}>
      <Card
        onPress={onPress}
        accessibilityLabel={`${row.ders.ad} ${row.sinif.ad}`}
        selected={selected}
        style={{ flex: 1, padding: 0, gap: 0, overflow: 'hidden', minHeight: 148 }}
      >
        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <AppText weight="bold" color={palette.ink} lines={2} style={{ flex: 1, minWidth: 0, fontSize: 22, lineHeight: 26 }}>
              {row.sinif.ad}
            </AppText>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: palette.primaryContainer,
              }}
            >
              <Icon icon={ChevronRight} color={palette.midnight} size={16} />
            </View>
          </View>
          <AppText weight="semibold" color={palette.midnight} lines={1}>
            {row.ders.ad}
          </AppText>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 10,
            backgroundColor: palette.primaryContainer,
          }}
        >
          <AppText variant="caption" weight="bold" color={palette.midnight} style={{ fontVariant: ['tabular-nums'] }}>
            {row.weekly_hours} saat
          </AppText>
          {role ? (
            <AppText variant="caption" weight="semibold" color={palette.ink}>
              {role}
            </AppText>
          ) : null}
          {groups ? (
            <AppText variant="caption" color={palette.muted} lines={1} style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
              {groups}
            </AppText>
          ) : null}
        </View>
      </Card>
    </Appear>
  );
}

export function StudentColumn({
  plan,
  query,
  onQuery,
  groupId,
  onGroup,
  page,
  onPage,
  loading,
  error,
  count,
  pageSize,
  rows,
  selectedId,
  onOpen,
}: {
  plan: ClassRow | null;
  query: string;
  onQuery: (value: string) => void;
  groupId: number | null;
  onGroup: (value: number | null) => void;
  page: number;
  onPage: (value: number) => void;
  loading: boolean;
  error: string | null;
  count: number;
  pageSize: number;
  rows: { student_id: number; plan_id: number; ad: string; soyad: string; okul_no: string; group_ad: string; sinif_ad: string; profil_foto?: string | null }[];
  selectedId: number | null;
  onOpen: (studentId: number, planId: number) => void;
}) {
  const palette = usePalette();
  const lastPage = pageSize > 0 ? Math.ceil(count / pageSize) : 1;
  return (
    <View style={{ gap: space.sm }}>
      <SearchField value={query} onChange={onQuery} placeholder="Ad, soyad veya okul no" label="Öğrenci ara" />
      {plan && plan.groups.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <Chip label="Tümü" selected={groupId == null} onPress={() => onGroup(null)} />
          {plan.groups.map((group) => (
            <Chip key={group.id} label={group.name} selected={groupId === group.id} onPress={() => onGroup(group.id)} />
          ))}
        </View>
      ) : null}
      <State loading={loading} error={error} empty={plan && !loading && !error && rows.length === 0 ? EMPTY_CLASS : plan ? null : 'Ders seçin.'}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {rows.map((student, index) => {
            const name = `${student.ad} ${student.soyad}`;
            const meta = [student.okul_no || 'Okul no yok', student.group_ad || student.sinif_ad].filter(Boolean).join(' · ');
            return (
              <Appear key={`${student.student_id}-${student.plan_id}`} index={index} style={{ flexGrow: 1, flexBasis: 180, maxWidth: 260 }}>
                <Card
                  onPress={() => onOpen(student.student_id, student.plan_id)}
                  accessibilityLabel={name}
                  selected={selectedId === student.student_id}
                  style={{ flex: 1, padding: 0, gap: 0, overflow: 'hidden', minHeight: 156 }}
                >
                  <View style={{ flex: 1, padding: 14, gap: 10 }}>
                    <Face name={name} photo={student.profil_foto} size={48} />
                    <AppText weight="bold" color={palette.ink} lines={2}>
                      {name}
                    </AppText>
                  </View>
                  <View style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: palette.primaryContainer }}>
                    <AppText variant="caption" weight="semibold" color={palette.midnight} lines={1}>
                      {meta}
                    </AppText>
                  </View>
                </Card>
              </Appear>
            );
          })}
        </View>
        {page > 1 || page < lastPage ? (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {page > 1 ? (
              <View style={{ flex: 1 }}>
                <Button label="Önceki" tone="ghost" onPress={() => onPage(page - 1)} />
              </View>
            ) : null}
            {page < lastPage ? (
              <View style={{ flex: 1 }}>
                <Button label="Sonraki" onPress={() => onPage(page + 1)} />
              </View>
            ) : null}
          </View>
        ) : null}
      </State>
    </View>
  );
}
