from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('student_resources', '0005_purchase_list_from_library'),
    ]

    operations = [
        migrations.AddField(
            model_name='resourcepurchaselistitem',
            name='item_status',
            field=models.CharField(
                choices=[
                    ('PENDING', 'Bekliyor'),
                    ('RECEIVED', 'Alındı'),
                    ('NOT_RECEIVED', 'Alınmadı'),
                    ('CANCELLED', 'İptal'),
                ],
                default='PENDING',
                max_length=20,
                verbose_name='Kalem Durumu',
            ),
        ),
    ]
