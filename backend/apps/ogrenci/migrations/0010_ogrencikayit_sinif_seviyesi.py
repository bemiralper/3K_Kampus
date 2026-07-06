# Generated manually — OgrenciKayit.sinif_seviyesi FK

from django.db import migrations, models
import django.db.models.deletion


def backfill_sinif_seviyesi(apps, schema_editor):
    OgrenciKayit = apps.get_model('ogrenci', 'OgrenciKayit')
    for kayit in OgrenciKayit.objects.filter(sinif_seviyesi_id__isnull=True).select_related('sinif'):
        if kayit.sinif_id and kayit.sinif and kayit.sinif.sinif_seviyesi_id:
            kayit.sinif_seviyesi_id = kayit.sinif.sinif_seviyesi_id
            kayit.save(update_fields=['sinif_seviyesi_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('egitim_tanimlari', '0010_sube_scoped_catalog'),
        ('ogrenci', '0009_ogrencikayit_sinif_optional'),
    ]

    operations = [
        migrations.AddField(
            model_name='ogrencikayit',
            name='sinif_seviyesi',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='ogrenci_kayitlari',
                to='egitim_tanimlari.sinifseviyesi',
                verbose_name='Sınıf Seviyesi',
            ),
        ),
        migrations.RunPython(backfill_sinif_seviyesi, migrations.RunPython.noop),
    ]
