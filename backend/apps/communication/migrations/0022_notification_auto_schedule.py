from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('communication', '0021_template_group'),
        ('sube', '0003_sube_branding'),
    ]

    operations = [
        migrations.CreateModel(
            name='NotificationAutoSchedule',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('event_key', models.CharField(db_index=True, max_length=64, verbose_name='Olay')),
                ('is_enabled', models.BooleanField(default=False, verbose_name='Otomatik gönderim')),
                ('send_time', models.TimeField(default='18:00', verbose_name='Gönderim saati')),
                ('last_sent_on', models.DateField(blank=True, null=True, verbose_name='Son gönderilen rapor tarihi')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('kurum', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='notification_auto_schedules',
                    to='kurum.kurum',
                    verbose_name='Kurum',
                )),
                ('sube', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='notification_auto_schedules',
                    to='sube.sube',
                    verbose_name='Şube',
                )),
                ('updated_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='notification_auto_schedules',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'Bildirim Otomatik Zamanlama',
                'verbose_name_plural': 'Bildirim Otomatik Zamanlamalar',
                'db_table': 'comm_notification_auto_schedule',
            },
        ),
        migrations.AddConstraint(
            model_name='notificationautoschedule',
            constraint=models.UniqueConstraint(
                condition=models.Q(sube__isnull=True),
                fields=('kurum', 'event_key'),
                name='comm_auto_sched_kurum_uniq',
            ),
        ),
        migrations.AddConstraint(
            model_name='notificationautoschedule',
            constraint=models.UniqueConstraint(
                condition=models.Q(sube__isnull=False),
                fields=('kurum', 'sube', 'event_key'),
                name='comm_auto_sched_sube_uniq',
            ),
        ),
        migrations.AddIndex(
            model_name='notificationautoschedule',
            index=models.Index(fields=['event_key', 'is_enabled'], name='comm_auto_sched_due_idx'),
        ),
    ]
