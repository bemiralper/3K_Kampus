from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0034_topic_program'),
    ]

    operations = [
        migrations.AlterField(
            model_name='exam',
            name='booklet_type',
            field=models.CharField(
                choices=[
                    ('NONE', 'Kitapçık Yok'),
                    ('AB', 'A-B'),
                    ('ABCD', 'A-B-C-D'),
                ],
                default='AB',
                max_length=4,
                verbose_name='Kitapçık Türü',
            ),
        ),
    ]
