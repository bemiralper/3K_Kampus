import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('communication', '0010_ticket_routing'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='WhatsAppMetaTemplate',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=512, verbose_name='Şablon Adı')),
                ('language', models.CharField(default='tr', max_length=16, verbose_name='Dil')),
                ('meta_category', models.CharField(
                    choices=[
                        ('UTILITY', 'Utility'),
                        ('MARKETING', 'Marketing'),
                        ('AUTHENTICATION', 'Authentication'),
                    ],
                    db_index=True,
                    default='UTILITY',
                    max_length=32,
                    verbose_name='Meta Kategori',
                )),
                ('status', models.CharField(
                    choices=[
                        ('DRAFT', 'Taslak'),
                        ('SUBMITTED', "Meta'ya Gönderildi"),
                        ('PENDING', 'İnceleniyor'),
                        ('APPROVED', 'Onaylandı'),
                        ('REJECTED', 'Reddedildi'),
                        ('PAUSED', 'Duraklatıldı'),
                        ('DISABLED', 'Devre Dışı'),
                    ],
                    db_index=True,
                    default='DRAFT',
                    max_length=32,
                    verbose_name='Durum',
                )),
                ('meta_template_id', models.CharField(blank=True, default='', max_length=64, verbose_name='Meta Template ID')),
                ('body_named', models.TextField(blank=True, default='', verbose_name='Gövde (named değişkenler)')),
                ('header_json', models.JSONField(blank=True, default=dict, verbose_name='Header')),
                ('footer_text', models.CharField(blank=True, default='', max_length=60, verbose_name='Footer')),
                ('buttons_json', models.JSONField(blank=True, default=list, verbose_name='Butonlar')),
                ('components_json', models.JSONField(blank=True, default=list, verbose_name='Meta Components')),
                ('variable_map_json', models.JSONField(blank=True, default=dict, verbose_name='Değişken eşlemesi (1→ogrenci_ad)')),
                ('rejected_reason', models.CharField(blank=True, default='', max_length=255, verbose_name='Ret nedeni')),
                ('rejected_detail', models.TextField(blank=True, default='', verbose_name='Meta açıklaması')),
                ('last_submitted_at', models.DateTimeField(blank=True, null=True, verbose_name='Son gönderim')),
                ('approved_at', models.DateTimeField(blank=True, null=True, verbose_name='Onay tarihi')),
                ('usage_count', models.PositiveIntegerField(default=0, verbose_name='Kullanım sayısı')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('channel_config', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='meta_templates',
                    to='communication.communicationchannelconfig',
                    verbose_name='WhatsApp Hesabı',
                )),
                ('created_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='whatsapp_meta_templates',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('kurum', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='whatsapp_meta_templates',
                    to='kurum.kurum',
                    verbose_name='Kurum',
                )),
            ],
            options={
                'verbose_name': 'WhatsApp Meta Şablonu',
                'verbose_name_plural': 'WhatsApp Meta Şablonları',
                'db_table': 'comm_whatsapp_meta_template',
                'ordering': ['-updated_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='whatsappmetatemplate',
            constraint=models.UniqueConstraint(
                fields=('channel_config', 'name', 'language'),
                name='comm_meta_tpl_account_name_lang_uniq',
            ),
        ),
        migrations.AddIndex(
            model_name='whatsappmetatemplate',
            index=models.Index(fields=['kurum', 'status'], name='comm_meta_tpl_kurum_status_idx'),
        ),
        migrations.AddIndex(
            model_name='whatsappmetatemplate',
            index=models.Index(fields=['channel_config', 'status'], name='comm_meta_tpl_acct_status_idx'),
        ),
    ]
