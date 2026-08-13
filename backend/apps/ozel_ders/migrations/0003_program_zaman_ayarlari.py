from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ozel_ders', '0002_ozel_ders_tatil_karari'),
    ]

    operations = [
        migrations.AddField(
            model_name='birebirogrenciprogrami',
            name='zaman_baslangic',
            field=models.CharField(
                default='09:00',
                help_text='Grid başlangıç saati (HH:MM)',
                max_length=5,
            ),
        ),
        migrations.AddField(
            model_name='birebirogrenciprogrami',
            name='zaman_sure_dk',
            field=models.PositiveSmallIntegerField(default=50),
        ),
        migrations.AddField(
            model_name='birebirogrenciprogrami',
            name='zaman_ara_dk',
            field=models.PositiveSmallIntegerField(default=10),
        ),
        migrations.AddField(
            model_name='birebirogrenciprogrami',
            name='zaman_ders_adet',
            field=models.PositiveSmallIntegerField(default=8),
        ),
    ]
