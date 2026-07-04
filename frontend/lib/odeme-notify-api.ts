import { apiGet, apiPost, type ApiResponse } from "@/lib/api";

export type OdemeNotifyType = "plan" | "sozlesme" | "makbuz";

export interface OdemeNotifyRecipient {
  recipient_type: "veli" | "ogrenci";
  ogrenci_id: number;
  veli_id: number | null;
  display_name: string;
  telefon: string;
  body: string;
  skip_reason?: string;
  send_count?: number;
  last_sent_at?: string | null;
  send_history?: { sent_at: string; status: string }[];
}

export interface OdemeNotifyPreviewData {
  notify_type: OdemeNotifyType;
  entity_id: number;
  sozlesme_id: number;
  sozlesme_no: string;
  student_name: string;
  pdf_title: string;
  extra_label?: string;
  recipients: OdemeNotifyRecipient[];
}

export async function previewOdemeNotify(
  sozlesmeId: number,
  notifyType: "plan" | "sozlesme",
): Promise<ApiResponse<OdemeNotifyPreviewData>> {
  return apiGet<OdemeNotifyPreviewData>(
    `/api/odeme-takip/api/sozlesmeler/${sozlesmeId}/notify-preview/?type=${notifyType}`,
  );
}

export async function previewMakbuzNotify(
  tahsilatId: number,
): Promise<ApiResponse<OdemeNotifyPreviewData>> {
  return apiGet<OdemeNotifyPreviewData>(
    `/api/odeme-takip/api/tahsilatlar/${tahsilatId}/notify-preview/`,
  );
}

export interface NotifySentDetail {
  recipient_type: string;
  display_name: string;
  telefon: string;
  message_status: string;
}

export interface OdemeNotifySendResult {
  sent: number;
  skipped: number;
  errors: string[];
  sent_details?: NotifySentDetail[];
}

export async function sendOdemeNotify(
  sozlesmeId: number,
  payload: {
    notify_type: "plan" | "sozlesme";
    veli_ids?: number[];
    include_student?: boolean;
  },
): Promise<ApiResponse<OdemeNotifySendResult>> {
  return apiPost(
    `/api/odeme-takip/api/sozlesmeler/${sozlesmeId}/notify-send/`,
    payload,
  );
}

export async function sendMakbuzNotify(
  tahsilatId: number,
  payload: {
    veli_ids?: number[];
    include_student?: boolean;
  },
): Promise<ApiResponse<OdemeNotifySendResult>> {
  return apiPost(
    `/api/odeme-takip/api/tahsilatlar/${tahsilatId}/notify-send/`,
    payload,
  );
}
