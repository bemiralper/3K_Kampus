"""
Migration 0009: KDV Oranı + EkHizmet-Deneme İlişkisi

Feature 1: Tüm paket modellerine KDV oranı alanı ekleme
Feature 2: EkHizmet modeline deneme_paketi FK ekleme
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('egitim_paketleri', '0008_add_ek_hizmet_system'),
    ]

    operations = [
        # === Feature 1: KDV Oranı — Tüm modellere ekleniyor ===
        
        # EkHizmet KDV
        migrations.AddField(
            model_name='ekhizmet',
            name='kdv_orani',
            field=models.DecimalField(
                decimal_places=2,
                default=10.00,
                help_text='KDV oranı yüzde olarak (örn: 10.00 = %10)',
                max_digits=5,
                verbose_name='KDV Oranı (%)',
            ),
        ),
        
        # GrupDersi KDV
        migrations.AddField(
            model_name='grupdersi',
            name='kdv_orani',
            field=models.DecimalField(
                decimal_places=2,
                default=10.00,
                help_text='KDV oranı yüzde olarak (örn: 10.00 = %10)',
                max_digits=5,
                verbose_name='KDV Oranı (%)',
            ),
        ),
        
        # OzelDers KDV
        migrations.AddField(
            model_name='ozelders',
            name='kdv_orani',
            field=models.DecimalField(
                decimal_places=2,
                default=10.00,
                help_text='KDV oranı yüzde olarak (örn: 10.00 = %10)',
                max_digits=5,
                verbose_name='KDV Oranı (%)',
            ),
        ),
        
        # Deneme KDV
        migrations.AddField(
            model_name='deneme',
            name='kdv_orani',
            field=models.DecimalField(
                decimal_places=2,
                default=10.00,
                help_text='KDV oranı yüzde olarak (örn: 10.00 = %10)',
                max_digits=5,
                verbose_name='KDV Oranı (%)',
            ),
        ),
        
        # DavranisPaketi KDV
        migrations.AddField(
            model_name='davranispaketi',
            name='kdv_orani',
            field=models.DecimalField(
                decimal_places=2,
                default=10.00,
                help_text='KDV oranı yüzde olarak (örn: 10.00 = %10)',
                max_digits=5,
                verbose_name='KDV Oranı (%)',
            ),
        ),
        
        # === Feature 2: EkHizmet ↔ Deneme FK ===
        migrations.AddField(
            model_name='ekhizmet',
            name='deneme_paketi',
            field=models.ForeignKey(
                blank=True,
                help_text='Hizmet türü "Deneme" ise ilişkili deneme paketini seçin',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='iliskili_ek_hizmetler',
                to='egitim_paketleri.deneme',
                verbose_name='İlişkili Deneme Paketi',
            ),
        ),
    ]
