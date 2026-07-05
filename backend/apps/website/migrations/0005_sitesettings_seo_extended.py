from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('website', '0004_sitesettings_footer_marka_metni'),
    ]

    operations = [
        migrations.AddField(
            model_name='sitesettings',
            name='seo_anahtar_kelimeler',
            field=models.CharField(blank=True, default='', max_length=500, verbose_name='SEO Anahtar Kelimeler'),
        ),
        migrations.AddField(
            model_name='sitesettings',
            name='seo_canonical_url',
            field=models.URLField(blank=True, default='', max_length=500, verbose_name='Canonical URL'),
        ),
        migrations.AddField(
            model_name='sitesettings',
            name='google_site_verification',
            field=models.CharField(blank=True, default='', max_length=120, verbose_name='Google Site Verification'),
        ),
        migrations.AddField(
            model_name='sitesettings',
            name='seo_robots_index',
            field=models.BooleanField(default=True, verbose_name='Arama Motorlarında İndeksle'),
        ),
    ]
