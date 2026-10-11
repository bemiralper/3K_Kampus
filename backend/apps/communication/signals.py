"""
Öğrenci/veli telefon değişikliklerinde iletişim kayıtlarını otomatik senkronize eder.
"""
import logging

from django.db import transaction
from django.db.models.signals import post_delete, post_save, pre_delete, pre_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


def _run_google(action, label: str):
    """Google kuyruğu hata verirse öğrenci/veli kaydını düşürmesin."""
    try:
        with transaction.atomic():
            action()
    except Exception:
        logger.exception('Google kişi kuyruğu (%s) başarısız', label)


@receiver(pre_save, sender='ogrenci.OgrenciVeli')
def _capture_veli_old_phone(sender, instance, **kwargs):
    if instance.pk:
        from apps.ogrenci.domain.models import OgrenciVeli

        old = OgrenciVeli.objects.filter(pk=instance.pk).values_list('telefon', flat=True).first()
        instance._comm_old_telefon = old
    else:
        instance._comm_old_telefon = None


@receiver(post_save, sender='ogrenci.OgrenciVeli')
def _sync_veli_phone_on_save(sender, instance, created, **kwargs):
    from apps.communication.application.phone_change_sync import PhoneChangeSync

    old_phone = None if created else getattr(instance, '_comm_old_telefon', None)
    PhoneChangeSync.on_veli_saved(instance, old_phone=old_phone)


@receiver(post_delete, sender='ogrenci.OgrenciVeli')
def _sync_veli_phone_on_delete(sender, instance, **kwargs):
    from apps.communication.application.phone_change_sync import PhoneChangeSync

    PhoneChangeSync.on_veli_deleted(instance)
    ogrenci_id = getattr(instance, 'ogrenci_id', None)
    if not ogrenci_id:
        return

    def _enqueue_remaining():
        from apps.ogrenci.domain.models import Ogrenci
        ogrenci = Ogrenci.objects.filter(pk=ogrenci_id).first()
        if ogrenci is not None:
            _google_contacts().enqueue_ogrenci(ogrenci)

    _run_google(_enqueue_remaining, 'veli silme')


def _google_contacts():
    from apps.communication.application.google_contacts import sync as google_sync
    return google_sync


@receiver(post_save, sender='ogrenci.OgrenciVeli')
def _enqueue_google_veli(sender, instance, **kwargs):
    _run_google(lambda: _google_contacts().enqueue_veli(instance), 'veli')


@receiver(pre_delete, sender='ogrenci.OgrenciVeli')
def _queue_google_veli_delete(sender, instance, **kwargs):
    _run_google(lambda: _google_contacts().queue_deletes_for_veli(instance), 'veli silme')


@receiver(pre_save, sender='ogrenci.Ogrenci')
def _capture_ogrenci_old_phone(sender, instance, **kwargs):
    if instance.pk:
        from apps.ogrenci.domain.models import Ogrenci

        old = Ogrenci.objects.filter(pk=instance.pk).values_list('telefon', flat=True).first()
        instance._comm_old_telefon = old
    else:
        instance._comm_old_telefon = None


@receiver(post_save, sender='ogrenci.Ogrenci')
def _sync_ogrenci_phone_on_save(sender, instance, created, **kwargs):
    from apps.communication.application.phone_change_sync import PhoneChangeSync

    old_phone = None if created else getattr(instance, '_comm_old_telefon', None)
    if created and not (instance.telefon or '').strip():
        return
    if not created and old_phone == (instance.telefon or '').strip():
        return
    PhoneChangeSync.on_ogrenci_saved(instance, old_phone=old_phone)


@receiver(post_save, sender='ogrenci.Ogrenci')
def _enqueue_google_ogrenci(sender, instance, **kwargs):
    _run_google(lambda: _google_contacts().enqueue_ogrenci(instance), 'öğrenci')


@receiver(pre_delete, sender='ogrenci.Ogrenci')
def _queue_google_ogrenci_delete(sender, instance, **kwargs):
    _run_google(lambda: _google_contacts().queue_deletes_for_ogrenci(instance), 'öğrenci silme')
