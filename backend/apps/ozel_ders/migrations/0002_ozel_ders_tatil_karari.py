from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('ozel_ders', '0001_ozel_ders_module'),
        ('kurum', '0003_alter_kurum_app_logo_alter_kurum_favicon_and_more'),
        ('sube', '0003_sube_branding'),
    ]

    operations = [
        migrations.CreateModel(
            name='OzelDersTatilKarari',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('holiday_key', models.CharField(db_index=True, max_length=64)),
                ('tarih', models.DateField(db_index=True)),
                ('ozel_ders_aktif', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('kurum', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='ozel_ders_tatil_kararlari',
                    to='kurum.kurum',
                )),
                ('sube', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='ozel_ders_tatil_kararlari',
                    to='sube.sube',
                )),
            ],
            options={
                'verbose_name': 'Özel Ders Tatil Kararı',
                'verbose_name_plural': 'Özel Ders Tatil Kararları',
                'db_table': 'ozel_ders_tatil_karari',
                'ordering': ['tarih', 'holiday_key'],
                'constraints': [
                    models.UniqueConstraint(
                        fields=('kurum', 'sube', 'holiday_key', 'tarih'),
                        name='unique_ozel_ders_tatil_karari',
                    ),
                ],
            },
        ),
    ]
