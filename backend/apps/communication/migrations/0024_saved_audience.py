from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('communication', '0023_notification_auto_schedule_report_kinds'),
    ]

    operations = [
        migrations.CreateModel(
            name='SavedAudience',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=160, verbose_name='Kitle adı')),
                ('description', models.CharField(blank=True, default='', max_length=300, verbose_name='Açıklama')),
                ('query_json', models.JSONField(blank=True, default=dict, verbose_name='Kitle kuralları')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='saved_audiences',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Oluşturan',
                )),
                ('kurum', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='saved_audiences',
                    to='kurum.kurum',
                    verbose_name='Kurum',
                )),
                ('sube', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='saved_audiences',
                    to='sube.sube',
                    verbose_name='Şube',
                )),
            ],
            options={
                'verbose_name': 'Kayıtlı Kitle',
                'verbose_name_plural': 'Kayıtlı Kitleler',
                'db_table': 'comm_saved_audience',
                'ordering': ['-updated_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='savedaudience',
            constraint=models.UniqueConstraint(
                fields=('kurum', 'created_by', 'name'),
                name='comm_saved_aud_user_name_uniq',
            ),
        ),
        migrations.AddIndex(
            model_name='savedaudience',
            index=models.Index(fields=['kurum', 'created_by'], name='comm_saved_aud_user_idx'),
        ),
    ]
