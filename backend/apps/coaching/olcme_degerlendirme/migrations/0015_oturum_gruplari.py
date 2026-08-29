from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('egitim_tanimlari', '0011_ders_kisa_ad'),
        ('egitim_yili', '0001_initial'),
        ('ogrenci', '0016_ogrenci_not_and_audit'),
        ('olcme_degerlendirme', '0014_exam_audience_room_participant'),
        ('sube', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='OlcmeSeviyeOturumAyar',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('preference', models.CharField(choices=[('HAFTA_ICI', 'Hafta İçi'), ('HAFTA_SONU', 'Hafta Sonu')], default='HAFTA_ICI', max_length=12)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('sinif_seviyesi', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='olcme_oturum_ayarlari', to='egitim_tanimlari.sinifseviyesi')),
                ('sube', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='olcme_seviye_oturum_ayarlari', to='sube.sube')),
            ],
            options={
                'verbose_name': 'Seviye Oturum Ayarı',
                'verbose_name_plural': 'Seviye Oturum Ayarları',
            },
        ),
        migrations.CreateModel(
            name='OlcmeOgrenciOturumTercihi',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('preference', models.CharField(choices=[('HAFTA_ICI', 'Hafta İçi'), ('HAFTA_SONU', 'Hafta Sonu')], max_length=12)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('egitim_yili', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='olcme_ogrenci_oturum_tercihleri', to='egitim_yili.egitimyili')),
                ('ogrenci', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='olcme_oturum_tercihleri', to='ogrenci.ogrenci')),
                ('sube', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='olcme_ogrenci_oturum_tercihleri', to='sube.sube')),
            ],
            options={
                'verbose_name': 'Öğrenci Oturum Tercihi',
                'verbose_name_plural': 'Öğrenci Oturum Tercihleri',
            },
        ),
        migrations.AddField(
            model_name='examparticipant',
            name='exam_session',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='participants',
                to='olcme_degerlendirme.examsessionmodel',
            ),
        ),
        migrations.RemoveConstraint(
            model_name='examparticipant',
            name='unique_exam_participant',
        ),
        migrations.AddConstraint(
            model_name='olcmeseviyeoturumayar',
            constraint=models.UniqueConstraint(fields=('sube', 'sinif_seviyesi'), name='unique_olcme_seviye_oturum_ayar'),
        ),
        migrations.AddConstraint(
            model_name='olcmeogrencioturumtercihi',
            constraint=models.UniqueConstraint(fields=('sube', 'egitim_yili', 'ogrenci'), name='unique_olcme_ogrenci_oturum_tercihi'),
        ),
        migrations.AddConstraint(
            model_name='examparticipant',
            constraint=models.UniqueConstraint(
                condition=models.Q(('exam_session__isnull', True)),
                fields=('exam', 'student'),
                name='unique_exam_participant_no_session',
            ),
        ),
        migrations.AddConstraint(
            model_name='examparticipant',
            constraint=models.UniqueConstraint(
                condition=models.Q(('exam_session__isnull', False)),
                fields=('exam', 'student', 'exam_session'),
                name='unique_exam_participant_session',
            ),
        ),
        migrations.RemoveConstraint(
            model_name='examparticipant',
            name='unique_exam_room_seat',
        ),
        migrations.AddConstraint(
            model_name='examparticipant',
            constraint=models.UniqueConstraint(
                condition=models.Q(('exam_session__isnull', True), ('room__isnull', False), ('seat_no__isnull', False)),
                fields=('exam', 'room', 'seat_no'),
                name='unique_exam_room_seat',
            ),
        ),
        migrations.AddConstraint(
            model_name='examparticipant',
            constraint=models.UniqueConstraint(
                condition=models.Q(('exam_session__isnull', False), ('room__isnull', False), ('seat_no__isnull', False)),
                fields=('exam_session', 'room', 'seat_no'),
                name='unique_exam_session_room_seat',
            ),
        ),
    ]
