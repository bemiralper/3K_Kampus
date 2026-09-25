from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('communication', '0033_bulk_send_hardening'),
    ]

    operations = [
        migrations.AddField(
            model_name='message',
            name='send_options',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
