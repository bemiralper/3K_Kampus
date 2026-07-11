# Generated migration for teacher availability

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('kurum', '0001_initial'),
        ('sube', '0001_initial'),
        ('personel', '0016_contract_v2_fields'),
        ('academic', '0012_schedule_template_gun_yapisi_label'),
    ]

    operations = [
        migrations.CreateModel(
            name='TeacherAvailabilitySet',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[('DEFAULT', 'Varsayılan'), ('TEMPORARY', 'Geçici')], default='DEFAULT', max_length=16)),
                ('title', models.CharField(blank=True, default='', max_length=120)),
                ('valid_from', models.DateField(blank=True, null=True)),
                ('valid_until', models.DateField(blank=True, null=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('kurum', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='teacher_availability_sets', to='kurum.kurum')),
                ('personel', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='availability_sets', to='personel.personel')),
                ('sube', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='teacher_availability_sets', to='sube.sube')),
            ],
            options={
                'verbose_name': 'Öğretmen Uygunluk Seti',
                'verbose_name_plural': 'Öğretmen Uygunluk Setleri',
                'db_table': 'academic_teacher_availability_set',
            },
        ),
        migrations.CreateModel(
            name='TeacherAvailabilityCalendar',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('availability_set', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='calendar_links', to='academic.teacheravailabilityset')),
                ('weekly_cycle', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='teacher_availability_links', to='academic.weeklycycle')),
            ],
            options={
                'db_table': 'academic_teacher_availability_calendar',
            },
        ),
        migrations.CreateModel(
            name='TeacherAvailabilityCell',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('day_of_week', models.PositiveSmallIntegerField(help_text='0=Pazartesi … 6=Pazar')),
                ('status', models.CharField(choices=[('AVAILABLE', 'Uygun'), ('UNAVAILABLE', 'Uygun Değil'), ('PREFERRED', 'Tercih Edilir')], default='UNAVAILABLE', max_length=16)),
                ('availability_set', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cells', to='academic.teacheravailabilityset')),
                ('timeslot', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='teacher_availability_cells', to='academic.timeslot')),
                ('weekly_cycle', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='teacher_availability_cells', to='academic.weeklycycle')),
            ],
            options={
                'db_table': 'academic_teacher_availability_cell',
            },
        ),
        migrations.AddConstraint(
            model_name='teacheravailabilityset',
            constraint=models.UniqueConstraint(condition=models.Q(('is_active', True), ('kind', 'DEFAULT')), fields=('personel', 'sube'), name='unique_default_availability_per_teacher_branch'),
        ),
        migrations.AddConstraint(
            model_name='teacheravailabilitycalendar',
            constraint=models.UniqueConstraint(fields=('availability_set', 'weekly_cycle'), name='unique_calendar_per_availability_set'),
        ),
        migrations.AddConstraint(
            model_name='teacheravailabilitycell',
            constraint=models.UniqueConstraint(fields=('availability_set', 'weekly_cycle', 'day_of_week', 'timeslot'), name='unique_teacher_availability_cell'),
        ),
    ]
