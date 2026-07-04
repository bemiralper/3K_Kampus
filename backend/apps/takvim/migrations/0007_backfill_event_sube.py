# Backfill null sube_id on existing events

from django.db import migrations


def backfill_event_sube(apps, schema_editor):
    Event = apps.get_model('takvim', 'Event')
    Sube = apps.get_model('sube', 'Sube')

    kurum_ids = Event.objects.filter(sube_id__isnull=True).values_list('kurum_id', flat=True).distinct()
    for kurum_id in kurum_ids:
        sube = Sube.objects.filter(kurum_id=kurum_id).order_by('id').first()
        if not sube:
            continue
        Event.objects.filter(kurum_id=kurum_id, sube_id__isnull=True).update(sube_id=sube.id)


class Migration(migrations.Migration):

    dependencies = [
        ('takvim', '0006_appnotification_ekran_gosterildi'),
    ]

    operations = [
        migrations.RunPython(backfill_event_sube, migrations.RunPython.noop),
    ]
