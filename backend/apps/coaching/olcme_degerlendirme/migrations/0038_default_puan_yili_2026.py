from django.db import migrations, models


def bump_factory_default_to_2026(apps, schema_editor):
    """Eski fabrika varsayılanı 2025 olan kurumları 2026'ya alır. 2024 seçimi durur."""
    OlcmePuanAyar = apps.get_model('olcme_degerlendirme', 'OlcmePuanAyar')
    OlcmePuanAyar.objects.filter(default_puan_yili=2025).update(default_puan_yili=2026)


def restore_2025(apps, schema_editor):
    OlcmePuanAyar = apps.get_model('olcme_degerlendirme', 'OlcmePuanAyar')
    OlcmePuanAyar.objects.filter(default_puan_yili=2026).update(default_puan_yili=2025)


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0037_ayt_optional_philosophy_six'),
    ]

    operations = [
        migrations.AlterField(
            model_name='olcmepuanayar',
            name='default_puan_yili',
            field=models.PositiveSmallIntegerField(default=2026, verbose_name='Varsayılan Puan Yılı'),
        ),
        migrations.RunPython(bump_factory_default_to_2026, restore_2025),
    ]
