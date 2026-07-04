from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('communication', '0003_campaignattachment_provider_media_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='messagetemplate',
            name='audience_scope',
            field=models.CharField(
                choices=[
                    ('genel', 'Genel (tüm roller)'),
                    ('admin', 'Admin / İletişim'),
                    ('coach', 'Koç'),
                    ('muhasebe', 'Muhasebe'),
                ],
                db_index=True,
                default='genel',
                max_length=32,
                verbose_name='Hedef kitle',
            ),
        ),
    ]
