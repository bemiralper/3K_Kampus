# Faz 3 — webhook veri bütünlüğü (B-01, M-09)
#
# * Message.provider_message_id: aynı Meta mesaj kimliği iki kez yazılamaz
#   (kısmi unique; boş değerler serbest). Canlıda (Faz 0.3) tekrar yok.
# * Message.created_at: gelen mesajlarda Meta zaman damgası yazılabilsin diye
#   auto_now_add → default=now. Mevcut veriye dokunmaz.
#
# Tablo boyutu küçük (≈6k satır); atomik DDL saniyenin altında biter.
from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('communication', '0029_conversationuserstate_notif_cleared_at'),
    ]

    operations = [
        migrations.AlterField(
            model_name='message',
            name='created_at',
            field=models.DateTimeField(default=django.utils.timezone.now, editable=False),
        ),
        migrations.AddConstraint(
            model_name='message',
            constraint=models.UniqueConstraint(
                condition=models.Q(('provider_message_id__gt', '')),
                fields=('provider_message_id',),
                name='comm_msg_provider_id_uniq',
            ),
        ),
    ]
