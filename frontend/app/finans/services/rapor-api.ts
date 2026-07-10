import type {
  GelirGiderRapor,
  TahsilatAnaliz,
  BorcYaslandirma,
  DonemRapor,
} from "../types/rapor-types";
import { finansRequest, finansDownload } from "./finans-http";

const request = finansRequest;

export type RaporExportEndpoint = "gelir-gider" | "tahsilat-analiz" | "borc-yaslandirma" | "donem";
export type RaporExportFormat = "csv" | "xlsx" | "pdf";

function buildParams(params: Record<string, string | number | undefined | null>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") qs.set(key, String(val));
  });
  return qs.toString();
}

function ctxParams(params: { kurum_id: number; sube_id?: number; egitim_yili_id?: number }) {
  return buildParams({
    kurum_id: params.kurum_id,
    sube_id: params.sube_id,
    egitim_yili_id: params.egitim_yili_id,
  });
}

export const raporService = {
  gelirGider(params: { kurum_id: number; sube_id?: number; egitim_yili_id?: number }): Promise<GelirGiderRapor> {
    return request(`/raporlar/gelir-gider/?${ctxParams(params)}`);
  },

  tahsilatAnaliz(params: { kurum_id: number; sube_id?: number; egitim_yili_id?: number }): Promise<TahsilatAnaliz> {
    return request(`/raporlar/tahsilat-analiz/?${ctxParams(params)}`);
  },

  borcYaslandirma(params: { kurum_id: number; sube_id?: number; egitim_yili_id?: number }): Promise<BorcYaslandirma> {
    return request(`/raporlar/borc-yaslandirma/?${ctxParams(params)}`);
  },

  donemRapor(params: { kurum_id: number; sube_id?: number; egitim_yili_id?: number }): Promise<DonemRapor> {
    return request(`/raporlar/donem/?${ctxParams(params)}`);
  },

  export(
    endpoint: RaporExportEndpoint,
    format: RaporExportFormat,
    params: { kurum_id: number; sube_id?: number; egitim_yili_id?: number },
  ): Promise<{ blob: Blob; filename: string }> {
    const qs = buildParams({
      kurum_id: params.kurum_id,
      sube_id: params.sube_id,
      egitim_yili_id: params.egitim_yili_id,
      fmt: format,
    });
    return finansDownload(`/raporlar/${endpoint}/?${qs}`);
  },
};
