"""
Gelir Tahsilat Service — İş kuralları katmanı
Tahsilat kaydı oluşturma, iptal, BakiyeHareketi entegrasyonu.
"""
from decimal import Decimal
from apps.finans.application.transaction_utils import atomic_result

from apps.finans.infrastructure.cari_hesap_repository import CariHesapRepository
from apps.finans.infrastructure.gelir_tahsilat_repository import GelirTahsilatRepository
from apps.finans.infrastructure.gelir_repository import GelirKaydiRepository
from apps.finans.application.bakiye_hareketi_service import BakiyeHareketiService
from apps.finans.application.cari_hareket_service import CariHareketService
from apps.finans.application.islem_masrafi_service import IslemMasrafiService
from apps.finans.domain.islem_masrafi import IslemMasrafiKaynakTipi
from apps.finans.constants.gider_types import OdemeDurum
from apps.finans.constants.cari_types import GelirDurum, CariHareketTuru, CariHareketYonu
from apps.finans.constants.hareket_types import HareketYonu, HareketKaynagi


class GelirTahsilatService:
    """
    Gelir tahsilat iş kuralları.
    Tahsilat → BakiyeHareketi → GelirKaydi durum güncelleme → Cari hareket.
    """

    def __init__(self):
        self.tahsilat_repo = GelirTahsilatRepository
        self.gelir_repo = GelirKaydiRepository
        self.bakiye_service = BakiyeHareketiService()
        self.cari_hareket_service = CariHareketService()
        self.masraf_service = IslemMasrafiService()

    @atomic_result
    def tahsilat_yap(self, data: dict):
        """
        Gelir tahsilatı yapar.
        A) Normal tahsilat (bakiyeden_mahsup=False):
           1. GelirTahsilat kaydı oluştur
           2. BakiyeHareketi oluştur (GİRİŞ — mali hesaba para giriyor)
           3. GelirKaydi tahsil_edilen + durum güncelle
           4. Cari hareket oluştur (ALACAK — müşteri borcu azalıyor)
        B) Bakiyeden mahsup (bakiyeden_mahsup=True):
           1. GelirTahsilat kaydı oluştur (bakiye_hareketi_id=0 sentinel, kasa girişi yok)
           2. GelirKaydi tahsil_edilen + durum güncelle
           3. Mükerrer CariHareket yazılmaz (SerbestTahsilat ALACAK + GelirKaydi BORÇ zaten işlendi)

        Returns: (GelirTahsilat, None) veya (None, error_dict)
        """
        bakiyeden_mahsup = bool(data.get('bakiyeden_mahsup', False))
        gelir_id = data.get('gelir_kaydi_id')
        if gelir_id:
            from apps.finans.domain.gelir_kaydi import GelirKaydi
            cari_id = (
                GelirKaydi.objects.filter(pk=gelir_id)
                .values_list('cari_hesap_id', flat=True)
                .first()
            )
            if cari_id:
                CariHesapRepository.get_by_id(cari_id, for_update=True)
            GelirKaydi.objects.select_for_update().filter(pk=gelir_id).first()

        errors = self._validate_tahsilat(data, bakiyeden_mahsup=bakiyeden_mahsup)
        if errors:
            return None, errors

        gelir = self.gelir_repo.get_by_id(gelir_id)
        tutar = data['tutar']

        if bakiyeden_mahsup:
            return self._bakiyeden_mahsup_yap(gelir, tutar, data)

        # 1. GelirTahsilat kaydı oluştur
        tahsilat_data = {
            'gelir_kaydi_id': gelir.pk,
            'odeme_yontemi_id': data['odeme_yontemi_id'],
            'mali_hesap_id': data['mali_hesap_id'],
            'tutar': tutar,
            'tahsilat_tarihi': data['tahsilat_tarihi'],
            'aciklama': data.get('aciklama', ''),
            'islem_yapan': data.get('islem_yapan'),
            'durum': OdemeDurum.TAMAMLANDI,
        }
        tahsilat = self.tahsilat_repo.create(tahsilat_data)

        # 2. BakiyeHareketi oluştur (GİRİŞ — kasaya/bankaya para giriyor)
        aciklama = f"Gelir tahsilatı: {gelir.cari_hesap} - {gelir.fatura_no or 'Belgesiz'}"
        hareket = self.bakiye_service.hareket_olustur(
            mali_hesap_id=data['mali_hesap_id'],
            kurum_id=gelir.kurum_id,
            sube_id=gelir.sube_id,
            egitim_yili_id=gelir.egitim_yili_id,
            tutar=tutar,
            yon=HareketYonu.GIRIS,
            kaynak=HareketKaynagi.TAHSILAT,
            islem_tarihi=data['tahsilat_tarihi'],
            kaynak_tip='GelirTahsilat',
            kaynak_id=tahsilat.pk,
            aciklama=aciklama,
        )

        # BakiyeHareketi referansını kaydet
        tahsilat.bakiye_hareketi_id = hareket.pk
        tahsilat.save(update_fields=['bakiye_hareketi_id'])

        # 3. GelirKaydi tahsil_edilen güncelle
        self._gelir_durum_guncelle(gelir)

        # 4. Cari hesapta ALACAK hareketi (müşteri borcu azalıyor — tahsilat aldık)
        self.cari_hareket_service.hareket_olustur(
            cari_hesap_id=gelir.cari_hesap_id,
            kurum_id=gelir.kurum_id,
            tutar=tutar,
            yon=CariHareketYonu.ALACAK,
            islem_turu=CariHareketTuru.TAHSILAT,
            islem_tarihi=data['tahsilat_tarihi'],
            sube_id=gelir.sube_id,
            egitim_yili_id=gelir.egitim_yili_id,
            kaynak_tip='GelirTahsilat',
            kaynak_id=tahsilat.pk,
            aciklama=f'Gelir tahsilatı: {gelir.fatura_no or "Belgesiz"} — {tutar} ₺',
        )

        _, masraf_err = self.masraf_service.process_if_present(
            data,
            kaynak_tip=IslemMasrafiKaynakTipi.GELIR_TAHSILAT,
            kaynak_id=tahsilat.pk,
            kurum_id=gelir.kurum_id,
            sube_id=gelir.sube_id,
            egitim_yili_id=gelir.egitim_yili_id,
            mali_hesap_id=data['mali_hesap_id'],
            odeme_yontemi_id=data['odeme_yontemi_id'],
            islem_tarihi=data['tahsilat_tarihi'],
            ana_islem_aciklama=aciklama,
            islem_yapan=data.get('islem_yapan'),
        )
        if masraf_err:
            return None, {'genel': masraf_err}

        return tahsilat, None

    def _bakiyeden_mahsup_yap(self, gelir, tutar, data):
        """
        Müşterinin mevcut serbest tahsilat/avans bakiyesini bu gelir faturasına mahsup eder.
        Kasaya/bankaya mükerrer giriş yazılmaz; bakiye_hareketi_id=0 sentinel ile işaretlenir.
        """
        from apps.finans.domain.gelir_tahsilat import GelirTahsilat

        tahsilat_data = {
            'gelir_kaydi_id': gelir.pk,
            'odeme_yontemi_id': None,
            'mali_hesap_id': None,
            'bakiye_hareketi_id': GelirTahsilat.MAHSUP_SENTINEL_BH_ID,
            'tutar': tutar,
            'tahsilat_tarihi': data['tahsilat_tarihi'],
            'aciklama': data.get('aciklama', '') or 'Cari serbest tahsilat bakiyesinden mahsup edildi',
            'islem_yapan': data.get('islem_yapan'),
            'durum': OdemeDurum.TAMAMLANDI,
        }
        tahsilat = self.tahsilat_repo.create(tahsilat_data)
        self._gelir_durum_guncelle(gelir)
        return tahsilat, None

    @atomic_result
    def tahsilat_iptal(self, tahsilat_id: int):
        """
        Tahsilatı iptal eder ve tüm bakiyeleri geri alır.
        Returns: (GelirTahsilat, None) veya (None, error_dict)
        """
        # Eşzamanlı işlem/iptal koruması — kilit sırası: CariHesap → GelirTahsilat.
        from apps.finans.domain.gelir_tahsilat import GelirTahsilat as _GelirTahsilat
        cari_id = (
            _GelirTahsilat.objects.filter(pk=tahsilat_id)
            .values_list('gelir_kaydi__cari_hesap_id', flat=True)
            .first()
        )
        if cari_id:
            CariHesapRepository.get_by_id(cari_id, for_update=True)
        _GelirTahsilat.objects.select_for_update().filter(pk=tahsilat_id).first()

        tahsilat = self.tahsilat_repo.get_by_id(tahsilat_id)
        if not tahsilat:
            return None, {'genel': 'Tahsilat kaydı bulunamadı.'}

        if tahsilat.durum == OdemeDurum.IPTAL:
            return None, {'genel': 'Bu tahsilat zaten iptal edilmiş.'}

        tutar = tahsilat.tutar
        gelir = tahsilat.gelir_kaydi
        is_mahsup = tahsilat.bakiyeden_mahsup

        # 1. Tahsilatı iptal et
        tahsilat = self.tahsilat_repo.iptal_et(tahsilat)

        # 2. BakiyeHareketi — mali hesaptan para çıkış (iptal).
        #    Yalnızca gerçek giriş hareketi varsa ve daha önce iptal yazılmadıysa.
        zaten_iptal_var = self.bakiye_service.kaynak_hareketi_var_mi(
            kaynak_tip='GelirTahsilat',
            kaynak_id=tahsilat.pk,
            kaynaklar=[HareketKaynagi.TAHSILAT_IPTAL],
        )
        if not is_mahsup and tahsilat.mali_hesap_id and tahsilat.bakiye_hareketi_id and not zaten_iptal_var:
            aciklama = f"Tahsilat iptali: {gelir.cari_hesap} - {gelir.fatura_no or 'Belgesiz'}"
            self.bakiye_service.hareket_olustur(
                mali_hesap_id=tahsilat.mali_hesap_id,
                kurum_id=gelir.kurum_id,
                sube_id=gelir.sube_id,
                egitim_yili_id=gelir.egitim_yili_id,
                tutar=tutar,
                yon=HareketYonu.CIKIS,
                kaynak=HareketKaynagi.TAHSILAT_IPTAL,
                islem_tarihi=tahsilat.tahsilat_tarihi,
                kaynak_tip='GelirTahsilat',
                kaynak_id=tahsilat.pk,
                aciklama=aciklama,
            )

        # 3. GelirKaydi tahsil_edilen güncelle
        self._gelir_durum_guncelle(gelir)

        # 4. Cari hesapta BORÇ hareketi (yalnızca normal tahsilatlarda; mahsupta cariye ek ALACAK yazılmamıştı)
        if not is_mahsup:
            self.cari_hareket_service.hareket_olustur(
                cari_hesap_id=gelir.cari_hesap_id,
                kurum_id=gelir.kurum_id,
                tutar=tutar,
                yon=CariHareketYonu.BORC,
                islem_turu=CariHareketTuru.IADE,
                islem_tarihi=tahsilat.tahsilat_tarihi,
                sube_id=gelir.sube_id,
                egitim_yili_id=gelir.egitim_yili_id,
                kaynak_tip='GelirTahsilat',
                kaynak_id=tahsilat.pk,
                aciklama=f'Tahsilat iptali: {gelir.fatura_no or "Belgesiz"} — {tutar} ₺',
            )

        self.masraf_service.iptal(
            IslemMasrafiKaynakTipi.GELIR_TAHSILAT,
            tahsilat.pk,
            islem_tarihi=tahsilat.tahsilat_tarihi,
        )

        return tahsilat, None

    # ─── Yardımcı ────────────────────────────────

    def _gelir_durum_guncelle(self, gelir):
        """Gelir kaydının tahsil_edilen ve durumunu yeniden hesaplar."""
        toplam = self.tahsilat_repo.toplam_tahsilat_by_gelir(gelir.pk)
        update_data = {'tahsil_edilen': toplam}

        if toplam >= gelir.net_tutar:
            update_data['durum'] = GelirDurum.TAHSIL_EDILDI
        elif toplam > Decimal('0'):
            update_data['durum'] = GelirDurum.KISMI_TAHSIL
        else:
            # İptal sonrası 0'a düşerse onaylandıya dön
            if gelir.durum in [GelirDurum.KISMI_TAHSIL, GelirDurum.TAHSIL_EDILDI]:
                update_data['durum'] = GelirDurum.ONAYLANDI

        self.gelir_repo.update(gelir, update_data)

    def _validate_tahsilat(self, data, *, bakiyeden_mahsup=False):
        errors = {}

        gelir_id = data.get('gelir_kaydi_id')
        if not gelir_id:
            errors['gelir_kaydi'] = 'Gelir kaydı zorunludur.'
            return errors

        gelir = self.gelir_repo.get_by_id(gelir_id)
        if not gelir:
            errors['gelir_kaydi'] = 'Gelir kaydı bulunamadı.'
            return errors

        from apps.finans.application.tenant_validation import validate_finans_links
        link_errors = validate_finans_links(
            kurum_id=gelir.kurum_id, sube_id=gelir.sube_id,
            mali_hesap_id=data.get('mali_hesap_id'),
            odeme_yontemi_id=data.get('odeme_yontemi_id'),
        )
        if link_errors:
            return link_errors

        if gelir.durum not in [GelirDurum.ONAYLANDI, GelirDurum.KISMI_TAHSIL]:
            errors['gelir_kaydi'] = f'Bu gelir kaydından tahsilat yapılamaz (durum: {gelir.get_durum_display()}).'

        tutar = data.get('tutar')
        if not tutar or tutar <= Decimal('0'):
            errors['tutar'] = 'Tahsilat tutarı sıfırdan büyük olmalıdır.'
        elif tutar > gelir.kalan_tutar:
            errors['tutar'] = f'Tahsilat tutarı kalan alacaktan ({gelir.kalan_tutar} ₺) fazla olamaz.'

        if bakiyeden_mahsup:
            from apps.finans.application.cari_balance import hesapla_serbest_tahsilat_bakiye
            serbest_tahsilat = hesapla_serbest_tahsilat_bakiye(gelir.cari_hesap_id)
            if tutar and serbest_tahsilat <= Decimal('0'):
                errors['tutar'] = (
                    f'Cari hesapta mahsup edilecek serbest tahsilat bakiyesi bulunmuyor. '
                    f'Kullanılabilir bakiye: {serbest_tahsilat} ₺'
                )
            elif tutar and tutar > serbest_tahsilat:
                errors['tutar'] = (
                    f'Mahsup tutarı kullanılabilir serbest tahsilat bakiyesinden '
                    f'({serbest_tahsilat} ₺) fazla olamaz.'
                )
        else:
            if not data.get('odeme_yontemi_id'):
                errors['odeme_yontemi'] = 'Ödeme yöntemi zorunludur.'
            if not data.get('mali_hesap_id'):
                errors['mali_hesap'] = 'Mali hesap seçimi zorunludur.'
            elif data.get('odeme_yontemi_id'):
                from apps.finans.application.cek_senet.cek_senet_helpers import (
                    cek_senet_v2_enabled,
                    is_cek_senet_yontemi,
                )
                from apps.finans.domain.payment_method import OdemeYontemi
                if cek_senet_v2_enabled():
                    yontem = OdemeYontemi.objects.filter(id=data['odeme_yontemi_id']).first()
                    if is_cek_senet_yontemi(yontem):
                        errors['odeme_yontemi'] = (
                            'Çek/senet tahsilatı Finans → Çek/Senet veya Cari → Tahsilat Al ekranından yapılmalıdır.'
                        )

        if not data.get('tahsilat_tarihi'):
            errors['tahsilat_tarihi'] = 'Tahsilat tarihi zorunludur.'

        return errors if errors else None
