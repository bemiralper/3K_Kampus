# Yoklama / telafi ayrımı + bildirim log

from django.db import migrations, models
import django.db.models.deletion


def migrate_telafi_edilecek(apps, schema_editor):
    Oturum = apps.get_model('ozel_ders', 'BirebirDersOturumu')
    ATTENDED = {'ISLENDI', 'ONLINE'}

    for o in Oturum.objects.filter(durum='TELAFI_EDILECEK').iterator():
        children = list(
            Oturum.objects.filter(replaces_oturum_id=o.id, is_active=True).order_by('id')
        )
        o.durum = 'IPTAL'
        o.sebep_kodu = 'DIGER'
        o.sebep_aciklama = 'Eski Telafi Edilecek kaydı'
        if children:
            if any(c.durum in ATTENDED for c in children):
                o.telafi_durumu = 'EDILDI'
            else:
                o.telafi_durumu = 'PLANLANDI'
        else:
            o.telafi_durumu = 'BEKLENIYOR'
        o.save(update_fields=['durum', 'sebep_kodu', 'sebep_aciklama', 'telafi_durumu'])

    for o in Oturum.objects.filter(durum='OGRETMEN_GELMEDI').iterator():
        children = list(
            Oturum.objects.filter(replaces_oturum_id=o.id, is_active=True)
        )
        if children:
            if any(c.durum in ATTENDED for c in children):
                o.telafi_durumu = 'EDILDI'
            else:
                o.telafi_durumu = 'PLANLANDI'
        else:
            o.telafi_durumu = 'BEKLENIYOR'
        o.save(update_fields=['telafi_durumu'])

    # Remaining rows keep default GEREKMIYOR


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('ozel_ders', '0003_program_zaman_ayarlari'),
        ('communication', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='birebirdersoturumu',
            name='telafi_durumu',
            field=models.CharField(
                choices=[
                    ('GEREKMIYOR', 'Telafi Gerekmiyor'),
                    ('BEKLENIYOR', 'Telafi Bekleniyor'),
                    ('PLANLANDI', 'Telafi Planlandı'),
                    ('EDILDI', 'Telafi Edildi'),
                ],
                db_index=True,
                default='GEREKMIYOR',
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name='birebirdersoturumu',
            name='sebep_kodu',
            field=models.CharField(
                blank=True,
                choices=[
                    ('HASTALIK', 'Hastalık'),
                    ('MAZERET', 'Mazeret'),
                    ('ACIL', 'Acil durum'),
                    ('KURUM', 'Kurum kaynaklı'),
                    ('DIGER', 'Diğer'),
                ],
                default='',
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name='birebirdersoturumu',
            name='sebep_aciklama',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddIndex(
            model_name='birebirdersoturumu',
            index=models.Index(
                fields=['telafi_durumu', 'session_date'],
                name='ozel_ders_oturum_telafi_tarih_idx',
            ),
        ),
        migrations.CreateModel(
            name='BirebirOturumBildirimLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_key', models.CharField(db_index=True, max_length=64)),
                ('veli_id', models.PositiveIntegerField(db_index=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('message', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='ozel_ders_bildirim_loglari',
                    to='communication.message',
                )),
                ('oturum', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='bildirim_loglari',
                    to='ozel_ders.birebirdersoturumu',
                )),
            ],
            options={
                'verbose_name': 'Özel Ders Oturum Bildirimi',
                'verbose_name_plural': 'Özel Ders Oturum Bildirimleri',
                'db_table': 'ozel_ders_oturum_bildirim_log',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='birebiroturumbildirimlog',
            constraint=models.UniqueConstraint(
                fields=('oturum', 'event_key', 'veli_id'),
                name='unique_ozel_ders_oturum_bildirim',
            ),
        ),
        migrations.RunPython(migrate_telafi_edilecek, noop_reverse),
        migrations.AlterField(
            model_name='birebirdersoturumu',
            name='durum',
            field=models.CharField(
                choices=[
                    ('PLANLANDI', 'Planlandı'),
                    ('ISLENDI', 'İşlendi'),
                    ('ONLINE', 'Online'),
                    ('OGRETMEN_GELMEDI', 'Öğretmen Gelmedi'),
                    ('OGRENCI_GELMEDI', 'Öğrenci Gelmedi'),
                    ('IPTAL', 'İptal'),
                ],
                db_index=True,
                default='PLANLANDI',
                max_length=24,
            ),
        ),
    ]
