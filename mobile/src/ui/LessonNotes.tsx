import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Platform, ScrollView, useWindowDimensions, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Trash2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, sessionHeaders } from '@/api/client';
import { deleteLessonNote, downloadLessonNoteFile, downloadObjectUrl, lessonNoteObjectUrl, notePreviewUri, saveLessonNote, useLessonNotes, useNotePreview } from '@/api/teacher';
import type { LessonNote } from '@/api/types';
import { Icon } from '@/design/icons';
import { AppText } from '@/design/text';
import { usePalette } from '@/design/theme';
import { space } from '@/design/tokens';
import { Press } from '@/flow/motion';
import { Button, State } from '@/flow/ui';
import { newRequestKey } from '@/topics/draft';
import { drawDocument } from '@/ui/pdf';
import { Sheet } from '@/ui/Sheet';

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function shownDate(iso: string) {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${day}.${month}.${year}` : iso;
}

function shownName(row: LessonNote) {
  const prefix = `${row.session_date} `;
  return row.file_name.startsWith(prefix) ? row.file_name.slice(prefix.length) : row.file_name;
}

function byDate(rows: LessonNote[]) {
  const groups: { date: string; rows: LessonNote[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === row.session_date) last.rows.push(row);
    else groups.push({ date: row.session_date, rows: [row] });
  }
  return groups;
}

function pickFile(): Promise<File | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/png,image/jpeg,image/webp';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

type Preview = { noteId: number; url: string | null; name: string; mime: string };

export function LessonNotes({ planId, termId, canWrite }: { planId: number | null; termId: number | null; canWrite: boolean }) {
  const palette = usePalette();
  const queryClient = useQueryClient();
  const notes = useLessonNotes(termId, planId);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [archive, setArchive] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const rows = notes.data?.results ?? [];
  const web = Platform.OS === 'web';
  const stored = planId != null;

  function closePreview() {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  async function remove(row: LessonNote) {
    await deleteLessonNote(row.id);
    if (preview?.noteId === row.id) closePreview();
    await queryClient.invalidateQueries({ queryKey: ['teacher-lesson-notes'] });
  }

  async function upload() {
    const file = await pickFile();
    if (!file || termId == null || planId == null) return;
    setPending(true);
    setMessage(null);
    try {
      await saveLessonNote(planId, termId, todayIso(), file, newRequestKey());
      await queryClient.invalidateQueries({ queryKey: ['teacher-lesson-notes'] });
      setMessage('Kaydedildi.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Dosya gönderilemedi.');
    } finally {
      setPending(false);
    }
  }

  return (
    <View>
      <Press
        accessibilityRole="button"
        accessibilityLabel="Ders notları"
        onPress={() => {
          setExpanded(false);
          setArchive(true);
        }}
        style={{
          height: 40,
          paddingHorizontal: 16,
          borderRadius: 999,
          backgroundColor: palette.midnight,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppText variant="caption" weight="bold" color="#FFFFFF">
          Ders notları
        </AppText>
      </Press>
      <Sheet
        visible={archive}
        title="Ders notları"
        expanded={expanded}
        onClose={() => setArchive(false)}
        onToggleExpanded={() => setExpanded((value) => !value)}
      >
        {canWrite && web && stored ? (
          <Button label={pending ? 'Yükleniyor' : 'Not yükle'} disabled={pending || termId == null} onPress={upload} />
        ) : null}
        {message ? (
          <AppText variant="support" weight="semibold" color={message === 'Kaydedildi.' ? palette.ok : palette.danger}>
            {message}
          </AppText>
        ) : null}
        <State loading={stored && notes.isLoading} error={notes.error instanceof Error ? notes.error.message : null}>
          {rows.length === 0 ? (
            <AppText variant="support" color={palette.muted}>
              {stored ? 'Bu sınıfa henüz ders notu yüklenmedi.' : 'Bu öğrencinin ders notu burada toplanacak.'}
            </AppText>
          ) : (
            byDate(rows).map((group) => (
              <View key={group.date} style={{ gap: 4 }}>
                <AppText variant="caption" weight="semibold" color={palette.muted}>
                  {shownDate(group.date)}
                </AppText>
                {group.rows.map((row) => (
                  <NoteRow key={row.id} row={row} canDelete={canWrite} onOpen={setPreview} onDelete={remove} />
                ))}
              </View>
            ))
          )}
        </State>
      </Sheet>
      {preview ? <NoteViewer preview={preview} onClose={closePreview} /> : null}
    </View>
  );
}

function NoteViewer({ preview, onClose }: { preview: Preview; onClose: () => void }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const host = useRef<View>(null);

  const web = Platform.OS === 'web' && preview.url != null;

  useEffect(() => {
    const node = host.current as unknown as HTMLElement | null;
    if (!web || !preview.url || !node || typeof document === 'undefined') return;
    let cancel = false;
    node.replaceChildren();
    const status = document.createElement('p');
    status.textContent = 'Açılıyor…';
    status.style.margin = '24px';
    node.appendChild(status);
    drawDocument(node, preview.url, preview.mime).catch(() => {
      if (cancel) return;
      node.replaceChildren();
      const fail = document.createElement('p');
      fail.textContent = 'Dosya görüntülenemedi.';
      fail.style.margin = '24px';
      node.appendChild(fail);
    });
    return () => {
      cancel = true;
      node.replaceChildren();
    };
  }, [preview, web]);

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: palette.paper }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingTop: insets.top + space.sm,
            paddingHorizontal: space.lg,
            paddingBottom: space.sm,
            borderBottomWidth: 1,
            borderBottomColor: palette.line,
          }}
        >
          <AppText weight="semibold" color={palette.ink} lines={1} style={{ flex: 1, minWidth: 0 }}>
            {preview.name}
          </AppText>
          <Press
            accessibilityRole="button"
            accessibilityLabel="İndir"
            onPress={() => {
              if (preview.url) downloadObjectUrl(preview.name, preview.url);
              else void downloadLessonNoteFile(preview.noteId, preview.name);
            }}
            style={{ padding: 8 }}
          >
            <Icon icon={Download} color={palette.midnight} size={18} />
          </Press>
          <Press accessibilityRole="button" accessibilityLabel="Kapat" onPress={onClose} style={{ padding: 8 }}>
            <AppText variant="caption" weight="semibold" color={palette.midnight}>
              Kapat
            </AppText>
          </Press>
        </View>
        {web ? (
          <View ref={host} style={{ flex: 1, overflow: 'scroll', backgroundColor: '#e7e5e4' }} />
        ) : (
          <DevicePages noteId={preview.noteId} />
        )}
      </View>
    </Modal>
  );
}

function DevicePages({ noteId }: { noteId: number }) {
  const palette = usePalette();
  const window = useWindowDimensions();
  const preview = useNotePreview(noteId);
  const headers = sessionHeaders();
  if (preview.isLoading) {
    return (
      <AppText variant="support" color={palette.muted} style={{ margin: 24 }}>
        Açılıyor…
      </AppText>
    );
  }
  if (preview.error || !preview.data) {
    return (
      <AppText variant="support" color={palette.danger} style={{ margin: 24 }}>
        {preview.error instanceof ApiError ? preview.error.message : 'Dosya görüntülenemedi.'}
      </AppText>
    );
  }
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#e7e5e4' }} contentContainerStyle={{ padding: 12, gap: 12 }}>
      {preview.data.pages.map((page) => (
        <Image
          key={page.number}
          accessibilityLabel={`Sayfa ${page.number}`}
          source={{ uri: notePreviewUri(noteId, page.number), headers }}
          style={{ width: window.width - 24, aspectRatio: page.width / Math.max(page.height, 1), backgroundColor: '#ffffff' }}
        />
      ))}
    </ScrollView>
  );
}

function NoteRow({
  row,
  canDelete,
  onOpen,
  onDelete,
}: {
  row: LessonNote;
  canDelete: boolean;
  onOpen: (preview: Preview) => void;
  onDelete: (row: LessonNote) => Promise<void>;
}) {
  const palette = usePalette();
  const [busy, setBusy] = useState<'open' | 'save' | 'delete' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy('delete');
    setError(null);
    try {
      await onDelete(row);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Not silinemedi.');
      setBusy(null);
    }
  }

  async function run(download: boolean) {
    setBusy(download ? 'save' : 'open');
    setError(null);
    try {
      if (Platform.OS !== 'web') {
        if (download) {
          await downloadLessonNoteFile(row.id, row.file_name);
          return;
        }
        onOpen({ noteId: row.id, url: null, name: row.file_name, mime: row.mime_type });
        return;
      }
      const url = await lessonNoteObjectUrl(row);
      if (download) {
        downloadObjectUrl(row.file_name, url);
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }
      onOpen({ noteId: row.id, url, name: row.file_name, mime: row.mime_type });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Dosya açılamadı.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ gap: 4, paddingVertical: 8, borderTopWidth: 1, borderTopColor: palette.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon icon={FileText} color={palette.midnight} size={18} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <AppText weight="semibold" color={palette.ink}>
            {shownName(row)}
          </AppText>
        </View>
        <Press accessibilityRole="button" accessibilityLabel={`${row.file_name} aç`} onPress={() => run(false)} style={{ padding: 8 }}>
          <AppText variant="caption" weight="semibold" color={palette.midnight}>
            {busy === 'open' ? '…' : 'Aç'}
          </AppText>
        </Press>
        <Press accessibilityRole="button" accessibilityLabel={`${row.file_name} indir`} onPress={() => run(true)} style={{ padding: 8 }}>
          <Icon icon={Download} color={palette.midnight} size={18} />
        </Press>
        {canDelete ? (
          <Press accessibilityRole="button" accessibilityLabel={`${row.file_name} sil`} onPress={() => setConfirming(true)} style={{ padding: 8 }}>
            <Icon icon={Trash2} color={palette.danger} size={18} />
          </Press>
        ) : null}
      </View>
      {confirming ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
          <AppText variant="caption" color={palette.ink}>
            Bu not silinsin mi?
          </AppText>
          <Press accessibilityRole="button" accessibilityLabel="Vazgeç" onPress={() => setConfirming(false)} style={{ padding: 8 }}>
            <AppText variant="caption" weight="semibold" color={palette.muted}>
              Vazgeç
            </AppText>
          </Press>
          <Press accessibilityRole="button" accessibilityLabel="Sil" disabled={busy === 'delete'} onPress={remove} style={{ padding: 8 }}>
            <AppText variant="caption" weight="semibold" color={palette.danger}>
              {busy === 'delete' ? '…' : 'Sil'}
            </AppText>
          </Press>
        </View>
      ) : null}
      {error ? (
        <AppText variant="caption" color={palette.danger}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
