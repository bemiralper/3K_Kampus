import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('okul', '0001_initial'),
        ('ogrenci', '0011_ogrenci_kisi_ogrenciveli_kisi'),
    ]

    operations = [
        migrations.AddField(
            model_name='ogrencikayit',
            name='school',
            field=models.ForeignKey(
                blank=True,
                db_column='school_id',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='ogrenci_kayitlari',
                to='okul.okul',
                verbose_name='Okul',
            ),
        ),
        migrations.AddIndex(
            model_name='ogrencikayit',
            index=models.Index(fields=['school'], name='ogrenci_kayit_school_idx'),
        ),
        migrations.AddIndex(
            model_name='ogrencikayit',
            index=models.Index(fields=['sube', 'school'], name='ogrenci_kayit_sube_school_idx'),
        ),
    ]
