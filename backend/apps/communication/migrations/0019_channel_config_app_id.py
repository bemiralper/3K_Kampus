from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('communication', '0018_birthday_media_and_wish_log'),
    ]

    operations = [
        migrations.AddField(
            model_name='communicationchannelconfig',
            name='app_id',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Open Graph fb:app_id ve şablon medya yükleme için. Boşsa token/env ile çözülür.',
                max_length=64,
                verbose_name='Meta App ID',
            ),
        ),
    ]
