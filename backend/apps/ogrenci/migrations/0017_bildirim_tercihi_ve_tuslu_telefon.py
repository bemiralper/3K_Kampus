from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ogrenci', '0016_ogrenci_not_and_audit'),
    ]

    operations = [
        migrations.AddField(
            model_name='ogrenci',
            name='whatsapp_uygun',
            field=models.BooleanField(
                db_index=True,
                default=True,
                help_text='Kapalıysa bu numaraya WhatsApp gönderilmez.',
                verbose_name='WhatsApp uygun',
            ),
        ),
        migrations.AddField(
            model_name='ogrenciveli',
            name='sms_tercih_kayitli',
            field=models.BooleanField(
                default=False,
                help_text='Formdan açıkça kaydedildiyse liste kelimesi kelimesine uygulanır. Eski kayıtlarda kapalıdır.',
                verbose_name='Bildirim tercihi kaydedildi',
            ),
        ),
    ]
