# Generated manually for yoklama veli bildirimi

import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('communication', '0006_category_audience_reply_reactions'),
        ('kutuphane', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='attendancerecord',
            name='cikis_saati',
            field=models.TimeField(blank=True, null=True, verbose_name='Çıkış Saati'),
        ),
        migrations.CreateModel(
            name='AttendanceNotificationConfig',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('kurum_id', models.IntegerField(unique=True, verbose_name='Kurum ID')),
                ('is_active', models.BooleanField(default=True, verbose_name='Aktif')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('absent_template', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+', to='communication.messagetemplate', verbose_name='Gelmedi şablonu',
                )),
                ('exit_template', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+', to='communication.messagetemplate', verbose_name='Çıkış şablonu',
                )),
                ('late_template', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+', to='communication.messagetemplate', verbose_name='Geç kalma şablonu',
                )),
            ],
            options={
                'verbose_name': 'Yoklama Bildirim Ayarı',
                'verbose_name_plural': 'Yoklama Bildirim Ayarları',
                'db_table': 'kutuphane_yoklama_bildirim_ayar',
            },
        ),
        migrations.CreateModel(
            name='AttendanceNotificationLog',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('ogrenci_id', models.IntegerField(verbose_name='Öğrenci ID')),
                ('veli_id', models.IntegerField(verbose_name='Veli ID')),
                ('event_type', models.CharField(
                    choices=[('ABSENT', 'Gelmedi'), ('LATE', 'Geç Geldi'), ('EXIT', 'Çıkış')],
                    max_length=20,
                )),
                ('template_id', models.UUIDField(blank=True, null=True)),
                ('sent_by_id', models.IntegerField(blank=True, null=True, verbose_name='Gönderen')),
                ('sent_at', models.DateTimeField(auto_now_add=True)),
                ('attendance_record', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='bildirim_loglari', to='kutuphane.attendancerecord',
                )),
                ('attendance_session', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='bildirim_loglari', to='kutuphane.attendancesession',
                )),
                ('message', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+', to='communication.message',
                )),
            ],
            options={
                'verbose_name': 'Yoklama Bildirim Logu',
                'verbose_name_plural': 'Yoklama Bildirim Logları',
                'db_table': 'kutuphane_yoklama_bildirim_log',
            },
        ),
        migrations.AddIndex(
            model_name='attendancenotificationlog',
            index=models.Index(fields=['attendance_session', 'event_type'], name='kutuphane_y_attenda_idx'),
        ),
        migrations.AddIndex(
            model_name='attendancenotificationlog',
            index=models.Index(fields=['ogrenci_id', 'event_type'], name='kutuphane_y_ogrenci_idx'),
        ),
        migrations.AddConstraint(
            model_name='attendancenotificationlog',
            constraint=models.UniqueConstraint(
                fields=('attendance_session', 'ogrenci_id', 'event_type', 'veli_id'),
                name='unique_yoklama_bildirim_per_veli',
            ),
        ),
    ]
