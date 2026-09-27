from django.db import migrations, models


def expand_short_ayt_philosophy(apps, schema_editor):
    """AYT seçmeli felsefe 5 soruysa 6'ya uzat. Soru numaralarını kaydırma."""
    from apps.coaching.olcme_degerlendirme.models import Exam
    from apps.coaching.olcme_degerlendirme.services.exam_templates import (
        sync_optional_philosophy_section,
    )

    for exam in Exam.objects.filter(exam_type='YKS_AYT', include_optional_philosophy=True):
        sync_optional_philosophy_section(exam)


def _noop(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0036_dispatch_send_options'),
    ]

    operations = [
        migrations.AlterField(
            model_name='exam',
            name='include_optional_philosophy',
            field=models.BooleanField(
                default=True,
                help_text=(
                    'Din Kültürü’nden hemen sonra gelen seçmeli felsefe '
                    '(TYT 5 soru, AYT 6 soru). Varsayılan: dahil. '
                    'Sözel puan hesaplamasında kullanılır.'
                ),
                verbose_name='Felsefe (Seçmeli)',
            ),
        ),
        migrations.RunPython(expand_short_ayt_philosophy, _noop),
    ]
