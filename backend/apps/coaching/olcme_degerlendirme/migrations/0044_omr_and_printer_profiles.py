from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

import apps.coaching.olcme_degerlendirme.models.omr as omr_models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('olcme_degerlendirme', '0042_optik_daire_sablon'),
        ('olcme_degerlendirme', '0043_inactive_seats'),
    ]

    operations = [
        migrations.AddField(
            model_name='examsession',
            name='source_type',
            field=models.CharField(
                choices=[('DAT', 'DAT'), ('OMR', 'Optik Tarama')],
                default='DAT',
                max_length=3,
                verbose_name='Kaynak türü',
            ),
        ),
        migrations.CreateModel(
            name='OptikYaziciProfili',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('ad', models.CharField(max_length=120, verbose_name='Profil adı')),
                ('kalibrasyon', models.JSONField(default=omr_models.bos_yazici_kalibrasyonu, help_text='Ofset, X/Y ölçek ve isteğe bağlı küçük dönüş.', verbose_name='Kalibrasyon')),
                ('varsayilan', models.BooleanField(default=False, verbose_name='Varsayılan')),
                ('son_kalite', models.JSONField(blank=True, default=dict, verbose_name='Son ölçüm kalitesi')),
                ('aktif', models.BooleanField(default=True, verbose_name='Aktif')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('kurum', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='optik_yazici_profilleri', to='kurum.kurum', verbose_name='Kurum')),
            ],
            options={'ordering': ['ad', 'id']},
        ),
        migrations.AddConstraint(
            model_name='optikyaziciprofili',
            constraint=models.UniqueConstraint(fields=('kurum', 'ad'), name='unique_optik_yazici_profili_ad'),
        ),
        migrations.AddConstraint(
            model_name='optikyaziciprofili',
            constraint=models.UniqueConstraint(condition=models.Q(('varsayilan', True)), fields=('kurum',), name='unique_default_optik_yazici_profili'),
        ),
        migrations.AddField(
            model_name='optikdairesablon',
            name='yazici_profili',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='sablonlar', to='olcme_degerlendirme.optikyaziciprofili', verbose_name='Yazıcı profili'),
        ),
        migrations.CreateModel(
            name='OmrTaramaOturumu',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('PENDING', 'Bekliyor'), ('PROCESSING', 'İşleniyor'), ('REVIEW', 'İnceleme bekliyor'), ('CONFIRMED', 'Onaylandı'), ('ERROR', 'Hata')], default='PENDING', max_length=15, verbose_name='Durum')),
                ('original_filenames', models.JSONField(blank=True, default=list, verbose_name='Kaynak dosya adları')),
                ('total_pages', models.PositiveIntegerField(default=0, verbose_name='Toplam sayfa')),
                ('processed_pages', models.PositiveIntegerField(default=0, verbose_name='İşlenen sayfa')),
                ('error_pages', models.PositiveIntegerField(default=0, verbose_name='Hatalı sayfa')),
                ('error_message', models.TextField(blank=True, verbose_name='Hata mesajı')),
                ('confirmed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('confirmed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='confirmed_omr_sessions', to=settings.AUTH_USER_MODEL, verbose_name='Onaylayan')),
                ('exam', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='omr_tarama_oturumlari', to='olcme_degerlendirme.exam', verbose_name='Sınav')),
                ('result_session', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='omr_tarama_oturumu', to='olcme_degerlendirme.examsession', verbose_name='Oluşturulan sonuç oturumu')),
                ('sablon', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='omr_tarama_oturumlari', to='olcme_degerlendirme.optikdairesablon', verbose_name='Daire şablonu')),
                ('uploaded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='uploaded_omr_sessions', to=settings.AUTH_USER_MODEL, verbose_name='Yükleyen')),
            ],
            options={'ordering': ['-created_at', '-id']},
        ),
        migrations.CreateModel(
            name='OmrTaramaSayfasi',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('sequence', models.PositiveIntegerField(verbose_name='Sıra')),
                ('original_filename', models.CharField(max_length=255, verbose_name='Kaynak dosya adı')),
                ('source_page', models.PositiveIntegerField(default=1, verbose_name='Kaynak sayfa')),
                ('image', models.ImageField(upload_to=omr_models._omr_page_upload_path, verbose_name='Raster sayfa')),
                ('status', models.CharField(choices=[('PENDING', 'Bekliyor'), ('PROCESSING', 'İşleniyor'), ('REVIEW', 'İnceleme bekliyor'), ('READY', 'Onaya hazır'), ('ERROR', 'Hata')], default='PENDING', max_length=15, verbose_name='Durum')),
                ('registration', models.JSONField(blank=True, default=dict, verbose_name='Sayfa kaydı')),
                ('decoded', models.JSONField(blank=True, default=dict, verbose_name='Ham OMR çözümü')),
                ('review', models.JSONField(blank=True, default=dict, verbose_name='İnceleme düzeltmeleri')),
                ('confidence', models.FloatField(default=0.0, verbose_name='Güven')),
                ('warnings', models.JSONField(blank=True, default=list, verbose_name='Uyarılar')),
                ('critical_warnings', models.JSONField(blank=True, default=list, verbose_name='Kritik uyarılar')),
                ('error_message', models.TextField(blank=True, verbose_name='Hata mesajı')),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('job', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sayfalar', to='olcme_degerlendirme.omrtaramaoturumu', verbose_name='Tarama oturumu')),
                ('reviewed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reviewed_omr_pages', to=settings.AUTH_USER_MODEL, verbose_name='İnceleyen')),
            ],
            options={'ordering': ['sequence', 'id']},
        ),
        migrations.AddConstraint(
            model_name='omrtaramasayfasi',
            constraint=models.UniqueConstraint(fields=('job', 'sequence'), name='unique_omr_job_page_sequence'),
        ),
    ]
