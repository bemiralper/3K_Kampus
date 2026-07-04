from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('gorev', '0004_atama_son_hatirlatma'),
    ]

    operations = [
        migrations.AddField(
            model_name='gorev',
            name='ekran_mesaji',
            field=models.BooleanField(
                default=False,
                help_text='Atanan kişiye girişte tam ekran bildirim göster',
                verbose_name='Ekran Mesajı',
            ),
        ),
    ]
