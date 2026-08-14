from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('communication', '0019_channel_config_app_id'),
        ('kurum', '0003_alter_kurum_app_logo_alter_kurum_favicon_and_more'),
        ('personel', '0018_ozel_ders_module'),
        ('sube', '0003_sube_branding'),
    ]

    operations = [
        migrations.CreateModel(
            name='NotificationStaffRecipient',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('event_key', models.CharField(db_index=True, max_length=64, verbose_name='Olay')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('kurum', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='notification_staff_recipients',
                    to='kurum.kurum',
                    verbose_name='Kurum',
                )),
                ('personel', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='notification_staff_recipients',
                    to='personel.personel',
                    verbose_name='Personel',
                )),
                ('sube', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='notification_staff_recipients',
                    to='sube.sube',
                    verbose_name='Şube',
                )),
            ],
            options={
                'verbose_name': 'Bildirim Personel Alıcısı',
                'verbose_name_plural': 'Bildirim Personel Alıcıları',
                'db_table': 'comm_notification_staff_recipient',
            },
        ),
        migrations.AddIndex(
            model_name='notificationstaffrecipient',
            index=models.Index(fields=['kurum', 'event_key'], name='comm_staff_rcpt_lookup_idx'),
        ),
        migrations.AddConstraint(
            model_name='notificationstaffrecipient',
            constraint=models.UniqueConstraint(
                condition=models.Q(sube__isnull=True),
                fields=('kurum', 'event_key', 'personel'),
                name='comm_staff_rcpt_kurum_uniq',
            ),
        ),
        migrations.AddConstraint(
            model_name='notificationstaffrecipient',
            constraint=models.UniqueConstraint(
                condition=models.Q(sube__isnull=False),
                fields=('kurum', 'sube', 'event_key', 'personel'),
                name='comm_staff_rcpt_sube_uniq',
            ),
        ),
    ]
