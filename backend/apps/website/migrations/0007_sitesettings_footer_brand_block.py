from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('website', '0006_sitesettings_google_analytics_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='sitesettings',
            name='footer_baslik',
            field=models.CharField(
                blank=True,
                default='3K Kampüs',
                max_length=200,
                verbose_name='Footer Marka Başlığı',
            ),
        ),
        migrations.AddField(
            model_name='sitesettings',
            name='footer_aciklama',
            field=models.TextField(
                blank=True,
                default='LGS, YKS ve okul destek programları ile başarıya giden yolda dijital eğitim partneriniz.',
                verbose_name='Footer Marka Açıklaması',
            ),
        ),
    ]
