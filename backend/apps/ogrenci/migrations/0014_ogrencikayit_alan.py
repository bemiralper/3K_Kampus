# OgrenciKayit.alan — kayıt sihirbazında seçilen alan (sözleşme paket filtresi)

from django.db import migrations, models
import django.db.models.deletion


def backfill_alan_from_grup(apps, schema_editor):
    OgrenciKayit = apps.get_model("ogrenci", "OgrenciKayit")
    OgrenciEgitimPaketi = apps.get_model("ogrenci", "OgrenciEgitimPaketi")
    GrupDersi = apps.get_model("egitim_paketleri", "GrupDersi")

    for kayit in OgrenciKayit.objects.filter(alan_id__isnull=True).iterator():
        grup_ids = list(
            OgrenciEgitimPaketi.objects.filter(
                ogrenci_id=kayit.ogrenci_id,
                aktif_mi=True,
                paket_turu="grup_dersi",
            ).values_list("paket_id", flat=True)
        )
        if not grup_ids:
            continue
        alan_id = (
            GrupDersi.objects.filter(id__in=grup_ids, alan_id__isnull=False)
            .values_list("alan_id", flat=True)
            .first()
        )
        if alan_id:
            kayit.alan_id = alan_id
            kayit.save(update_fields=["alan_id"])


class Migration(migrations.Migration):

    dependencies = [
        ("egitim_tanimlari", "0010_sube_scoped_catalog"),
        ("ogrenci", "0013_ogrenciegitimpaketi_dahil_mi_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="ogrencikayit",
            name="alan",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="ogrenci_kayitlari_alan",
                to="egitim_tanimlari.alan",
                verbose_name="Alan",
            ),
        ),
        migrations.RunPython(backfill_alan_from_grup, migrations.RunPython.noop),
    ]
