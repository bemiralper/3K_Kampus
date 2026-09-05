from django.db import migrations, models

from . import _idempotent as idem


def enable_existing_pending(apps, schema_editor):
    Dispatch = apps.get_model('olcme_degerlendirme', 'ExamScheduledDispatch')
    Dispatch.objects.filter(status='pending', scheduled_at__isnull=False).update(is_enabled=True)


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0019_yoklama_present_publish_dispatch'),
    ]

    operations = [
        idem.AddFieldIfMissing(
            model_name='examscheduleddispatch',
            name='is_enabled',
            field=models.BooleanField(
                default=False,
                help_text='Kapalıysa yayın saati dolsa bile otomatik gönderilmez.',
            ),
        ),
        idem.AddFieldIfMissing(
            model_name='examscheduleddispatch',
            name='campaign_id',
            field=models.UUIDField(blank=True, null=True),
        ),
        migrations.RunPython(enable_existing_pending, migrations.RunPython.noop),
    ]
