from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('yedekleme', '0002_rebuild_v2'),
    ]

    operations = [
        migrations.AddField(
            model_name='backupschedule',
            name='last_run_status',
            field=models.CharField(blank=True, default='', max_length=20, verbose_name='Son Çalışma Durumu'),
        ),
        migrations.AddField(
            model_name='backupschedule',
            name='last_run_message',
            field=models.CharField(blank=True, default='', max_length=512, verbose_name='Son Çalışma Mesajı'),
        ),
        migrations.AddField(
            model_name='backupschedule',
            name='last_run_artifact',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='+',
                to='yedekleme.backupartifact',
                verbose_name='Son Çalışma Yedeği',
            ),
        ),
    ]
