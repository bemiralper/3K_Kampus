import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('odeme_takip', '0020_ceksenetdetay_cari_hareket'),
        ('kurum', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('finans', '0038_uyumsoft_ayar'),
    ]

    operations = [
        migrations.CreateModel(
            name='EBelge',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('ettn', models.UUIDField(default=uuid.uuid4, unique=True, verbose_name='ETTN')),
                ('belge_tipi', models.CharField(choices=[('efatura', 'e-Fatura'), ('earsiv', 'e-Arşiv')], max_length=20, verbose_name='Belge tipi')),
                ('durum', models.CharField(choices=[('uyumsoft_taslak', 'Uyumsoft taslağı'), ('hata', 'Hata')], default='hata', max_length=30, verbose_name='Durum')),
                ('yerel_no', models.CharField(blank=True, default='', max_length=20, verbose_name='Yerel belge no')),
                ('uyumsoft_no', models.CharField(blank=True, default='', max_length=32, verbose_name='Uyumsoft belge no')),
                ('alici_unvan', models.CharField(blank=True, default='', max_length=200, verbose_name='Alıcı')),
                ('alici_vkn', models.CharField(blank=True, default='', max_length=11, verbose_name='Alıcı VKN/TCKN')),
                ('alici_alias', models.CharField(blank=True, default='', max_length=200, verbose_name='Alıcı etiketi')),
                ('satirlar', models.JSONField(blank=True, default=list, verbose_name='Satırlar')),
                ('matrah', models.DecimalField(decimal_places=2, default=0, max_digits=12, verbose_name='Matrah')),
                ('kdv_tutari', models.DecimalField(decimal_places=2, default=0, max_digits=12, verbose_name='KDV')),
                ('odenecek', models.DecimalField(decimal_places=2, default=0, max_digits=12, verbose_name='Ödenecek')),
                ('hata_mesaji', models.TextField(blank=True, default='', verbose_name='Hata')),
                ('gonderim_tarihi', models.DateTimeField(blank=True, null=True, verbose_name='Gönderim')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('gonderen', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='gonderdigi_e_belgeler', to=settings.AUTH_USER_MODEL, verbose_name='Gönderen')),
                ('kurum', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='e_belgeler', to='kurum.kurum', verbose_name='Kurum')),
                ('tahsilat', models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name='e_belge', to='odeme_takip.tahsilat', verbose_name='Tahsilat')),
            ],
            options={
                'verbose_name': 'E-Belge',
                'verbose_name_plural': 'E-Belgeler',
                'db_table': 'finans_e_belge',
            },
        ),
    ]
