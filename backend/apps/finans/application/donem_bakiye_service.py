"""
Dönem Bakiye Service
İş mantığı katmanı — dönem açma, kapama ve devir işlemleri.

KRİTİK İŞ KURALLARI:
1. Dönem açılışı: Sube'deki tüm aktif mali hesaplar için DonemBakiye oluşturulur
2. Dönem kapanışı: Hareketlerden toplam gelir/gider hesaplanır, bakiye kesinleşir
3. Dönem devri: Eski dönem kapanır → bakiye devir tutarı olarak yeni döneme aktarılır
4. Devir işlemi geri alınamaz
5. Bir mali hesabın aynı eğitim yılında birden fazla DonemBakiye'si olamaz
"""
from django.db import transaction
from django.utils import timezone

from apps.finans.infrastructure.donem_bakiye_repository import DonemBakiyeRepository
from apps.finans.infrastructure.bakiye_hareketi_repository import BakiyeHareketiRepository
from apps.finans.domain.donem_bakiye import DonemBakiye
from apps.finans.constants.hareket_types import (
    DonemDurum, HareketYonu, HareketKaynagi,
)


class DonemBakiyeService:
    """Dönem bakiye işlemleri için iş mantığı."""

    def __init__(self):
        self.repo = DonemBakiyeRepository()
        self.hareket_repo = BakiyeHareketiRepository()

    # ─── Dönem Açılışı ───────────────────────────

    @transaction.atomic
    def donem_ac(self, kurum_id, sube_id, egitim_yili_id):
        """
        Şubenin tüm aktif mali hesapları için yeni dönem bakiye kayıtları oluşturur.

        - İlk kez açılıyorsa: donem_basi_bakiye = mali hesabın baslangic_bakiye değeri
        - Önceki yıldan devir varsa: donem_basi_bakiye = önceki yılın devir_tutari

        Returns:
            dict: { olusturulan: int, atlanan: int, message: str }
        """
        from apps.finans.domain.financial_account import MaliHesap

        mali_hesaplar = MaliHesap.objects.filter(
            sube_id=sube_id,
            aktif_mi=True,
        )

        olusturulan = 0
        atlanan = 0

        for hesap in mali_hesaplar:
            if self.repo.exists(hesap.id, egitim_yili_id):
                atlanan += 1
                continue

            # Önceki yıl devir tutarını bul
            devir = self._onceki_yil_devir(hesap.id, egitim_yili_id)

            self.repo.create({
                'mali_hesap_id': hesap.id,
                'kurum_id': kurum_id,
                'sube_id': sube_id,
                'egitim_yili_id': egitim_yili_id,
                'donem_basi_bakiye': devir if devir is not None else int(hesap.baslangic_bakiye),
                'durum': DonemDurum.ACIK,
            })
            olusturulan += 1

        return {
            'olusturulan': olusturulan,
            'atlanan': atlanan,
            'message': f'{olusturulan} mali hesap için dönem açıldı. {atlanan} hesap zaten açıktı.',
        }

    def _onceki_yil_devir(self, mali_hesap_id, egitim_yili_id):
        """Önceki eğitim yılının devir tutarını bulur."""
        from apps.egitim_yili.domain.models import EgitimYili

        try:
            mevcut_yil = EgitimYili.objects.get(pk=egitim_yili_id)
        except EgitimYili.DoesNotExist:
            return None

        onceki_yil = EgitimYili.objects.filter(
            bitis_yil=mevcut_yil.baslangic_yil,
        ).first()

        if not onceki_yil:
            return None

        onceki_donem = self.repo.get_by_mali_hesap_ve_yil(mali_hesap_id, onceki_yil.id)
        if not onceki_donem:
            return None

        # Sadece kapanmış/devredilmiş dönemlerden devir al
        if onceki_donem.durum in [DonemDurum.KAPANDI, DonemDurum.DEVREDILDI]:
            return onceki_donem.devir_tutari

        return None

    # ─── Dönem Kapanışı ──────────────────────────

    @transaction.atomic
    def donem_kapat(self, sube_id, egitim_yili_id, kullanici=None, notlar=''):
        """
        Şubenin belirli eğitim yılı dönemini kapatır.
        Tüm mali hesapların bakiyeleri hareketlerden yeniden hesaplanır ve kesinleşir.

        Returns:
            dict: { kapatilan: int, toplam_gelir: int, toplam_gider: int, message: str }
        """
        donemler = self.repo.get_by_sube_ve_yil(sube_id, egitim_yili_id)
        acik_donemler = [d for d in donemler if d.durum == DonemDurum.ACIK]

        if not acik_donemler:
            raise ValueError('Bu dönemde kapatılacak açık kayıt bulunamadı.')

        kapatilan = 0
        toplam_gelir = 0
        toplam_gider = 0
        now = timezone.now()

        for donem in acik_donemler:
            # Hareketlerden güncel toplamları hesapla
            gelir = self.hareket_repo.toplam_giris(
                donem.mali_hesap_id, egitim_yili_id, devir_haric=True
            )
            gider = self.hareket_repo.toplam_cikis(
                donem.mali_hesap_id, egitim_yili_id, devir_haric=True
            )

            donem.toplam_gelir = gelir
            donem.toplam_gider = gider
            donem.hesapla_bakiye()
            donem.devir_tutari = donem.donem_sonu_bakiye
            donem.durum = DonemDurum.KAPANDI
            donem.kapanma_tarihi = now
            donem.kapatan_kullanici = kullanici
            donem.notlar = notlar
            donem.save()

            kapatilan += 1
            toplam_gelir += gelir
            toplam_gider += gider

        return {
            'kapatilan': kapatilan,
            'toplam_gelir': toplam_gelir,
            'toplam_gider': toplam_gider,
            'toplam_net': toplam_gelir - toplam_gider,
            'message': f'{kapatilan} mali hesap dönemi kapatıldı.',
        }

    # ─── Dönem Devri ─────────────────────────────

    @transaction.atomic
    def donem_devret(self, sube_id, eski_egitim_yili_id, yeni_egitim_yili_id,
                     kurum_id, kullanici=None):
        """
        Eski eğitim yılının bakiyelerini yeni eğitim yılına devreder.

        İşlem Sırası:
        1. Eski dönem kapalı mı kontrol et (değilse önce kapat)
        2. Her mali hesap için yeni DonemBakiye oluştur
        3. Devir tutarını yeni dönemin dönem başı bakiyesi yap
        4. BakiyeHareketi ile devir kaydı oluştur (eski dönem ÇIKIŞ, yeni dönem GİRİŞ)
        5. Eski dönemi 'devredildi' olarak işaretle

        Returns:
            dict: { devredilen: int, toplam_devir: int, message: str }
        """
        from apps.finans.application.bakiye_hareketi_service import BakiyeHareketiService

        eski_donemler = self.repo.get_by_sube_ve_yil(sube_id, eski_egitim_yili_id)

        # Kapanmamış dönem var mı?
        acik_var = any(d.durum == DonemDurum.ACIK for d in eski_donemler)
        if acik_var:
            raise ValueError(
                'Devir yapılmadan önce eski dönem kapatılmalıdır. '
                'Lütfen önce dönem kapanışı yapın.'
            )

        # Zaten devredilmiş mi?
        hepsi_devredilmis = all(d.durum == DonemDurum.DEVREDILDI for d in eski_donemler)
        if hepsi_devredilmis:
            raise ValueError('Bu dönem zaten devredilmiş.')

        hareket_service = BakiyeHareketiService()
        devredilen = 0
        toplam_devir = 0
        now = timezone.now()
        islem_tarihi = now.date()

        for eski_donem in eski_donemler:
            if eski_donem.durum == DonemDurum.DEVREDILDI:
                continue

            devir_tutari = eski_donem.devir_tutari

            # Yeni dönem oluştur (yoksa)
            if not self.repo.exists(eski_donem.mali_hesap_id, yeni_egitim_yili_id):
                self.repo.create({
                    'mali_hesap_id': eski_donem.mali_hesap_id,
                    'kurum_id': kurum_id,
                    'sube_id': sube_id,
                    'egitim_yili_id': yeni_egitim_yili_id,
                    'donem_basi_bakiye': devir_tutari,
                    'donem_sonu_bakiye': devir_tutari,
                    'durum': DonemDurum.ACIK,
                })

            # Devir bakiye hareketi: yeni döneme GİRİŞ
            if devir_tutari != 0:
                yon = HareketYonu.GIRIS if devir_tutari > 0 else HareketYonu.CIKIS
                hareket_service.hareket_olustur(
                    mali_hesap_id=eski_donem.mali_hesap_id,
                    kurum_id=kurum_id,
                    sube_id=sube_id,
                    egitim_yili_id=yeni_egitim_yili_id,
                    yon=yon,
                    tutar=abs(devir_tutari),
                    kaynak=HareketKaynagi.DEVIR,
                    islem_tarihi=islem_tarihi,
                    kaynak_tip='donem_bakiye',
                    kaynak_id=eski_donem.id,
                    aciklama=f'Dönem devri: {eski_donem.egitim_yili} → {yeni_egitim_yili_id}',
                    islem_yapan=kullanici,
                )

            # Eski dönemi devredildi olarak işaretle
            eski_donem.durum = DonemDurum.DEVREDILDI
            eski_donem.devir_tarihi = now
            eski_donem.save(update_fields=['durum', 'devir_tarihi', 'updated_at'])

            devredilen += 1
            toplam_devir += devir_tutari

        return {
            'devredilen': devredilen,
            'toplam_devir': toplam_devir,
            'message': f'{devredilen} mali hesap bakiyesi yeni döneme devredildi. Toplam devir: {toplam_devir:,} TL',
        }

    # ─── Bakiye Yeniden Hesaplama ────────────────

    def _hesap_donem_satirini_hareketlerden_guncelle(self, donem, mali_hesap_id, egitim_yili_id):
        """Açık dönem satırının gelir/gider/bakiye alanlarını hareketlerden yazar."""
        gelir = self.hareket_repo.toplam_giris(mali_hesap_id, egitim_yili_id, devir_haric=True)
        gider = self.hareket_repo.toplam_cikis(mali_hesap_id, egitim_yili_id, devir_haric=True)
        donem.toplam_gelir = gelir
        donem.toplam_gider = gider
        donem.hesapla_bakiye()
        donem.save(update_fields=['toplam_gelir', 'toplam_gider', 'donem_sonu_bakiye', 'updated_at'])

    @transaction.atomic
    def senkronize_acik_donem(self, kurum_id, sube_id, egitim_yili_id):
        """Açık dönem kayıtlarını hareketlerden yeniden hesaplar; eksik hesap satırlarını oluşturur.

        Dönem raporları ve dashboard metadata'sı DonemBakiye tablosunu okur. Hareketler
        repair/import yoluyla oluşturulduysa veya hesap dönem açılmadan sonra eklendiyse
        satırlar eksik/kalıcı olabilir — okuma öncesi bu metot self-heal yapar.
        Kapalı/devredilmiş dönem snapshot'larına dokunulmaz.
        """
        from apps.finans.domain.financial_account import MaliHesap

        olusturulan = 0
        guncellenen = 0

        for hesap in MaliHesap.objects.filter(sube_id=sube_id, aktif_mi=True):
            donem = self.repo.get_by_mali_hesap_ve_yil(hesap.id, egitim_yili_id)
            if not donem:
                devir = self._onceki_yil_devir(hesap.id, egitim_yili_id)
                donem = self.repo.create({
                    'mali_hesap_id': hesap.id,
                    'kurum_id': kurum_id,
                    'sube_id': sube_id,
                    'egitim_yili_id': egitim_yili_id,
                    'donem_basi_bakiye': devir if devir is not None else int(hesap.baslangic_bakiye or 0),
                    'durum': DonemDurum.ACIK,
                })
                olusturulan += 1

            if donem.durum != DonemDurum.ACIK:
                continue

            eski = (donem.toplam_gelir, donem.toplam_gider, donem.donem_sonu_bakiye)
            self._hesap_donem_satirini_hareketlerden_guncelle(donem, hesap.id, egitim_yili_id)
            donem.refresh_from_db()
            yeni = (donem.toplam_gelir, donem.toplam_gider, donem.donem_sonu_bakiye)
            if eski != yeni:
                guncellenen += 1

        return {'olusturulan': olusturulan, 'guncellenen': guncellenen}

    @transaction.atomic
    def senkronize_kurum_acik_donemler(self, kurum_id):
        """Kurumdaki tüm açık dönem (şube × yıl) kombinasyonlarını senkronize eder."""
        from apps.sube.domain.models import Sube

        from apps.finans.domain.donem_bakiye import DonemBakiye

        yil_ids = set(
            DonemBakiye.objects.filter(kurum_id=kurum_id, durum=DonemDurum.ACIK)
            .values_list('egitim_yili_id', flat=True)
        )
        sube_ids = list(Sube.objects.filter(kurum_id=kurum_id).values_list('id', flat=True))
        toplam = {'olusturulan': 0, 'guncellenen': 0}
        for sube_id in sube_ids:
            for ey_id in yil_ids:
                if ey_id:
                    r = self.senkronize_acik_donem(kurum_id, sube_id, ey_id)
                    toplam['olusturulan'] += r['olusturulan']
                    toplam['guncellenen'] += r['guncellenen']
        return toplam

    @transaction.atomic
    def bakiye_yeniden_hesapla(self, mali_hesap_id, egitim_yili_id):
        """
        Hareketlerden dönem bakiyesini sıfırdan yeniden hesaplar.
        Tutarsızlık durumlarında düzeltme aracı olarak kullanılır.
        """
        donem = self.repo.get_by_mali_hesap_ve_yil(mali_hesap_id, egitim_yili_id)
        if not donem:
            raise ValueError('Dönem bakiye kaydı bulunamadı.')

        if donem.durum != DonemDurum.ACIK:
            raise ValueError('Sadece açık dönemlerin bakiyesi yeniden hesaplanabilir.')

        eski_bakiye = donem.donem_sonu_bakiye
        self._hesap_donem_satirini_hareketlerden_guncelle(donem, mali_hesap_id, egitim_yili_id)
        donem.refresh_from_db()

        return {
            'eski_bakiye': eski_bakiye,
            'yeni_bakiye': donem.donem_sonu_bakiye,
            'fark': donem.donem_sonu_bakiye - eski_bakiye,
            'message': 'Bakiye yeniden hesaplandı.',
        }
