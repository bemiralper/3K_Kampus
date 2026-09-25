import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sube', '0001_initial'),
        ('olcme_degerlendirme', '0032_room_seating_mode'),
    ]

    operations = [
        migrations.CreateModel(
            name='DenemeSalon',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100, verbose_name='Salon adı')),
                ('capacity', models.PositiveIntegerField(default=30, verbose_name='Kapasite')),
                ('sube', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='deneme_salonlari', to='sube.sube')),
            ],
            options={
                'verbose_name': 'Deneme salonu',
                'verbose_name_plural': 'Deneme salonları',
                'ordering': ['name', 'id'],
            },
        ),
        migrations.AddConstraint(
            model_name='denemesalon',
            constraint=models.UniqueConstraint(fields=('sube', 'name'), name='unique_deneme_salon_name'),
        ),
    ]
