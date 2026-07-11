from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academic', '0013_teacher_availability'),
    ]

    operations = [
        migrations.AddField(
            model_name='weeklycycle',
            name='program_tipi',
            field=models.CharField(
                choices=[
                    ('GRUP', 'Grup Dersleri'),
                    ('BIREBIR', 'Birebir / Özel Ders'),
                    ('GENEL', 'Genel / Karma'),
                ],
                default='GENEL',
                help_text='Grup dersleri, birebir özel ders veya karma program',
                max_length=16,
                verbose_name='Program Tipi',
            ),
        ),
    ]
