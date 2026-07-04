"""Mevcut çek/senet kayıtlarına kurum/sube/tutar/yon backfill."""
from django.db import migrations


def backfill_cek_senet(apps, schema_editor):
    CekSenetDetay = apps.get_model('odeme_takip', 'CekSenetDetay')
    for det in CekSenetDetay.objects.select_related('taksit', 'tahsilat').iterator():
        updates = {}
        if det.taksit_id:
            Taksit = apps.get_model('odeme_takip', 'Taksit')
            Sozlesme = apps.get_model('odeme_takip', 'Sozlesme')
            taksit = Taksit.objects.filter(pk=det.taksit_id).first()
            if taksit and taksit.sozlesme_id:
                soz = Sozlesme.objects.filter(pk=taksit.sozlesme_id).first()
                if soz:
                    updates['kurum_id'] = soz.kurum_id
                    updates['sube_id'] = soz.sube_id
                if not det.tutar:
                    updates['tutar'] = taksit.kalan_tutar or taksit.tutar or 0
        elif det.tahsilat_id:
            Tahsilat = apps.get_model('odeme_takip', 'Tahsilat')
            Sozlesme = apps.get_model('odeme_takip', 'Sozlesme')
            tahsilat = Tahsilat.objects.filter(pk=det.tahsilat_id).first()
            if tahsilat and tahsilat.sozlesme_id:
                soz = Sozlesme.objects.filter(pk=tahsilat.sozlesme_id).first()
                if soz:
                    updates['kurum_id'] = soz.kurum_id
                    updates['sube_id'] = soz.sube_id
                if not det.tutar:
                    updates['tutar'] = tahsilat.tutar or 0

        if not getattr(det, 'yon', None) or det.yon == 'alinan':
            if not det.yon:
                updates['yon'] = 'alinan'

        if det.durum == 'tahsil':
            updates['durum'] = 'tahsil_edildi'
        elif not det.durum:
            updates['durum'] = 'portfoyde'

        if updates:
            CekSenetDetay.objects.filter(pk=det.pk).update(**updates)


class Migration(migrations.Migration):

    dependencies = [
        ('odeme_takip', '0014_cek_senet_v2'),
    ]

    operations = [
        migrations.RunPython(backfill_cek_senet, migrations.RunPython.noop),
    ]
