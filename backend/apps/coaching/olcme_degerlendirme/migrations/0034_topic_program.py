from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0033_deneme_salon'),
    ]

    operations = [
        migrations.AddField(
            model_name='topic',
            name='program',
            field=models.CharField(
                choices=[
                    ('program_2018', '2018 Programı'),
                    ('maarif', 'Maarif Modeli'),
                ],
                db_index=True,
                default='program_2018',
                max_length=20,
                verbose_name='Program',
            ),
        ),
    ]
