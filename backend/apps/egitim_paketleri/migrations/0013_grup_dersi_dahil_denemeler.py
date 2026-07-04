from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('egitim_paketleri', '0012_alter_davranispaketi_brut_fiyat_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='grupdersi',
            name='dahil_denemeler',
            field=models.ManyToManyField(
                blank=True,
                help_text='Bu grup dersine ücretsiz dahil olan deneme paketleri',
                related_name='dahil_oldugu_grup_dersleri',
                to='egitim_paketleri.deneme',
                verbose_name='Dahil Deneme Paketleri',
            ),
        ),
    ]
