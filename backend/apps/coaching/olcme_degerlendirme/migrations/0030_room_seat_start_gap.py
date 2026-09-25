from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0029_sync_model_state'),
    ]

    operations = [
        migrations.AddField(
            model_name='examroom',
            name='seat_start',
            field=models.PositiveIntegerField(
                default=1,
                help_text='Bu sınavın bu salondaki ilk sıra numarası. 51 ise öğrenciler 51’den başlar.',
                verbose_name='İlk sıra',
            ),
        ),
        migrations.AddField(
            model_name='examroom',
            name='seat_gap',
            field=models.PositiveSmallIntegerField(
                default=0,
                help_text='Öğrenciler arasında bırakılan boş sıra. 0 bitişik oturur, 2 ise 1, 4, 7 gider.',
                verbose_name='Ara boşluk',
            ),
        ),
    ]
