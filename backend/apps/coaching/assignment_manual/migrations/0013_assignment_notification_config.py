# Generated manually
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('assignment_manual', '0012_seed_assignment_pdf_templates'),
        ('communication', '0006_category_audience_reply_reactions'),
    ]

    operations = [
        migrations.CreateModel(
            name='AssignmentNotificationConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kurum_id', models.IntegerField(unique=True, verbose_name='Kurum ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('plan_veli_template', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='communication.messagetemplate', verbose_name='Ödev planı — veli şablonu')),
                ('plan_ogrenci_template', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='communication.messagetemplate', verbose_name='Ödev planı — öğrenci şablonu')),
                ('report_veli_template', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='communication.messagetemplate', verbose_name='Ödev raporu — veli şablonu')),
                ('report_ogrenci_template', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='communication.messagetemplate', verbose_name='Ödev raporu — öğrenci şablonu')),
            ],
            options={
                'verbose_name': 'Ödev Bildirim Ayarı',
                'verbose_name_plural': 'Ödev Bildirim Ayarları',
                'db_table': 'coaching_assignment_notify_config',
            },
        ),
        migrations.RunPython(
            code=lambda apps, schema_editor: _link_configs(apps),
            reverse_code=migrations.RunPython.noop,
        ),
    ]


def _link_configs(apps):
    Kurum = apps.get_model('kurum', 'Kurum')
    from apps.coaching.assignment_manual.assignment_template_seed import ensure_assignment_pdf_templates

    for kurum_id in Kurum.objects.values_list('id', flat=True):
        ensure_assignment_pdf_templates(kurum_id)
