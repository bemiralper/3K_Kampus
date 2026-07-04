"""Mevcut kurumlar için Haftalık Ödev PDF mesaj şablonlarını oluştur."""
from django.db import migrations


def seed_assignment_pdf_templates(apps, schema_editor):
    Kurum = apps.get_model('kurum', 'Kurum')
    from apps.coaching.assignment_manual.assignment_template_seed import ensure_assignment_pdf_templates

    for kurum_id in Kurum.objects.values_list('id', flat=True):
        # Config tablosu 0013'te oluşur — burada yalnızca şablon kayıtları
        ensure_assignment_pdf_templates(kurum_id, link_config=False)


class Migration(migrations.Migration):

    dependencies = [
        ('assignment_manual', '0011_manualassignment_deletion_audit'),
        ('communication', '0006_category_audience_reply_reactions'),
        ('kurum', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_assignment_pdf_templates, migrations.RunPython.noop),
    ]
