from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('takvim', '0008_sync_model_state'),
    ]

    operations = [
        migrations.AddField(
            model_name='appnotification',
            name='sube_id',
            field=models.IntegerField(blank=True, null=True, verbose_name='Şube ID'),
        ),
        migrations.AddField(
            model_name='appnotification',
            name='sube_ad',
            field=models.CharField(blank=True, default='', max_length=120, verbose_name='Şube'),
        ),
    ]
