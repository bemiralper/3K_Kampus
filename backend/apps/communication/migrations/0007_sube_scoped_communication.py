# Şube kapsamlı iletişim kayıtları — FK ekleme ve backfill

from django.db import migrations, models
import django.db.models.deletion


def backfill_conversation_sube(apps, schema_editor):
    Conversation = apps.get_model('communication', 'Conversation')
    for conv in Conversation.objects.filter(sube_id__isnull=True).select_related('ogrenci', 'veli'):
        sube_id = None
        if conv.ogrenci_id:
            sube_id = getattr(conv.ogrenci, 'sube_id', None)
        if not sube_id and conv.veli_id:
            Veli = apps.get_model('ogrenci', 'OgrenciVeli')
            veli = Veli.objects.filter(id=conv.veli_id).select_related('ogrenci').first()
            if veli and veli.ogrenci_id:
                sube_id = veli.ogrenci.sube_id
        if sube_id:
            Conversation.objects.filter(pk=conv.pk).update(sube_id=sube_id)


def backfill_campaign_sube(apps, schema_editor):
    OutboundCampaign = apps.get_model('communication', 'OutboundCampaign')
    Sube = apps.get_model('sube', 'Sube')

    kurum_ids = OutboundCampaign.objects.filter(sube_id__isnull=True).values_list(
        'kurum_id', flat=True,
    ).distinct()
    for kurum_id in kurum_ids:
        default_sube = Sube.objects.filter(kurum_id=kurum_id).order_by('id').first()
        if not default_sube:
            continue
        for campaign in OutboundCampaign.objects.filter(kurum_id=kurum_id, sube_id__isnull=True):
            sube_id = default_sube.id
            filt = campaign.recipient_filter_json or {}
            raw = filt.get('sube_id')
            if raw:
                try:
                    sube_id = int(raw)
                except (TypeError, ValueError):
                    pass
            OutboundCampaign.objects.filter(pk=campaign.pk).update(sube_id=sube_id)


def backfill_kurum_models_to_first_sube(apps, schema_editor):
    Sube = apps.get_model('sube', 'Sube')
    models_to_backfill = [
        ('communication', 'MessageTemplate'),
        ('communication', 'MessageTemplateCategory'),
        ('communication', 'CampaignAttachment'),
    ]
    for app_label, model_name in models_to_backfill:
        Model = apps.get_model(app_label, model_name)
        kurum_ids = Model.objects.filter(sube_id__isnull=True).values_list(
            'kurum_id', flat=True,
        ).distinct()
        for kurum_id in kurum_ids:
            sube = Sube.objects.filter(kurum_id=kurum_id).order_by('id').first()
            if not sube:
                continue
            Model.objects.filter(kurum_id=kurum_id, sube_id__isnull=True).update(sube_id=sube.id)


class Migration(migrations.Migration):

    dependencies = [
        ('communication', '0006_category_audience_reply_reactions'),
        ('sube', '0002_sube_extended_profile'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='messagetemplatecategory',
            name='comm_template_category_kurum_slug_uniq',
        ),
        migrations.AddField(
            model_name='conversation',
            name='sube',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='conversations',
                to='sube.sube',
                verbose_name='Şube',
            ),
        ),
        migrations.AddField(
            model_name='outboundcampaign',
            name='sube',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='outbound_campaigns',
                to='sube.sube',
                verbose_name='Şube',
            ),
        ),
        migrations.AddField(
            model_name='messagetemplate',
            name='sube',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='message_templates',
                to='sube.sube',
                verbose_name='Şube',
            ),
        ),
        migrations.AddField(
            model_name='messagetemplatecategory',
            name='sube',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='message_template_categories',
                to='sube.sube',
                verbose_name='Şube',
            ),
        ),
        migrations.AddField(
            model_name='campaignattachment',
            name='sube',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='campaign_attachments',
                to='sube.sube',
                verbose_name='Şube',
            ),
        ),
        migrations.RunPython(backfill_conversation_sube, migrations.RunPython.noop),
        migrations.RunPython(backfill_campaign_sube, migrations.RunPython.noop),
        migrations.RunPython(backfill_kurum_models_to_first_sube, migrations.RunPython.noop),
        migrations.AddIndex(
            model_name='conversation',
            index=models.Index(fields=['kurum', 'sube'], name='comm_conv_kurum_sube_idx'),
        ),
        migrations.AddIndex(
            model_name='outboundcampaign',
            index=models.Index(fields=['kurum', 'sube'], name='comm_camp_kurum_sube_idx'),
        ),
        migrations.AddIndex(
            model_name='messagetemplate',
            index=models.Index(fields=['kurum', 'sube'], name='comm_tpl_kurum_sube_idx'),
        ),
        migrations.AddIndex(
            model_name='campaignattachment',
            index=models.Index(fields=['kurum', 'sube'], name='comm_att_kurum_sube_idx'),
        ),
        migrations.AddConstraint(
            model_name='messagetemplatecategory',
            constraint=models.UniqueConstraint(
                fields=['sube', 'slug'],
                name='comm_template_category_sube_slug_uniq',
            ),
        ),
    ]
