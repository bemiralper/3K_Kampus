from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('website', '0015_integrations_search_console_html'),
    ]

    operations = [
        migrations.AddField(
            model_name='contententry',
            name='attachments',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='contententry',
            name='cover_thumb_url',
            field=models.URLField(blank=True, default='', max_length=500),
        ),
        migrations.AddField(
            model_name='contententry',
            name='gallery',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='contententry',
            name='priority',
            field=models.CharField(
                choices=[
                    ('normal', 'Normal'),
                    ('bilgi', 'Bilgi'),
                    ('onemli', 'Önemli'),
                    ('kritik', 'Kritik'),
                ],
                db_index=True,
                default='normal',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='contententry',
            name='unpublish_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
