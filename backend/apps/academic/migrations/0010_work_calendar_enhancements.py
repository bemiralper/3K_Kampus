from django.db import migrations, models
import django.db.models.deletion


def backfill_cycle_kurum_sube(apps, schema_editor):
    WeeklyCycle = apps.get_model('academic', 'WeeklyCycle')
    for cycle in WeeklyCycle.objects.select_related('schedule_template').filter(kurum__isnull=True):
        tpl = cycle.schedule_template
        if tpl:
            cycle.kurum_id = tpl.kurum_id
            cycle.sube_id = tpl.sube_id
            cycle.save(update_fields=['kurum_id', 'sube_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('kurum', '0001_initial'),
        ('sube', '0001_initial'),
        ('academic', '0009_schedule_template_enhancements'),
    ]

    operations = [
        migrations.AddField(
            model_name='weeklycycle',
            name='kurum',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='weekly_cycles',
                to='kurum.kurum',
                verbose_name='Kurum',
            ),
        ),
        migrations.AddField(
            model_name='weeklycycle',
            name='sube',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='weekly_cycles',
                to='sube.sube',
                verbose_name='Şube',
            ),
        ),
        migrations.AddField(
            model_name='weeklycycle',
            name='is_default',
            field=models.BooleanField(
                default=False,
                help_text='Bu şube için varsayılan çalışma takvimi',
                verbose_name='Varsayılan mı?',
            ),
        ),
        migrations.AddField(
            model_name='weeklycycle',
            name='color',
            field=models.CharField(
                blank=True,
                default='#0262a7',
                max_length=7,
                verbose_name='Renk',
            ),
        ),
        migrations.AddField(
            model_name='weeklycycle',
            name='icon',
            field=models.CharField(
                blank=True,
                default='calendar',
                max_length=32,
                verbose_name='İkon',
            ),
        ),
        migrations.AlterField(
            model_name='weeklycycle',
            name='schedule_template',
            field=models.ForeignKey(
                blank=True,
                help_text='Eski bağlantı — yeni takvimler şablonsuz oluşturulur',
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='weekly_cycles',
                to='academic.scheduletemplate',
                verbose_name='Zaman Şablonu',
            ),
        ),
        migrations.AddField(
            model_name='weeklyday',
            name='schedule_template',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='weekly_day_plans',
                to='academic.scheduletemplate',
                verbose_name='Ders Saati Şablonu',
            ),
        ),
        migrations.AddField(
            model_name='weeklyday',
            name='note',
            field=models.CharField(
                blank=True,
                default='',
                max_length=200,
                verbose_name='Not',
            ),
        ),
        migrations.RunPython(backfill_cycle_kurum_sube, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name='weeklycycle',
            name='unique_cycle_name_per_template_active',
        ),
        migrations.AddConstraint(
            model_name='weeklycycle',
            constraint=models.UniqueConstraint(
                condition=models.Q(('is_active', True)),
                fields=('kurum', 'sube', 'name'),
                name='unique_work_calendar_name_per_branch_active',
            ),
        ),
    ]
