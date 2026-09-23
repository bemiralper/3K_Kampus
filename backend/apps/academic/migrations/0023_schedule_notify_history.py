from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academic', '0022_attendance_izinli_mi'),
    ]

    operations = [
        migrations.AddField(
            model_name='classschedulenotifylog',
            name='target_kind',
            field=models.CharField(
                choices=[('class', 'Sınıf'), ('teacher', 'Öğretmen')],
                db_index=True,
                default='class',
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name='classschedulenotifylog',
            name='batch_id',
            field=models.CharField(blank=True, db_index=True, default='', max_length=64),
        ),
        migrations.AlterField(
            model_name='classschedulenotifylog',
            name='schedule_version',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.CASCADE,
                related_name='notify_logs',
                to='academic.scheduleversion',
            ),
        ),
        migrations.AlterField(
            model_name='classschedulenotifylog',
            name='sinif',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.CASCADE,
                related_name='schedule_notify_logs',
                to='sinif.sinif',
            ),
        ),
        migrations.AlterField(
            model_name='classschedulenotifylog',
            name='grid_fingerprint',
            field=models.CharField(blank=True, db_index=True, default='', max_length=64),
        ),
    ]
