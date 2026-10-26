import { useState } from 'react';
import { View } from 'react-native';
import { Bell, CalendarDays, Megaphone, UserRound } from 'lucide-react-native';

import { useNotifications } from '@/api/teacher';
import type { NotificationItem } from '@/api/types';
import { Icon } from '@/design/icons';
import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { space } from '@/design/tokens';
import { Appear } from '@/flow/motion';
import { Heading, Page, Row, Segmented, State } from '@/flow/ui';
import { Sheet } from '@/ui/Sheet';

const FALLBACK = [
  { code: 'announcement', label: 'Duyuru' },
  { code: 'schedule', label: 'Program' },
  { code: 'private', label: 'Özel ders' },
];

function when(value: string) {
  const [day, rest] = value.split('T');
  const clock = (rest || '').slice(0, 5);
  const parts = day.split('-');
  if (parts.length !== 3) return value;
  const shown = `${parts[2]}.${parts[1]}`;
  return clock && clock !== '00:00' ? `${shown} ${clock}` : shown;
}

function Badge({ category }: { category: string }) {
  const palette = usePalette();
  const icon = category === 'announcement' ? Megaphone : category === 'schedule' ? CalendarDays : category === 'private' ? UserRound : Bell;
  const bg = category === 'private' ? palette.tealSurface : palette.primaryContainer;
  const fg = category === 'private' ? palette.teal : palette.midnight;
  return (
    <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
      <Icon icon={icon} color={fg} size={18} />
    </View>
  );
}

export default function NotificationsScreen() {
  const palette = usePalette();
  const [category, setCategory] = useState('');
  const [open, setOpen] = useState<NotificationItem | null>(null);
  const [expanded, setExpanded] = useState(false);
  const inbox = useNotifications(category);
  const categories = inbox.data?.categories?.length ? inbox.data.categories : FALLBACK;
  const rows = inbox.data?.results ?? [];
  const items = [{ key: '', label: 'Tümü' }, ...categories.map((item) => ({ key: item.code, label: item.label.replace('Kurum duyurusu', 'Duyuru') }))];

  return (
    <Page>
      <Heading title="Bildirimler" sub="Duyurular, program gönderimleri ve özel dersleriniz" />
      <Segmented items={items} value={category} onChange={setCategory} />
      <State loading={inbox.isLoading} error={inbox.error instanceof Error ? inbox.error.message : null} empty={!inbox.isLoading && rows.length === 0 ? 'Yeni bildiriminiz yok.' : null}>
        <View>
          {rows.map((row, index) => (
            <Appear key={row.id} index={index}>
              <Row
                title={row.title}
                sub={row.body || undefined}
                titleLines={2}
                subLines={2}
                leading={<Badge category={row.category} />}
                trailing={
                  <AppText variant="caption" weight="medium" color={palette.muted}>
                    {when(row.occurred_at)}
                  </AppText>
                }
                onPress={() => {
                  setExpanded(false);
                  setOpen(row);
                }}
              />
            </Appear>
          ))}
        </View>
      </State>
      <Sheet visible={open != null} title={open?.title ?? 'Bildirim'} expanded={expanded} onClose={() => setOpen(null)} onToggleExpanded={() => setExpanded((value) => !value)}>
        {open ? (
          <View style={{ gap: space.sm }}>
            <AppText variant="caption" weight="semibold" color={palette.muted}>
              {when(open.occurred_at)}
            </AppText>
            <AppText color={palette.ink}>{open.body || 'Bu bildirimin ayrıntısı yok.'}</AppText>
          </View>
        ) : null}
      </Sheet>
    </Page>
  );
}
