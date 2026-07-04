"""
Fesih Service
Sözleşme fesih hesaplama ve uygulama

Integer-Only: Tüm parasal hesaplamalar tam sayı aritmetiğiyle yapılır.
Decimal KULLANILMAZ.
"""
from datetime import date
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


class FesihService:

    def __init__(self):
        self.repo = SozlesmeRepository()
        self.gecmis_repo = SozlesmeGecmisiRepository()

    def hesapla_onizleme(self, sozlesme_id, fesih_tarihi, fesih_nedeni=None, kesintiler=None, ceza_orani=0):
        """
        Fesih ön izleme hesabı — kayıt YAPMAZ, sadece hesaplar.
        Tüm tutarlar Integer (TL).
        """
        sozlesme = self.repo.get_by_id(sozlesme_id)
        if not sozlesme:
            return None, {'error': 'Sözleşme bulunamadı'}

        if sozlesme.durum != SozlesmeDurum.AKTIF:
            return None, {'error': 'Sadece aktif sözleşmeler feshedilebilir'}

        net_tutar = sozlesme.net_tutar

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

        # Kullanılan tutar — orantısal
        if toplam_gun > 0:
            kullanilan_tutar = round(net_tutar * kullanilan_gun / toplam_gun)
        else:
            kullanilan_tutar = 0

        # Kesintiler
        kesintiler = kesintiler or []
        kesinti_tutari = sum(int(k.get('tutar', 0)) for k in kesintiler)

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
                     fesih_aciklama='', kesintiler=None, ceza_orani=0, user=None):
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
            sozlesme_id, fesih_tarihi, fesih_nedeni, kesintiler, ceza_orani
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
