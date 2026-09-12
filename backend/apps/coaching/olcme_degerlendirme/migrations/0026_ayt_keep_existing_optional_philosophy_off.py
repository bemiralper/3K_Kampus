from django.db import migrations


def _disable_ayt_flag_without_section(apps, schema_editor):
    """Mevcut AYT sınavlarında varsayılan True, bölüm yoktu — otomatik +5 kaydırma olmasın."""
    Exam = apps.get_model('olcme_degerlendirme', 'Exam')
    ExamSection = apps.get_model('olcme_degerlendirme', 'ExamSection')
    for exam in Exam.objects.filter(exam_type='YKS_AYT', include_optional_philosophy=True):
        has_phil = ExamSection.objects.filter(exam_id=exam.id, name='Felsefe (Seçmeli)').exists()
        if not has_phil:
            exam.include_optional_philosophy = False
            exam.save(update_fields=['include_optional_philosophy'])


def _noop(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0025_heal_mixed_curriculum_and_realign'),
    ]

    operations = [
        migrations.RunPython(_disable_ayt_flag_without_section, _noop),
    ]
