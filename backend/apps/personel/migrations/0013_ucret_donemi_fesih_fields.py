"""
Personel Sözleşmeleri — Migration 0013
- UcretDonemi modeli (Dönemsel ücretlendirme)
- Fesih alanları: fesih_tarihi, fesih_sebebi
"""
from django.db import migrations, models
import django.db.models.deletion
import django.core.validators
from decimal import Decimal


class Migration(migrations.Migration):

    dependencies = [
        ('personel', '0012_add_avans_kaydi'),
    ]

    operations = [
        # ── Fesih alanları → PersonelSozlesme ──
        migrations.AddField(
            model_name='personelsozlesme',
            name='fesih_tarihi',
            field=models.DateField(
                blank=True, null=True,
                verbose_name='Fesih Tarihi',
                help_text='Sözleşmenin feshedildiği tarih',
            ),
        ),
        migrations.AddField(
            model_name='personelsozlesme',
            name='fesih_sebebi',
            field=models.TextField(
                blank=True, default='',
                verbose_name='Fesih Sebebi',
                help_text='Fesih gerekçesi / açıklaması',
            ),
        ),

        # ── UcretDonemi modeli ──
        migrations.CreateModel(
            name='UcretDonemi',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('baslangic_ay', models.PositiveSmallIntegerField(
                    help_text='Sözleşmenin kaçıncı ayından itibaren (1-based). Ör: 1',
                    verbose_name='Başlangıç Ayı',
                )),
                ('bitis_ay', models.PositiveSmallIntegerField(
                    help_text='Sözleşmenin kaçıncı ayına kadar (dahil). Ör: 3. 0=sonsuza kadar',
                    verbose_name='Bitiş Ayı',
                )),
                ('brut_maas', models.DecimalField(
                    decimal_places=2, max_digits=12,
                    validators=[django.core.validators.MinValueValidator(Decimal('0.00'))],
                    verbose_name='Brüt Maaş (₺)',
                )),
                ('net_maas', models.DecimalField(
                    decimal_places=2, default=Decimal('0.00'), max_digits=12,
                    validators=[django.core.validators.MinValueValidator(Decimal('0.00'))],
                    verbose_name='Net Maaş (₺)',
                )),
                ('aciklama', models.CharField(
                    blank=True, max_length=255,
                    help_text='Ör: Deneme süresi, Zam sonrası dönem vb.',
                    verbose_name='Açıklama',
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('sozlesme', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='ucret_donemleri',
                    to='personel.personelsozlesme',
                    verbose_name='Sözleşme',
                )),
            ],
            options={
                'verbose_name': 'Ücret Dönemi',
                'verbose_name_plural': 'Ücret Dönemleri',
                'db_table': 'personel_ucret_donemi',
                'ordering': ['sozlesme', 'baslangic_ay'],
                'indexes': [
                    models.Index(fields=['sozlesme', 'baslangic_ay'], name='personel_uc_sozlesm_idx'),
                ],
            },
        ),
    ]
