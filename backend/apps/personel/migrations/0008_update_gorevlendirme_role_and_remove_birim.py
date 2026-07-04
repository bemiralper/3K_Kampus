# Generated migration
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('personel', '0007_alter_personelgorevlendirme_rol'),
        ('roller', '0001_initial'),
        ('egitim_tanimlari', '0001_initial'),
    ]

    operations = [
        # 1. Birim FK'ını görevlendirmeden kaldır
        migrations.RemoveField(
            model_name='personelgorevlendirme',
            name='birim',
        ),
        
        # 2. Eski rol FK'ını kaldır
        migrations.RemoveField(
            model_name='personelgorevlendirme',
            name='rol',
        ),
        
        # 3. Yeni rol FK'ını ekle (roller.Role modeline)
        migrations.AddField(
            model_name='personelgorevlendirme',
            name='rol',
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='personel_gorevlendirmeleri',
                to='roller.role',
                verbose_name='Rol'
            ),
        ),
        
        # 4. Eski brans FK'ını kaldır (Ders modeline bağlı)
        migrations.RemoveField(
            model_name='personelgorevlendirme',
            name='brans',
        ),
        
        # 5. Yeni brans FK'ını ekle (Brans modeline)
        migrations.AddField(
            model_name='personelgorevlendirme',
            name='brans',
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='personel_gorevlendirmeleri',
                to='egitim_tanimlari.brans',
                verbose_name='Branş'
            ),
        ),
        
        # 6. Birim modelini sil
        migrations.DeleteModel(
            name='Birim',
        ),
        
        # 7. PersonelRol modelini sil (artık roller.Role kullanılıyor)
        migrations.DeleteModel(
            name='PersonelRol',
        ),
    ]
