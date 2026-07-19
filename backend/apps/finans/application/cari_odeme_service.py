"""
Cari Ödeme Service — Serbest Ödeme / Erken Ödeme
Gider kaydına bağlı olmadan doğrudan cari hesaba ödeme yapılmasını sağlar.
"""
from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from apps.finans.application.cari_hareket_service import CariHareketService
from apps.finans.application.bakiye_hareketi_service import BakiyeHareketiService
from apps.finans.application.islem_masrafi_service import IslemMasrafiService
from apps.finans.domain.islem_masrafi import IslemMasrafiKaynakTipi
from apps.finans.infrastructure.cari_hesap_repository import CariHesapRepository
from apps.finans.infrastructure.cari_hareket_repository import CariHareketRepository
from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.constants.cari_types import CariHareketTuru, CariHareketYonu
from apps.finans.constants.hareket_types import HareketYonu, HareketKaynagi
from apps.egitim_yili.domain.models import EgitimYili


class CariOdemeService:
    """
    Serbest (gider-bağımsız) ödeme iş kuralları.

    Kullanım alanları:
    - Gider kaydı olmadan tedarikçiye direkt ödeme
    - Avans / erken ödeme
    - Artı bakiye oluşturma
    - Çek/senet ile verilen ödeme (portföy kaydı; kasa çıkışı Ödendi anında)
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

    @transaction.atomic
    def serbest_odeme_yap(self, data: dict):
        """
        Gider kaydına bağlı olmadan cari hesaba ödeme yapar.

        Nakit/EFT/kart:
          1. BakiyeHareketi ÇIKIŞ
          2. CariHareket BORÇ/ÖDEME

        Çek/senet:
          1. CekSenetDetay (verilen, bekliyor) — kasa çıkışı yok
          2. CariHareket BORÇ/ÖDEME (kaynak_id = çek kaydı)
          Kasa çıkışı Çek/Senet → Ödendi ile yapılır.

        Returns: (dict, None) veya (None, error_dict)
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
                'odeme_yontemi_id': 'Çek/senet ile serbest ödeme için Çek/Senet V2 özelliği açık olmalıdır.',
            }

        cari_hesap_id = data['cari_hesap_id']
        kurum_id = data['kurum_id']
        tutar = Decimal(str(data['tutar']))
        odeme_tarihi = data.get('odeme_tarihi', timezone.now().date())
        aciklama = data.get('aciklama', '')
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

        tutar_int = int(tutar)
        hareket_aciklama = f"Serbest ödeme: {hesap.gorunen_ad or hesap.unvan} — {tutar} ₺"
        if aciklama:
            hareket_aciklama += f" ({aciklama})"

        if is_cek:
            return self._serbest_odeme_cek(
                data=data,
                hesap=hesap,
                cari_hesap_id=cari_hesap_id,
                kurum_id=kurum_id,
                sube_id=sube_id,
                egitim_yili_id=egitim_yili_id,
                tutar=tutar,
                tutar_int=tutar_int,
                odeme_tarihi=odeme_tarihi,
                odeme_yontemi_id=odeme_yontemi_id,
                mali_hesap_id=mali_hesap_id,
                hareket_aciklama=hareket_aciklama,
            )

        # Nakit / EFT / kart — anında kasa çıkışı
        bakiye_hareket = self.bakiye_service.hareket_olustur(
            mali_hesap_id=mali_hesap_id,
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            tutar=tutar_int,
            yon=HareketYonu.CIKIS,
            kaynak=HareketKaynagi.AVANS,
            islem_tarihi=odeme_tarihi,
            kaynak_id=cari_hesap_id,
            aciklama=hareket_aciklama,
        )

        cari_hareket = self.cari_hareket_service.hareket_olustur(
            cari_hesap_id=cari_hesap_id,
            kurum_id=kurum_id,
            tutar=tutar,
            yon=CariHareketYonu.BORC,
            islem_turu=CariHareketTuru.ODEME,
            islem_tarihi=odeme_tarihi,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            kaynak_tip='SerbestOdeme',
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
                islem_tarihi=odeme_tarihi,
                ana_islem_aciklama=hareket_aciklama,
                islem_yapan=data.get('islem_yapan'),
            )
            if masraf_err:
                return None, {'genel': masraf_err}

        hesap.refresh_from_db()
        return {
            'detail': 'Ödeme başarıyla kaydedildi.',
            'tutar': str(tutar),
            'cari_hareket_id': cari_hareket.pk,
            'bakiye_hareketi_id': bakiye_hareket.pk,
            'yeni_bakiye': str(hesap.bakiye),
        }, None

    def _serbest_odeme_cek(
        self,
        *,
        data,
        hesap,
        cari_hesap_id,
        kurum_id,
        sube_id,
        egitim_yili_id,
        tutar,
        tutar_int,
        odeme_tarihi,
        odeme_yontemi_id,
        mali_hesap_id,
        hareket_aciklama,
    ):
        from apps.finans.application.cek_senet.cek_senet_service import CekSenetService
        from apps.odeme_takip.domain.cek_senet import CekSenetDetay

        vade = data.get('vade_tarihi')
        if not vade:
            return None, {'vade_tarihi': 'Çek/senet ödemelerinde vade tarihi zorunludur.'}

        cek_svc = CekSenetService()
        cek_payload = {
            'kurum_id': kurum_id,
            'sube_id': sube_id,
            'cari_hesap_id': cari_hesap_id,
            'odeme_yontemi_id': odeme_yontemi_id,
            'tutar': tutar_int,
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
        cek_result, cek_err = cek_svc.create_verilen(cek_payload, user=data.get('islem_yapan'))
        if cek_err:
            return None, cek_err if isinstance(cek_err, dict) else {'genel': str(cek_err)}

        cek_id = cek_result['id']
        detay = CekSenetDetay.objects.get(pk=cek_id)

        if mali_hesap_id:
            detay.tahsilat_mali_hesap_id = mali_hesap_id
            detay.save(update_fields=['tahsilat_mali_hesap_id', 'updated_at'])

        cari_hareket = self.cari_hareket_service.hareket_olustur(
            cari_hesap_id=cari_hesap_id,
            kurum_id=kurum_id,
            tutar=tutar,
            yon=CariHareketYonu.BORC,
            islem_turu=CariHareketTuru.ODEME,
            islem_tarihi=odeme_tarihi,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            kaynak_tip='SerbestOdeme',
            kaynak_id=cek_id,
            aciklama=hareket_aciklama,
            islem_yapan=data.get('islem_yapan'),
        )

        detay.cari_hareket = cari_hareket
        detay.save(update_fields=['cari_hareket', 'updated_at'])

        # Çek yolunda işlem masrafı yalnızca mali hesap seçildiyse (nadiren)
        if odeme_yontemi_id and mali_hesap_id:
            _, masraf_err = self.masraf_service.process_if_present(
                data,
                kaynak_tip=IslemMasrafiKaynakTipi.CARI_ODEME,
                kaynak_id=cari_hareket.pk,
                kurum_id=kurum_id,
                sube_id=sube_id,
                egitim_yili_id=egitim_yili_id,
                mali_hesap_id=mali_hesap_id,
                odeme_yontemi_id=odeme_yontemi_id,
                islem_tarihi=odeme_tarihi,
                ana_islem_aciklama=hareket_aciklama,
                islem_yapan=data.get('islem_yapan'),
            )
            if masraf_err:
                return None, {'genel': masraf_err}

        hesap.refresh_from_db()
        return {
            'detail': 'Ödeme çek/senet portföyüne kaydedildi. Kasa çıkışı çek ödendiğinde yapılır.',
            'tutar': str(tutar),
            'cari_hareket_id': cari_hareket.pk,
            'cek_senet_id': cek_id,
            'bakiye_hareketi_id': None,
            'yeni_bakiye': str(hesap.bakiye),
        }, None

    @transaction.atomic
    def serbest_odeme_iptal(self, cari_hareket_id: int):
        """
        Serbest ödemeyi iptal eder.

        Nakit yolu: ters BakiyeHareketi + ters CariHareket
        Çek yolu: çek iptal + ters CariHareket (kasa tersi yok — henüz çıkış yoksa)
        """
        from apps.finans.domain.cari_hareket import CariHareket
        from apps.finans.application.cek_senet.cek_senet_service import CekSenetService
        from apps.odeme_takip.domain.cek_senet import CekSenetDetay, CekSenetDurum

        try:
            hareket = CariHareket.objects.get(pk=cari_hareket_id)
        except CariHareket.DoesNotExist:
            return None, {'genel': 'Cari hareket bulunamadı.'}

        if hareket.kaynak_tip != 'SerbestOdeme':
            return None, {'genel': 'Bu hareket serbest ödeme değil, bu ekrandan iptal edilemez.'}

        iptal_hareket = CariHareket.objects.filter(
            kaynak_tip='SerbestOdemeIptal',
            kaynak_id=hareket.pk,
        ).exists()
        if iptal_hareket:
            return None, {'genel': 'Bu ödeme zaten iptal edilmiş.'}

        self.masraf_service.iptal(
            IslemMasrafiKaynakTipi.CARI_ODEME,
            cari_hareket_id,
            islem_tarihi=timezone.localdate(),
        )

        tutar = hareket.tutar
        hesap = self.hesap_repo.get_by_id(hareket.cari_hesap_id)

        # Çek yolu: OneToOne cari_hareket FK (güvenilir). Nakit yolu: kaynak_id = bakiye hareketi.
        cek_detay = CekSenetDetay.objects.filter(cari_hareket_id=hareket.pk).first()

        if cek_detay is not None:
            if cek_detay.durum == CekSenetDurum.ODENDI:
                return None, {
                    'genel': 'Çek/senet ödenmiş; önce çek kaydını iptal edin veya iade edin.',
                }
            if cek_detay.durum != CekSenetDurum.IPTAL:
                cek_svc = CekSenetService()
                _, cek_err = cek_svc.iptal_et(
                    cek_detay.pk,
                    aciklama='Serbest ödeme iptali',
                )
                if cek_err:
                    return None, cek_err if isinstance(cek_err, dict) else {'genel': str(cek_err)}
        else:
            # Nakit/EFT yolu: kaynak_id = bakiye hareketi
            bakiye_hareketi_id = hareket.kaynak_id
            if bakiye_hareketi_id:
                try:
                    orijinal_bh = BakiyeHareketi.objects.get(pk=bakiye_hareketi_id)
                    self.bakiye_service.hareket_olustur(
                        mali_hesap_id=orijinal_bh.mali_hesap_id,
                        kurum_id=orijinal_bh.kurum_id,
                        sube_id=orijinal_bh.sube_id,
                        egitim_yili_id=orijinal_bh.egitim_yili_id,
                        tutar=int(tutar),
                        yon=HareketYonu.GIRIS,
                        kaynak=HareketKaynagi.TAHSILAT_IPTAL,
                        islem_tarihi=timezone.now().date(),
                        kaynak_id=hareket.pk,
                        aciklama=f'Serbest ödeme iptali: {hesap.gorunen_ad or hesap.unvan} — {tutar} ₺',
                    )
                except BakiyeHareketi.DoesNotExist:
                    pass

        self.cari_hareket_service.hareket_olustur(
            cari_hesap_id=hareket.cari_hesap_id,
            kurum_id=hareket.kurum_id,
            tutar=tutar,
            yon=CariHareketYonu.ALACAK,
            islem_turu=CariHareketTuru.IADE,
            islem_tarihi=timezone.now().date(),
            sube_id=hareket.sube_id,
            egitim_yili_id=hareket.egitim_yili_id,
            kaynak_tip='SerbestOdemeIptal',
            kaynak_id=hareket.pk,
            aciklama=f'Serbest ödeme iptali: {tutar} ₺',
        )

        hesap.refresh_from_db()
        return {
            'detail': 'Serbest ödeme iptal edildi.',
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
            errors['cari_hesap_id'] = 'Pasif cari hesaba ödeme yapılamaz.'

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
                errors['vade_tarihi'] = 'Çek/senet ödemelerinde vade tarihi zorunludur.'
            if not data.get('odeme_yontemi_id'):
                errors['odeme_yontemi_id'] = 'Çek/senet ödemelerinde ödeme yöntemi zorunludur.'
            # Mali hesap opsiyonel (Ödendi anında seçilir)
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

        tutar = data.get('tutar')
        if not tutar or Decimal(str(tutar)) <= Decimal('0'):
            errors['tutar'] = 'Ödeme tutarı sıfırdan büyük olmalıdır.'

        if not data.get('odeme_tarihi'):
            errors['odeme_tarihi'] = 'Ödeme tarihi zorunludur.'

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
