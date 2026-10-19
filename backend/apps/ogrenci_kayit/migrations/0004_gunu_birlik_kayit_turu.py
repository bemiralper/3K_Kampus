from django.db import migrations


def seed_gunu_birlik(apps, schema_editor):
    LookupCategory = apps.get_model('ogrenci_kayit', 'LookupCategory')
    LookupOption = apps.get_model('ogrenci_kayit', 'LookupOption')
    category, _ = LookupCategory.objects.get_or_create(
        code='registration_type',
        defaults={'name': 'Kayıt Türü', 'is_active': True},
    )
    LookupOption.objects.get_or_create(
        category=category,
        code='gunu_birlik',
        defaults={
            'label': 'Günü Birlik Misafir',
            'order': 4,
            'is_active': True,
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ('ogrenci_kayit', '0003_veli_telefonlar'),
    ]

    operations = [
        migrations.RunPython(seed_gunu_birlik, migrations.RunPython.noop),
    ]
