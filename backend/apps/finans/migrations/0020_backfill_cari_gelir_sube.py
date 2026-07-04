# Step 2: backfill cari/gelir sube + make cari.sube required

from django.db import migrations, models
import django.db.models.deletion


def backfill_sube_references(apps, schema_editor):
    CariHesap = apps.get_model('finans', 'CariHesap')
    GelirKaydi = apps.get_model('finans', 'GelirKaydi')
    Sube = apps.get_model('sube', 'Sube')

    kurum_ids = set(
        CariHesap.objects.filter(sube__isnull=True).values_list('kurum_id', flat=True)
    ) | set(
        GelirKaydi.objects.filter(sube__isnull=True).values_list('kurum_id', flat=True)
    )

    for kurum_id in kurum_ids:
        sube = Sube.objects.filter(kurum_id=kurum_id).order_by('id').first()
        if not sube:
            continue
        CariHesap.objects.filter(kurum_id=kurum_id, sube__isnull=True).update(sube_id=sube.id)
        GelirKaydi.objects.filter(kurum_id=kurum_id, sube__isnull=True).update(sube_id=sube.id)


class Migration(migrations.Migration):

    dependencies = [
        ('finans', '0019_cari_hesap_sube'),
    ]

    operations = [
        migrations.RunPython(backfill_sube_references, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='carihesap',
            name='sube',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='cari_hesaplar',
                to='sube.sube',
                verbose_name='Şube',
            ),
        ),
        migrations.AlterField(
            model_name='gelirkaydi',
            name='sube',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='gelir_kayitlari',
                to='sube.sube',
                verbose_name='Şube',
            ),
        ),
        migrations.RemoveIndex(
            model_name='carihesap',
            name='finans_cari_kurum_i_198f8d_idx',
        ),
        migrations.RemoveIndex(
            model_name='carihesap',
            name='finans_cari_kurum_i_1ce708_idx',
        ),
        migrations.RemoveIndex(
            model_name='carihesap',
            name='finans_cari_vergi_n_98f34d_idx',
        ),
        migrations.AddIndex(
            model_name='carihesap',
            index=models.Index(
                fields=['kurum', 'sube', 'hesap_turu'],
                name='finans_cari_kurum_s_hesap_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='carihesap',
            index=models.Index(
                fields=['kurum', 'sube', 'aktif_mi'],
                name='finans_cari_kurum_s_aktif_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='carihesap',
            index=models.Index(
                fields=['sube', 'vergi_no'],
                name='finans_cari_sube_v_idx',
            ),
        ),
    ]
