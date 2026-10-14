from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('kurum', '0003_alter_kurum_app_logo_alter_kurum_favicon_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='kurum',
            name='il',
            field=models.CharField(blank=True, default='', max_length=100, verbose_name='İl'),
        ),
        migrations.AddField(
            model_name='kurum',
            name='ilce',
            field=models.CharField(blank=True, default='', max_length=100, verbose_name='İlçe'),
        ),
    ]
