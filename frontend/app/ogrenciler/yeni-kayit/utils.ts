import type { WizardData } from "./types";

// Phone formatting helper - (5XX) XXX XX XX format
export function formatPhone(value: string): string {
  // Sadece rakamları al
  const digits = value.replace(/\D/g, "").slice(0, 10);
  
  if (digits.length === 0) return "";
  
  // Format: (5XX) XXX XX XX
  let formatted = "";
  if (digits.length > 0) {
    formatted = "(" + digits.slice(0, Math.min(3, digits.length));
  }
  if (digits.length >= 3) {
    formatted += ") ";
  }
  if (digits.length > 3) {
    formatted += digits.slice(3, Math.min(6, digits.length));
  }
  if (digits.length > 6) {
    formatted += " " + digits.slice(6, Math.min(8, digits.length));
  }
  if (digits.length > 8) {
    formatted += " " + digits.slice(8, 10);
  }
  
  return formatted;
}

// Title case converter for Turkish (her kelime büyük harf ile başlar)
// Kullanıcı yazarken boşlukları korur
export function titleCase(value: string): string {
  // Eğer string boşlukla bitiyorsa, koruyalım
  const endsWithSpace = value.endsWith(" ");
  const words = value.split(" ");
  const formatted = words
    .map((word) => {
      if (!word) return "";
      return word.charAt(0).toLocaleUpperCase("tr") + word.slice(1).toLocaleLowerCase("tr");
    })
    .filter((word, index, arr) => {
      // Son boşluk için boş string'i koru
      if (index === arr.length - 1 && endsWithSpace && word === "") return false;
      return true;
    })
    .join(" ");
  return endsWithSpace ? formatted + " " : formatted;
}

// Address text formatter (her kelime büyük harf ile başlar)
// Kullanıcı yazarken boşlukları korur
export function formatAddress(value: string): string {
  // Eğer string boşlukla bitiyorsa, koruyalım
  const endsWithSpace = value.endsWith(" ");
  const words = value.split(" ");
  const formatted = words
    .map((word) => {
      if (!word) return "";
      return word.charAt(0).toLocaleUpperCase("tr") + word.slice(1).toLocaleLowerCase("tr");
    })
    .filter((word, index, arr) => {
      // Son boşluk için boş string'i koru
      if (index === arr.length - 1 && endsWithSpace && word === "") return false;
      return true;
    })
    .join(" ");
  return endsWithSpace ? formatted + " " : formatted;
}

// TC Kimlik No validation
export function validateTcKimlik(tc: string): boolean {
  if (!/^\d{11}$/.test(tc)) return false;
  if (tc[0] === '0') return false;
  
  const digits = tc.split('').map(Number);
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
  
  const digit10 = (oddSum * 7 - evenSum) % 10;
  const digit11 = (digits.slice(0, 10).reduce((a, b) => a + b, 0)) % 10;
  
  return digits[9] === digit10 && digits[10] === digit11;
}

// Format date for display
export function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('tr-TR');
}

/** Kullanıcının anlamlı veri girip girmediğini kontrol eder (sistem varsayılanları hariç). */
export function hasWizardUserInput(data: WizardData): boolean {
  const { student, enrollment, address, guardians, package: pkg, veliSecimi } = data;

  if (student.kayit_turu != null) return true;
  if (student.tc_kimlik_no.trim()) return true;
  if (student.ad.trim()) return true;
  if (student.soyad.trim()) return true;
  if (student.dogum_tarihi) return true;
  if (student.cinsiyet != null) return true;
  if (student.email.trim()) return true;
  if (student.telefon.trim()) return true;

  if (enrollment.sinif_seviyesi != null) return true;
  if (enrollment.alan != null) return true;
  if (enrollment.ogrenci_no.trim()) return true;
  if (enrollment.geldigi_okul.trim()) return true;
  if (enrollment.referans.trim()) return true;

  if (address.adres_turu != null) return true;
  if (address.posta_kodu.trim()) return true;
  if (address.acik_adres.trim()) return true;
  if (address.ilce_adi?.trim()) return true;

  if (veliSecimi != null) return true;
  if (guardians.length > 0) return true;

  if (pkg.paketler.length > 0) return true;
  if (pkg.ek_hizmet_ids.length > 0) return true;
  if (pkg.deneme_paketi_ids.length > 0) return true;

  return false;
}

// Get age from birth date
export function calculateAge(birthDate: string): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
