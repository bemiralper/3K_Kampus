"""Çoklu WhatsApp hesabı (hibrit şube/rol kapsamı) + conversation/campaign FK."""

from django.db import migrations, models
import django.db.models.deletion


def migrate_legacy_configs(apps, schema_editor):
    Config = apps.get_model('communication', 'CommunicationChannelConfig')
    Role = apps.get_model('roller', 'Role')
    for cfg in Config.objects.all():
        if not cfg.name:
            cfg.name = cfg.display_phone or 'Genel WhatsApp' or 'WhatsApp'
            if not cfg.name.strip():
                cfg.name = 'Genel WhatsApp'
        cfg.scope_type = 'ALL_SUBES'
        cfg.is_default = True
        cfg.save(update_fields=['name', 'scope_type', 'is_default', 'updated_at'])
        # Tüm aktif rolleri ata (geriye uyum: tek hesap herkese açıktı)
        roles = list(Role.objects.filter(is_active=True, silindi_mi=False).values_list('id', flat=True))
        if roles:
            cfg.allowed_roles.set(roles)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('communication', '0008_contactidentity_kisi'),
        ('roller', '0003_role_soft_delete'),
        ('sube', '0003_sube_branding'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='communicationchannelconfig',
            name='unique_comm_channel_per_kurum',
        ),
        migrations.AddField(
            model_name='communicationchannelconfig',
            name='name',
            field=models.CharField(blank=True, default='', max_length=120, verbose_name='Hesap Adı'),
        ),
        migrations.AddField(
            model_name='communicationchannelconfig',
            name='app_secret_encrypted',
            field=models.TextField(blank=True, default='', verbose_name='App Secret (encrypted)'),
        ),
        migrations.AddField(
            model_name='communicationchannelconfig',
            name='is_default',
            field=models.BooleanField(default=False, verbose_name='Varsayılan Hesap'),
        ),
        migrations.AddField(
            model_name='communicationchannelconfig',
            name='scope_type',
            field=models.CharField(
                choices=[('ALL_SUBES', 'Tüm şubeler'), ('SELECTED_SUBES', 'Seçili şubeler')],
                default='ALL_SUBES',
                max_length=20,
                verbose_name='Şube Kapsamı',
            ),
        ),
        migrations.AddField(
            model_name='communicationchannelconfig',
            name='quota_json',
            field=models.JSONField(blank=True, default=dict, verbose_name='Kota'),
        ),
        migrations.AddField(
            model_name='communicationchannelconfig',
            name='last_synced_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Son Senkronizasyon'),
        ),
        migrations.AddField(
            model_name='communicationchannelconfig',
            name='allowed_subes',
            field=models.ManyToManyField(
                blank=True,
                related_name='whatsapp_accounts',
                to='sube.sube',
                verbose_name='İzinli Şubeler',
            ),
        ),
        migrations.AddField(
            model_name='communicationchannelconfig',
            name='allowed_roles',
            field=models.ManyToManyField(
                blank=True,
                related_name='whatsapp_accounts',
                to='roller.role',
                verbose_name='İzinli Roller',
            ),
        ),
        migrations.AddField(
            model_name='conversation',
            name='channel_config',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='conversations',
                to='communication.communicationchannelconfig',
                verbose_name='WhatsApp Hesabı',
            ),
        ),
        migrations.AddField(
            model_name='outboundcampaign',
            name='channel_config',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='campaigns',
                to='communication.communicationchannelconfig',
                verbose_name='WhatsApp Hesabı',
            ),
        ),
        migrations.AddField(
            model_name='outboundcampaign',
            name='replied_count',
            field=models.PositiveIntegerField(default=0, verbose_name='Yanıt Sayısı'),
        ),
        migrations.AddIndex(
            model_name='communicationchannelconfig',
            index=models.Index(fields=['kurum', 'channel', 'is_active'], name='comm_cfg_kurum_ch_act_idx'),
        ),
        migrations.AddIndex(
            model_name='communicationchannelconfig',
            index=models.Index(fields=['phone_number_id'], name='comm_cfg_phone_number_idx'),
        ),
        migrations.AlterModelOptions(
            name='communicationchannelconfig',
            options={
                'verbose_name': 'WhatsApp Hesabı',
                'verbose_name_plural': 'WhatsApp Hesapları',
            },
        ),
        migrations.RunPython(migrate_legacy_configs, noop_reverse),
    ]
