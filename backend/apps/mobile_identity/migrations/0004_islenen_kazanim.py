from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0048_room_name_per_session'),
        ('mobile_identity', '0003_boards'),
    ]

    operations = [
        migrations.CreateModel(
            name='IslenenKazanim',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                (
                    'islenen_konu',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='kazanimlar',
                        to='mobile_identity.islenenkonu',
                    ),
                ),
                (
                    'outcome',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='islenen_kayitlar',
                        to='olcme_degerlendirme.outcome',
                    ),
                ),
            ],
            options={
                'db_table': 'islenen_kazanim',
            },
        ),
        migrations.AddConstraint(
            model_name='islenenkazanim',
            constraint=models.UniqueConstraint(fields=('islenen_konu', 'outcome'), name='islenen_kazanim_unique'),
        ),
    ]
