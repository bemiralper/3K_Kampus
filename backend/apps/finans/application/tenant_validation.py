"""Yazma öncesi finans ilişkilerinin kurum/şube sınırını doğrular."""
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.payment_method import OdemeYontemi
from apps.finans.domain.cari_hesap import CariHesap


def validate_finans_links(*, kurum_id, sube_id, mali_hesap_id=None,
                          odeme_yontemi_id=None, cari_hesap_id=None,
                          match_payment_account=True):
    errors = {}
    if sube_id is not None:
        from apps.sube.domain.models import Sube
        if not Sube.objects.filter(pk=sube_id, kurum_id=kurum_id, aktif_mi=True).exists():
            errors['sube_id'] = 'Şube aktif kuruma ait değil veya pasif.'
    hesap = None
    if mali_hesap_id:
        hesap = MaliHesap.objects.filter(
            pk=mali_hesap_id, sube__kurum_id=kurum_id, aktif_mi=True,
        ).first()
        if not hesap or (sube_id is not None and hesap.sube_id != int(sube_id)):
            errors['mali_hesap_id'] = 'Mali hesap aktif kurum/şubeye ait değil veya pasif.'
    if odeme_yontemi_id:
        yontem = OdemeYontemi.objects.select_related('mali_hesap__sube').filter(
            pk=odeme_yontemi_id, kurum_id=kurum_id, aktif_mi=True,
        ).first()
        if not yontem:
            errors['odeme_yontemi_id'] = 'Ödeme yöntemi aktif kuruma ait değil veya pasif.'
        elif yontem.mali_hesap_id:
            mh = yontem.mali_hesap
            if (mh.silindi_mi or not mh.aktif_mi
                    or mh.sube.kurum_id != int(kurum_id)
                    or (sube_id is not None and mh.sube_id != int(sube_id))
                    or (match_payment_account and mali_hesap_id
                        and mh.pk != int(mali_hesap_id))):
                errors['odeme_yontemi_id'] = 'Ödeme yöntemi seçilen mali hesap/şube ile eşleşmiyor.'
    if cari_hesap_id:
        cari = CariHesap.objects.filter(
            pk=cari_hesap_id, kurum_id=kurum_id, aktif_mi=True,
        ).first()
        if not cari or (sube_id is not None and cari.sube_id != int(sube_id)):
            errors['cari_hesap_id'] = 'Cari hesap aktif kurum/şubeye ait değil veya pasif.'
    return errors or None
