from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('resources', '0005_resourcebook_sinif_seviyeleri_m2m'),
        ('student_resources', '0004_partial_unique_active_assignment'),
    ]

    operations = [
        migrations.AddField(
            model_name='resourcepurchaselist',
            name='title',
            field=models.CharField(blank=True, max_length=200, verbose_name='Liste Başlığı'),
        ),
        migrations.AddField(
            model_name='resourcepurchaselistitem',
            name='difficulty_snapshot',
            field=models.CharField(blank=True, max_length=20, verbose_name='Zorluk'),
        ),
        migrations.AddField(
            model_name='resourcepurchaselistitem',
            name='source_note',
            field=models.CharField(
                blank=True,
                help_text='Örn: Çağrı Kitap Kırtasiye',
                max_length=300,
                verbose_name='Temini / Kaynak Yeri',
            ),
        ),
        migrations.AlterField(
            model_name='resourcepurchaselistitem',
            name='assignment',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='purchase_list_items',
                to='student_resources.studentresourceassignment',
                verbose_name='Kaynak Ataması',
            ),
        ),
        migrations.AddField(
            model_name='resourcepurchaselistitem',
            name='lesson',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='purchase_list_items',
                to='egitim_tanimlari.ders',
                verbose_name='Ders',
            ),
        ),
        migrations.AddField(
            model_name='resourcepurchaselistitem',
            name='resource_book',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='purchase_list_items',
                to='resources.resourcebook',
                verbose_name='Kaynak Kitap',
            ),
        ),
        migrations.AlterUniqueTogether(
            name='resourcepurchaselistitem',
            unique_together=set(),
        ),
        migrations.AddConstraint(
            model_name='resourcepurchaselistitem',
            constraint=models.UniqueConstraint(
                condition=models.Q(('assignment__isnull', False)),
                fields=('purchase_list', 'assignment'),
                name='uniq_purchase_list_assignment',
            ),
        ),
        migrations.AddConstraint(
            model_name='resourcepurchaselistitem',
            constraint=models.UniqueConstraint(
                condition=models.Q(('resource_book__isnull', False)),
                fields=('purchase_list', 'resource_book'),
                name='uniq_purchase_list_resource_book',
            ),
        ),
    ]
