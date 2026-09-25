import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0030_room_seat_start_gap'),
    ]

    operations = [
        migrations.AddField(
            model_name='examroom',
            name='exam_session',
            field=models.ForeignKey(
                blank=True,
                help_text='Boşsa salon her oturumda kullanılır. Doluysa yalnız bu oturumun öğrencileri buraya oturur.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='rooms',
                to='olcme_degerlendirme.examsessionmodel',
                verbose_name='Oturum',
            ),
        ),
    ]
