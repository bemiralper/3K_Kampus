from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('website', '0003_sinavtakvim_saat_bitis'),
    ]

    operations = [
        migrations.AddField(
            model_name='sitesettings',
            name='footer_marka_metni',
            field=models.CharField(
                blank=True,
                default='3K Kampüs, Özgün Sınav Öğretim Eğitim A.Ş. markasıdır.',
                max_length=300,
                verbose_name='Footer Marka Bildirimi',
            ),
        ),
    ]
