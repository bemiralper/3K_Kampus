"""Yanlışlıkla kutuphane türüyle kaydedilmiş koçluk ek hizmetlerini düzelt."""
from django.db import migrations
from django.db.models import Q


def fix_kocluk_hizmet_turu(apps, schema_editor):
    EkHizmet = apps.get_model('egitim_paketleri', 'EkHizmet')
    EkHizmet.objects.filter(hizmet_turu='kutuphane').filter(
        Q(ad__icontains='koç')
        | Q(ad__icontains='kocluk')
        | Q(kod__icontains='KOCLUK')
        | Q(kod__icontains='KOC_')
    ).update(hizmet_turu='kocluk')


class Migration(migrations.Migration):

    dependencies = [
        ('egitim_paketleri', '0013_grup_dersi_dahil_denemeler'),
    ]

    operations = [
        migrations.RunPython(fix_kocluk_hizmet_turu, migrations.RunPython.noop),
    ]
