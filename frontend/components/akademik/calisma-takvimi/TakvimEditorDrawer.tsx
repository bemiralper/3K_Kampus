'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Col,
  Drawer,
  Form,
  Input,
  Row,
  Select,
  Space,
  Switch,
  Tabs,
  Typography,
  message,
} from 'antd';
import {
  createWorkCalendar,
  fetchWorkCalendar,
  fetchScheduleTemplates,
  saveWorkCalendarPlan,
  updateWorkCalendar,
  type ScheduleTemplate,
  type WorkCalendarDayInput,
} from '@/lib/academic-api';
import {
  TAKVIM_COLOR_PRESETS,
  TAKVIM_ICON_OPTIONS,
  defaultWeekDays,
  takvimIconNode,
  validateWeeklyPlan,
} from './constants';
import { PROGRAM_TIPI_OPTIONS } from '@/components/akademik/program-tipi';
import WeeklyPlanGrid from './WeeklyPlanGrid';
import TakvimSummaryPreview from './TakvimSummaryPreview';
import './calisma-takvimi.css';

const { TextArea } = Input;
const { Text } = Typography;

type Props = {
  open: boolean;
  calendarId: number | null;
  onClose: () => void;
  onSaved: (newId?: number) => void;
};

type MetaForm = {
  name: string;
  description?: string;
  is_active: boolean;
  is_default: boolean;
  color: string;
  icon: string;
  program_tipi: string;
};

export default function TakvimEditorDrawer({ open, calendarId, onClose, onSaved }: Props) {
  const [form] = Form.useForm<MetaForm>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [planDays, setPlanDays] = useState<WorkCalendarDayInput[]>(defaultWeekDays());
  const [activeTab, setActiveTab] = useState('general');

  const isEdit = calendarId != null;

  const loadTemplates = useCallback(async () => {
    try {
      const data = await fetchScheduleTemplates();
      setTemplates(data.filter((t) => t.is_active));
    } catch {
      setTemplates([]);
    }
  }, []);

  const loadDetail = useCallback(async () => {
    if (!calendarId) {
      form.setFieldsValue({
        name: '',
        description: '',
        is_active: true,
        is_default: false,
        color: '#0262a7',
        icon: 'calendar',
        program_tipi: 'GENEL',
      });
      setPlanDays(defaultWeekDays());
      setActiveTab('general');
      return;
    }
    setLoading(true);
    try {
      const data = await fetchWorkCalendar(calendarId);
      form.setFieldsValue({
        name: data.name,
        description: data.description || '',
        is_active: data.is_active,
        is_default: data.is_default,
        color: data.color || '#0262a7',
        icon: data.icon || 'calendar',
        program_tipi: data.program_tipi || 'GENEL',
      });
      setPlanDays(
        data.days.length
          ? data.days
              .sort((a, b) => a.day_of_week - b.day_of_week)
              .map((d) => ({
                id: d.id,
                day_of_week: d.day_of_week,
                name: d.name,
                order: d.order,
                is_active: d.is_active,
                schedule_template: d.schedule_template,
                note: d.note || '',
              }))
          : defaultWeekDays(),
      );
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Takvim yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [calendarId, form]);

  useEffect(() => {
    if (open) {
      loadTemplates();
      loadDetail();
    }
  }, [open, loadDetail, loadTemplates]);

  const watchMeta = Form.useWatch([], form) as MetaForm | undefined;
  const previewMeta = watchMeta || {
    name: '',
    color: '#0262a7',
    icon: 'calendar',
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const planError = validateWeeklyPlan(planDays);
      if (planError) {
        message.warning(planError);
        setActiveTab('plan');
        return;
      }

      setSaving(true);
      let id = calendarId;

      if (isEdit && id) {
        await updateWorkCalendar(id, values);
        await saveWorkCalendarPlan(id, planDays);
        message.success('Çalışma takvimi güncellendi');
      } else {
        const created = await createWorkCalendar({
          ...values,
          create_default_days: false,
        });
        id = created.id;
        await saveWorkCalendarPlan(id, planDays);
        message.success('Çalışma takvimi oluşturuldu');
      }

      onSaved(id ?? undefined);
    } catch (e) {
      if (e instanceof Error && e.message) message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const color = Form.useWatch('color', form) || '#0262a7';
  const icon = Form.useWatch('icon', form) || 'calendar';
  const name = Form.useWatch('name', form) || '';

  const tabItems = useMemo(
    () => [
      {
        key: 'general',
        label: 'Genel Bilgiler',
        children: (
          <section className="ct-panel">
            <Form form={form} layout="vertical" requiredMark="optional">
              <Form.Item name="name" label="Takvim Adı" rules={[{ required: true, min: 2 }]}>
                <Input placeholder="Örn: Grup Hafta İçi, Birebir Akşam" maxLength={100} />
              </Form.Item>
              <Form.Item
                name="program_tipi"
                label="Program Tipi"
                rules={[{ required: true }]}
                extra="Grup ve birebir dersler farklı saat yapıları kullanır; öğretmen uygunluğu bu tipe göre ayrılır."
              >
                <Select
                  options={PROGRAM_TIPI_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                    title: o.hint,
                  }))}
                />
              </Form.Item>
              <Form.Item name="description" label="Açıklama">
                <TextArea rows={3} placeholder="Kısa açıklama…" maxLength={500} />
              </Form.Item>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="is_default" label="Varsayılan mı" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="is_active" label="Aktif mi" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="color" label="Renk">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {TAKVIM_COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`ct-color-swatch${color === c ? ' ct-color-swatch--active' : ''}`}
                      style={{ background: c }}
                      onClick={() => form.setFieldValue('color', c)}
                      aria-label={c}
                    />
                  ))}
                  <Input
                    type="color"
                    value={color}
                    onChange={(e) => form.setFieldValue('color', e.target.value)}
                    style={{ width: 40, height: 32, padding: 2 }}
                  />
                </div>
              </Form.Item>
              <Form.Item name="icon" label="İkon">
                <div className="ct-icon-pick">
                  {TAKVIM_ICON_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`ct-icon-btn${icon === opt.value ? ' ct-icon-btn--active' : ''}`}
                      onClick={() => form.setFieldValue('icon', opt.value)}
                      title={opt.label}
                    >
                      {takvimIconNode(opt.value, color)}
                    </button>
                  ))}
                </div>
              </Form.Item>
            </Form>
          </section>
        ),
      },
      {
        key: 'plan',
        label: 'Haftalık Plan',
        children: (
          <section className="ct-panel">
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              Her gün için aktiflik ve ders saati şablonu seçin. Şablonlar yalnızca Ders Saatleri
              ekranında tanımlanan kayıtlardan seçilir.
            </Text>
            <WeeklyPlanGrid days={planDays} templates={templates} onChange={setPlanDays} />
          </section>
        ),
      },
    ],
    [color, form, icon, planDays, templates],
  );

  return (
    <Drawer
      title={isEdit ? 'Takvim Düzenle' : 'Yeni Çalışma Takvimi'}
      open={open}
      onClose={onClose}
      width="min(1100px, 96vw)"
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>Kapat</Button>
          <Button type="primary" loading={saving} onClick={handleSave}>
            Kaydet
          </Button>
        </Space>
      }
    >
      {loading ? (
        <div className="ct-loading">Yükleniyor…</div>
      ) : (
        <Row gutter={[20, 20]}>
          <Col xs={24} lg={15}>
            <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
          </Col>
          <Col xs={24} lg={9}>
            <TakvimSummaryPreview
              name={name}
              color={previewMeta.color || color}
              icon={previewMeta.icon || icon}
              days={planDays}
              templates={templates}
            />
          </Col>
        </Row>
      )}
    </Drawer>
  );
}
