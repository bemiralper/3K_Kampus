from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('assignment_manual', '0010_assignment_packages'),
    ]

    operations = [
        migrations.AddField(
            model_name='manualassignment',
            name='deleted_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Silinme Tarihi'),
        ),
        migrations.AddField(
            model_name='manualassignment',
            name='deleted_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='manual_assignments_deleted',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Silen Kullanıcı',
            ),
        ),
        migrations.AddField(
            model_name='manualassignment',
            name='deletion_reason',
            field=models.TextField(blank=True, verbose_name='Silme Sebebi'),
        ),
    ]
