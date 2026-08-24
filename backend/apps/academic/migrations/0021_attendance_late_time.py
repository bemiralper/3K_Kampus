from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academic', '0020_schedule_change_action_program_labels'),
    ]

    operations = [
        migrations.AddField(
            model_name='classperiodattendancerecord',
            name='late_time',
            field=models.TimeField(
                blank=True,
                help_text='Geç gelen öğrencinin giriş saati (kütüphane yoklamasındaki giris_saati gibi).',
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='lessonattendancerecord',
            name='late_time',
            field=models.TimeField(
                blank=True,
                help_text='Geç gelen öğrencinin derse giriş saati.',
                null=True,
            ),
        ),
    ]
