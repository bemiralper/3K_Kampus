'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal, Radio, Select, message } from 'antd';
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

type Mode = 'class' | 'teacher';

type Props = {
  open: boolean;
  onClose: () => void;
  mode: Mode;
  termId: number | null;
  currentClassroomId?: number | null;
  classrooms?: ClassLessonPlanClassroom[];
  teacherId?: number | null;
  teacherName?: string;
};

const FORMAT_CARDS: { value: ScheduleExportFormat; title: string }[] = [
  { value: 'pdf', title: 'PDF' },
  { value: 'xlsx', title: 'Excel' },
  { value: 'csv', title: 'CSV' },
];

export default function GoruntulemeExportModal({
  open,
  onClose,
  mode,
  termId,
  currentClassroomId,
  classrooms = [],
  teacherId,
  teacherName,
}: Props) {
  const [scope, setScope] = useState<ScheduleExportScope>('current');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [format, setFormat] = useState<ScheduleExportFormat>('pdf');
  const [layout, setLayout] = useState<ScheduleExportLayout>('stacked');
  const [teacherDisplay, setTeacherDisplay] = useState<ScheduleTeacherDisplay>('full');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScope('current');
    setSelectedIds(currentClassroomId ? [currentClassroomId] : []);
    setFormat('pdf');
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
      message.warning('Dönem seçin');
      return;
    }

    let classroom_ids: number[] | undefined;
    let all = false;
    if (mode === 'class') {
      if (scope === 'all') {
        all = true;
      } else if (scope === 'current') {
        if (!currentClassroomId) {
          message.warning('Sınıf seçin');
          return;
        }
        classroom_ids = [currentClassroomId];
      } else {
        if (!selectedIds.length) {
          message.warning('En az bir sınıf seçin');
          return;
        }
        classroom_ids = selectedIds;
      }
    } else if (!teacherId) {
      message.warning('Öğretmen seçin');
      return;
    }

    setExporting(true);
    try {
      const common = {
        term_id: termId,
        classroom_ids,
        teacher_id: mode === 'teacher' ? teacherId ?? undefined : undefined,
        all,
        teacher_display: teacherDisplay,
      };
      if (format === 'pdf') {
        const payload = await fetchScheduleExportJson(common);
        await exportSchedulePdf(payload, {
          layout,
          colorBy: getScheduleColorBy(),
        });
      } else {
        await downloadScheduleExportFile({
          ...common,
          format,
          layout: format === 'xlsx' ? layout : undefined,
          color_by: format === 'xlsx' ? getScheduleColorBy() : undefined,
        });
      }
      message.success('İndirme hazır');
      onClose();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Dışa aktarma başarısız');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal
      title={mode === 'teacher' ? (teacherName ? `${teacherName} · indir` : 'Öğretmen programını indir') : 'Sınıf programını indir'}
      open={open}
      onCancel={onClose}
      onOk={runExport}
      confirmLoading={exporting}
      okText="İndir"
      destroyOnClose
      centered
      width={560}
    >
      <div className="gv-export">
        {mode === 'class' && (
          <div className="gv-export-block">
            <strong>Kapsam</strong>
            <Radio.Group
              className="gv-export-radios"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              options={[
                { value: 'current', label: 'Bu sınıf' },
                { value: 'selected', label: 'Seçili sınıflar' },
                { value: 'all', label: 'Tüm sınıflar' },
              ]}
            />
            {scope === 'selected' && (
              <Select
                mode="multiple"
                showSearch
                optionFilterProp="label"
                style={{ width: '100%', marginTop: 8 }}
                placeholder="Sınıf seçin"
                value={selectedIds}
                onChange={setSelectedIds}
                options={classroomOptions}
              />
            )}
          </div>
        )}

        <div className="gv-export-block">
          <strong>Format</strong>
          <div className="gv-export-formats">
            {FORMAT_CARDS.map((card) => (
              <button
                key={card.value}
                type="button"
                className={`gv-export-card${format === card.value ? ' is-active' : ''}`}
                onClick={() => setFormat(card.value)}
              >
                <em>{card.title}</em>
              </button>
            ))}
          </div>
        </div>

        {mode === 'class' && (
          <div className="gv-export-block">
            <strong>Öğretmen gösterimi</strong>
            <Radio.Group
              className="gv-export-radios"
              value={teacherDisplay}
              onChange={(e) => setTeacherDisplay(e.target.value)}
              options={[
                { value: 'full', label: 'Tam ad' },
                { value: 'initials', label: 'Baş harfler' },
                { value: 'hidden', label: 'Gizle' },
              ]}
            />
          </div>
        )}

        {format !== 'csv' && mode === 'class' && (
          <div className="gv-export-block">
            <strong>Yerleşim</strong>
            <Radio.Group
              className="gv-export-radios"
              value={layout}
              onChange={(e) => setLayout(e.target.value)}
              options={[
                { value: 'stacked', label: 'Tek dosyada ardışık' },
                { value: 'per_class_sheet', label: 'Sınıf başına sayfa' },
              ]}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
