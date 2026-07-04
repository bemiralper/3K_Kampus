from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('takvim', '0004_eventtype_varsayilan_mi'),
    ]

    operations = [
        migrations.AddField(
            model_name='appnotification',
            name='ekran_mesaji',
            field=models.BooleanField(
                default=False,
                help_text='Girişte tam ekran banner olarak gösterilir',
                verbose_name='Ekran Mesajı',
            ),
        ),
    ]
