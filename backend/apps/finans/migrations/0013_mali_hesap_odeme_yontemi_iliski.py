from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('personel', '0014_rename_personel_av_sozlesm_idx_personel_av_sozlesm_90efc1_idx_and_more'),
        ('odeme_takip', '0013_alter_sozlesmegecmisi_islem_turu'),
        ('finans', '0012_alter_bakiyehareketi_kaynak_alter_odemeyontemi_tip_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='malihesap',
            name='hesap_no',
            field=models.CharField(blank=True, default='', help_text="Banka hesap numarası (IBAN'dan bağımsız, opsiyonel)", max_length=50, verbose_name='Hesap No'),
        ),
        migrations.CreateModel(
            name='MaliHesapYetkilisi',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('ad_soyad', models.CharField(blank=True, default='', help_text='Personel seçilmediyse serbest metin olarak isim girilebilir', max_length=200, verbose_name='Ad Soyad')),
                ('rol', models.CharField(blank=True, default='', help_text='Örn: Şube Müdürü, Muhasebe Sorumlusu', max_length=100, verbose_name='Rol / Görev')),
                ('telefon', models.CharField(blank=True, default='', max_length=20, verbose_name='Telefon')),
                ('email', models.EmailField(blank=True, default='', max_length=254, verbose_name='E-posta')),
                ('notlar', models.TextField(blank=True, default='', verbose_name='Notlar')),
                ('siralama', models.PositiveIntegerField(default=0, verbose_name='Sıralama')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Oluşturma Tarihi')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Güncelleme Tarihi')),
                ('mali_hesap', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='yetkililer', to='finans.malihesap', verbose_name='Mali Hesap')),
                ('personel', models.ForeignKey(blank=True, help_text='Sistemdeki bir personel ile ilişkilendirmek isterseniz seçin (opsiyonel)', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='mali_hesap_yetkilikleri', to='personel.personel', verbose_name='Personel')),
            ],
            options={
                'verbose_name': 'Mali Hesap Yetkilisi',
                'verbose_name_plural': 'Mali Hesap Yetkilileri',
                'db_table': 'finans_mali_hesap_yetkilisi',
                'ordering': ['siralama', 'ad_soyad'],
            },
        ),
        migrations.AddField(
            model_name='odemeyontemi',
            name='mali_hesap',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='odeme_yontemleri', to='finans.malihesap', verbose_name='Mali Hesap', help_text='Bu ödeme yönteminin ait olduğu kasa/banka/pos hesabı'),
        ),
    ]
