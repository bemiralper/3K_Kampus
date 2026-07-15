# Sözleşme unique: (personel, egitim_yili) → (personel, egitim_yili, sube)

from django.db import migrations, models


def backfill_sozlesme_sube(apps, schema_editor):
    """Eski kayıtlarda boş sube_id'yi görevlendirme veya personel ana şubesinden doldur."""
    PersonelSozlesme = apps.get_model('personel', 'PersonelSozlesme')
    for s in PersonelSozlesme.objects.filter(sube_id__isnull=True).select_related('personel', 'gorevlendirme'):
        sube_id = None
        if s.gorevlendirme_id and getattr(s.gorevlendirme, 'gorev_sube_id', None):
            sube_id = s.gorevlendirme.gorev_sube_id
        elif s.personel_id and getattr(s.personel, 'sube_id', None):
            sube_id = s.personel.sube_id
        if sube_id:
            s.sube_id = sube_id
            s.save(update_fields=['sube_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('personel', '0016_contract_v2_fields'),
    ]

    operations = [
        migrations.RunPython(backfill_sozlesme_sube, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name='personelsozlesme',
            name='unique_aktif_sozlesme_per_yil',
        ),
        migrations.AddConstraint(
            model_name='personelsozlesme',
            constraint=models.UniqueConstraint(
                condition=models.Q(('durum__in', ['TASLAK', 'AKTIF', 'PASIF', 'ASKIDA'])),
                fields=('personel', 'egitim_yili', 'sube'),
                name='unique_aktif_sozlesme_per_yil_sube',
            ),
        ),
    ]
