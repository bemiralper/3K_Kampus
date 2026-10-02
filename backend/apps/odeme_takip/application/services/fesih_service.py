"""
Fesih Service
Sözleşme fesih hesaplama ve uygulama

Integer-Only: Tüm parasal hesaplamalar tam sayı aritmetiğiyle yapılır.
Decimal KULLANILMAZ.
"""
import re
from datetime import date
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation

from django.db import transaction
from django.utils import timezone

from apps.odeme_takip.domain.models import (
    Sozlesme, SozlesmeFesih, SozlesmeGecmisi, Taksit,
)
from apps.odeme_takip.domain.enums import (
    SozlesmeDurum, TaksitDurum, TahsilatDurum, TahsilatTuru,
    FesihNedeni, GecmisIslemTuru,
)
from apps.odeme_takip.infrastructure.repositories.sozlesme_repository import (
    SozlesmeRepository, SozlesmeGecmisiRepository,
)


def indirimsiz_tutar(sozlesme) -> int:
    """İndirim düşülmeden önceki sözleşme bedeli (brüt)."""
    brut = int(getattr(sozlesme, 'brut_tutar', 0) or 0)
    if brut <= 0:
        kalemler = getattr(sozlesme, 'kalemler', None)
        if kalemler is not None:
            brut = int(sum(int(k.brut_tutar or 0) for k in kalemler.all()))
    if brut <= 0:
        brut = int(getattr(sozlesme, 'net_tutar', 0) or 0) + int(getattr(sozlesme, 'toplam_indirim_tutari', 0) or 0)
    return max(0, brut)


def onerilen_kullanilan_bedel(indirimsiz: int, toplam_gun: int, kullanilan_gun: int) -> int:
    """İndirimsiz bedelin, başlangıçtan fesih gününe kadarki payı."""
    if toplam_gun <= 0 or indirimsiz <= 0:
        return 0
    return int(round(indirimsiz * kullanilan_gun / toplam_gun))


def _manuel_tutar(value):
    if value is None or value == '':
        return None
    try:
        return max(0, int(round(float(value))))
    except (TypeError, ValueError):
        return None


_MALZEME_KALEMLERI = {'yayin', 'ek_hizmet', 'ek_hizmet_satisi'}


def kesinti_tutari_oku(value) -> int:
    """Kesinti tutarını tam sayıya çevirir. 2.500 ve 2.500,50 kabul edilir."""
    if value is None or isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        try:
            return max(0, int(Decimal(str(value)).quantize(Decimal('1'), rounding=ROUND_HALF_UP)))
        except (InvalidOperation, ValueError):
            return 0
    text = str(value).strip().replace('₺', '').replace('TL', '').replace(' ', '')
    if not text:
        return 0
    if ',' in text and '.' in text:
        text = text.replace('.', '').replace(',', '.')
    elif ',' in text:
        text = text.replace(',', '.')
    elif re.fullmatch(r'\d{1,3}(\.\d{3})+', text):
        text = text.replace('.', '')
    try:
        return max(0, int(Decimal(text).quantize(Decimal('1'), rounding=ROUND_HALF_UP)))
    except (InvalidOperation, ValueError):
        return 0


def normalize_kesintiler(kesintiler):
    """[{"ad", "tutar"}] listesini temizler. Bozuk satır hesabı düşürmez."""
    if not isinstance(kesintiler, list):
        return []
    temiz = []
    for kalem in kesintiler:
        if not isinstance(kalem, dict):
            continue
        ad = str(kalem.get('ad') or '').strip()
        tutar = kesinti_tutari_oku(kalem.get('tutar'))
        if not ad or tutar <= 0:
            continue
        temiz.append({'ad': ad, 'tutar': tutar})
    return temiz


def kesinti_kalemlerini_birlestir(satirlar):
    """Aynı addan ilk satır kalır. Tutar indirimsiz tam sayıdır."""
    sonuc = []
    gorulen = set()
    for ad, tutar in satirlar:
        name = str(ad or '').strip()
        if not name:
            continue
        anahtar = name.casefold()
        if anahtar in gorulen:
            continue
        gorulen.add(anahtar)
        sonuc.append({'ad': name, 'tutar': max(0, int(tutar or 0))})
    return sonuc


def _fesih_ust_paketler(sozlesme):
    """Sözleşmenin grup, premium ve deneme paketleri."""
    from apps.egitim_paketleri.models import Deneme, GrupDersi, PremiumPaket

    modeller = {
        'grup_dersi': GrupDersi,
        'premium': PremiumPaket,
        'deneme': Deneme,
    }
    adaylar = []
    if getattr(sozlesme, 'paket_id', None) and getattr(sozlesme, 'paket_turu', None):
        adaylar.append((sozlesme.paket_turu, sozlesme.paket_id))
    kalemler = getattr(sozlesme, 'kalemler', None)
    if kalemler is not None:
        for kalem in kalemler.all():
            tur = kalem.kalem_turu or ''
            if tur == 'paket' and sozlesme.paket_id == kalem.kalem_id:
                tur = sozlesme.paket_turu or ''
            if tur in modeller and kalem.kalem_id:
                adaylar.append((tur, kalem.kalem_id))
    gorulen = set()
    for tur, paket_id in adaylar:
        anahtar = (tur, paket_id)
        if anahtar in gorulen:
            continue
        gorulen.add(anahtar)
        paket = modeller[tur].objects.filter(id=paket_id).first()
        if paket is not None:
            yield paket


def kesinti_onerileri(sozlesme):
    """
    Fesihte düşülebilecek kitap, yayın ve ek hizmetler.
    Bedel indirimsizdir: sözleşmedeki brüt, yoksa paketin liste fiyatı.
    """
    satirlar = []
    kalemler = getattr(sozlesme, 'kalemler', None)
    if kalemler is not None:
        for kalem in kalemler.all():
            if (kalem.kalem_turu or '') in _MALZEME_KALEMLERI:
                satirlar.append((kalem.kalem_adi, int(kalem.brut_tutar or 0)))
    for paket in _fesih_ust_paketler(sozlesme):
        yayinlar = getattr(paket, 'dahil_yayin_paketleri', None)
        if yayinlar is not None:
            for yayin in yayinlar.all():
                satirlar.append((yayin.ad, int(getattr(yayin, 'brut_fiyat', 0) or 0)))
        hizmetler = getattr(paket, 'dahil_ek_hizmetler', None)
        if hizmetler is not None:
            for hizmet in hizmetler.all():
                satirlar.append((hizmet.ad, int(getattr(hizmet, 'brut_fiyat', 0) or 0)))
    return kesinti_kalemlerini_birlestir(satirlar)


class FesihService:

    def __init__(self):
        self.repo = SozlesmeRepository()
        self.gecmis_repo = SozlesmeGecmisiRepository()

    def get_fesih_detay(self, sozlesme_id):
        """Sözleşmenin fesih kaydı. Yoksa None."""
        return (
            SozlesmeFesih.objects
            .select_related('sozlesme', 'sozlesme__ogrenci', 'fesih_eden')
            .prefetch_related('sozlesme__kalemler')
            .filter(sozlesme_id=sozlesme_id)
            .first()
        )

    def hesapla_onizleme(self, sozlesme_id, fesih_tarihi, fesih_nedeni=None, kesintiler=None, ceza_orani=0, kullanilan_tutar=None):
        """
        Fesih ön izleme hesabı — kayıt YAPMAZ, sadece hesaplar.
        Tüm tutarlar Integer (TL).
        """
        sozlesme = self.repo.get_by_id(sozlesme_id)
        if not sozlesme:
            return None, {'error': 'Sözleşme bulunamadı'}

        if sozlesme.durum != SozlesmeDurum.AKTIF:
            return None, {'error': 'Sadece aktif sözleşmeler feshedilebilir'}

        net_tutar = int(sozlesme.net_tutar or 0)
        baz_tutar = indirimsiz_tutar(sozlesme)

        # Toplam ödenen
        toplam_odenen = sozlesme.tahsilatlar.filter(
            durum=TahsilatDurum.AKTIF
        ).exclude(
            tahsilat_turu=TahsilatTuru.IADE
        ).aggregate(
            toplam=__import__('django').db.models.Sum('tutar')
        )['toplam'] or 0
        toplam_odenen = int(toplam_odenen)

        # Gün hesabı
        if isinstance(fesih_tarihi, str):
            fesih_tarihi = date.fromisoformat(fesih_tarihi)

        toplam_gun = (sozlesme.bitis_tarihi - sozlesme.baslangic_tarihi).days
        kullanilan_gun = max(0, (fesih_tarihi - sozlesme.baslangic_tarihi).days)

        # Kullanılan tutar — indirimsiz bedelin gün payı. Elle verilen tutar bunu ezer.
        onerilen = onerilen_kullanilan_bedel(baz_tutar, toplam_gun, kullanilan_gun)
        manuel = _manuel_tutar(kullanilan_tutar)
        kullanilan_tutar = onerilen if manuel is None else manuel

        # Kesintiler — kitap, materyal, üniforma. Tutar elle verilmiş tam sayıdır.
        kesintiler = normalize_kesintiler(kesintiler)
        kesinti_tutari = sum(k['tutar'] for k in kesintiler)

        # Ceza
        ceza_orani = int(ceza_orani)
        ceza_tutari = round(net_tutar * ceza_orani / 100)

        # İade tutarı
        iade_tutari = toplam_odenen - kullanilan_tutar - kesinti_tutari - ceza_tutari

        # İptal edilecek taksitler
        from django.db.models import Sum
        bekleyen_taksitler = Taksit.objects.filter(
            sozlesme=sozlesme,
            durum__in=[TaksitDurum.BEKLEMEDE, TaksitDurum.GECIKTI],
        )
        iptal_edilecek_taksit_sayisi = bekleyen_taksitler.count()
        iptal_edilecek_taksit_tutar = int(
            bekleyen_taksitler.aggregate(t=Sum('tutar'))['t'] or 0
        )

        # iade_mi_borc_mu: frontend'in beklediği format
        if iade_tutari > 0:
            iade_mi_borc_mu = 'iade'
        elif iade_tutari < 0:
            iade_mi_borc_mu = 'borc'
        else:
            iade_mi_borc_mu = 'sifir'

        return {
            'sozlesme_id': sozlesme.id,
            'sozlesme_no': sozlesme.sozlesme_no,
            'ogrenci_adi': f'{sozlesme.ogrenci.ad} {sozlesme.ogrenci.soyad}' if sozlesme.ogrenci else '',
            'fesih_tarihi': str(fesih_tarihi),
            'sozlesme_net_tutar': net_tutar,
            'net_tutar': net_tutar,
            'indirimsiz_tutar': baz_tutar,
            'onerilen_kullanilan_tutar': onerilen,
            'kullanilan_tutar_manuel': manuel is not None,
            'toplam_odenen': toplam_odenen,
            'toplam_gun': toplam_gun,
            'kullanilan_gun': kullanilan_gun,
            'kullanilan_tutar': kullanilan_tutar,
            'kesintiler': kesintiler,
            'kesinti_tutari': kesinti_tutari,
            'ceza_orani': ceza_orani,
            'ceza_tutari': ceza_tutari,
            'iade_tutari': iade_tutari,
            'iade_yonu': 'kurum_ogrenciye' if iade_tutari > 0 else 'ogrenci_borcu' if iade_tutari < 0 else 'denk',
            'iade_mi_borc_mu': iade_mi_borc_mu,
            'iptal_edilecek_taksit_sayisi': iptal_edilecek_taksit_sayisi,
            'iptal_edilecek_taksit_tutar': iptal_edilecek_taksit_tutar,
        }, None

    @transaction.atomic
    def fesih_uygula(self, sozlesme_id, fesih_tarihi, fesih_nedeni,
                     fesih_aciklama='', kesintiler=None, ceza_orani=0,
                     kullanilan_tutar=None, user=None):
        """Fesih işlemini uygula — Integer-Only, atomic transaction."""
        sozlesme = self.repo.get_by_id(sozlesme_id)
        if not sozlesme:
            return None, {'error': 'Sözleşme bulunamadı'}

        if sozlesme.durum != SozlesmeDurum.AKTIF:
            return None, {'error': 'Sadece aktif sözleşmeler feshedilebilir'}

        # Aynı sözleşme için zaten fesih kaydı varsa engelle
        if SozlesmeFesih.objects.filter(sozlesme=sozlesme).exists():
            return None, {'error': 'Bu sözleşme için zaten bir fesih kaydı mevcut'}

        # Ön hesaplama yap
        onizleme, err = self.hesapla_onizleme(
            sozlesme_id, fesih_tarihi, fesih_nedeni, kesintiler, ceza_orani,
            kullanilan_tutar=kullanilan_tutar,
        )
        if err:
            return None, err

        if isinstance(fesih_tarihi, str):
            fesih_tarihi = date.fromisoformat(fesih_tarihi)

        # Fesih kaydı oluştur
        fesih = SozlesmeFesih.objects.create(
            sozlesme=sozlesme,
            fesih_tarihi=fesih_tarihi,
            fesih_nedeni=fesih_nedeni,
            fesih_aciklama=fesih_aciklama,
            sozlesme_net_tutar=onizleme['net_tutar'],
            toplam_odenen=onizleme['toplam_odenen'],
            kullanilan_gun=onizleme['kullanilan_gun'],
            toplam_gun=onizleme['toplam_gun'],
            kullanilan_tutar=onizleme['kullanilan_tutar'],
            kesintiler=onizleme['kesintiler'],
            kesinti_tutari=onizleme['kesinti_tutari'],
            ceza_orani=onizleme['ceza_orani'],
            ceza_tutari=onizleme['ceza_tutari'],
            iade_tutari=onizleme['iade_tutari'],
            fesih_eden=user,
        )
        fesih.hesapla()
        fesih.save()

        # Bekleyen taksitleri iptal et
        iptal_sayisi = Taksit.objects.filter(
            sozlesme=sozlesme,
            durum__in=[TaksitDurum.BEKLEMEDE, TaksitDurum.GECIKTI],
        ).update(durum=TaksitDurum.IPTAL)

        fesih.iptal_edilen_taksit_sayisi = iptal_sayisi
        fesih.save(update_fields=['iptal_edilen_taksit_sayisi'])

        # Sözleşme durumunu değiştir
        sozlesme.durum = SozlesmeDurum.FESHEDILMIS
        sozlesme.save(update_fields=['durum', 'updated_at'])

        # Audit log
        self.gecmis_repo.create({
            'sozlesme': sozlesme,
            'islem_turu': GecmisIslemTuru.FESIH,
            'yeni_deger': {
                'fesih_tarihi': str(fesih_tarihi),
                'fesih_nedeni': fesih_nedeni,
                'iade_tutari': fesih.iade_tutari,
                'iptal_taksit': iptal_sayisi,
            },
            'aciklama': f'Sözleşme feshedildi. İade: {fesih.iade_tutari} TL',
            'islem_yapan': user,
        })

        return fesih, None
