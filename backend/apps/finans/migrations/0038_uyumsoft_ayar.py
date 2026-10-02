from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('kurum', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('finans', '0037_sync_model_state'),
    ]

    operations = [
        migrations.CreateModel(
            name='UyumsoftAyar',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('web_servis_url', models.URLField(default='https://edonusumapi.uyum.com.tr/Services/Integration', max_length=300, verbose_name='Web servis adresi')),
                ('portal_url', models.URLField(default='https://edonusum.uyum.com.tr', help_text='Fatura onayı bu adreste yapılır. Uygulama bu adrese bağlanmaz.', max_length=300, verbose_name='Portal adresi')),
                ('kullanici_adi', models.CharField(max_length=120, verbose_name='Web servis kullanıcısı')),
                ('sifre_encrypted', models.TextField(blank=True, default='', verbose_name='Web servis şifresi')),
                ('vkn', models.CharField(max_length=11, verbose_name='VKN / TCKN')),
                ('gonderici_birim', models.CharField(max_length=200, verbose_name='Gönderici birim')),
                ('posta_kutusu', models.CharField(max_length=200, verbose_name='Posta kutusu')),
                ('aktif', models.BooleanField(default=True, verbose_name='Aktif')),
                ('son_test_at', models.DateTimeField(blank=True, null=True, verbose_name='Son bağlantı denemesi')),
                ('son_test_basarili', models.BooleanField(blank=True, null=True, verbose_name='Son deneme başarılı')),
                ('son_test_mesaji', models.TextField(blank=True, default='', verbose_name='Son deneme mesajı')),
                ('son_test_ozet', models.JSONField(blank=True, default=dict, verbose_name='Son deneme özeti')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('guncelleyen', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='guncelledigi_uyumsoft_ayarlari', to=settings.AUTH_USER_MODEL, verbose_name='Güncelleyen')),
                ('kurum', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='uyumsoft_ayar', to='kurum.kurum', verbose_name='Kurum')),
            ],
            options={
                'verbose_name': 'Uyumsoft ayarı',
                'verbose_name_plural': 'Uyumsoft ayarları',
                'db_table': 'finans_uyumsoft_ayar',
            },
        ),
    ]
