from django.db import migrations, models
import django.db.models.deletion


def backfill_attendance(apps, schema_editor):
    ExamParticipant = apps.get_model('olcme_degerlendirme', 'ExamParticipant')
    ExamParticipant.objects.filter(attendance='').update(attendance='present')


class Migration(migrations.Migration):

    dependencies = [
        ('olcme_degerlendirme', '0016_seat_notify_lock'),
    ]

    operations = [
        migrations.AlterField(
            model_name='examparticipant',
            name='attendance',
            field=models.CharField(
                blank=True,
                choices=[('', 'Belirsiz'), ('present', 'Geldi'), ('absent', 'Gelmedi')],
                default='present',
                max_length=10,
            ),
        ),
        migrations.RunPython(backfill_attendance, migrations.RunPython.noop),
        migrations.AddField(
            model_name='exam',
            name='answer_key_pdf',
            field=models.FileField(
                blank=True,
                null=True,
                upload_to='olcme/cevap-anahtari/',
                verbose_name='Cevap Anahtarı PDF',
            ),
        ),
        migrations.CreateModel(
            name='ExamScheduledDispatch',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[('karne', 'Karne PDF'), ('answer_key', 'Cevap anahtarı PDF')], max_length=20)),
                ('scheduled_at', models.DateTimeField(blank=True, null=True)),
                ('status', models.CharField(choices=[('pending', 'Bekliyor'), ('sent', 'Gönderildi'), ('overdue_unread', 'Saat geçti — hazır değil'), ('cancelled', 'İptal')], default='pending', max_length=20)),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('sent_count', models.PositiveIntegerField(default=0)),
                ('skipped_count', models.PositiveIntegerField(default=0)),
                ('last_error', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('exam', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='scheduled_dispatches', to='olcme_degerlendirme.exam')),
            ],
            options={
                'verbose_name': 'Sınav Zamanlı Gönderim',
                'verbose_name_plural': 'Sınav Zamanlı Gönderimler',
            },
        ),
        migrations.AddConstraint(
            model_name='examscheduleddispatch',
            constraint=models.UniqueConstraint(fields=('exam', 'kind'), name='unique_exam_scheduled_dispatch'),
        ),
    ]
