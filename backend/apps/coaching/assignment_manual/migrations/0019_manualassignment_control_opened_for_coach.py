from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('assignment_manual', '0018_assignmenttask_quota_kind'),
    ]

    operations = [
        migrations.AddField(
            model_name='manualassignment',
            name='control_opened_for_coach',
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text='Kontrol tarihi geçmiş ödev yönetici tarafından koça açıldıysa True.',
                verbose_name='Koça açıldı',
            ),
        ),
        migrations.AddField(
            model_name='manualassignment',
            name='control_opened_at',
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name='Koça açılma tarihi',
            ),
        ),
        migrations.AddField(
            model_name='manualassignment',
            name='control_opened_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='manual_assignments_opened_for_coach',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Koça açan kullanıcı',
            ),
        ),
    ]
