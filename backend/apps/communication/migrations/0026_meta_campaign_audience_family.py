from django.db import migrations, models


def backfill_campaign_tags(apps, schema_editor):
    from apps.communication.application.campaign_template_catalog import (
        infer_campaign_audience,
        is_campaign_eligible,
    )

    Template = apps.get_model('communication', 'WhatsAppMetaTemplate')
    for tpl in Template.objects.all().iterator():
        if not is_campaign_eligible(usage_scope=tpl.usage_scope):
            continue
        audience = tpl.campaign_audience or infer_campaign_audience(tpl.name)
        updates = []
        if audience and tpl.campaign_audience != audience:
            tpl.campaign_audience = audience
            updates.append('campaign_audience')
        if updates:
            tpl.save(update_fields=updates)


class Migration(migrations.Migration):

    dependencies = [
        ('communication', '0025_meta_template_example_values'),
    ]

    operations = [
        migrations.AddField(
            model_name='whatsappmetatemplate',
            name='campaign_audience',
            field=models.CharField(
                blank=True,
                db_index=True,
                default='',
                help_text='veli / ogrenci / personel. Boşsa ada göre tahmin edilir.',
                max_length=16,
                verbose_name='Toplu gönderim kitlesi',
            ),
        ),
        migrations.AddField(
            model_name='whatsappmetatemplate',
            name='campaign_family',
            field=models.CharField(
                blank=True,
                db_index=True,
                default='',
                help_text='duyuru / hatirlatma / bilgilendirme / genel veya özel slug.',
                max_length=32,
                verbose_name='Toplu gönderim kategorisi',
            ),
        ),
        migrations.RunPython(backfill_campaign_tags, migrations.RunPython.noop),
    ]
