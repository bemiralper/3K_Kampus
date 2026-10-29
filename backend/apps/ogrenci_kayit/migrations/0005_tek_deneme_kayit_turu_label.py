from django.db import migrations


def rename_label(apps, schema_editor):
    LookupOption = apps.get_model('ogrenci_kayit', 'LookupOption')
    LookupOption.objects.filter(code='gunu_birlik').update(label='Tek deneme')


def restore_label(apps, schema_editor):
    LookupOption = apps.get_model('ogrenci_kayit', 'LookupOption')
    LookupOption.objects.filter(code='gunu_birlik', label='Tek deneme').update(
        label='Günü Birlik Misafir',
    )


class Migration(migrations.Migration):

    dependencies = [
        ('ogrenci_kayit', '0004_gunu_birlik_kayit_turu'),
    ]

    operations = [
        migrations.RunPython(rename_label, restore_label),
    ]
