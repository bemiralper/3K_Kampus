import { apiGet, apiPatch, apiPost, type ApiResponse } from "@/lib/api";

export type CoachMeProfile = {
  id: number;
  teacher_id: number;
  teacher_full_name: string;
  teacher_fotograf: string | null;
  capacity: number;
  is_active: boolean;
  is_coach: boolean;
  current_student_count: number;
  available_capacity: number;
  telefon: string;
  cep_telefon: string;
  email: string;
};

export type CoachMeUpdatePayload = {
  telefon?: string;
  cep_telefon?: string;
  email?: string;
};

export type CoachPeriodCount = {
  toplam: number;
  bu_hafta: number;
  bu_ay: number;
};

export type CoachSelfStats = {
  ogrenciler: {
    aktif_ogrenci: number;
    kapasite: number;
    bos_kapasite: number;
    riskli_ogrenci: number;
    gorusme_bekleyen: number;
  };
  odevler: {
    verilen: CoachPeriodCount;
    tamamlanan: number;
    devam_eden: number;
    geciken: number;
    bekleyen_kontrol: number;
  };
  gorusmeler: {
    ogrenci: CoachPeriodCount;
    veli: CoachPeriodCount;
    tamamlanan_toplam: number;
    bugun_planli: number;
  };
  gorevler: {
    bekleyen: number;
    bugun: number;
    geciken: number;
    tamamlanan: number;
    tamamlanamayan: number;
  };
};

export type ChangePasswordPayload = {
  current_password: string;
  new_password: string;
  new_password_confirm: string;
};

export async function fetchCoachMe(): Promise<ApiResponse<CoachMeProfile>> {
  return apiGet<CoachMeProfile>("/api/coaching/coaches/me/");
}

export async function updateCoachMe(
  payload: CoachMeUpdatePayload,
): Promise<ApiResponse<CoachMeProfile>> {
  return apiPatch<CoachMeProfile>("/api/coaching/coaches/me/", payload);
}

export async function fetchCoachMeStats(): Promise<ApiResponse<CoachSelfStats>> {
  return apiGet<CoachSelfStats>("/api/coaching/coaches/me/stats/");
}

export async function changePassword(
  payload: ChangePasswordPayload,
): Promise<ApiResponse<{ message?: string }>> {
  return apiPost<{ message?: string }>("/auth/api/change-password/", payload);
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export async function uploadCoachPhoto(
  personelId: number,
  file: File,
): Promise<{ success: boolean; fotograf_url?: string; error?: string }> {
  const formData = new FormData();
  formData.append("fotograf", file);

  const response = await fetch(`${BACKEND_URL}/personel/api/${personelId}/upload-foto/`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  return response.json();
}

export async function deleteCoachPhoto(
  personelId: number,
): Promise<{ success: boolean; error?: string }> {
  const response = await fetch(`${BACKEND_URL}/personel/api/${personelId}/delete-foto/`, {
    method: "DELETE",
    credentials: "include",
  });

  return response.json();
}
