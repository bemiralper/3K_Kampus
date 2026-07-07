# Generated migration for okul app

import django.db.models.deletion
from django.db import migrations, models
from django.db.models.functions import Lower


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('kurum', '0001_initial'),
        ('sube', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Okul',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('ad', models.CharField(max_length=200, verbose_name='Okul Adı')),
                ('okul_turu', models.CharField(blank=True, max_length=100, verbose_name='Okul Türü')),
                ('il', models.CharField(blank=True, max_length=100, verbose_name='İl')),
                ('ilce', models.CharField(blank=True, max_length=100, verbose_name='İlçe')),
                ('not_metni', models.TextField(blank=True, verbose_name='Not')),
                ('aktif_mi', models.BooleanField(default=True, verbose_name='Aktif')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Oluşturma Tarihi')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Güncelleme Tarihi')),
                ('kurum', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='%(class)s_set', to='kurum.kurum', verbose_name='Kurum')),
                ('sube', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='%(class)s_set', to='sube.sube', verbose_name='Şube')),
            ],
            options={
                'verbose_name': 'Okul',
                'verbose_name_plural': 'Okullar',
                'db_table': 'okul',
                'ordering': ['ad'],
            },
        ),
        migrations.AddIndex(
            model_name='okul',
            index=models.Index(fields=['sube', 'aktif_mi'], name='okul_sube_aktif_idx'),
        ),
        migrations.AddIndex(
            model_name='okul',
            index=models.Index(fields=['sube', 'ad'], name='okul_sube_ad_idx'),
        ),
        migrations.AddIndex(
            model_name='okul',
            index=models.Index(fields=['sube', 'okul_turu'], name='okul_sube_tur_idx'),
        ),
        migrations.AddIndex(
            model_name='okul',
            index=models.Index(fields=['sube', 'il', 'ilce'], name='okul_sube_il_ilce_idx'),
        ),
        migrations.AddConstraint(
            model_name='okul',
            constraint=models.UniqueConstraint(Lower('ad'), models.F('sube'), name='unique_okul_ad_sube_ci'),
        ),
    ]
