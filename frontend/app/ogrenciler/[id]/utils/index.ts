// Öğrenci detay sayfası yardımcı fonksiyonları

// Avatar gradient colors
export function getAvatarGradient(name: string): string {
  const gradients = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
    'linear-gradient(135deg, #8E2DE2 0%, #4A00E0 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)',
    'linear-gradient(135deg, #00C9FF 0%, #92FE9D 100%)',
  ];
  const index = name.charCodeAt(0) % gradients.length;
  return gradients[index];
}

// Get initials from name
export function getInitials(ad: string, soyad: string): string {
  return `${ad.charAt(0)}${soyad.charAt(0)}`.toUpperCase();
}

// Calculate age from birth date (DD.MM.YYYY format)
export function calculateAge(birthDate: string): number | null {
  if (!birthDate) return null;
  const parts = birthDate.split('.');
  if (parts.length !== 3) return null;
  const birth = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

// Format phone number for WhatsApp link
export function formatWhatsAppLink(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  const withCountry = cleaned.startsWith('90') ? cleaned : `90${cleaned}`;
  return `https://wa.me/${withCountry}`;
}

// Format phone number for display (0XXX XXX XX XX)
export function formatPhoneDisplay(phone: string): string {
  if (!phone) return '-';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `0${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6, 8)} ${cleaned.slice(8)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7, 9)} ${cleaned.slice(9)}`;
  }
  return phone;
}
