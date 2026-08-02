from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('communication', '0012_message_comm_msg_conv_created_idx'),
    ]

    operations = [
        migrations.AddField(
            model_name='outboundqueueitem',
            name='send_options',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
