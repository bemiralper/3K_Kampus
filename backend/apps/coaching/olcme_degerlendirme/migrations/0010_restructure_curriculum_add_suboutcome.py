# Generated migration: Remove Unit model, restructure Topic → Subject, add SubOutcome

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0009_add_match_fields'),
    ]

    operations = [
        # 1. Topic'e subject FK ekle (nullable olarak başlat)
        migrations.AddField(
            model_name='topic',
            name='subject',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='topics',
                to='olcme_degerlendirme.subject',
                verbose_name='Ders',
            ),
        ),

        # 2. Topic'e code alanı ekle
        migrations.AddField(
            model_name='topic',
            name='code',
            field=models.CharField(
                blank=True,
                help_text='Ör: 9.1, 9.2',
                max_length=30,
                verbose_name='Konu Kodu',
                default='',
            ),
        ),

        # 3. Topic'teki eski unit FK'yı kaldır
        migrations.RemoveField(
            model_name='topic',
            name='unit',
        ),

        # 4. Unit modelini sil
        migrations.DeleteModel(
            name='Unit',
        ),

        # 5. Topic.subject'i non-nullable yap (varsayılan yok, tablo boş)
        migrations.AlterField(
            model_name='topic',
            name='subject',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='topics',
                to='olcme_degerlendirme.subject',
                verbose_name='Ders',
            ),
        ),

        # 6. Topic ordering güncelle
        migrations.AlterModelOptions(
            name='topic',
            options={
                'verbose_name': 'Konu',
                'verbose_name_plural': 'Konular',
                'ordering': ['subject', 'order'],
            },
        ),

        # 7. SubOutcome modeli oluştur
        migrations.CreateModel(
            name='SubOutcome',
            fields=[
                ('id', models.BigAutoField(
                    auto_created=True,
                    primary_key=True,
                    serialize=False,
                    verbose_name='ID',
                )),
                ('code', models.CharField(
                    blank=True,
                    max_length=50,
                    verbose_name='Alt Kazanım Kodu',
                )),
                ('text', models.TextField(verbose_name='Alt Kazanım Metni')),
                ('order', models.PositiveSmallIntegerField(
                    default=0,
                    verbose_name='Sıra',
                )),
                ('is_active', models.BooleanField(
                    default=True,
                    verbose_name='Aktif',
                )),
                ('outcome', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='sub_outcomes',
                    to='olcme_degerlendirme.outcome',
                    verbose_name='Kazanım',
                )),
            ],
            options={
                'verbose_name': 'Alt Kazanım',
                'verbose_name_plural': 'Alt Kazanımlar',
                'ordering': ['outcome', 'order'],
            },
        ),
    ]
