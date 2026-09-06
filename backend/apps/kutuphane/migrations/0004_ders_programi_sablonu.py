# Adlandırılmış ders programı şablonları (kurum bazlı, şubeden bağımsız).

from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('kutuphane', '0003_library_locker_sube_id'),
    ]

    operations = [
        migrations.CreateModel(
            name='DersProgramiSablonu',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('kurum_id', models.IntegerField(verbose_name='Kurum ID')),
                ('ad', models.CharField(max_length=100, verbose_name='Şablon Adı')),
                ('aciklama', models.CharField(blank=True, default='', max_length=255, verbose_name='Açıklama')),
                ('ders_saatleri', models.JSONField(default=dict, help_text='Gün bazlı ders saatleri (SubeDersProgrami ile aynı şema)', verbose_name='Ders Saatleri')),
                ('gun_bazli_aktiflik', models.JSONField(default=dict, help_text='Hangi gün hangi periyotlar aktif', verbose_name='Gün Bazlı Aktiflik')),
                ('olusturan_id', models.IntegerField(blank=True, null=True, verbose_name='Oluşturan Kullanıcı')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Oluşturma Tarihi')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Güncelleme Tarihi')),
            ],
            options={
                'verbose_name': 'Ders Programı Şablonu',
                'verbose_name_plural': 'Ders Programı Şablonları',
                'db_table': 'kutuphane_ders_programi_sablonu',
                'ordering': ['ad'],
            },
        ),
        migrations.AddIndex(
            model_name='dersprogramisablonu',
            index=models.Index(fields=['kurum_id'], name='kutuphane_d_kurum_i_6987d2_idx'),
        ),
        migrations.AddConstraint(
            model_name='dersprogramisablonu',
            constraint=models.UniqueConstraint(fields=('kurum_id', 'ad'), name='unique_kurum_ders_programi_sablon_ad'),
        ),
    ]
