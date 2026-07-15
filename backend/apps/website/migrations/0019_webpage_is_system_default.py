from django.db import migrations, models

SYSTEM_SLUGS = (
    'home',
    'hakkimizda',
    '3k-sistemi',
    'programlar',
    'iletisim',
    'duyurular',
    'kvkk',
    'gizlilik',
    'kullanim',
    'cerez',
)


def mark_existing_system_pages(apps, schema_editor):
    WebPage = apps.get_model('website', 'WebPage')
    WebPage.objects.filter(slug__in=SYSTEM_SLUGS).update(is_system_default=True)


class Migration(migrations.Migration):

    dependencies = [
        ('website', '0018_sitesettings_seo_og_image_url'),
    ]

    operations = [
        migrations.AddField(
            model_name='webpage',
            name='is_system_default',
            field=models.BooleanField(
                default=False,
                help_text='Kurumsal sitenin hazır sayfaları; silinemez, slug değiştirilmesi önerilmez.',
                verbose_name='Sistem varsayılanı',
            ),
        ),
        migrations.RunPython(mark_existing_system_pages, migrations.RunPython.noop),
    ]
