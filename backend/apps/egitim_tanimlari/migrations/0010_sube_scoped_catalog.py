# Şube bazlı eğitim tanımları — kurum/sube FK + katalog kopyalama

from django.db import migrations, models
import django.db.models.deletion


def duplicate_catalog_per_sube(apps, schema_editor):
    Sube = apps.get_model('sube', 'Sube')
    SinifSeviyesi = apps.get_model('egitim_tanimlari', 'SinifSeviyesi')
    Alan = apps.get_model('egitim_tanimlari', 'Alan')
    Ders = apps.get_model('egitim_tanimlari', 'Ders')
    Brans = apps.get_model('egitim_tanimlari', 'Brans')

    subeler = list(Sube.objects.select_related('kurum').order_by('id'))
    if not subeler:
        return

    first_sube = subeler[0]
    kurum_id = first_sube.kurum_id

    # Legacy kayıtları ilk şubeye ata (silme — ResourceBook vb. FK koruması)
    SinifSeviyesi.objects.filter(sube__isnull=True).update(kurum_id=kurum_id, sube_id=first_sube.id)
    Alan.objects.filter(sube__isnull=True).update(kurum_id=kurum_id, sube_id=first_sube.id)
    Ders.objects.filter(sube__isnull=True).update(kurum_id=kurum_id, sube_id=first_sube.id)
    Brans.objects.filter(sube__isnull=True).update(kurum_id=kurum_id, sube_id=first_sube.id)

    source_seviyeler = list(SinifSeviyesi.objects.filter(sube_id=first_sube.id))
    source_alanlar = list(Alan.objects.filter(sube_id=first_sube.id))
    source_dersler = list(Ders.objects.filter(sube_id=first_sube.id))
    source_branslar = list(Brans.objects.filter(sube_id=first_sube.id))

    for sube in subeler[1:]:
        kurum_id = sube.kurum_id
        alan_map = {}
        for old in source_alanlar:
            if Alan.objects.filter(sube_id=sube.id, kod=old.kod).exists():
                alan_map[old.id] = Alan.objects.get(sube_id=sube.id, kod=old.kod).id
                continue
            new = Alan.objects.create(
                kurum_id=kurum_id, sube_id=sube.id,
                ad=old.ad, kod=old.kod, sira=old.sira,
                aciklama=old.aciklama, aktif_mi=old.aktif_mi,
            )
            alan_map[old.id] = new.id

        seviye_map = {}
        for old in source_seviyeler:
            if SinifSeviyesi.objects.filter(sube_id=sube.id, kod=old.kod).exists():
                seviye_map[old.id] = SinifSeviyesi.objects.get(sube_id=sube.id, kod=old.kod).id
                continue
            new = SinifSeviyesi.objects.create(
                kurum_id=kurum_id, sube_id=sube.id,
                ad=old.ad, kod=old.kod, sira=old.sira,
                ogrenci_no_prefix=old.ogrenci_no_prefix,
                aciklama=old.aciklama, aktif_mi=old.aktif_mi,
            )
            seviye_map[old.id] = new.id
            old_alan_ids = list(old.alanlar.values_list('id', flat=True))
            new_alan_ids = [alan_map[aid] for aid in old_alan_ids if aid in alan_map]
            if new_alan_ids:
                new.alanlar.set(new_alan_ids)

        for old in source_branslar:
            if Brans.objects.filter(sube_id=sube.id, kod=old.kod).exists():
                continue
            Brans.objects.create(
                kurum_id=kurum_id, sube_id=sube.id,
                ad=old.ad, kod=old.kod,
                aciklama=old.aciklama, aktif_mi=old.aktif_mi,
            )

        for old in source_dersler:
            if Ders.objects.filter(sube_id=sube.id, kod=old.kod).exists():
                continue
            new = Ders.objects.create(
                kurum_id=kurum_id, sube_id=sube.id,
                ad=old.ad, kod=old.kod,
                aciklama=old.aciklama, aktif_mi=old.aktif_mi,
            )
            old_sev_ids = list(old.sinif_seviyeleri.values_list('id', flat=True))
            old_alan_ids = list(old.alanlar.values_list('id', flat=True))
            new_sev_ids = [seviye_map[sid] for sid in old_sev_ids if sid in seviye_map]
            new_alan_ids = [alan_map[aid] for aid in old_alan_ids if aid in alan_map]
            if new_sev_ids:
                new.sinif_seviyeleri.set(new_sev_ids)
            if new_alan_ids:
                new.alanlar.set(new_alan_ids)


class Migration(migrations.Migration):

    dependencies = [
        ('kurum', '0001_initial'),
        ('sube', '0001_initial'),
        ('egitim_tanimlari', '0009_merge_20260201_0154'),
    ]

    operations = [
        migrations.AddField(
            model_name='alan',
            name='kurum',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='alan_set',
                to='kurum.kurum',
                verbose_name='Kurum',
            ),
        ),
        migrations.AddField(
            model_name='alan',
            name='sube',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='alan_set',
                to='sube.sube',
                verbose_name='Şube',
            ),
        ),
        migrations.AddField(
            model_name='brans',
            name='kurum',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='brans_set',
                to='kurum.kurum',
                verbose_name='Kurum',
            ),
        ),
        migrations.AddField(
            model_name='brans',
            name='sube',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='brans_set',
                to='sube.sube',
                verbose_name='Şube',
            ),
        ),
        migrations.AddField(
            model_name='ders',
            name='kurum',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='ders_set',
                to='kurum.kurum',
                verbose_name='Kurum',
            ),
        ),
        migrations.AddField(
            model_name='ders',
            name='sube',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='ders_set',
                to='sube.sube',
                verbose_name='Şube',
            ),
        ),
        migrations.AddField(
            model_name='sinifseviyesi',
            name='kurum',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='sinifseviyesi_set',
                to='kurum.kurum',
                verbose_name='Kurum',
            ),
        ),
        migrations.AddField(
            model_name='sinifseviyesi',
            name='sube',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='sinifseviyesi_set',
                to='sube.sube',
                verbose_name='Şube',
            ),
        ),
        migrations.AlterField(
            model_name='alan',
            name='kod',
            field=models.CharField(max_length=20, verbose_name='Kod'),
        ),
        migrations.AlterField(
            model_name='brans',
            name='kod',
            field=models.CharField(max_length=20, verbose_name='Kod'),
        ),
        migrations.AlterField(
            model_name='ders',
            name='kod',
            field=models.CharField(max_length=20, verbose_name='Kod'),
        ),
        migrations.AlterField(
            model_name='sinifseviyesi',
            name='kod',
            field=models.CharField(max_length=20, verbose_name='Kod'),
        ),
        migrations.RunPython(duplicate_catalog_per_sube, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='alan',
            name='kurum',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='alan_set',
                to='kurum.kurum',
                verbose_name='Kurum',
            ),
        ),
        migrations.AlterField(
            model_name='alan',
            name='sube',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='alan_set',
                to='sube.sube',
                verbose_name='Şube',
            ),
        ),
        migrations.AlterField(
            model_name='brans',
            name='kurum',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='brans_set',
                to='kurum.kurum',
                verbose_name='Kurum',
            ),
        ),
        migrations.AlterField(
            model_name='brans',
            name='sube',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='brans_set',
                to='sube.sube',
                verbose_name='Şube',
            ),
        ),
        migrations.AlterField(
            model_name='ders',
            name='kurum',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='ders_set',
                to='kurum.kurum',
                verbose_name='Kurum',
            ),
        ),
        migrations.AlterField(
            model_name='ders',
            name='sube',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='ders_set',
                to='sube.sube',
                verbose_name='Şube',
            ),
        ),
        migrations.AlterField(
            model_name='sinifseviyesi',
            name='kurum',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='sinifseviyesi_set',
                to='kurum.kurum',
                verbose_name='Kurum',
            ),
        ),
        migrations.AlterField(
            model_name='sinifseviyesi',
            name='sube',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='sinifseviyesi_set',
                to='sube.sube',
                verbose_name='Şube',
            ),
        ),
        migrations.AddConstraint(
            model_name='alan',
            constraint=models.UniqueConstraint(fields=('sube', 'kod'), name='unique_alan_kod_sube'),
        ),
        migrations.AddConstraint(
            model_name='brans',
            constraint=models.UniqueConstraint(fields=('sube', 'kod'), name='unique_brans_kod_sube'),
        ),
        migrations.AddConstraint(
            model_name='ders',
            constraint=models.UniqueConstraint(fields=('sube', 'kod'), name='unique_ders_kod_sube'),
        ),
        migrations.AddConstraint(
            model_name='sinifseviyesi',
            constraint=models.UniqueConstraint(fields=('sube', 'kod'), name='unique_sinif_seviyesi_kod_sube'),
        ),
    ]
