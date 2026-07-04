import { finansRequest } from "./finans-http";
import type {
  OverduePaymentDetail,
  OverduePaymentsParams,
  OverduePaymentsResponse,
  OverdueReminderPreviewRequest,
  OverdueReminderPreviewResponse,
  OverdueReminderSendRequest,
  OverdueReminderSendResponse,
} from "../types/overdue-types";

function buildParams(params: OverduePaymentsParams & Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      qs.set(key, String(val));
    }
  });
  return qs.toString();
}

export const overdueService = {
  list(params: OverduePaymentsParams): Promise<OverduePaymentsResponse> {
    return finansRequest(`/overdue-payments/?${buildParams(params as OverduePaymentsParams & Record<string, string | number | boolean | undefined>)}`);
  },

  detail(taksitId: number, kurumId: number): Promise<OverduePaymentDetail> {
    return finansRequest(`/overdue-payments/${taksitId}/?kurum_id=${kurumId}`);
  },

  previewReminders(body: OverdueReminderPreviewRequest): Promise<OverdueReminderPreviewResponse> {
    return finansRequest("/overdue-reminders/preview/", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  sendReminders(body: OverdueReminderSendRequest): Promise<OverdueReminderSendResponse> {
    return finansRequest("/overdue-reminders/send/", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  exportUrl(
    params: OverduePaymentsParams,
    format: "csv" | "xlsx" | "pdf",
    exportColumnKeys?: string[],
    orientation: "portrait" | "landscape" = "landscape",
  ): string {
    const columns =
      exportColumnKeys && exportColumnKeys.length > 0
        ? exportColumnKeys.join(",")
        : undefined;
    return `/overdue-payments/?${buildParams({
      ...params,
      format,
      columns,
      orientation,
    } as OverduePaymentsParams & Record<string, string | number | boolean | undefined>)}`;
  },
};
