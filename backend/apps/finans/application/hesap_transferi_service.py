"""
Hesap Transferi Service
İş mantığı katmanı — iki mali hesap arasında para transferi (virman,
bankaya para yatırma, bankadan kasaya çekme).

Temel Kural: Her transfer kaynak hesapta ÇIKIŞ, hedef hesapta GİRİŞ olmak
üzere iki BakiyeHareketi kaydı oluşturur. İşlem atomiktir — ya ikisi de
başarılı olur ya da hiçbiri kaydedilmez.
"""
from django.db import transaction

from apps.finans.application.bakiye_hareketi_service import BakiyeHareketiService
from apps.finans.application.islem_masrafi_service import IslemMasrafiService
from apps.finans.domain.islem_masrafi import IslemMasrafiKaynakTipi
from apps.finans.constants.hareket_types import HareketYonu, HareketKaynagi, TransferTuru
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.infrastructure.hesap_transferi_repository import HesapTransferiRepository


class HesapTransferiService:

    def __init__(self):
        self.repo = HesapTransferiRepository()
        self.bakiye_service = BakiyeHareketiService()
        self.masraf_service = IslemMasrafiService()

    def get_all(self, kurum_id, sube_id=None, egitim_yili_id=None, filters=None):
        return self.repo.get_all(kurum_id, sube_id, egitim_yili_id, filters)

    @transaction.atomic
    def transfer_yap(self, data, user=None, kurum_id=None, sube_id=None):
        """
        data: {
            kaynak_hesap_id, hedef_hesap_id, tutar, transfer_tarihi,
            transfer_turu (opsiyonel, default 'virman'), aciklama,
            egitim_yili_id (opsiyonel — dönem bakiyesi için)
        }
        kurum_id / sube_id: verilirse hesapların bu tenant'a ait olduğu
        doğrulanır (cross-tenant virman engellenir).
        """
        errors = self._validate(data)
        if errors:
            return None, errors

        kaynak = MaliHesap.objects.filter(id=data['kaynak_hesap_id']).select_related('sube').first()
        hedef = MaliHesap.objects.filter(id=data['hedef_hesap_id']).select_related('sube').first()

        if not kaynak:
            return None, {'error': 'Kaynak hesap bulunamadı'}
        if not hedef:
            return None, {'error': 'Hedef hesap bulunamadı'}
        if kaynak.id == hedef.id:
            return None, {'error': 'Kaynak ve hedef hesap aynı olamaz'}
        if kaynak.sube.kurum_id != hedef.sube.kurum_id:
            return None, {'error': 'Kaynak ve hedef hesap aynı kuruma ait olmalıdır'}

        if kurum_id is not None:
            if kaynak.sube.kurum_id != int(kurum_id) or hedef.sube.kurum_id != int(kurum_id):
                return None, {'error': 'Seçilen hesaplar aktif kuruma ait değil'}
        if sube_id is not None:
            if kaynak.sube_id != int(sube_id) or hedef.sube_id != int(sube_id):
                return None, {'error': 'Seçilen hesaplar aktif şubeye ait değil'}

        tutar = int(data['tutar'])
        transfer_turu = data.get('transfer_turu') or TransferTuru.VIRMAN
        if transfer_turu not in dict(TransferTuru.CHOICES):
            transfer_turu = TransferTuru.VIRMAN
        egitim_yili_id = data.get('egitim_yili_id')
        aciklama = data.get('aciklama', '')
        tarih = data['transfer_tarihi']

        transfer = self.repo.create({
            'kaynak_hesap': kaynak,
            'hedef_hesap': hedef,
            'kurum_id': kaynak.sube.kurum_id,
            'sube_id': kaynak.sube_id,
            'egitim_yili_id': egitim_yili_id,
            'tutar': tutar,
            'transfer_turu': transfer_turu,
            'transfer_tarihi': tarih,
            'aciklama': aciklama,
            'islem_yapan': user,
        })

        etiket = TransferTuru.get_label(transfer_turu)
        kaynak_aciklama = f'{etiket}: {kaynak.ad} → {hedef.ad}' + (f' — {aciklama}' if aciklama else '')
        hedef_aciklama = f'{etiket}: {kaynak.ad} → {hedef.ad}' + (f' — {aciklama}' if aciklama else '')

        kaynak_hareket = self.bakiye_service.hareket_olustur(
            mali_hesap_id=kaynak.id,
            kurum_id=kaynak.sube.kurum_id,
            sube_id=kaynak.sube_id,
            egitim_yili_id=egitim_yili_id,
            yon=HareketYonu.CIKIS,
            tutar=tutar,
            kaynak=HareketKaynagi.TRANSFER,
            islem_tarihi=tarih,
            kaynak_tip='hesap_transferi',
            kaynak_id=transfer.id,
            aciklama=kaynak_aciklama,
            islem_yapan=user,
        )
        hedef_hareket = self.bakiye_service.hareket_olustur(
            mali_hesap_id=hedef.id,
            kurum_id=hedef.sube.kurum_id,
            sube_id=hedef.sube_id,
            egitim_yili_id=egitim_yili_id,
            yon=HareketYonu.GIRIS,
            tutar=tutar,
            kaynak=HareketKaynagi.TRANSFER,
            islem_tarihi=tarih,
            kaynak_tip='hesap_transferi',
            kaynak_id=transfer.id,
            aciklama=hedef_aciklama,
            islem_yapan=user,
        )

        transfer.kaynak_hareket_id = kaynak_hareket.id
        transfer.hedef_hareket_id = hedef_hareket.id
        transfer.save(update_fields=['kaynak_hareket_id', 'hedef_hareket_id'])

        odeme_yontemi_id = data.get('odeme_yontemi_id')
        if odeme_yontemi_id:
            _, masraf_err = self.masraf_service.process_if_present(
                data,
                kaynak_tip=IslemMasrafiKaynakTipi.HESAP_TRANSFERI,
                kaynak_id=transfer.id,
                kurum_id=kaynak.sube.kurum_id,
                sube_id=kaynak.sube_id,
                egitim_yili_id=egitim_yili_id,
                mali_hesap_id=kaynak.id,
                odeme_yontemi_id=odeme_yontemi_id,
                islem_tarihi=tarih,
                ana_islem_aciklama=kaynak_aciklama,
                islem_yapan=user,
            )
            if masraf_err:
                return None, {'genel': masraf_err}

        return transfer, None

    def _validate(self, data):
        errors = {}
        if not data.get('kaynak_hesap_id'):
            errors['kaynak_hesap_id'] = 'Kaynak hesap seçilmedi'
        if not data.get('hedef_hesap_id'):
            errors['hedef_hesap_id'] = 'Hedef hesap seçilmedi'
        if not data.get('transfer_tarihi'):
            errors['transfer_tarihi'] = 'Transfer tarihi zorunlu'
        tutar = data.get('tutar')
        if tutar is None:
            errors['tutar'] = 'Tutar zorunlu'
        else:
            try:
                if int(tutar) <= 0:
                    errors['tutar'] = "Tutar 0'dan büyük olmalı"
            except (TypeError, ValueError):
                errors['tutar'] = 'Geçersiz tutar'
        return errors if errors else None
