"""
Gider Kaydı & Taksit Repository — Veritabanı erişim katmanı
"""
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone
from django.db.models import Sum, Q, F

from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.domain.gider_taksit import GiderTaksit
from apps.finans.constants.gider_types import GiderTaksitDurum


class GiderKaydiRepository:
    """GiderKaydi entity için CRUD operasyonları."""

    @staticmethod
    def get_by_id(gider_id):
        try:
            return GiderKaydi.objects.select_related(
                'cari_hesap', 'gider_kategorisi', 'mali_hesap',
                'odeme_yontemi', 'sube', 'olusturan', 'onaylayan'
            ).prefetch_related(
                'taksitler'
            ).get(pk=gider_id)
        except GiderKaydi.DoesNotExist:
            return None

    @staticmethod
    def get_by_kurum(kurum_id, filtreler=None):
        """
        Kuruma ait gider kayıtlarını filtreli listeler.
        filtreler dict: durum, cari_hesap_id, kategori_id, baslangic, bitis, arama
        """
        qs = GiderKaydi.objects.filter(kurum_id=kurum_id).select_related(
            'cari_hesap', 'gider_kategorisi', 'sube', 'mali_hesap'
        )
        if filtreler:
            if filtreler.get('durum'):
                qs = qs.filter(durum=filtreler['durum'])
            if filtreler.get('cari_hesap_id'):
                qs = qs.filter(cari_hesap_id=filtreler['cari_hesap_id'])
            if filtreler.get('kategori_id'):
                qs = qs.filter(gider_kategorisi_id=filtreler['kategori_id'])
            if filtreler.get('odeme_yontemi_id'):
                qs = qs.filter(odeme_yontemi_id=filtreler['odeme_yontemi_id'])
            if filtreler.get('sube_id'):
                qs = qs.filter(Q(sube_id=filtreler['sube_id']) | Q(sube_id__isnull=True))
            if filtreler.get('baslangic'):
                qs = qs.filter(fatura_tarihi__gte=filtreler['baslangic'])
            if filtreler.get('bitis'):
                qs = qs.filter(fatura_tarihi__lte=filtreler['bitis'])
            if filtreler.get('arama'):
                qs = qs.filter(
                    Q(fatura_no__icontains=filtreler['arama'])
                    | Q(aciklama__icontains=filtreler['arama'])
                    | Q(cari_hesap__unvan__icontains=filtreler['arama'])
                    | Q(gider_kategorisi__ad__icontains=filtreler['arama'])
                )
        return qs

    @staticmethod
    def create(data: dict) -> GiderKaydi:
        return GiderKaydi.objects.create(**data)

    @staticmethod
    def update(gider: GiderKaydi, data: dict) -> GiderKaydi:
        for key, value in data.items():
            setattr(gider, key, value)
        gider.save()
        return gider

    @staticmethod
    def soft_delete(gider: GiderKaydi) -> GiderKaydi:
        gider.silindi_mi = True
        gider.silinme_tarihi = timezone.now()
        gider.save(update_fields=['silindi_mi', 'silinme_tarihi', 'updated_at'])
        return gider

    @staticmethod
    def odenen_toplam_guncelle(gider: GiderKaydi):
        """Gidere ait tüm ödemelerin toplamını yeniden hesaplar."""
        from apps.finans.domain.gider_odeme import GiderOdeme
        from apps.finans.constants.gider_types import OdemeDurum

        toplam = GiderOdeme.objects.filter(
            gider_kaydi=gider,
            durum=OdemeDurum.TAMAMLANDI,
        ).aggregate(toplam=Sum('tutar'))['toplam'] or Decimal('0.00')

        gider.odenen_toplam = toplam
        gider.save(update_fields=['odenen_toplam', 'updated_at'])
        return gider

    @staticmethod
    def ozet_istatistikler(kurum_id, egitim_yili_id=None, sube_id=None):
        """Dashboard için özet istatistikler."""
        qs = GiderKaydi.objects.filter(kurum_id=kurum_id)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        if sube_id:
            qs = qs.filter(Q(sube_id=sube_id) | Q(sube_id__isnull=True))

        taksit_filter = {'gider_kaydi__kurum_id': kurum_id}
        if sube_id:
            taksit_filter['gider_kaydi__sube_id'] = sube_id

        from apps.finans.constants.gider_types import GiderDurum
        return {
            'toplam_gider': qs.exclude(durum=GiderDurum.IPTAL).aggregate(
                t=Sum('net_tutar'))['t'] or Decimal('0.00'),
            'toplam_odenen': qs.exclude(durum=GiderDurum.IPTAL).aggregate(
                t=Sum('odenen_toplam'))['t'] or Decimal('0.00'),
            'bekleyen_sayi': qs.filter(durum=GiderDurum.ONAY_BEKLIYOR).count(),
            'odenmemis_sayi': qs.filter(
                durum__in=[GiderDurum.ONAYLANDI, GiderDurum.KISMI_ODENDI]
            ).count(),
            'geciken_taksit_sayi': GiderTaksit.objects.filter(
                vade_tarihi__lt=timezone.now().date(),
                durum__in=[GiderTaksitDurum.BEKLEMEDE, GiderTaksitDurum.KISMI_ODENDI],
                **taksit_filter,
            ).count(),
            'yaklasan_cek_vade_sayi': GiderTaksitRepository.yaklasan_vadeler(
                kurum_id, gun=14, odeme_yontemi_tipi='cek', sube_id=sube_id,
            ).count(),
        }


class GiderTaksitRepository:
    """GiderTaksit entity için CRUD operasyonları."""

    @staticmethod
    def get_by_id(taksit_id):
        try:
            return GiderTaksit.objects.select_related(
                'gider_kaydi', 'gider_kaydi__cari_hesap'
            ).get(pk=taksit_id)
        except GiderTaksit.DoesNotExist:
            return None

    @staticmethod
    def get_by_gider(gider_id):
        """Bir gider kaydının tüm taksitlerini getirir."""
        return GiderTaksit.objects.filter(gider_kaydi_id=gider_id).select_related(
            'odeme_yontemi', 'gider_kaydi__odeme_yontemi',
        ).order_by('taksit_no')

    @staticmethod
    def toplu_olustur(gider: GiderKaydi, taksit_plani=None):
        """
        Gider kaydının taksit planını oluşturur.
        taksit_plani verilmişse özel plan kullanılır,
        verilmemişse taksit_sayisi adet eşit bölünmüş taksit oluşturulur.
        Kuruş farkı son taksitte ayarlanır.

        taksit_plani formatı:
        [{'taksit_no': 1, 'vade_tarihi': '2026-04-15', 'tutar': '5000.00'}, ...]
        """
        if taksit_plani:
            # Özel taksit planı
            taksitler = []
            for item in taksit_plani:
                from datetime import date as date_type
                vade = item['vade_tarihi']
                if isinstance(vade, str):
                    from datetime import datetime
                    vade = datetime.strptime(vade, '%Y-%m-%d').date()

                taksitler.append(GiderTaksit(
                    gider_kaydi=gider,
                    taksit_no=item['taksit_no'],
                    vade_tarihi=vade,
                    tutar=Decimal(str(item['tutar'])),
                    odenen_tutar=Decimal('0.00'),
                    odeme_yontemi_id=item.get('odeme_yontemi_id') or None,
                    durum=GiderTaksitDurum.BEKLEMEDE,
                ))
            return GiderTaksit.objects.bulk_create(taksitler)

        # Otomatik eşit taksitlendirme
        taksit_sayisi = gider.taksit_sayisi or 1
        birim_tutar = (gider.net_tutar / taksit_sayisi).quantize(Decimal('0.01'))
        taksitler = []

        for i in range(1, taksit_sayisi + 1):
            if i == taksit_sayisi:
                # Son taksit — kalan tutarı al (kuruş farkı düzeltmesi)
                onceki_toplam = birim_tutar * (taksit_sayisi - 1)
                tutar = gider.net_tutar - onceki_toplam
            else:
                tutar = birim_tutar

            vade = gider.vade_tarihi + timedelta(days=30 * (i - 1))

            taksitler.append(GiderTaksit(
                gider_kaydi=gider,
                taksit_no=i,
                vade_tarihi=vade,
                tutar=tutar,
                odenen_tutar=Decimal('0.00'),
                durum=GiderTaksitDurum.BEKLEMEDE,
            ))

        return GiderTaksit.objects.bulk_create(taksitler)

    @staticmethod
    def odenen_tutar_guncelle(taksit: GiderTaksit):
        """Taksitteki ödemelerin toplamını yeniden hesaplar."""
        from apps.finans.domain.gider_odeme import GiderOdeme
        from apps.finans.constants.gider_types import OdemeDurum

        toplam = GiderOdeme.objects.filter(
            gider_taksit=taksit,
            durum=OdemeDurum.TAMAMLANDI,
        ).aggregate(toplam=Sum('tutar'))['toplam'] or Decimal('0.00')

        taksit.odenen_tutar = toplam

        if taksit.odenen_tutar >= taksit.tutar:
            taksit.durum = GiderTaksitDurum.ODENDI
        elif taksit.odenen_tutar > Decimal('0'):
            taksit.durum = GiderTaksitDurum.KISMI_ODENDI
        else:
            taksit.durum = GiderTaksitDurum.BEKLEMEDE

        taksit.save(update_fields=['odenen_tutar', 'durum', 'updated_at'])
        return taksit

    @staticmethod
    def _odenecek_taksit_qs(kurum_id, sube_id=None):
        """Ödemesi yapılabilir, kalan borcu olan taksitler."""
        from apps.finans.constants.gider_types import GiderDurum

        qs = GiderTaksit.objects.filter(
            gider_kaydi__kurum_id=kurum_id,
            gider_kaydi__durum__in=[GiderDurum.ONAYLANDI, GiderDurum.KISMI_ODENDI],
            durum__in=[GiderTaksitDurum.BEKLEMEDE, GiderTaksitDurum.KISMI_ODENDI],
        ).annotate(
            hesap_kalan=F('tutar') - F('odenen_tutar'),
        ).filter(
            hesap_kalan__gt=Decimal('0.00'),
        )
        if sube_id:
            qs = qs.filter(gider_kaydi__sube_id=sube_id)
        return qs.select_related('gider_kaydi', 'gider_kaydi__cari_hesap')

    @staticmethod
    def geciken_taksitler(kurum_id, sube_id=None):
        """Vadesi geçmiş, ödenmemiş taksitleri listeler."""
        return GiderTaksitRepository._odenecek_taksit_qs(kurum_id, sube_id).filter(
            vade_tarihi__lt=timezone.now().date(),
        )

    @staticmethod
    def yaklasan_vadeler(kurum_id, gun=7, odeme_yontemi_tipi=None, sube_id=None):
        """Önümüzdeki N gün içinde vadesi olan taksitler."""
        from apps.finans.constants.payment_types import OdemeYontemiTipi
        bugun = timezone.now().date()
        qs = GiderTaksitRepository._odenecek_taksit_qs(kurum_id, sube_id).filter(
            vade_tarihi__gte=bugun,
            vade_tarihi__lte=bugun + timedelta(days=gun),
        )
        if sube_id:
            qs = qs.select_related(
                'gider_kaydi',
                'gider_kaydi__cari_hesap',
                'gider_kaydi__odeme_yontemi',
            )
        if odeme_yontemi_tipi == OdemeYontemiTipi.CEK:
            qs = qs.filter(gider_kaydi__odeme_yontemi__tip=OdemeYontemiTipi.CEK)
        elif odeme_yontemi_tipi:
            qs = qs.filter(gider_kaydi__odeme_yontemi__tip=odeme_yontemi_tipi)
        return qs
