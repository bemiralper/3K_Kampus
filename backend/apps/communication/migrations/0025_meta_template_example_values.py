from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('communication', '0024_saved_audience'),
    ]

    operations = [
        migrations.AddField(
            model_name='whatsappmetatemplate',
            name='example_values_json',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text='Yalnızca Meta onayına gider ({{mesaj}} vb.). Asıl gönderimde kullanılmaz.',
                verbose_name='Meta onay örnekleri',
            ),
        ),
    ]
