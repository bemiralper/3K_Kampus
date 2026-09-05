from django.db import migrations, models

from . import _idempotent as idem


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0017_oturum_gruplari'),
    ]

    operations = [
        idem.AddFieldIfMissing(
            model_name='examparticipant',
            name='notified_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Sınav bilgisi gönderildi'),
        ),
        idem.AddFieldIfMissing(
            model_name='examparticipant',
            name='notified_room_id',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        idem.AddFieldIfMissing(
            model_name='examparticipant',
            name='notified_seat_no',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
