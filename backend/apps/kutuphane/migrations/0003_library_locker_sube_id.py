from django.db import migrations, models


def backfill_sube_id(apps, schema_editor):
    Library = apps.get_model('kutuphane', 'Library')
    Locker = apps.get_model('kutuphane', 'Locker')
    Sube = apps.get_model('sube', 'Sube')

    def first_sube_for_kurum(kurum_id):
        sube = Sube.objects.filter(kurum_id=kurum_id, aktif_mi=True).order_by('id').first()
        if not sube:
            sube = Sube.objects.filter(kurum_id=kurum_id).order_by('id').first()
        return sube

    for library in Library.objects.filter(sube_id__isnull=True):
        sube = first_sube_for_kurum(library.kurum_id)
        if sube:
            library.sube_id = sube.id
            library.save(update_fields=['sube_id'])

    for locker in Locker.objects.filter(sube_id__isnull=True):
        sube = first_sube_for_kurum(locker.kurum_id)
        if sube:
            locker.sube_id = sube.id
            locker.save(update_fields=['sube_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('kutuphane', '0002_attendance_notifications'),
        ('sube', '0001_initial'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='library',
            name='unique_kurum_salon_kod',
        ),
        migrations.RemoveConstraint(
            model_name='library',
            name='unique_kurum_salon_ad',
        ),
        migrations.RemoveConstraint(
            model_name='locker',
            name='unique_kurum_dolap_no',
        ),
        migrations.AddField(
            model_name='library',
            name='sube_id',
            field=models.IntegerField(null=True, verbose_name='Şube ID'),
        ),
        migrations.AddField(
            model_name='locker',
            name='sube_id',
            field=models.IntegerField(null=True, verbose_name='Şube ID'),
        ),
        migrations.RunPython(backfill_sube_id, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='library',
            name='sube_id',
            field=models.IntegerField(verbose_name='Şube ID'),
        ),
        migrations.AlterField(
            model_name='locker',
            name='sube_id',
            field=models.IntegerField(verbose_name='Şube ID'),
        ),
        migrations.AddIndex(
            model_name='library',
            index=models.Index(fields=['sube_id'], name='kutuphane_s_sube_id_7c5557_idx'),
        ),
        migrations.AddIndex(
            model_name='locker',
            index=models.Index(fields=['sube_id'], name='kutuphane_d_sube_id_ac8b29_idx'),
        ),
        migrations.AddConstraint(
            model_name='library',
            constraint=models.UniqueConstraint(
                condition=models.Q(('is_deleted', False)),
                fields=('kurum_id', 'sube_id', 'kod'),
                name='unique_kurum_sube_salon_kod',
            ),
        ),
        migrations.AddConstraint(
            model_name='library',
            constraint=models.UniqueConstraint(
                condition=models.Q(('is_deleted', False)),
                fields=('kurum_id', 'sube_id', 'ad'),
                name='unique_kurum_sube_salon_ad',
            ),
        ),
        migrations.AddConstraint(
            model_name='locker',
            constraint=models.UniqueConstraint(
                condition=models.Q(('is_deleted', False)),
                fields=('kurum_id', 'sube_id', 'dolap_no'),
                name='unique_kurum_sube_dolap_no',
            ),
        ),
    ]
