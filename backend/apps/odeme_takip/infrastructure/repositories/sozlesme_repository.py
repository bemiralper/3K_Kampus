"""
Sözleşme Repository
Veritabanı erişim katmanı — Sözleşme, SozlesmeKalemi, SozlesmeIndirimi, SozlesmeGecmisi
"""
from django.db.models import Q, Sum, Count, F
from apps.odeme_takip.domain.models import (
    Sozlesme, SozlesmeKalemi, SozlesmeIndirimi, SozlesmeGecmisi,
    IndirimTuru,
)
from apps.odeme_takip.domain.enums import SozlesmeDurum, OnayDurum, TahsilatDurum, TahsilatTuru


class SozlesmeRepository:
    """Sözleşme veritabanı işlemleri"""

    def get_all(self, kurum_id=None, sube_id=None, egitim_yili_id=None, durum=None, ogrenci_id=None):
        qs = Sozlesme.objects.select_related(
            'ogrenci', 'egitim_yili', 'kurum', 'sube', 'olusturan',
            'veli', 'odeme_yontemi', 'mali_hesap',
        ).prefetch_related('kalemler', 'indirimler', 'taksitler')

        if kurum_id:
            qs = qs.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        if durum:
            qs = qs.filter(durum=durum)
        if ogrenci_id:
            qs = qs.filter(ogrenci_id=ogrenci_id)
        return qs.order_by('-created_at')

    def get_by_id(self, id):
        try:
            return Sozlesme.objects.select_related(
                'ogrenci', 'egitim_yili', 'kurum', 'sube', 'olusturan',
                'veli', 'odeme_yontemi', 'mali_hesap',
            ).prefetch_related(
                'kalemler',
                'indirimler__indirim_turu',
                'indirimler__olusturan',
                'indirimler__onaylayan',
                'taksitler__tahsilatlar__odeme_yontemi',
                'gecmis__islem_yapan',
            ).get(id=id)
        except Sozlesme.DoesNotExist:
            return None

    def get_by_sozlesme_no(self, sozlesme_no):
        try:
            return Sozlesme.objects.get(sozlesme_no=sozlesme_no)
        except Sozlesme.DoesNotExist:
            return None

    def get_by_ogrenci(self, ogrenci_id, egitim_yili_id=None):
        qs = Sozlesme.objects.select_related(
            'egitim_yili'
        ).filter(ogrenci_id=ogrenci_id)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        return qs

    def create(self, data):
        return Sozlesme.objects.create(**data)

    def update(self, sozlesme, data):
        for key, value in data.items():
            setattr(sozlesme, key, value)
        sozlesme.save()
        return sozlesme

    def delete(self, sozlesme):
        """Sözleşmeyi ve tüm ilişkili kayıtları siler (CASCADE)"""
        sozlesme.delete()

    def get_son_sira_no(self, egitim_yili):
        """Dönem bazlı son sözleşme sıra numarasını bul"""
        prefix = f"SZL-{str(egitim_yili.baslangic_yil)[-2:]}{str(egitim_yili.bitis_yil)[-2:]}-"
        son = Sozlesme.objects.filter(
            sozlesme_no__startswith=prefix
        ).order_by('-sozlesme_no').first()

        if son:
            try:
                return int(son.sozlesme_no.split('-')[-1])
            except (ValueError, IndexError):
                pass
        return 0

    def get_ozet_istatistikler(self, kurum_id, sube_id, egitim_yili_id):
        """Dashboard özet istatistikleri"""
        base_qs = Sozlesme.objects.filter(
            kurum_id=kurum_id, sube_id=sube_id, egitim_yili_id=egitim_yili_id
        ).exclude(durum__in=[SozlesmeDurum.TASLAK, SozlesmeDurum.IPTAL])

        toplam_hacim = base_qs.aggregate(t=Sum('net_tutar'))['t'] or 0
        sozlesme_sayisi = base_qs.count()

        from apps.odeme_takip.domain.models import Tahsilat
        toplam_tahsilat = Tahsilat.objects.filter(
            sozlesme__in=base_qs,
            durum=TahsilatDurum.AKTIF,
        ).exclude(
            tahsilat_turu=TahsilatTuru.IADE
        ).aggregate(t=Sum('tutar'))['t'] or 0

        toplam_indirim = base_qs.aggregate(t=Sum('toplam_indirim_tutari'))['t'] or 0

        return {
            'sozlesme_sayisi': sozlesme_sayisi,
            'toplam_hacim': toplam_hacim,
            'toplam_tahsilat': toplam_tahsilat,
            'acik_alacak': toplam_hacim - toplam_tahsilat,
            'toplam_indirim': toplam_indirim,
        }


class SozlesmeKalemiRepository:

    def create(self, data):
        return SozlesmeKalemi.objects.create(**data)

    def get_by_sozlesme(self, sozlesme_id):
        return SozlesmeKalemi.objects.filter(sozlesme_id=sozlesme_id)

    def delete_by_sozlesme(self, sozlesme_id):
        SozlesmeKalemi.objects.filter(sozlesme_id=sozlesme_id).delete()


class SozlesmeIndirimiRepository:

    def create(self, data):
        return SozlesmeIndirimi.objects.create(**data)

    def get_by_sozlesme(self, sozlesme_id):
        return SozlesmeIndirimi.objects.filter(
            sozlesme_id=sozlesme_id
        ).select_related('indirim_turu', 'olusturan', 'onaylayan')

    def get_by_id(self, id):
        try:
            return SozlesmeIndirimi.objects.select_related(
                'sozlesme', 'indirim_turu'
            ).get(id=id)
        except SozlesmeIndirimi.DoesNotExist:
            return None

    def get_onaylanan_toplam(self, sozlesme_id):
        """Sadece onaylanmış indirimlerin toplam tutarı"""
        return SozlesmeIndirimi.objects.filter(
            sozlesme_id=sozlesme_id,
            onay_durumu=OnayDurum.ONAYLANDI
        ).aggregate(t=Sum('indirim_tutari'))['t'] or 0


class SozlesmeGecmisiRepository:

    def create(self, data):
        return SozlesmeGecmisi.objects.create(**data)

    def get_by_sozlesme(self, sozlesme_id):
        return SozlesmeGecmisi.objects.filter(
            sozlesme_id=sozlesme_id
        ).select_related('islem_yapan').order_by('-created_at')


class ParametrikRepository:
    """IndirimTuru parametrik tablo + finans OdemeYontemi proxy"""

    def get_odeme_yontemleri(self, kurum_id=None, mali_hesap_id=None, sube_id=None):
        """
        Finans modülündeki OdemeYontemi'leri getir (eski odeme_sekilleri yerine).

        mali_hesap_id verilirse o hesaba ait yöntemler + hesap tipine uygun plan kanonik
        kanallar (Nakit/Havale/POS) + kurum geneli çek/senet döner.
        sube_id verilirse aktif şubedeki mali hesaplar + kurum geneli çek/senet döner.
        """
        from django.db.models import Q
        from apps.finans.domain.payment_method import OdemeYontemi

        qs = OdemeYontemi.objects.filter(aktif_mi=True, silindi_mi=False)
        if kurum_id:
            qs = qs.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(
                Q(mali_hesap__sube_id=sube_id)
                | Q(mali_hesap__isnull=True),
            )
        if mali_hesap_id:
            from apps.finans.application.odeme_yontemi_plan_helpers import (
                filter_odeme_yontemleri_for_mali_hesap,
            )
            qs = filter_odeme_yontemleri_for_mali_hesap(
                qs, mali_hesap_id, kurum_id=kurum_id,
            )
        return qs.order_by('siralama', 'ad')

    def get_odeme_yontemleri_for_plan(self, kurum_id=None, sube_id=None):
        """Sözleşme/taksit planı — tip başına tek kanal (banka ayrımı yok)."""
        from apps.finans.application.odeme_yontemi_plan_helpers import (
            dedupe_odeme_yontemleri_for_plan,
            ensure_kurum_plan_odeme_yontemleri,
        )

        if kurum_id:
            ensure_kurum_plan_odeme_yontemleri(int(kurum_id))
        qs = self.get_odeme_yontemleri(kurum_id=kurum_id, sube_id=sube_id)
        return dedupe_odeme_yontemleri_for_plan(qs)

    def get_indirim_turleri(self, kurum_id=None, sube_id=None):
        qs = IndirimTuru.objects.filter(aktif_mi=True)
        if kurum_id:
            qs = qs.filter(Q(kurum_id=kurum_id) | Q(kurum__isnull=True))
        if sube_id:
            qs = qs.filter(Q(sube_id=sube_id) | Q(sube__isnull=True))
        return qs
