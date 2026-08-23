from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('communication', '0022_notification_auto_schedule'),
    ]

    operations = [
        migrations.AddField(
            model_name='notificationautoschedule',
            name='report_kinds',
            field=models.CharField(
                default='ozet',
                help_text='ozet | detay | ikisi',
                max_length=16,
                verbose_name='Otomatik rapor',
            ),
        ),
    ]
