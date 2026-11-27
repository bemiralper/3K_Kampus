"""
Cari Tahsilat Service — Serbest Tahsilat / Avans Tahsilatı
Gelir faturasına bağlı olmadan doğrudan cari hesaptan tahsilat yapılmasını sağlar.
"""
from decimal import Decimal
from django.utils import timezone

from apps.egitim_yili.domain.models import EgitimYili
from apps.finans.application.bakiye_hareketi_service import BakiyeHareketiService
from apps.finans.application.cari_balance import hesapla_serbest_tahsilat_bakiye
from apps.finans.application.cari_hareket_service import CariHareketService
from apps.finans.application.islem_masrafi_service import IslemMasrafiService
from apps.finans.application.transaction_utils import atomic_result
from apps.finans.constants.cari_types import CariHareketTuru, CariHareketYonu
from apps.finans.constants.gider_types import OdemeDurum
from apps.finans.constants.hareket_types import HareketKaynagi, HareketYonu
from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.domain.gelir_tahsilat import GelirTahsilat
from apps.finans.domain.islem_masrafi import IslemMasrafiKaynakTipi
from apps.finans.infrastructure.cari_hareket_repository import CariHareketRepository
from apps.finans.infrastructure.cari_hesap_repository import CariHesapRepository


class CariTahsilatService:
    """
    Serbest (fatura-bağımsız) cari tahsilat iş kuralları.

    Kullanım alanları:
    - Müşteriden açılış bakiyesi veya cari hesap tahsilatı alma
    - Fatura kesilmeden önce müşteri avansı / ön ödeme alma
    - Çek/senet ile tahsilat (portföy kaydı; kasa ve cari tahsilat Tahsil Edildi anında)
    """

    def __init__(self):
        self.cari_hareket_service = CariHareketService()
        self.bakiye_service = BakiyeHareketiService()
        self.masraf_service = IslemMasrafiService()
        self.hesap_repo = CariHesapRepository
        self.hareket_repo = CariHareketRepository

    def _resolve_odeme_yontemi(self, odeme_yontemi_id):
        if not odeme_yontemi_id:
            return None
        from apps.finans.domain.payment_method import OdemeYontemi
        return OdemeYontemi.objects.filter(id=odeme_yontemi_id).first()

    @atomic_result
    def serbest_tahsilat_yap(self, data: dict):
        """
        Gelir kaydına bağlı olmadan cari hesaptan tahsilat alır.

        Nakit/EFT/POS:
          1. BakiyeHareketi GİRİŞ (TAHSILAT, kaynak_tip='SerbestTahsilat')
          2. CariHareket ALACAK/TAHSILAT (kaynak_tip='SerbestTahsilat', kaynak_id=bakiye_hareket.pk)
          3. Varsa banka/POS kesintisi (IslemMasrafi)

        Çek/senet:
          1. CekSenetDetay (alınan, portföyde) — kasa girişi ve cari tahsilat
             çek Tahsil Edildi olduğunda CekSenetService.tahsil_et ile yapılır.
        """
        from apps.finans.application.cek_senet.cek_senet_helpers import (
            cek_senet_v2_enabled,
            is_cek_senet_yontemi,
        )

        odeme_yontemi_id = data.get('odeme_yontemi_id')
        yontem = self._resolve_odeme_yontemi(odeme_yontemi_id)
        is_cek = is_cek_senet_yontemi(yontem)

        errors = self._validate(data, is_cek_path=is_cek)
        if errors:
            return None, errors

        if is_cek and not cek_senet_v2_enabled():
            return None, {
                'odeme_yontemi_id': 'Çek/senet ile serbest tahsilat için Çek/Senet V2 özelliği açık olmalıdır.',
            }

        cari_hesap_id = data['cari_hesap_id']
        kurum_id = data['kurum_id']
        tutar = Decimal(str(data['tutar']))
        tahsilat_tarihi = data.get('tahsilat_tarihi', timezone.localdate())
        aciklama = (data.get('aciklama') or '').strip()
        mali_hesap_id = data.get('mali_hesap_id')

        hesap = self.hesap_repo.get_by_id(cari_hesap_id)

        sube_id = data.get('sube_id')
        if not sube_id:
            return None, {'genel': 'Şube bağlamı zorunludur.'}

        egitim_yili_id = data.get('egitim_yili_id')
        if not egitim_yili_id:
            aktif_yil = EgitimYili.objects.filter(aktif_mi=True).first()
            if not aktif_yil:
                return None, {'genel': 'Aktif eğitim yılı bulunamadı. Lütfen eğitim yılı tanımlayın.'}
            egitim_yili_id = aktif_yil.pk

        hareket_aciklama = f"Serbest tahsilat: {hesap.gorunen_ad or hesap.unvan} — {tutar} ₺"
        if aciklama:
            hareket_aciklama += f" ({aciklama})"

        if is_cek:
            return self._serbest_tahsilat_cek(
                data=data,
                hesap=hesap,
                cari_hesap_id=cari_hesap_id,
                kurum_id=kurum_id,
                sube_id=sube_id,
                tutar=tutar,
                odeme_yontemi_id=odeme_yontemi_id,
                mali_hesap_id=mali_hesap_id,
                hareket_aciklama=hareket_aciklama,
            )

        bakiye_hareket = self.bakiye_service.hareket_olustur(
            mali_hesap_id=mali_hesap_id,
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            tutar=tutar,
            yon=HareketYonu.GIRIS,
            kaynak=HareketKaynagi.TAHSILAT,
            islem_tarihi=tahsilat_tarihi,
            kaynak_tip='SerbestTahsilat',
            kaynak_id=cari_hesap_id,
            aciklama=hareket_aciklama,
            islem_yapan=data.get('islem_yapan'),
        )

        cari_hareket = self.cari_hareket_service.hareket_olustur(
            cari_hesap_id=cari_hesap_id,
            kurum_id=kurum_id,
            tutar=tutar,
            yon=CariHareketYonu.ALACAK,
            islem_turu=CariHareketTuru.TAHSILAT,
            islem_tarihi=tahsilat_tarihi,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            kaynak_tip='SerbestTahsilat',
            kaynak_id=bakiye_hareket.pk,
            aciklama=hareket_aciklama,
            islem_yapan=data.get('islem_yapan'),
        )

        if odeme_yontemi_id:
            _, masraf_err = self.masraf_service.process_if_present(
                data,
                kaynak_tip=IslemMasrafiKaynakTipi.CARI_ODEME,
                kaynak_id=cari_hareket.pk,
                kurum_id=kurum_id,
                sube_id=sube_id,
                egitim_yili_id=egitim_yili_id,
                mali_hesap_id=mali_hesap_id,
                odeme_yontemi_id=odeme_yontemi_id,
                islem_tarihi=tahsilat_tarihi,
                ana_islem_aciklama=hareket_aciklama,
                islem_yapan=data.get('islem_yapan'),
            )
            if masraf_err:
                return None, {'genel': masraf_err}

        hesap.refresh_from_db()
        return {
            'detail': 'Tahsilat başarıyla kaydedildi.',
            'tutar': str(tutar),
            'cari_hareket_id': cari_hareket.pk,
            'bakiye_hareketi_id': bakiye_hareket.pk,
            'yeni_bakiye': str(hesap.bakiye),
        }, None

    def _serbest_tahsilat_cek(
        self,
        *,
        data,
        hesap,
        cari_hesap_id,
        kurum_id,
        sube_id,
        tutar,
        odeme_yontemi_id,
        mali_hesap_id,
        hareket_aciklama,
    ):
        from apps.finans.application.cek_senet.cek_senet_service import CekSenetService
        from apps.odeme_takip.domain.cek_senet import CekSenetDetay

        vade = data.get('vade_tarihi')
        if not vade:
            return None, {'vade_tarihi': 'Çek/senet tahsilatlarında vade tarihi zorunludur.'}

        cek_svc = CekSenetService()
        cek_payload = {
            'kurum_id': kurum_id,
            'sube_id': sube_id,
            'cari_hesap_id': cari_hesap_id,
            'odeme_yontemi_id': odeme_yontemi_id,
            'tutar': int(tutar),
            'vade_tarihi': vade,
            'aciklama': hareket_aciklama,
            'cek_senet_no': (data.get('cek_senet_no') or '').strip(),
            'seri_no': (data.get('seri_no') or '').strip(),
            'banka_adi': (data.get('banka_adi') or '').strip(),
            'sube_adi': (data.get('sube_adi') or '').strip(),
            'hesap_no': (data.get('hesap_no') or '').strip(),
            'keside_eden': (data.get('keside_eden') or '').strip(),
            'keside_tarihi': data.get('keside_tarihi') or None,
        }
        cek_result, cek_err = cek_svc.create_alinan(cek_payload, user=data.get('islem_yapan'))
        if cek_err:
            return None, cek_err if isinstance(cek_err, dict) else {'genel': str(cek_err)}

        cek_id = cek_result['id']
        if mali_hesap_id:
            detay = CekSenetDetay.objects.get(pk=cek_id)
            detay.tahsilat_mali_hesap_id = mali_hesap_id
            detay.save(update_fields=['tahsilat_mali_hesap_id', 'updated_at'])

        hesap.refresh_from_db()
        return {
            'detail': 'Alınan çek/senet portföye kaydedildi. Kasa girişi ve cari tahsilat çek tahsil edildiğinde yansır.',
            'tutar': str(tutar),
            'cari_hareket_id': None,
            'cek_senet_id': cek_id,
            'bakiye_hareketi_id': None,
            'yeni_bakiye': str(hesap.bakiye),
        }, None

    @atomic_result
    def serbest_tahsilat_iptal(self, cari_hareket_id: int):
        """
        Serbest tahsilatı iptal eder (ters BakiyeHareketi + ters CariHareket).
        Eğer bu serbest tahsilatın bir kısmı bir gelir faturasına mahsup edildiyse
        önce mahsup tahsilatının iptal edilmesini zorunlu kılar.
        """
        from django.db.models import Sum
        from apps.finans.domain.cari_hareket import CariHareket

        cari_id = (
            CariHareket.objects.filter(pk=cari_hareket_id)
            .values_list('cari_hesap_id', flat=True)
            .first()
        )
        if not cari_id:
            return None, {'genel': 'Cari hareket bulunamadı.'}
        self.hesap_repo.get_by_id(cari_id, for_update=True)

        try:
            hareket = CariHareket.objects.select_for_update().get(pk=cari_hareket_id)
        except CariHareket.DoesNotExist:
            return None, {'genel': 'Cari hareket bulunamadı.'}

        if hareket.kaynak_tip != 'SerbestTahsilat':
            return None, {'genel': 'Bu hareket serbest tahsilat değil, bu ekrandan iptal edilemez.'}

        zaten_iptal = CariHareket.objects.filter(
            kaynak_tip='SerbestTahsilatIptal',
            kaynak_id=hareket.pk,
        ).exists()
        if zaten_iptal:
            return None, {'genel': 'Bu tahsilat zaten iptal edilmiş.'}

        tutar = hareket.tutar
        aktif_mahsuplar = (
            GelirTahsilat.objects.filter(
                gelir_kaydi__cari_hesap_id=hareket.cari_hesap_id,
                bakiye_hareketi_id=GelirTahsilat.MAHSUP_SENTINEL_BH_ID,
                durum=OdemeDurum.TAMAMLANDI,
            ).aggregate(t=Sum('tutar'))['t']
            or Decimal('0.00')
        )
        if aktif_mahsuplar > Decimal('0.00'):
            kalan_serbest = hesapla_serbest_tahsilat_bakiye(hareket.cari_hesap_id)
            if kalan_serbest < tutar:
                return None, {
                    'genel': (
                        'Bu serbest tahsilatın bir kısmı gelir faturasına mahsup edilmiş; '
                        'önce ilgili mahsup tahsilatını iptal edin.'
                    ),
                }

        self.masraf_service.iptal(
            IslemMasrafiKaynakTipi.CARI_ODEME,
            cari_hareket_id,
            islem_tarihi=timezone.localdate(),
        )

        hesap = self.hesap_repo.get_by_id(hareket.cari_hesap_id)

        bakiye_hareketi_id = hareket.kaynak_id
        if bakiye_hareketi_id:
            try:
                orijinal_bh = BakiyeHareketi.objects.get(pk=bakiye_hareketi_id)
                self.bakiye_service.hareket_olustur(
                    mali_hesap_id=orijinal_bh.mali_hesap_id,
                    kurum_id=orijinal_bh.kurum_id,
                    sube_id=orijinal_bh.sube_id,
                    egitim_yili_id=orijinal_bh.egitim_yili_id,
                    tutar=tutar,
                    yon=HareketYonu.CIKIS,
                    kaynak=HareketKaynagi.TAHSILAT_IPTAL,
                    islem_tarihi=timezone.localdate(),
                    kaynak_tip='SerbestTahsilatIptal',
                    kaynak_id=hareket.pk,
                    aciklama=f'Serbest tahsilat iptali: {hesap.gorunen_ad or hesap.unvan} — {tutar} ₺',
                )
            except BakiyeHareketi.DoesNotExist:
                pass

        self.cari_hareket_service.hareket_olustur(
            cari_hesap_id=hareket.cari_hesap_id,
            kurum_id=hareket.kurum_id,
            tutar=tutar,
            yon=CariHareketYonu.BORC,
            islem_turu=CariHareketTuru.IADE,
            islem_tarihi=timezone.localdate(),
            sube_id=hareket.sube_id,
            egitim_yili_id=hareket.egitim_yili_id,
            kaynak_tip='SerbestTahsilatIptal',
            kaynak_id=hareket.pk,
            aciklama=f'Serbest tahsilat iptali: {tutar} ₺',
        )

        hesap.refresh_from_db()
        return {
            'detail': 'Serbest tahsilat iptal edildi.',
            'tutar': str(tutar),
            'yeni_bakiye': str(hesap.bakiye),
        }, None

    def _validate(self, data, *, is_cek_path=False):
        errors = {}

        if not data.get('cari_hesap_id'):
            errors['cari_hesap_id'] = 'Cari hesap zorunludur.'
            return errors

        hesap = self.hesap_repo.get_by_id(data['cari_hesap_id'])
        if not hesap:
            errors['cari_hesap_id'] = 'Cari hesap bulunamadı.'
            return errors

        if not hesap.aktif_mi:
            errors['cari_hesap_id'] = 'Pasif cari hesaptan tahsilat alınamaz.'

        kurum_id = data.get('kurum_id')
        if not kurum_id:
            errors['kurum_id'] = 'Kurum zorunludur.'
        elif hesap.kurum_id != kurum_id:
            errors['cari_hesap_id'] = 'Cari hesap seçilen kuruma ait değil.'

        sube_id = data.get('sube_id')
        if sube_id and hesap.sube_id and hesap.sube_id != sube_id:
            errors['cari_hesap_id'] = 'Cari hesap seçilen şubeye ait değil.'

        mali_hesap_id = data.get('mali_hesap_id')
        if is_cek_path:
            if not data.get('vade_tarihi'):
                errors['vade_tarihi'] = 'Çek/senet tahsilatlarında vade tarihi zorunludur.'
            if not data.get('odeme_yontemi_id'):
                errors['odeme_yontemi_id'] = 'Çek/senet tahsilatlarında ödeme yöntemi zorunludur.'
            if mali_hesap_id:
                mh_err = self._validate_mali_hesap(mali_hesap_id, kurum_id, sube_id)
                if mh_err:
                    errors['mali_hesap_id'] = mh_err
        else:
            if not mali_hesap_id:
                errors['mali_hesap_id'] = 'Mali hesap seçimi zorunludur.'
            else:
                mh_err = self._validate_mali_hesap(mali_hesap_id, kurum_id, sube_id)
                if mh_err:
                    errors['mali_hesap_id'] = mh_err

        from apps.finans.application.tenant_validation import validate_finans_links
        link_errors = validate_finans_links(
            kurum_id=kurum_id, sube_id=sube_id,
            mali_hesap_id=mali_hesap_id,
            odeme_yontemi_id=data.get('odeme_yontemi_id'),
        )
        if link_errors:
            errors.update(link_errors)

        tutar = data.get('tutar')
        if not tutar or Decimal(str(tutar)) <= Decimal('0'):
            errors['tutar'] = 'Tahsilat tutarı sıfırdan büyük olmalıdır.'

        if not data.get('tahsilat_tarihi'):
            errors['tahsilat_tarihi'] = 'Tahsilat tarihi zorunludur.'

        return errors if errors else None

    def _validate_mali_hesap(self, mali_hesap_id, kurum_id, sube_id):
        from apps.finans.domain.financial_account import MaliHesap

        mali_hesap = (
            MaliHesap.objects.filter(id=mali_hesap_id, silindi_mi=False, aktif_mi=True)
            .select_related('sube')
            .first()
        )
        if not mali_hesap:
            return 'Mali hesap bulunamadı veya pasif.'
        if kurum_id and mali_hesap.sube.kurum_id != kurum_id:
            return 'Mali hesap seçilen kuruma ait değil.'
        if sube_id and mali_hesap.sube_id != sube_id:
            return 'Mali hesap seçilen şubeye ait değil.'
        return None
