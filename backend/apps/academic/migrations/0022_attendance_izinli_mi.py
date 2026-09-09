from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academic', '0021_attendance_late_time'),
    ]

    operations = [
        migrations.AddField(
            model_name='lessonattendancerecord',
            name='izinli_mi',
            field=models.BooleanField(
                default=False,
                help_text='Kütüphane izin kaydı nedeniyle otomatik İZİNLİ',
            ),
        ),
        migrations.AddField(
            model_name='classperiodattendancerecord',
            name='izinli_mi',
            field=models.BooleanField(
                default=False,
                help_text='Kütüphane izin kaydı nedeniyle otomatik İZİNLİ',
            ),
        ),
    ]
