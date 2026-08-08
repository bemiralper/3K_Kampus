"""
Kaynak içerik adı değişince bağlı ödev görev başlıklarını senkron tut.
"""
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from apps.resources.models import ResourceContent


@receiver(pre_save, sender=ResourceContent)
def _cache_content_ad_before_save(sender, instance, **kwargs):
    if not instance.pk:
        instance._assignment_sync_old_ad = None
        return
    old_ad = (
        ResourceContent.objects.filter(pk=instance.pk)
        .values_list('ad', flat=True)
        .first()
    )
    instance._assignment_sync_old_ad = old_ad


@receiver(post_save, sender=ResourceContent)
def sync_assignment_task_titles_on_content_rename(sender, instance, created, **kwargs):
    """ResourceContent.ad değişince AssignmentTask.title güncelle."""
    if created:
        return

    update_fields = kwargs.get('update_fields')
    if update_fields is not None and 'ad' not in update_fields:
        return

    old_ad = getattr(instance, '_assignment_sync_old_ad', object())
    new_ad = (instance.ad or '').strip()
    if not new_ad or old_ad == instance.ad:
        return

    from apps.coaching.assignment_manual.models import AssignmentTask

    AssignmentTask.objects.filter(content_id=instance.id).exclude(title=new_ad).update(
        title=new_ad,
    )
