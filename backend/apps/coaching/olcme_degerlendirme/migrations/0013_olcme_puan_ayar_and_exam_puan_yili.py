from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('kurum', '0001_initial'),
        ('olcme_degerlendirme', '0012_update_section_unique_constraint'),
    ]

    operations = [
        migrations.AddField(
            model_name='exam',
            name='puan_yili',
            field=models.PositiveSmallIntegerField(
                blank=True,
                help_text='Boşsa kurum varsayılan puan yılı kullanılır.',
                null=True,
                verbose_name='Puan Yılı',
            ),
        ),
        migrations.CreateModel(
            name='OlcmePuanAyar',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('default_puan_yili', models.PositiveSmallIntegerField(default=2025, verbose_name='Varsayılan Puan Yılı')),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('kurum', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='olcme_puan_ayar',
                    to='kurum.kurum',
                    verbose_name='Kurum',
                )),
            ],
            options={
                'verbose_name': 'Ölçme Puan Ayarı',
                'verbose_name_plural': 'Ölçme Puan Ayarları',
            },
        ),
        migrations.CreateModel(
            name='OlcmeKatsayiSeti',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('year', models.PositiveSmallIntegerField(verbose_name='Yıl')),
                ('kind', models.CharField(
                    choices=[
                        ('TYT', 'TYT'),
                        ('AYT_SAY', 'AYT Sayısal'),
                        ('AYT_EA', 'AYT Eşit Ağırlık'),
                        ('AYT_SOZ', 'AYT Sözel'),
                    ],
                    max_length=12,
                    verbose_name='Tür',
                )),
                ('coefficients', models.JSONField(default=dict, verbose_name='Katsayılar')),
                ('is_published', models.BooleanField(
                    default=True,
                    help_text='2026 gibi henüz açıklanmamış yıllar False kalır.',
                    verbose_name='Resmi (ÖSYM açıklandı)',
                )),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('kurum', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='olcme_katsayi_setleri',
                    to='kurum.kurum',
                    verbose_name='Kurum',
                )),
            ],
            options={
                'verbose_name': 'Ölçme Katsayı Seti',
                'verbose_name_plural': 'Ölçme Katsayı Setleri',
            },
        ),
        migrations.AddConstraint(
            model_name='olcmekatsayiseti',
            constraint=models.UniqueConstraint(
                fields=('kurum', 'year', 'kind'),
                name='unique_olcme_katsayi_kurum_year_kind',
            ),
        ),
    ]
