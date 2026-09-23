from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academic', '0023_schedule_notify_history'),
    ]

    operations = [
        migrations.AlterField(
            model_name='classperiodattendancesession',
            name='period',
            field=models.CharField(
                choices=[
                    ('MORNING', 'Sabah'),
                    ('AFTERNOON', 'Öğle'),
                    ('EVENING', 'Akşam'),
                ],
                db_index=True,
                max_length=16,
            ),
        ),
    ]
