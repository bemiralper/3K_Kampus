from django.db import migrations, models


def backfill_template_groups(apps, schema_editor):
    from apps.communication.application.notification_events import template_group_for_event_key

    Binding = apps.get_model('communication', 'NotificationTemplateBinding')
    Meta = apps.get_model('communication', 'WhatsAppMetaTemplate')
    App = apps.get_model('communication', 'MessageTemplate')

    meta_updates: dict = {}
    app_updates: dict = {}
    for binding in Binding.objects.all().only(
        'event_key', 'meta_template_id', 'message_template_id',
    ):
        group = template_group_for_event_key(binding.event_key)
        if not group:
            continue
        if binding.meta_template_id and binding.meta_template_id not in meta_updates:
            meta_updates[binding.meta_template_id] = group
        if binding.message_template_id and binding.message_template_id not in app_updates:
            app_updates[binding.message_template_id] = group

    for pk, group in meta_updates.items():
        Meta.objects.filter(pk=pk, template_group='').update(template_group=group)
    for pk, group in app_updates.items():
        App.objects.filter(pk=pk, template_group='').update(template_group=group)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('communication', '0020_notification_staff_recipient'),
    ]

    operations = [
        migrations.AddField(
            model_name='messagetemplate',
            name='template_group',
            field=models.CharField(
                blank=True,
                db_index=True,
                default='',
                help_text='Bildirim olayı modülü (odev, yoklama:kutuphane). Meta’ya gönderilmez.',
                max_length=64,
                verbose_name='Şablon Grubu',
            ),
        ),
        migrations.AddField(
            model_name='whatsappmetatemplate',
            name='template_group',
            field=models.CharField(
                blank=True,
                db_index=True,
                default='',
                help_text='Bildirim olayı modülü (odev, yoklama:kutuphane). Meta’ya gönderilmez.',
                max_length=64,
                verbose_name='Şablon Grubu',
            ),
        ),
        migrations.RunPython(backfill_template_groups, noop),
    ]
