# Faz 4 — kuyruk kilidi (B-04): kilidi alan işleyicinin kimliği.
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('communication', '0030_message_provider_id_unique'),
    ]

    operations = [
        migrations.AddField(
            model_name='outboundqueueitem',
            name='locked_by',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
    ]
