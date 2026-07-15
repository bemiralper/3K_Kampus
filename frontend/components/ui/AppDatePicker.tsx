"use client";

/**
 * Öğrenci kayıt doğum tarihi ile aynı Ant Design takvim.
 * Personel (ve diğer) formlarda type="date" yerine kullanılır.
 */
import { ConfigProvider, DatePicker } from "antd";
import type { DatePickerProps } from "antd";
import trTR from "antd/locale/tr_TR";
import dayjs, { type Dayjs } from "dayjs";
import "dayjs/locale/tr";

dayjs.locale("tr");

export type AppDatePickerProps = {
  value?: string | null;
  onChange?: (isoDate: string) => void;
  placeholder?: string;
  format?: string;
  className?: string;
  style?: React.CSSProperties;
  status?: "error" | "warning";
  disabled?: boolean;
  allowClear?: boolean;
  /** Doğum tarihi gibi alanlarda gelecek günleri kapatır */
  disableFuture?: boolean;
  size?: DatePickerProps["size"];
  id?: string;
  getPopupContainer?: DatePickerProps["getPopupContainer"];
};

function parseValue(value?: string | null): Dayjs | null {
  if (!value) return null;
  const d = dayjs(value.slice(0, 10));
  return d.isValid() ? d : null;
}

export default function AppDatePicker({
  value,
  onChange,
  placeholder = "GG.AA.YYYY",
  format = "DD.MM.YYYY",
  className,
  style,
  status,
  disabled,
  allowClear = true,
  disableFuture = false,
  size = "middle",
  id,
  getPopupContainer,
}: AppDatePickerProps) {
  return (
    <ConfigProvider locale={trTR}>
      <DatePicker
        id={id}
        value={parseValue(value)}
        onChange={(date) => onChange?.(date ? date.format("YYYY-MM-DD") : "")}
        format={format}
        placeholder={placeholder}
        className={className}
        style={{ width: "100%", ...style }}
        status={status}
        disabled={disabled}
        allowClear={allowClear}
        size={size}
        getPopupContainer={
          getPopupContainer || ((trigger) => trigger.parentElement || document.body)
        }
        disabledDate={
          disableFuture
            ? (current) => !!current && current > dayjs().endOf("day")
            : undefined
        }
      />
    </ConfigProvider>
  );
}
