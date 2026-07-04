import { finansRequest } from "./finans-http";
import type {
  PeriodDetailsResponse,
  PeriodQueryParams,
  PeriodSummaryResponse,
} from "../types/period-types";

function buildParams(
  params: Partial<PeriodQueryParams> & { format?: string; orientation?: string },
): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val === undefined || val === null || val === "") return;
    if (Array.isArray(val)) {
      val.forEach((v) => qs.append(key, String(v)));
    } else {
      qs.set(key, String(val));
    }
  });
  return qs.toString();
}

export const periodService = {
  summary(params: PeriodQueryParams): Promise<PeriodSummaryResponse> {
    const { page: _p, page_size: _s, ...rest } = params;
    return finansRequest(`/period-summary/?${buildParams(rest)}`);
  },

  details(params: PeriodQueryParams): Promise<PeriodDetailsResponse> {
    return finansRequest(`/period-details/?${buildParams(params)}`);
  },

  exportUrl(
    params: PeriodQueryParams,
    format: "csv" | "xlsx" | "pdf",
    orientation: "portrait" | "landscape" = "landscape",
  ): string {
    return `/period-details/?${buildParams({ ...params, format, orientation })}`;
  },

  reportExportUrl(
    params: PeriodQueryParams,
    format: "csv" | "xlsx" | "pdf",
    orientation: "portrait" | "landscape" = "landscape",
  ): string {
    const { page: _p, page_size: _s, ...rest } = params;
    return `/period-report/?${buildParams({ ...rest, format, orientation })}`;
  },
};
