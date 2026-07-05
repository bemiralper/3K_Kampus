from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('website', '0005_sitesettings_seo_extended'),
    ]

    operations = [
        migrations.AddField(
            model_name='sitesettings',
            name='google_analytics_id',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Örn. G-3NWSLBGCK8 (gtag.js)',
                max_length=32,
                verbose_name='Google Analytics Ölçüm Kimliği',
            ),
        ),
    ]
