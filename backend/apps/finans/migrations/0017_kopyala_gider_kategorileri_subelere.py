# Step 2: kopyala kurum düzeyi kategorileri → her şube

from django.db import migrations


def kopyala_kategorileri_subelere(apps, schema_editor):
    GiderKategorisi = apps.get_model('finans', 'GiderKategorisi')
    GiderKaydi = apps.get_model('finans', 'GiderKaydi')
    Sube = apps.get_model('sube', 'Sube')

    kurum_ids = GiderKategorisi.objects.filter(sube__isnull=True).values_list(
        'kurum_id', flat=True
    ).distinct()

    for kurum_id in kurum_ids:
        subeler = list(Sube.objects.filter(kurum_id=kurum_id).order_by('id'))
        if not subeler:
            continue

        old_all = list(
            GiderKategorisi.objects.filter(kurum_id=kurum_id, sube__isnull=True).order_by('id')
        )
        if not old_all:
            continue

        ana_list = [c for c in old_all if c.parent_id is None]
        alt_list = [c for c in old_all if c.parent_id is not None]
        first_sube_maps = {}

        for sube in subeler:
            id_map = {}
            for cat in ana_list:
                new = GiderKategorisi.objects.create(
                    kurum_id=kurum_id,
                    sube_id=sube.id,
                    parent_id=None,
                    ad=cat.ad,
                    ikon=cat.ikon,
                    renk=cat.renk,
                    aciklama=cat.aciklama,
                    siralama=cat.siralama,
                    aktif_mi=cat.aktif_mi,
                    silindi_mi=cat.silindi_mi,
                    silinme_tarihi=cat.silinme_tarihi,
                )
                id_map[cat.id] = new.id

            for cat in alt_list:
                new_parent = id_map.get(cat.parent_id)
                if not new_parent:
                    continue
                new = GiderKategorisi.objects.create(
                    kurum_id=kurum_id,
                    sube_id=sube.id,
                    parent_id=new_parent,
                    ad=cat.ad,
                    ikon=cat.ikon,
                    renk=cat.renk,
                    aciklama=cat.aciklama,
                    siralama=cat.siralama,
                    aktif_mi=cat.aktif_mi,
                    silindi_mi=cat.silindi_mi,
                    silinme_tarihi=cat.silinme_tarihi,
                )
                id_map[cat.id] = new.id

            if sube.id == subeler[0].id:
                first_sube_maps = id_map

            for gk in GiderKaydi.objects.filter(kurum_id=kurum_id, sube_id=sube.id):
                new_kat_id = id_map.get(gk.gider_kategorisi_id)
                if new_kat_id:
                    gk.gider_kategorisi_id = new_kat_id
                    gk.save(update_fields=['gider_kategorisi_id'])

        for gk in GiderKaydi.objects.filter(kurum_id=kurum_id, sube__isnull=True):
            gk.sube_id = subeler[0].id
            new_kat_id = first_sube_maps.get(gk.gider_kategorisi_id)
            if new_kat_id:
                gk.gider_kategorisi_id = new_kat_id
            gk.save(update_fields=['sube_id', 'gider_kategorisi_id'])

        GiderKategorisi.objects.filter(kurum_id=kurum_id, sube__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('finans', '0016_gider_kategorisi_sube'),
    ]

    operations = [
        migrations.RunPython(kopyala_kategorileri_subelere, migrations.RunPython.noop),
    ]
