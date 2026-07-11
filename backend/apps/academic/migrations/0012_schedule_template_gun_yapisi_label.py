from django.db import migrations, models


def backfill_gun_yapisi_label(apps, schema_editor):
    ScheduleTemplate = apps.get_model('academic', 'ScheduleTemplate')
    WeeklyCycle = apps.get_model('academic', 'WeeklyCycle')
    for tpl in ScheduleTemplate.objects.filter(gun_yapisi_label='').select_related('primary_weekly_cycle'):
        if tpl.primary_weekly_cycle_id:
            try:
                cycle = WeeklyCycle.objects.get(pk=tpl.primary_weekly_cycle_id)
                tpl.gun_yapisi_label = cycle.name
                tpl.save(update_fields=['gun_yapisi_label'])
            except WeeklyCycle.DoesNotExist:
                pass


class Migration(migrations.Migration):

    dependencies = [
        ('academic', '0011_schedule_template_unique_active_only'),
    ]

    operations = [
        migrations.AddField(
            model_name='scheduletemplate',
            name='gun_yapisi_label',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Görüntüleme etiketi — örn. Hafta İçi, Hafta Sonu (çalışma takviminden bağımsız)',
                max_length=100,
                verbose_name='Gün Yapısı Etiketi',
            ),
        ),
        migrations.RunPython(backfill_gun_yapisi_label, migrations.RunPython.noop),
    ]
