from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('website', '0019_webpage_is_system_default'),
    ]

    operations = [
        migrations.AddField(
            model_name='sitesettings',
            name='ticari_unvan',
            field=models.CharField(
                blank=True,
                default='ÖZGÜN SINAV ÖĞRETİM EĞİTİM ANONİM ŞİRKETİ',
                max_length=300,
                verbose_name='Ticari Unvan',
            ),
        ),
        migrations.AddField(
            model_name='sitesettings',
            name='mersis_no',
            field=models.CharField(
                blank=True,
                default='0692037476300018',
                max_length=32,
                verbose_name='MERSİS No',
            ),
        ),
        migrations.AddField(
            model_name='sitesettings',
            name='vergi_no',
            field=models.CharField(
                blank=True,
                default='6920374763',
                max_length=20,
                verbose_name='Vergi No',
            ),
        ),
        migrations.AddField(
            model_name='sitesettings',
            name='ticaret_sicil_no',
            field=models.CharField(
                blank=True,
                default='14305',
                max_length=32,
                verbose_name='Ticaret Sicil No',
            ),
        ),
    ]
