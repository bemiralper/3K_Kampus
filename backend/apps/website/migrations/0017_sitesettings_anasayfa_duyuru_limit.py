from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('website', '0016_contententry_rich_media'),
    ]

    operations = [
        migrations.AddField(
            model_name='sitesettings',
            name='anasayfa_duyuru_limit',
            field=models.PositiveSmallIntegerField(
                default=6,
                help_text='Anasayfada gösterilecek duyuru/haber kartı sayısı (1–12).',
                verbose_name='Anasayfa Duyuru Adedi',
            ),
        ),
    ]
