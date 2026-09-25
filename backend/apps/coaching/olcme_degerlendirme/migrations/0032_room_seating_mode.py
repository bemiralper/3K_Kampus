from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0031_room_exam_session'),
    ]

    operations = [
        migrations.AddField(
            model_name='examroom',
            name='seating_mode',
            field=models.CharField(
                default='shuffle',
                help_text='Bu salondaki öğrencilerin sıra düzeni: shuffle, cross veya sequential.',
                max_length=12,
                verbose_name='Oturma kuralı',
            ),
        ),
    ]
