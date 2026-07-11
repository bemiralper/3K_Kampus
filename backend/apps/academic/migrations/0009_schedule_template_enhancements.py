from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('academic', '0008_schedule_version'),
    ]

    operations = [
        migrations.AddField(
            model_name='scheduletemplate',
            name='is_default',
            field=models.BooleanField(
                default=False,
                help_text='Bu şube için varsayılan ders saati şablonu',
                verbose_name='Varsayılan mı?',
            ),
        ),
        migrations.AddField(
            model_name='scheduletemplate',
            name='primary_weekly_cycle',
            field=models.ForeignKey(
                blank=True,
                help_text='Liste ve program oluşturmada gösterilen gün yapısı',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='primary_for_templates',
                to='academic.weeklycycle',
                verbose_name='Gün Yapısı',
            ),
        ),
    ]
