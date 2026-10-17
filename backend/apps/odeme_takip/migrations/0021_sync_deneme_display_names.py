"""Deneme paketi yeniden adlandırılınca geride kalan 'Deneme' görünen adlarını katalog adıyla eşitler.

Fiyatlara dokunulmaz. Gerçekten adı 'Deneme' olan paket (ad değişmemiş) olduğu gibi kalır.
"""

from django.db import migrations


def sync_stale_deneme_names(apps, schema_editor):
    Deneme = apps.get_model("egitim_paketleri", "Deneme")
    EkHizmet = apps.get_model("egitim_paketleri", "EkHizmet")
    OgrenciEgitimPaketi = apps.get_model("ogrenci", "OgrenciEgitimPaketi")
    SozlesmeKalemi = apps.get_model("odeme_takip", "SozlesmeKalemi")

    for deneme in Deneme.objects.all().iterator():
        expected = f"Deneme — {deneme.ad}"
        EkHizmet.objects.filter(
            deneme_paketi_id=deneme.id,
            hizmet_turu="deneme",
        ).exclude(ad=expected).update(ad=expected)
        OgrenciEgitimPaketi.objects.filter(
            paket_turu="deneme",
            paket_id=deneme.id,
        ).exclude(paket_adi=deneme.ad).update(paket_adi=deneme.ad)
        if deneme.ad == "Deneme":
            continue
        SozlesmeKalemi.objects.filter(
            kalem_id=deneme.id,
            kalem_turu__in=["paket", "deneme"],
            kalem_adi="Deneme",
        ).update(kalem_adi=deneme.ad)


class Migration(migrations.Migration):

    dependencies = [
        ("egitim_paketleri", "0018_sync_model_state"),
        ("ogrenci", "0016_ogrenci_not_and_audit"),
        ("odeme_takip", "0020_ceksenetdetay_cari_hareket"),
    ]

    operations = [
        migrations.RunPython(sync_stale_deneme_names, migrations.RunPython.noop),
    ]
