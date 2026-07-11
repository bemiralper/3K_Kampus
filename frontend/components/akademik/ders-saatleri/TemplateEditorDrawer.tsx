'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Col,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  TimePicker,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  bulkDeleteTimeSlots,
  bulkUpdateLessonDuration,
  createScheduleTemplate,
  createSlotGenerator,
  createTimeSlot,
  deleteTimeSlot,
  exportSlotsCsv,
  fetchScheduleTemplate,
  previewSlotGenerator,
  shiftTemplateSlots,
  updateScheduleTemplate,
  updateTimeSlot,
  type GeneratedSlotPreview,
  type ScheduleTemplateDetail,
  type SlotGeneratorConfig,
  type SlotTypeCode,
  type TimeSlot,
} from '@/lib/academic-api';
import { GUN_YAPISI_PRESETS, SLOT_TYPE_OPTIONS, slotTypeMeta } from './constants';
import SlotTimelinePreview from './SlotTimelinePreview';
import { useKurum } from '@/lib/contexts/KurumContext';
import './ders-saatleri.css';

const { TextArea } = Input;
const { Title, Text } = Typography;

type Props = {
  open: boolean;
  templateId: number | null;
  onClose: () => void;
  onSaved: (newTemplateId?: number) => void;
};

type SlotRow = TimeSlot | (GeneratedSlotPreview & { id?: number; _draft?: boolean });

function slotId(slot: SlotRow): number | null {
  return 'id' in slot && typeof slot.id === 'number' ? slot.id : null;
}

function slotStartLabel(slot: SlotRow): string {
  if ('start_time_display' in slot) {
    const display = (slot as TimeSlot).start_time_display;
    if (display) return display;
  }
  return String(slot.start_time).slice(0, 5);
}

function slotEndLabel(slot: SlotRow): string {
  if ('end_time_display' in slot) {
    const display = (slot as TimeSlot).end_time_display;
    if (display) return display;
  }
  return String(slot.end_time).slice(0, 5);
}

type EditorForm = {
  name: string;
  description?: string;
  weekly_cycle_name: string;
  is_active: boolean;
  is_default: boolean;
};

const defaultGenerator: Omit<SlotGeneratorConfig, 'schedule_template_id'> = {
  start_time: '08:30',
  lesson_duration: 40,
  short_break_duration: 10,
  lesson_count: 10,
  lunch_break_enabled: true,
  lunch_break_after_lesson: 4,
  lunch_break_duration: 45,
  evening_break_enabled: false,
  overwrite_existing: false,
};

function toTimePickerValue(value?: string) {
  if (!value) return null;
  const t = value.length >= 5 ? value.slice(0, 5) : value;
  return dayjs(t, 'HH:mm');
}

function fromTimePickerValue(value: dayjs.Dayjs | null): string {
  return value ? value.format('HH:mm') : '';
}

export default function TemplateEditorDrawer({ open, templateId, onClose, onSaved }: Props) {
  const { activeSube } = useKurum();
  const subeThemeHex = activeSube?.tema_rengi ?? null;
  const [form] = Form.useForm<EditorForm>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<ScheduleTemplateDetail | null>(null);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [generator, setGenerator] = useState(defaultGenerator);
  const [previewSlots, setPreviewSlots] = useState<GeneratedSlotPreview[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [shiftMinutes, setShiftMinutes] = useState(10);
  const [bulkDuration, setBulkDuration] = useState(40);

  const isEdit = templateId != null;

  const loadDetail = useCallback(async () => {
    if (!templateId) {
      form.setFieldsValue({
        name: '',
        description: '',
        weekly_cycle_name: 'Hafta İçi',
        is_active: true,
        is_default: false,
      });
      setDetail(null);
      setSlots([]);
      setPreviewSlots(null);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchScheduleTemplate(templateId);
      setDetail(data);
      setSlots(data.time_slots);
      form.setFieldsValue({
        name: data.name,
        description: data.description || '',
        weekly_cycle_name: data.weekly_cycle_name || 'Hafta İçi',
        is_active: data.is_active,
        is_default: data.is_default,
      });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Şablon yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [form, templateId]);

  useEffect(() => {
    if (open) loadDetail();
  }, [open, loadDetail]);

  const previewData = previewSlots ?? slots;

  const handleSaveMeta = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (isEdit && templateId) {
        await updateScheduleTemplate(templateId, values);
        message.success('Şablon güncellendi');
        await loadDetail();
        onSaved();
      } else {
        const created = await createScheduleTemplate(values);
        message.success('Şablon oluşturuldu');
        onSaved(created.id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Kayıt başarısız';
      message.error(msg);
      if (msg.includes('adında aktif bir şablon')) {
        form.setFields([{ name: 'name', errors: [msg] }]);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePreview = async () => {
    if (!templateId) {
      message.warning('Önce şablonu kaydedin');
      return;
    }
    setGenerating(true);
    try {
      const result = await previewSlotGenerator({
        ...generator,
        schedule_template_id: templateId,
      });
      setPreviewSlots(result.preview);
      message.success('Önizleme hazır');
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Önizleme oluşturulamadı');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateCreate = async () => {
    if (!templateId) {
      message.warning('Önce şablonu kaydedin');
      return;
    }
    const run = async (overwrite: boolean) => {
      setGenerating(true);
      try {
        const result = await createSlotGenerator({
          ...generator,
          schedule_template_id: templateId,
          overwrite_existing: overwrite,
        });
        setSlots(result.slots);
        setPreviewSlots(null);
        message.success('Ders saatleri oluşturuldu');
        onSaved();
      } catch (e) {
        message.error(e instanceof Error ? e.message : 'Oluşturma başarısız');
      } finally {
        setGenerating(false);
      }
    };

    if (slots.length > 0 && !generator.overwrite_existing) {
      Modal.confirm({
        title: 'Mevcut saatlerin üzerine yazılsın mı?',
        content: 'Bu şablonda tanımlı ders saatleri silinip yenileri oluşturulacak.',
        okText: 'Üzerine yaz',
        cancelText: 'Vazgeç',
        onOk: () => run(true),
      });
      return;
    }
    await run(generator.overwrite_existing ?? false);
  };

  const handleAddRow = async () => {
    if (!templateId) {
      message.warning('Önce şablonu kaydedin');
      return;
    }
    const nextOrder = (slots.reduce((max, s) => Math.max(max, s.order), 0) || 0) + 1;
    const last = slots[slots.length - 1];
    const lastEnd = last ? slotEndLabel(last) : generator.start_time;
    try {
      const created = await createTimeSlot({
        schedule_template: templateId,
        name: `${nextOrder}. Ders`,
        order: nextOrder,
        start_time: lastEnd || '08:30',
        end_time: dayjs(lastEnd || '08:30', 'HH:mm').add(generator.lesson_duration, 'minute').format('HH:mm'),
        slot_type: 'LESSON',
      });
      setSlots((prev) => [...prev, created].sort((a, b) => a.order - b.order));
      setPreviewSlots(null);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Satır eklenemedi');
    }
  };

  const persistSlotPatch = async (slotId: number, patch: Record<string, unknown>) => {
    const updated = await updateTimeSlot(slotId, patch);
    setSlots((prev) => prev.map((s) => ('id' in s && s.id === slotId ? updated : s)));
    setPreviewSlots(null);
  };

  const handleDeleteSlot = async (slotId: number) => {
    await deleteTimeSlot(slotId);
    setSlots((prev) => prev.filter((s) => !('id' in s) || s.id !== slotId));
  };

  const handleShift = async () => {
    if (!templateId) return;
    try {
      const updated = await shiftTemplateSlots(templateId, shiftMinutes);
      setSlots(updated);
      setPreviewSlots(null);
      message.success(`Saatler ${shiftMinutes} dk kaydırıldı`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Kaydırma başarısız');
    }
  };

  const handleBulkDuration = async () => {
    if (!templateId) return;
    try {
      const updated = await bulkUpdateLessonDuration(templateId, bulkDuration);
      setSlots(updated);
      setPreviewSlots(null);
      message.success('Ders süreleri güncellendi');
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Güncelleme başarısız');
    }
  };

  const columns: ColumnsType<SlotRow> = useMemo(
    () => [
      {
        title: 'Ders No',
        dataIndex: 'order',
        width: 72,
        render: (order: number, record) => {
          const id = slotId(record);
          return (
            <InputNumber
              min={1}
              size="small"
              value={order}
              disabled={id == null}
              onChange={(val) => {
                if (id != null && val) persistSlotPatch(id, { order: val }).catch(() => undefined);
              }}
            />
          );
        },
      },
      {
        title: 'Başlangıç',
        width: 110,
        render: (_, record) => {
          const id = slotId(record);
          return (
            <TimePicker
              size="small"
              format="HH:mm"
              value={toTimePickerValue(slotStartLabel(record))}
              disabled={id == null}
              onChange={(val) => {
                if (id != null) {
                  persistSlotPatch(id, { start_time: fromTimePickerValue(val) }).catch(() => undefined);
                }
              }}
            />
          );
        },
      },
      {
        title: 'Bitiş',
        width: 110,
        render: (_, record) => {
          const id = slotId(record);
          return (
            <TimePicker
              size="small"
              format="HH:mm"
              value={toTimePickerValue(slotEndLabel(record))}
              disabled={id == null}
              onChange={(val) => {
                if (id != null) {
                  persistSlotPatch(id, { end_time: fromTimePickerValue(val) }).catch(() => undefined);
                }
              }}
            />
          );
        },
      },
      {
        title: 'Süre',
        width: 72,
        render: (_, record) => <Text type="secondary">{record.duration} dk</Text>,
      },
      {
        title: 'Tip',
        width: 150,
        render: (_, record) => {
          const id = slotId(record);
          const meta = slotTypeMeta(record.slot_type, subeThemeHex);
          return (
            <Select
              size="small"
              style={{ width: '100%' }}
              value={record.slot_type}
              disabled={id == null}
              options={SLOT_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(val: SlotTypeCode) => {
                if (id != null) persistSlotPatch(id, { slot_type: val }).catch(() => undefined);
              }}
              tagRender={() => <Tag color={meta.color}>{meta.label}</Tag>}
            />
          );
        },
      },
      {
        title: 'Renk',
        width: 56,
        render: (_, record) => {
          const meta = slotTypeMeta(record.slot_type, subeThemeHex);
          return <span className="ds-color-dot" style={{ background: meta.color }} />;
        },
      },
      {
        title: '',
        width: 48,
        render: (_, record) => {
          const id = slotId(record);
          if (id == null) return null;
          return (
            <Button
              type="text"
              danger
              size="small"
              onClick={() =>
                Modal.confirm({
                  title: 'Satır silinsin mi?',
                  onOk: () => handleDeleteSlot(id),
                })
              }
            >
              Sil
            </Button>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, subeThemeHex],
  );

  return (
    <Drawer
      title={isEdit ? `Şablon Düzenle — ${detail?.name ?? ''}` : 'Yeni Ders Saati Şablonu'}
      open={open}
      onClose={onClose}
      width="min(1200px, 96vw)"
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>Kapat</Button>
          <Button type="primary" loading={saving} onClick={handleSaveMeta}>
            Kaydet
          </Button>
        </Space>
      }
    >
      {loading ? (
        <div className="ds-loading">Yükleniyor…</div>
      ) : (
        <Row gutter={[20, 20]}>
          <Col xs={24} lg={14}>
            <section className="ds-panel">
              <Title level={5}>Genel Bilgiler</Title>
              <Form form={form} layout="vertical" requiredMark="optional">
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item
                      name="name"
                      label="Şablon Adı"
                      rules={[{ required: true, min: 2 }]}
                      extra="Örn: Hafta İçi Gündüz, Hafta Sonu Akşam — Gün Yapısı alanından bağımsızdır."
                    >
                      <Input placeholder="Örn. Hafta İçi" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="weekly_cycle_name"
                      label="Gün Yapısı Etiketi"
                      rules={[{ required: true }]}
                      extra="Sadece sınıflandırma etiketi — Çalışma Takvimi oluşturmaz."
                    >
                      <Select
                        showSearch
                        options={GUN_YAPISI_PRESETS.map((p) => ({ value: p, label: p }))}
                        placeholder="Gün yapısı seçin"
                      />
                    </Form.Item>
                  </Col>
                  <Col span={24}>
                    <Form.Item name="description" label="Açıklama">
                      <TextArea rows={2} placeholder="Kısa açıklama" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="is_active" label="Durum" valuePropName="checked">
                      <Switch checkedChildren="Aktif" unCheckedChildren="Pasif" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="is_default" label="Varsayılan" valuePropName="checked">
                      <Switch checkedChildren="Evet" unCheckedChildren="Hayır" />
                    </Form.Item>
                  </Col>
                </Row>
              </Form>
            </section>

            {isEdit && (
              <>
                <section className="ds-panel ds-panel--gen">
                  <Title level={5}>Otomatik Oluştur</Title>
                  <p className="ds-gen-hint">
                    Sistem sırayla ders + teneffüs üretir. Belirttiğiniz dersten sonra öğle arası koyar,
                    ardından kalan derslere devam eder. Önce <strong>Önizle</strong>, sonra <strong>Oluştur</strong>.
                  </p>
                  <Row gutter={[12, 12]}>
                    <Col span={8}>
                      <label className="ds-field-label">Başlangıç</label>
                      <TimePicker
                        style={{ width: '100%' }}
                        format="HH:mm"
                        value={toTimePickerValue(generator.start_time)}
                        onChange={(v) =>
                          setGenerator((g) => ({ ...g, start_time: fromTimePickerValue(v) || '08:30' }))
                        }
                      />
                    </Col>
                    <Col span={8}>
                      <label className="ds-field-label">Ders Süresi (dk)</label>
                      <InputNumber
                        style={{ width: '100%' }}
                        min={10}
                        max={120}
                        value={generator.lesson_duration}
                        onChange={(v) => setGenerator((g) => ({ ...g, lesson_duration: Number(v) || 40 }))}
                      />
                    </Col>
                    <Col span={8}>
                      <label className="ds-field-label">Teneffüs (dk)</label>
                      <InputNumber
                        style={{ width: '100%' }}
                        min={5}
                        max={30}
                        value={generator.short_break_duration}
                        onChange={(v) => setGenerator((g) => ({ ...g, short_break_duration: Number(v) || 10 }))}
                      />
                    </Col>
                    <Col span={8}>
                      <label className="ds-field-label">Öğle süresi (dk)</label>
                      <InputNumber
                        style={{ width: '100%' }}
                        min={15}
                        max={120}
                        disabled={!generator.lunch_break_enabled}
                        value={generator.lunch_break_duration}
                        onChange={(v) => setGenerator((g) => ({ ...g, lunch_break_duration: Number(v) || 45 }))}
                      />
                    </Col>
                    <Col span={8}>
                      <label className="ds-field-label">Öğle — kaçıncı dersten sonra?</label>
                      <InputNumber
                        style={{ width: '100%' }}
                        min={1}
                        max={15}
                        disabled={!generator.lunch_break_enabled}
                        value={generator.lunch_break_after_lesson}
                        onChange={(v) =>
                          setGenerator((g) => ({ ...g, lunch_break_after_lesson: Number(v) || 4 }))
                        }
                      />
                    </Col>
                    <Col span={8}>
                      <label className="ds-field-label">Toplam ders sayısı</label>
                      <InputNumber
                        style={{ width: '100%' }}
                        min={1}
                        max={16}
                        value={generator.lesson_count}
                        onChange={(v) => setGenerator((g) => ({ ...g, lesson_count: Number(v) || 8 }))}
                      />
                    </Col>
                    <Col span={8} style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <Checkbox
                        checked={generator.lunch_break_enabled}
                        onChange={(e) => setGenerator((g) => ({ ...g, lunch_break_enabled: e.target.checked }))}
                      >
                        Öğle arası ekle
                      </Checkbox>
                    </Col>
                  </Row>
                  <Space wrap style={{ marginTop: 12 }}>
                    <Button loading={generating} onClick={handleGeneratePreview}>
                      Önizle
                    </Button>
                    <Button type="primary" loading={generating} onClick={handleGenerateCreate}>
                      Oluştur
                    </Button>
                  </Space>
                </section>

                <section className="ds-panel">
                  <div className="ds-panel-head">
                    <Title level={5} style={{ margin: 0 }}>
                      Ders Saatleri
                    </Title>
                    <Space wrap>
                      <Button size="small" onClick={handleAddRow}>
                        Satır Ekle
                      </Button>
                      <InputNumber size="small" min={-120} max={120} value={shiftMinutes} onChange={(v) => setShiftMinutes(Number(v) || 10)} />
                      <Button size="small" onClick={handleShift}>
                        Saat Kaydır
                      </Button>
                      <InputNumber size="small" min={10} max={120} value={bulkDuration} onChange={(v) => setBulkDuration(Number(v) || 40)} />
                      <Button size="small" onClick={handleBulkDuration}>
                        Toplu Süre
                      </Button>
                      <Button
                        size="small"
                        danger
                        onClick={() =>
                          Modal.confirm({
                            title: 'Tüm saatler silinsin mi?',
                            onOk: async () => {
                              await bulkDeleteTimeSlots(templateId!);
                              setSlots([]);
                              setPreviewSlots(null);
                              message.success('Saatler temizlendi');
                            },
                          })
                        }
                      >
                        Tümünü Sil
                      </Button>
                    </Space>
                  </div>
                  <Table
                    size="small"
                    rowKey={(r) => ('id' in r ? String(r.id) : `draft-${r.order}`)}
                    columns={columns}
                    dataSource={previewSlots ?? slots}
                    pagination={false}
                    scroll={{ x: 720, y: 360 }}
                    rowClassName={(record) =>
                      record.slot_type === 'LUNCH_BREAK' ? 'ds-row-lunch' : ''
                    }
                    onRow={(record) => {
                      if (record.slot_type !== 'LUNCH_BREAK') return {};
                      const lunch = slotTypeMeta('LUNCH_BREAK', subeThemeHex);
                      return {
                        style: { background: lunch.bg, color: lunch.color },
                      };
                    }}
                  />
                  {previewSlots && (
                    <Alert
                      style={{ marginTop: 12 }}
                      type="info"
                      showIcon
                      message="Önizleme modu — Oluştur butonuna basarak kaydedin veya düzenlemeye devam edin."
                    />
                  )}
                </section>
              </>
            )}

            {!isEdit && (
              <Alert
                type="info"
                showIcon
                message="Önce genel bilgileri kaydedin; ardından ders saatlerini otomatik oluşturabilir veya manuel ekleyebilirsiniz."
              />
            )}
          </Col>

          <Col xs={24} lg={10}>
            <SlotTimelinePreview slots={previewData} subeThemeHex={subeThemeHex} />
          </Col>
        </Row>
      )}
    </Drawer>
  );
}
