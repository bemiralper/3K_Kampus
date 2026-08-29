from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0015_oturum_gruplari'),
    ]

    operations = [
        migrations.AddField(
            model_name='examparticipant',
            name='notified_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Sınav bilgisi gönderildi'),
        ),
        migrations.AddField(
            model_name='examparticipant',
            name='notified_room_id',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='examparticipant',
            name='notified_seat_no',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
