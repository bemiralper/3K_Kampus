"""Tek deneme satış izleri eğitim sözleşmesi değildir.

Eski kayıtları silmeden sözleşme ekranları ve alacak raporlarından ayırır.
Deneme kulübü/paketi sözleşmeleri bu kapsamda kalır; yalnız satış izi ayrılır.
"""
DENEME_SATIS_MARKER = 'gunu_birlik_deneme_ucreti'


def egitim_sozlesmeleri(queryset):
    return queryset.exclude(notlar__contains=DENEME_SATIS_MARKER)
