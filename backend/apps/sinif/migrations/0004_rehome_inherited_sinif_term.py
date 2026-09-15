from django.db import migrations
from django.db.models import Q


def _rehome_inherited_siniflar(apps, schema_editor):
    Sinif = apps.get_model('sinif', 'Sinif')
    Term = apps.get_model('term', 'Term')
    Placement = apps.get_model('academic', 'StudentClassPlacement')

    term_groups = (
        Term.objects
        .values_list('kurum_id', 'sube_id', 'egitim_yili_id')
        .distinct()
    )
    for kurum_id, sube_id, egitim_yili_id in term_groups:
        terms = list(
            Term.objects
            .filter(kurum_id=kurum_id, sube_id=sube_id, egitim_yili_id=egitim_yili_id)
            .order_by('-is_active', '-updated_at', 'order_no', 'start_date', 'id')
        )
        if not terms:
            continue
        active = next((t for t in terms if t.is_active), terms[0])
        previous = next((t for t in terms if t.id != active.id), None)
        if previous is None:
            Sinif.objects.filter(
                kurum_id=kurum_id,
                sube_id=sube_id,
                egitim_yili_id=egitim_yili_id,
                term_id__isnull=True,
            ).update(term_id=active.id)
            continue

        owned_ids = set(
            Placement.objects.filter(
                term_id=active.id,
                is_active=True,
            ).values_list('classroom_id', flat=True)
        )
        candidates = (
            Sinif.objects
            .filter(kurum_id=kurum_id, sube_id=sube_id, egitim_yili_id=egitim_yili_id)
            .filter(Q(term_id=active.id) | Q(term_id__isnull=True))
            .exclude(id__in=owned_ids)
        )
        for sinif in candidates:
            has_prev = Placement.objects.filter(
                classroom_id=sinif.id,
                term_id=previous.id,
                is_active=True,
            ).exists()
            created_before = bool(
                sinif.created_at and active.created_at and sinif.created_at < active.created_at
            )
            if not (has_prev or created_before or sinif.term_id is None):
                continue
            clash = Sinif.objects.filter(
                kurum_id=sinif.kurum_id,
                sube_id=sinif.sube_id,
                egitim_yili_id=sinif.egitim_yili_id,
                term_id=previous.id,
                ad=sinif.ad,
            ).exclude(pk=sinif.pk).exists()
            if clash:
                continue
            sinif.term_id = previous.id
            sinif.save(update_fields=['term_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('sinif', '0003_sinif_term'),
        ('academic', '0006_student_class_placement'),
    ]

    operations = [
        migrations.RunPython(_rehome_inherited_siniflar, migrations.RunPython.noop),
    ]
