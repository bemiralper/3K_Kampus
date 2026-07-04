import { cookies } from "next/headers";
import { fetchJson } from "@/lib/fetchJson";
import KurumYonetimiClient, { type KurumResponse } from "./KurumYonetimiClient";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type ApiResponse = {
  success: boolean;
  data: KurumResponse;
};

export default async function KurumYonetimiPage() {
  const cookieHeader = cookies().toString();
  const result = await fetchJson<ApiResponse>(
    `${BACKEND_URL}/kurum-yonetimi/api/legacy/kurumlar/`,
    {
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
      cache: "no-store",
    }
  );

  const data = (result.data?.data ?? {}) as KurumResponse;

  return <KurumYonetimiClient initialData={data} />;
}
