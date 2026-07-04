from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('gorev', '0003_atama_gecikme_bildirimi'),
    ]

    operations = [
        migrations.AddField(
            model_name='gorevatama',
            name='son_hatirlatma_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Son Hatırlatma Bildirimi'),
        ),
    ]
