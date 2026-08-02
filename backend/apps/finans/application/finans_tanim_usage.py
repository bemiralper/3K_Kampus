"""
Finans tanım kayıtlarının (MaliHesap, OdemeYontemi) kullanım kontrolü.
Silme işlemi öncesi referans sayıları kontrol edilir.
"""
from django.apps import apps

from apps.finans.constants.gider_types import OdemeDurum
from apps.finans.domain.payment_method import OdemeYontemi
from apps.odeme_takip.domain.enums import TahsilatDurum
from apps.odeme_takip.domain.models import Sozlesme, Tahsilat


def _format_delete_block_message(entity_label: str, usages: list[tuple[str, int]]) -> str | None:
    """Kullanım varsa Türkçe silme engeli mesajı üretir."""
    active = [(label, count) for label, count in usages if count > 0]
    if not active:
        return None
    parts = [f"{label} ({count})" for label, count in active]
    return (
        f"Bu {entity_label} silinemez; aşağıdaki kayıtlarda kullanılıyor: "
        + ", ".join(parts)
        + "."
    )


def odeme_yontemi_ids_for_mali_hesap(mali_hesap_id: int) -> list[int]:
    """Hesaba bağlı (silinmemiş) ödeme yöntemleri."""
    return list(
        OdemeYontemi.objects.filter(mali_hesap_id=mali_hesap_id).values_list('id', flat=True)
    )


def _kullanimdaki_odeme_yontemi_sayisi(mali_hesap_id: int) -> int:
    """
    Hesabın ödeme yöntemlerinden kaçı gerçekten kullanımda?

    Kasa/banka hesabı açılırken kanal kayıtları (Nakit, Havale, POS…) otomatik
    üretildiği için yalnızca varlıkları silmeyi engellememeli; hesapla birlikte
    silinirler. Engel yalnızca bir kayıtta kullanılmış yöntemler için geçerlidir.
    """
    return sum(
        1
        for odeme_yontemi_id in odeme_yontemi_ids_for_mali_hesap(mali_hesap_id)
        if is_odeme_yontemi_in_use(odeme_yontemi_id)
    )


def get_mali_hesap_delete_block_message(mali_hesap_id: int) -> str | None:
    """Mali hesap silinmeden önce kullanım kontrolü."""
    BakiyeHareketi = apps.get_model('finans', 'BakiyeHareketi')
    DonemBakiye = apps.get_model('finans', 'DonemBakiye')
    GelirKaydi = apps.get_model('finans', 'GelirKaydi')
    GiderKaydi = apps.get_model('finans', 'GiderKaydi')
    GelirTahsilat = apps.get_model('finans', 'GelirTahsilat')
    GiderOdeme = apps.get_model('finans', 'GiderOdeme')

    usages = [
        (
            'kullanımda olan ödeme yöntemi',
            _kullanimdaki_odeme_yontemi_sayisi(mali_hesap_id),
        ),
        (
            'öğrenci sözleşmesi',
            Sozlesme.objects.filter(mali_hesap_id=mali_hesap_id).count(),
        ),
        (
            'bakiye hareketi',
            BakiyeHareketi.objects.filter(mali_hesap_id=mali_hesap_id).count(),
        ),
        (
            'dönem bakiye kaydı',
            DonemBakiye.objects.filter(mali_hesap_id=mali_hesap_id).count(),
        ),
        (
            'gelir kaydı',
            GelirKaydi.objects.filter(mali_hesap_id=mali_hesap_id, silindi_mi=False).count(),
        ),
        (
            'gider kaydı',
            GiderKaydi.objects.filter(mali_hesap_id=mali_hesap_id, silindi_mi=False).count(),
        ),
        (
            'gelir tahsilatı',
            GelirTahsilat.objects.filter(
                mali_hesap_id=mali_hesap_id,
            ).exclude(durum=OdemeDurum.IPTAL).count(),
        ),
        (
            'gider ödemesi',
            GiderOdeme.objects.filter(
                mali_hesap_id=mali_hesap_id,
            ).exclude(durum=OdemeDurum.IPTAL).count(),
        ),
    ]
    return _format_delete_block_message('mali hesap', usages)


def get_odeme_yontemi_delete_block_message(odeme_yontemi_id: int) -> str | None:
    """Ödeme yöntemi silinmeden önce kullanım kontrolü."""
    GelirKaydi = apps.get_model('finans', 'GelirKaydi')
    GiderKaydi = apps.get_model('finans', 'GiderKaydi')
    GelirTahsilat = apps.get_model('finans', 'GelirTahsilat')
    GiderOdeme = apps.get_model('finans', 'GiderOdeme')

    usages = [
        (
            'öğrenci sözleşmesi',
            Sozlesme.objects.filter(odeme_yontemi_id=odeme_yontemi_id).count(),
        ),
        (
            'öğrenci tahsilatı',
            Tahsilat.objects.filter(
                odeme_yontemi_id=odeme_yontemi_id,
                durum=TahsilatDurum.AKTIF,
            ).count(),
        ),
        (
            'gelir kaydı',
            GelirKaydi.objects.filter(
                odeme_yontemi_id=odeme_yontemi_id,
                silindi_mi=False,
            ).count(),
        ),
        (
            'gider kaydı',
            GiderKaydi.objects.filter(
                odeme_yontemi_id=odeme_yontemi_id,
                silindi_mi=False,
            ).exclude(durum='iptal').count(),
        ),
        (
            'gelir tahsilatı',
            GelirTahsilat.objects.filter(
                odeme_yontemi_id=odeme_yontemi_id,
            ).exclude(durum=OdemeDurum.IPTAL).count(),
        ),
        (
            'gider ödemesi',
            GiderOdeme.objects.filter(
                odeme_yontemi_id=odeme_yontemi_id,
            ).exclude(durum=OdemeDurum.IPTAL).count(),
        ),
    ]
    return _format_delete_block_message('ödeme yöntemi', usages)


def is_odeme_yontemi_in_use(odeme_yontemi_id: int) -> bool:
    """Ödeme yöntemi herhangi bir kayıtta kullanılıyor mu?"""
    return get_odeme_yontemi_delete_block_message(odeme_yontemi_id) is not None
