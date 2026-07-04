/** Çek/senet durum ve terim açıklamaları — sade Türkçe. */

export type DurumHelp = { baslik: string; aciklama: string };

export const DURUM_HELP: Record<string, DurumHelp> = {
  bekliyor: {
    baslik: "Bekleniyor",
    aciklama:
      "Sözleşme planından kayıt oluştu. Veli henüz çek veya senedi teslim etmedi; numara ve banka bilgisi henüz girilmedi.",
  },
  portfoyde: {
    baslik: "Portföyde",
    aciklama:
      "Çek veya senet kurumunuzdadır (kasada veya evrak dosyasında). Henüz bankaya verilmedi; parası hesaba geçmedi.",
  },
  tahsilde: {
    baslik: "Tahsilde",
    aciklama:
      "Belge bankaya verildi. Vade gününde paranın hesaba geçmesi bekleniyor.",
  },
  tahsil_edildi: {
    baslik: "Tahsil edildi",
    aciklama: "Para banka veya kasa hesabınıza geçti. Alınan çek/senet işlemi tamamlandı.",
  },
  tahsil: {
    baslik: "Tahsil edildi",
    aciklama: "Para hesaba geçti (eski kayıt etiketi).",
  },
  iade: {
    baslik: "İade",
    aciklama: "Belge veliye veya cariye geri verildi; tahsil edilmeyecek.",
  },
  karsiliksiz: {
    baslik: "Karşılıksız",
    aciklama:
      "Banka ödeme yapmadı (hesapta yeterli bakiye yok veya belge geçersiz). Takip gerekir.",
  },
  iptal: {
    baslik: "İptal",
    aciklama: "Kayıt geçersiz sayıldı; tahsilat veya ödeme yapılmayacak.",
  },
  hazirlandi: {
    baslik: "Hazırlandı",
    aciklama: "Kurumun kestiği çek/senet düzenlendi; henüz cariye veya alacaklıya verilmedi.",
  },
  verildi: {
    baslik: "Verildi",
    aciklama: "Kurumun kestiği çek/senet alacaklıya (tedarikçi vb.) teslim edildi; vade günü ödenecek.",
  },
  odendi: {
    baslik: "Ödendi",
    aciklama: "Kurumun verdiği çek/senet için para bankadan çıktı; borç kapandı.",
  },
};

export const GECIS_HELP: Record<string, string> = {
  portfoyde: "Belge elinize ulaştı. Numara, banka ve keşide eden bilgilerini girip portföye alın.",
  tahsilde: "Vade geldiğinde bankaya götürmek üzere bu adımı seçin.",
  tahsil_edildi: "Para hesaba geçtiğinde tahsilatı tamamlayın; kasa/banka hesabı seçmeniz gerekir.",
  iade: "Belge veliye veya cariye iade edilecekse seçin.",
  karsiliksiz: "Banka ödeme yapmadıysa karşılıksız olarak işaretleyin.",
  iptal: "Kayıt artık geçerli değilse iptal edin.",
  hazirlandi: "Verilecek çek/senet bilgileri girildi; henüz teslim edilmedi.",
  verildi: "Çek/senet alacaklıya fiziken teslim edildi.",
  odendi: "Bankadan para çıktı; ödeme tamamlandı.",
};

export const TERIM_HELP = {
  keside_eden: "Çeki veya senedi düzenleyen / imzalayan kişi. Alınan çeklerde genellikle veli.",
  tahsilat_hesabi: "Paranın gireceği kurum hesabı (banka veya kasa). Tahsil edildiğinde zorunludur.",
  odeme_hesabi: "Paranın çıkacağı kurum hesabı (banka veya kasa). Verilen çek ödendiğinde zorunludur.",
  alinan: "Veliden veya cariden alınan çek/senetler — size ödeme yapılacak.",
  verilen: "Kurumun kestiği çek/senetler — siz birine ödeme yapacaksınız.",
} as const;

export function getDurumHelp(durum: string): DurumHelp {
  return (
    DURUM_HELP[durum] ?? {
      baslik: durum,
      aciklama: "Bu durum için açıklama tanımlanmamış.",
    }
  );
}

export function getGecisHelp(durum: string): string {
  return GECIS_HELP[durum] ?? "Bu adıma geçildiğinde kayıt durumu güncellenir.";
}
