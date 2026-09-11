from django.db import migrations, models

from ._idempotent import AddFieldIfMissing


def _heal(apps, schema_editor):
    # Canlı Docker migrate sırasında kirliliği temizle + DAT'ı yeniden hizala.
    from apps.coaching.olcme_degerlendirme.services.curriculum_heal import (
        uygula_karisan_kazanim_temizligi,
    )
    from apps.coaching.olcme_degerlendirme.services.dat_realign import (
        realign_exam_if_needed,
    )
    from apps.coaching.olcme_degerlendirme.models.exam import Exam

    uygula_karisan_kazanim_temizligi()
    for exam in Exam.objects.all().iterator():
        try:
            realign_exam_if_needed(exam)
        except Exception:
            continue


def _noop(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0024_mappingtemplate_kurum'),
    ]

    operations = [
        AddFieldIfMissing(
            model_name='examsession',
            name='align_version',
            field=models.PositiveSmallIntegerField(
                default=0,
                help_text='0: sütunlar ardışık eklenmiş eski parse. '
                          '1+: her bölüm kendi question_start ofsetine yazılır.',
                verbose_name='Hizalama Sürümü',
            ),
        ),
        migrations.RunPython(_heal, _noop),
    ]
