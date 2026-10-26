from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('mobile_identity', '0004_islenen_kazanim'),
    ]

    operations = [
        migrations.CreateModel(
            name='DersNotu',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('session_date', models.DateField()),
                ('file_name', models.CharField(max_length=180)),
                ('drive_file_id', models.CharField(max_length=128, unique=True)),
                ('mime_type', models.CharField(max_length=80)),
                ('size', models.PositiveIntegerField()),
                ('idempotency_key', models.CharField(blank=True, default='', max_length=80)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                (
                    'class_lesson_plan',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='ders_notlari',
                        to='academic.classlessonplan',
                    ),
                ),
                (
                    'created_by',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='ders_notlari',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    'egitim_yili',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='ders_notlari',
                        to='egitim_yili.egitimyili',
                    ),
                ),
                (
                    'kurum',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='ders_notlari',
                        to='kurum.kurum',
                    ),
                ),
                (
                    'ogretmen',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='ders_notlari',
                        to='personel.personel',
                    ),
                ),
                (
                    'sube',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='ders_notlari',
                        to='sube.sube',
                    ),
                ),
                (
                    'term',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='ders_notlari',
                        to='term.term',
                    ),
                ),
            ],
            options={
                'db_table': 'ders_notu',
            },
        ),
        migrations.AddIndex(
            model_name='dersnotu',
            index=models.Index(fields=['class_lesson_plan', 'session_date'], name='ders_notu_plan_date'),
        ),
        migrations.AddConstraint(
            model_name='dersnotu',
            constraint=models.UniqueConstraint(
                condition=~models.Q(idempotency_key=''),
                fields=('created_by', 'idempotency_key'),
                name='ders_notu_idempotent',
            ),
        ),
    ]
