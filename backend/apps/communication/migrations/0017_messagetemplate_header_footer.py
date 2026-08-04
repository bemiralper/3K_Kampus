from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('communication', '0016_messagetemplate_meta_template_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='messagetemplate',
            name='header_json',
            field=models.JSONField(blank=True, default=dict, verbose_name='Başlık'),
        ),
        migrations.AddField(
            model_name='messagetemplate',
            name='footer_text',
            field=models.CharField(blank=True, default='', max_length=60, verbose_name='Alt bilgi'),
        ),
    ]
