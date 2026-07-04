"""
Öğrenci/veli telefon değişikliklerinde iletişim kayıtlarını otomatik senkronize eder.
"""
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver


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
