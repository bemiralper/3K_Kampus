from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('coaching', '0005_gorusme_kaydi'),
        ('kurum', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AttendanceThresholdSetting',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('absence_attention', models.PositiveSmallIntegerField(default=3, verbose_name='Devamsızlık dikkat eşiği')),
                ('absence_alarm', models.PositiveSmallIntegerField(default=5, verbose_name='Devamsızlık alarm eşiği')),
                ('late_attention', models.PositiveSmallIntegerField(default=3, verbose_name='Geç kalma dikkat eşiği')),
                ('late_alarm', models.PositiveSmallIntegerField(default=5, verbose_name='Geç kalma alarm eşiği')),
                ('consecutive_absent_alarm', models.PositiveSmallIntegerField(default=2, help_text='Ardışık yoklama günü gelmeme sayısı (sabah/öğle/akşam aynı gün sayılır).', verbose_name='Ardışık devamsızlık alarmı')),
                ('recommended_action_attention', models.CharField(default='Öğrenciyle görüş', max_length=160, verbose_name='Dikkat önerilen aksiyon')),
                ('recommended_action_alarm', models.CharField(default='Öğrenciyle görüş', max_length=160, verbose_name='Alarm önerilen aksiyon')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('kurum', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='attendance_threshold_setting', to='kurum.kurum', verbose_name='Kurum')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='updated_attendance_thresholds', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Yoklama Eşik Ayarı',
                'verbose_name_plural': 'Yoklama Eşik Ayarları',
                'db_table': 'coaching_attendance_threshold',
            },
        ),
        migrations.CreateModel(
            name='AttendanceCoachDigest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source_key', models.CharField(max_length=80)),
                ('session_date', models.DateField()),
                ('student_ids', models.JSONField(blank=True, default=list)),
                ('notification_id', models.CharField(blank=True, default='', max_length=40)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('coach', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attendance_digests', to='coaching.coachprofile')),
            ],
            options={
                'verbose_name': 'Koç Yoklama Bildirim Özeti',
                'verbose_name_plural': 'Koç Yoklama Bildirim Özetleri',
                'db_table': 'coaching_attendance_coach_digest',
            },
        ),
        migrations.AddIndex(
            model_name='attendancecoachdigest',
            index=models.Index(fields=['coach', 'session_date'], name='coach_att_digest_day_idx'),
        ),
        migrations.AddConstraint(
            model_name='attendancecoachdigest',
            constraint=models.UniqueConstraint(fields=('coach', 'source_key'), name='unique_attendance_coach_digest'),
        ),
    ]
