"""
Migration: AvansKaydi modeli — Personel avans takip sistemi
"""
import django.core.validators
import django.db.models.deletion
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('personel', '0011_add_prim_fazla_mesai_avans_ders_basi_ucret'),
    ]

    operations = [
        migrations.CreateModel(
            name='AvansKaydi',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tarih', models.DateField(verbose_name='Avans Tarihi')),
                ('tutar', models.DecimalField(
                    decimal_places=2, max_digits=12,
                    validators=[django.core.validators.MinValueValidator(Decimal('0.01'))],
                    verbose_name='Tutar (₺)',
                )),
                ('aciklama', models.CharField(blank=True, help_text='Avansın nedeni / açıklaması', max_length=500, verbose_name='Açıklama')),
                ('mahsup_yil', models.PositiveSmallIntegerField(help_text='Hangi yılın bordrosundan düşülecek', verbose_name='Mahsup Yılı')),
                ('mahsup_ay', models.PositiveSmallIntegerField(help_text='Hangi ayın bordrosundan düşülecek (1-12)', verbose_name='Mahsup Ayı')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('sozlesme', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='avans_kayitlari',
                    to='personel.personelsozlesme',
                    verbose_name='Sözleşme',
                )),
                ('olusturan', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='olusturulan_avanslar',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Oluşturan',
                )),
            ],
            options={
                'verbose_name': 'Avans Kaydı',
                'verbose_name_plural': 'Avans Kayıtları',
                'db_table': 'personel_avans_kaydi',
                'ordering': ['-tarih'],
            },
        ),
        migrations.AddIndex(
            model_name='avanskaydi',
            index=models.Index(fields=['sozlesme', 'mahsup_yil', 'mahsup_ay'], name='personel_av_sozlesm_idx'),
        ),
    ]
