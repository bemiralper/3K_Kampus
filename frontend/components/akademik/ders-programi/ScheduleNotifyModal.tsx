'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Modal,
  Space,
  Spin,
  Typography,
  message,
} from 'antd';
import type { ClassLessonPlanClassroom } from '@/lib/academic-api';
import {
  previewScheduleNotify,
  sendScheduleNotify,
  type ScheduleNotifyClassPreview,
} from '@/lib/schedule-notify-api';

const { Text } = Typography;

type Props = {
  open: boolean;
  onClose: () => void;
  termId: number | null;
  versionId: number | null;
  currentClassroomId: number | null;
  classrooms: ClassLessonPlanClassroom[];
};

export default function ScheduleNotifyModal({
  open,
  onClose,
  termId,
  versionId,
  currentClassroomId,
  classrooms,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [sendVeli, setSendVeli] = useState(true);
  const [sendOgrenci, setSendOgrenci] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<ScheduleNotifyClassPreview[] | null>(null);
  const [includeUnchanged, setIncludeUnchanged] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedIds(currentClassroomId ? [currentClassroomId] : classrooms.map((c) => c.id));
    setSendVeli(true);
    setSendOgrenci(true);
    setPreview(null);
    setIncludeUnchanged([]);
    setError(null);
  }, [open, currentClassroomId, classrooms]);

  const classroomOptions = useMemo(
    () =>
      classrooms.map((c) => ({
        id: c.id,
        label: `${c.ad}${c.alan_ad ? ` · ${c.alan_ad}` : ''}`,
      })),
    [classrooms],
  );

  const runPreview = async () => {
    if (!termId || !versionId) {
      message.warning('Dönem ve program versiyonu seçin.');
      return;
    }
    if (!selectedIds.length) {
      message.warning('En az bir sınıf seçin.');
      return;
    }
    setLoadingPreview(true);
    setError(null);
    try {
      const res = await previewScheduleNotify({
        term_id: termId,
        version_id: versionId,
        sinif_ids: selectedIds,
      });
      setPreview(res.classes);
      setIncludeUnchanged([]);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : 'Önizleme alınamadı');
    } finally {
      setLoadingPreview(false);
    }
  };

  const toggleIncludeUnchanged = (sinifId: number, checked: boolean) => {
    setIncludeUnchanged((prev) =>
      checked ? Array.from(new Set([...prev, sinifId])) : prev.filter((id) => id !== sinifId),
    );
  };

  const runSend = async () => {
    if (!termId || !versionId) return;
    if (!sendVeli && !sendOgrenci) {
      message.warning('Veli veya öğrenci seçin.');
      return;
    }
    if (!preview?.length) {
      message.warning('Önce önizleme alın.');
      return;
    }

    const toSend = preview.filter((c) => {
      if (c.empty_grid) return false;
      if (c.has_changes) return true;
      return includeUnchanged.includes(c.sinif_id);
    });
    if (!toSend.length) {
      message.warning('Gönderilecek sınıf yok. Değişmemiş sınıfları işaretleyin veya programı güncelleyin.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      const sendTo: Array<'veli' | 'ogrenci'> = [];
      if (sendVeli) sendTo.push('veli');
      if (sendOgrenci) sendTo.push('ogrenci');
      const res = await sendScheduleNotify({
        term_id: termId,
        version_id: versionId,
        sinif_ids: toSend.map((c) => c.sinif_id),
        force_unchanged_ids: includeUnchanged,
        send_to: sendTo,
      });
      message.success(
        `Kuyruğa alındı: ${res.total_veli_sent} veli, ${res.total_ogrenci_sent} öğrenci`
        + (res.total_skipped ? ` · ${res.total_skipped} sınıf atlandı` : ''),
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gönderim başarısız');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      title="Ders Programını Bildir"
      open={open}
      onCancel={onClose}
      width={640}
      destroyOnClose
      footer={[
        <Button key="cancel" onClick={onClose}>
          Vazgeç
        </Button>,
        <Button key="preview" onClick={runPreview} loading={loadingPreview} disabled={!termId || !versionId}>
          Önizle
        </Button>,
        <Button
          key="send"
          type="primary"
          onClick={runSend}
          loading={sending}
          disabled={!preview?.length}
        >
          Gönder
        </Button>,
      ]}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Text type="secondary">
          Seçilen sınıfların ders programı PDF olarak veli ve/veya öğrencilere WhatsApp ile gönderilir.
        </Text>

        <div>
          <Text strong>Sınıflar</Text>
          <div style={{ marginTop: 8, maxHeight: 180, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: 8 }}>
            <Checkbox
              indeterminate={
                selectedIds.length > 0 && selectedIds.length < classroomOptions.length
              }
              checked={
                classroomOptions.length > 0 && selectedIds.length === classroomOptions.length
              }
              onChange={(e) =>
                setSelectedIds(e.target.checked ? classroomOptions.map((c) => c.id) : [])
              }
              style={{ marginBottom: 8 }}
            >
              Tümünü seç
            </Checkbox>
            <Checkbox.Group
              style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
              value={selectedIds}
              onChange={(vals) => setSelectedIds(vals as number[])}
              options={classroomOptions.map((c) => ({ label: c.label, value: c.id }))}
            />
          </div>
        </div>

        <Space>
          <Checkbox checked={sendVeli} onChange={(e) => setSendVeli(e.target.checked)}>
            Veliler
          </Checkbox>
          <Checkbox checked={sendOgrenci} onChange={(e) => setSendOgrenci(e.target.checked)}>
            Öğrenciler
          </Checkbox>
        </Space>

        {error ? <Alert type="error" showIcon message={error} /> : null}

        {loadingPreview ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : null}

        {preview && !loadingPreview ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {preview.map((c) => (
              <div
                key={c.sinif_id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: '10px 12px',
                  background: c.empty_grid || !c.has_changes ? '#fffbeb' : '#f8fafc',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <Text strong>{c.sinif_ad}</Text>
                  <Text type="secondary">
                    {c.veli_count} veli · {c.students_with_phone}/{c.student_count} öğrenci
                  </Text>
                </div>
                {c.warning ? (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginTop: 8 }}
                    message={c.warning}
                  />
                ) : (
                  <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                    Programda değişiklik var — gönderilebilir.
                  </Text>
                )}
                {!c.has_changes && !c.empty_grid ? (
                  <Checkbox
                    style={{ marginTop: 8 }}
                    checked={includeUnchanged.includes(c.sinif_id)}
                    onChange={(e) => toggleIncludeUnchanged(c.sinif_id, e.target.checked)}
                  >
                    Yine de gönder
                  </Checkbox>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </Space>
    </Modal>
  );
}
