import { apiGet } from '@/lib/api';

export interface KutuphaneStudentOption {
  id: number;
  ad: string;
  soyad: string;
  tam_ad: string;
  sinif_ad?: string;
  profil_foto?: string | null;
}

/** Kurum geneli öğrenci araması (masa/dolap ataması). */
export async function searchKutuphaneStudents(
  query: string,
  _coachMode = false,
): Promise<KutuphaneStudentOption[]> {
  if (query.trim().length < 2) return [];

  const res = await apiGet<{ ogrenciler?: KutuphaneStudentOption[] } | KutuphaneStudentOption[]>(
    `/ogrenciler/api/list/?q=${encodeURIComponent(query)}`,
  );
  if (res.success && res.data) {
    const list = Array.isArray(res.data)
      ? res.data
      : res.data.ogrenciler || [];
    return Array.isArray(list) ? list.slice(0, 10) : [];
  }
  return [];
}

/** İzinler — koç modunda da kurum geneli arama. */
export async function searchKutuphaneStudentsForIzin(
  query: string,
  _coachMode = false,
): Promise<KutuphaneStudentOption[]> {
  if (query.trim().length < 2) return [];

  const res = await apiGet<{ ogrenciler?: KutuphaneStudentOption[] } | KutuphaneStudentOption[]>(
    `/ogrenciler/api/search/?q=${encodeURIComponent(query)}`,
  );
  if (res.success && res.data) {
    const list = Array.isArray(res.data)
      ? res.data
      : (res.data as { ogrenciler?: KutuphaneStudentOption[] }).ogrenciler || res.data;
    return Array.isArray(list) ? list.slice(0, 10) : [];
  }
  return [];
}
