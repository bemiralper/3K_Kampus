"""
Cari v2 — Komut (yazma) servisi.

Cari hesap oluşturma/güncelleme/silme/aktiflik ve açılış bakiyesi.
Tüm çok adımlı yazma işlemleri transaction içinde yürür; bakiye
hareketleri merkezi CariHareketService üzerinden yazılır.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from apps.finans.application.cari_hareket_service import CariHareketService
from apps.finans.constants.cari_types import CariHareketTuru, CariHareketYonu, CariHesapTuru
from apps.finans.domain.cari_etiket import CariEtiket
from apps.finans.infrastructure.cari_hesap_repository import CariHesapRepository

_TUR_KODLARI = {
    'tedarikci': 'TDR',
    'musteri': 'MST',
    'karma': 'KRM',
    'gelir_hesabi': 'GLR',
    'gider_hesabi': 'GDR',
    'diger': 'DGR',
}

_YAZILABILIR_ALANLAR = [
    'unvan', 'kisa_ad', 'hesap_turu', 'hesap_kodu',
    'kategori', 'risk_limiti', 'varsayilan_vade_gun', 'para_birimi',
    'vergi_no', 'vergi_dairesi',
    'telefon', 'email', 'adres', 'il', 'ilce',
    'yetkili_kisi', 'yetkili_telefon',
    'banka_adi', 'iban', 'hesap_sahibi',
    'notlar', 'aktif_mi',
]


def _to_decimal(value, default='0'):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


class CariCommandService:
    def __init__(self):
        self.repo = CariHesapRepository
        self.hareket_service = CariHareketService()

    def _validate(self, data):
        errors = {}
        if not data.get('kurum_id'):
            errors['kurum'] = 'Kurum bilgisi zorunludur.'
        if not data.get('sube_id'):
            errors['sube'] = 'Şube bilgisi zorunludur.'
        if not data.get('unvan'):
            errors['unvan'] = 'Ünvan zorunludur.'
        hesap_turu = data.get('hesap_turu')
        if not hesap_turu:
            errors['hesap_turu'] = 'Hesap türü zorunludur.'
        elif hesap_turu not in dict(CariHesapTuru.CHOICES):
            errors['hesap_turu'] = 'Geçersiz hesap türü.'
        return errors or None

    def _generate_kod(self, kurum_id, hesap_turu, sube_id):
        prefix = f"CH-{_TUR_KODLARI.get(hesap_turu, 'CRI')}-"
        son = self.repo.son_hesap_kodu_sirasi(kurum_id, prefix, sube_id=sube_id)
        return f'{prefix}{son + 1:04d}'

    @transaction.atomic
    def create(self, data: dict, *, islem_yapan=None):
        errors = self._validate(data)
        if errors:
            return None, errors

        vergi_no = data.get('vergi_no') or ''
        if vergi_no and self.repo.vergi_no_kontrol(
            data['kurum_id'], vergi_no, sube_id=data.get('sube_id'),
        ):
            return None, {'vergi_no': 'Bu vergi numarası zaten kayıtlı.'}

        etiketler = data.pop('etiketler', None)
        acilis_tutar = _to_decimal(data.pop('acilis_bakiye', 0))
        acilis_yon = data.pop('acilis_yon', CariHareketYonu.BORC)

        if not data.get('hesap_kodu'):
            data['hesap_kodu'] = self._generate_kod(
                data['kurum_id'], data.get('hesap_turu'), data.get('sube_id'),
            )

        create_data = {
            k: v for k, v in data.items()
            if k in _YAZILABILIR_ALANLAR + ['kurum_id', 'sube_id',
                                            'gider_kategorileri', 'gelir_kategorileri']
        }
        hesap = self.repo.create(create_data)

        if etiketler:
            self._set_etiketler(hesap, etiketler, data['kurum_id'], data.get('sube_id'))

        if acilis_tutar and acilis_tutar > 0:
            yon = (
                CariHareketYonu.ALACAK
                if acilis_yon == CariHareketYonu.ALACAK
                else CariHareketYonu.BORC
            )
            self.hareket_service.hareket_olustur(
                cari_hesap_id=hesap.pk,
                kurum_id=hesap.kurum_id,
                tutar=acilis_tutar,
                yon=yon,
                islem_turu=CariHareketTuru.ACILIS,
                islem_tarihi=timezone.localdate(),
                sube_id=hesap.sube_id,
                aciklama='Açılış bakiyesi',
                islem_yapan=islem_yapan,
            )
            hesap.refresh_from_db()

        return hesap, None

    @transaction.atomic
    def update(self, hesap_id, data: dict, *, islem_yapan=None):
        hesap = self.repo.get_by_id(hesap_id)
        if not hesap:
            return None, {'genel': 'Cari hesap bulunamadı.'}

        vergi_no = data.get('vergi_no', hesap.vergi_no)
        if vergi_no and self.repo.vergi_no_kontrol(
            hesap.kurum_id, vergi_no, sube_id=hesap.sube_id, haric_id=hesap.pk,
        ):
            return None, {'vergi_no': 'Bu vergi numarası zaten kayıtlı.'}

        etiketler = data.pop('etiketler', None)
        update_data = {
            k: v for k, v in data.items()
            if k in _YAZILABILIR_ALANLAR + ['gider_kategorileri', 'gelir_kategorileri']
        }
        hesap = self.repo.update(hesap, update_data)

        if etiketler is not None:
            self._set_etiketler(hesap, etiketler, hesap.kurum_id, hesap.sube_id)

        return hesap, None

    def soft_delete(self, hesap_id):
        hesap = self.repo.get_by_id(hesap_id)
        if not hesap:
            return None, {'genel': 'Cari hesap bulunamadı.'}
        if hesap.bakiye != 0:
            return None, {'genel': 'Açık bakiyesi olan cari hesap silinemez.'}
        return self.repo.soft_delete(hesap), None

    def toggle_aktif(self, hesap_id):
        hesap = self.repo.get_by_id(hesap_id)
        if not hesap:
            return None, {'genel': 'Cari hesap bulunamadı.'}
        return self.repo.toggle_aktif(hesap), None

    def _set_etiketler(self, hesap, etiket_ids, kurum_id, sube_id):
        valid = CariEtiket.objects.filter(id__in=etiket_ids, kurum_id=kurum_id)
        hesap.etiketler.set(list(valid))
