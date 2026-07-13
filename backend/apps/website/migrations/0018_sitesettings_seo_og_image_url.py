from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('website', '0017_sitesettings_anasayfa_duyuru_limit'),
    ]

    operations = [
        migrations.AddField(
            model_name='sitesettings',
            name='seo_og_image_url',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Anasayfa paylaşımında görünen kapak (önerilen 1200×630). Örn. /media/…',
                max_length=500,
                verbose_name='WhatsApp / Open Graph Görseli',
            ),
        ),
    ]
