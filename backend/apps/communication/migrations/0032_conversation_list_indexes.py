# Faz 5 — liste ve numara eşleşmesi indeksleri (P-08).
#
# Metin araması için trigram (pg_trgm) indeksi bu migration'da yok: canlı DB
# rolü superuser değil ve uzantı kurulu değil. Uzantı yüklendikten sonra
# ayrı bir migration ile eklenir (bkz. docs/deployment notu).
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('communication', '0031_outboundqueueitem_locked_by'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='conversation',
            index=models.Index(fields=['kurum', '-last_message_at'], name='comm_conv_kurum_lastmsg_idx'),
        ),
        migrations.AddIndex(
            model_name='conversation',
            index=models.Index(fields=['kurum', 'contact_phone'], name='comm_conv_kurum_phone_idx'),
        ),
    ]
