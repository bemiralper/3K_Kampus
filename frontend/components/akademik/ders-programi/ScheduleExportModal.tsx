'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Checkbox,
  Modal,
  Radio,
  Select,
  Space,
  Typography,
  message,
} from 'antd';
import {
  downloadScheduleExportFile,
  exportSchedulePdf,
  fetchScheduleExportJson,
  type ScheduleExportFormat,
  type ScheduleExportLayout,
  type ScheduleExportScope,
  type ScheduleTeacherDisplay,
} from '@/lib/schedule-export';
import { getScheduleColorBy } from '@/lib/schedule-color';
import type { ClassLessonPlanClassroom } from '@/lib/academic-api';

const { Text } = Typography;

type Props = {
  open: boolean;
  onClose: () => void;
  termId: number | null;
  versionId: number | null;
  currentClassroomId: number | null;
  classrooms: ClassLessonPlanClassroom[];
};

export default function ScheduleExportModal({
  open,
  onClose,
  termId,
  versionId,
  currentClassroomId,
  classrooms,
}: Props) {
  const [scope, setScope] = useState<ScheduleExportScope>('current');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [format, setFormat] = useState<ScheduleExportFormat>('xlsx');
  const [layout, setLayout] = useState<ScheduleExportLayout>('stacked');
  const [teacherDisplay, setTeacherDisplay] = useState<ScheduleTeacherDisplay>('full');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScope('current');
    setSelectedIds(currentClassroomId ? [currentClassroomId] : []);
    setFormat('xlsx');
    setLayout('stacked');
    setTeacherDisplay('full');
  }, [open, currentClassroomId]);

  const classroomOptions = useMemo(
    () =>
      classrooms.map((c) => ({
        value: c.id,
        label: `${c.ad}${c.alan_ad ? ` · ${c.alan_ad}` : ''}`,
      })),
    [classrooms],
  );

  const runExport = async () => {
    if (!termId) {
      message.warning({ content: 'Dönem seçin', style: { marginTop: '38vh' } });
      return;
    }
    if (!versionId) {
      message.warning({
        content: 'Program versiyonu seçin (Ders Programı filtreleri).',
        style: { marginTop: '38vh' },
      });
      return;
    }

    let classroom_ids: number[] | undefined;
    let all = false;
    if (scope === 'all') {
      all = true;
    } else if (scope === 'current') {
      if (!currentClassroomId) {
        message.warning({ content: 'Sınıf seçin', style: { marginTop: '38vh' } });
        return;
      }
      classroom_ids = [currentClassroomId];
    } else {
      if (!selectedIds.length) {
        message.warning({ content: 'En az bir sınıf seçin', style: { marginTop: '38vh' } });
        return;
      }
      classroom_ids = selectedIds;
    }

    setExporting(true);
    try {
      if (format === 'pdf') {
        const payload = await fetchScheduleExportJson({
          term_id: termId,
          version_id: versionId,
          classroom_ids,
          all,
          teacher_display: teacherDisplay,
        });
        await exportSchedulePdf(payload, {
          layout,
          colorBy: getScheduleColorBy(),
        });
      } else {
        await downloadScheduleExportFile({
          term_id: termId,
          version_id: versionId,
          classroom_ids,
          all,
          format,
          layout: format === 'xlsx' ? layout : undefined,
          teacher_display: teacherDisplay,
          color_by: format === 'xlsx' ? getScheduleColorBy() : undefined,
        });
      }
      message.success({ content: 'Dışa aktarma tamamlandı', style: { marginTop: '38vh' } });
      onClose();
    } catch (e) {
      message.error({
        content: e instanceof Error ? e.message : 'Dışa aktarma başarısız',
        style: { marginTop: '38vh' },
        duration: 5,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal
      title="Ders programı dışa aktar"
      open={open}
      onCancel={onClose}
      onOk={runExport}
      confirmLoading={exporting}
      okText="İndir"
      destroyOnClose
      centered
      width={540}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {!versionId ? (
          <Alert
            type="warning"
            showIcon
            message="Versiyon seçilmedi"
            description="Önce Ders Programı filtrelerinden bir program versiyonu seçin."
          />
        ) : (
          <Alert
            type="info"
            showIcon
            message="Kurumsal Excel/CSV (logo + başlık) · PDF Türkçe font destekli"
          />
        )}

        <div>
          <Text strong>Kapsam</Text>
          <Radio.Group
            style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            options={[
              { value: 'current', label: 'Bu sınıf' },
              { value: 'selected', label: 'Seçili sınıflar' },
              { value: 'all', label: 'Tüm sınıflar' },
            ]}
          />
          {scope === 'selected' ? (
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              style={{ width: '100%', marginTop: 10 }}
              placeholder="Sınıf seçin"
              value={selectedIds}
              onChange={setSelectedIds}
              options={classroomOptions}
            />
          ) : null}
        </div>

        <div>
          <Text strong>Format</Text>
          <Radio.Group
            style={{ display: 'flex', gap: 16, marginTop: 8 }}
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            options={[
              { value: 'xlsx', label: 'Excel' },
              { value: 'csv', label: 'CSV' },
              { value: 'pdf', label: 'PDF' },
            ]}
          />
        </div>

        <div>
          <Text strong>Öğretmen gösterimi</Text>
          <Radio.Group
            style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}
            value={teacherDisplay}
            onChange={(e) => setTeacherDisplay(e.target.value)}
            options={[
              { value: 'full', label: 'Tam ad (Ahmet Yılmaz)' },
              { value: 'initials', label: 'Baş harfler (A. Y.)' },
              { value: 'hidden', label: 'Öğretmeni gösterme' },
            ]}
          />
        </div>

        <div>
          <Text strong>Yerleşim</Text>
          <Radio.Group
            style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}
            value={layout}
            onChange={(e) => setLayout(e.target.value)}
            options={[
              {
                value: 'stacked',
                label:
                  format === 'xlsx'
                    ? 'Ardışık (tek sayfada bloklar)'
                    : 'Ardışık (tek dosya)',
              },
              {
                value: 'per_class_sheet',
                label:
                  format === 'xlsx'
                    ? 'Sınıf başına Excel sayfası'
                    : format === 'csv'
                      ? 'Sınıf başına sayfa (CSV)'
                      : 'Sınıf başına sayfa (PDF)',
              },
            ]}
          />
          {format === 'csv' ? (
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
              CSV’de yerleşim her zaman ardışık bloklardır (UTF-8, ; ayırıcı). CSV
              metin olduğu için hücre rengi uygulanamaz; renkli çıktı için Excel veya PDF kullanın.
            </Text>
          ) : null}
        </div>

        {format === 'xlsx' || format === 'pdf' ? (
          <Checkbox checked disabled>
            Renkler ekrandaki Ders / Öğretmen / Renksiz tercihine göre uygulanır
          </Checkbox>
        ) : null}
      </Space>
    </Modal>
  );
}
