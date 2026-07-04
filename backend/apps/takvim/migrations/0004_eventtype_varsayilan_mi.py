from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('takvim', '0003_add_context_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='eventtype',
            name='varsayilan_mi',
            field=models.BooleanField(default=False, verbose_name='Varsayılan Tür'),
        ),
    ]
